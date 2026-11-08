import { describe, expect, it } from 'vitest'
import { createSqlStores, type SqlDatabase } from '../src/sql'

export interface SuiteTarget {
  /** Opens a database handle; the same underlying database must be reachable by every call. */
  open(): Promise<SqlDatabase> | SqlDatabase
  /** Raw statement runner for assertions that bypass the stores. */
  raw(db: SqlDatabase, sql: string): Promise<void>
  /** Unique table prefix per test so runs never collide on a shared server. */
  prefix(): string
}

/** The behaviour every dialect must provide, run against SQLite, MySQL and PostgreSQL. */
export function describeSqlStores(name: string, target: SuiteTarget): void {
  describe(`createSqlStores (${name})`, () => {
    const create = async (extra: { now?: () => number; ownerId?: () => string } = {}, db?: SqlDatabase, prefix = target.prefix()) => {
      const handle = db ?? (await target.open())
      return { db: handle, prefix, stores: createSqlStores({ db: handle, prefix, ...extra }) }
    }
    const cleanup = async (db: SqlDatabase, prefix: string) => {
      for (const table of ['migrations', 'locks', 'toggles']) await target.raw(db, `DROP TABLE IF EXISTS ${prefix}${table}`)
    }

    it('creates the schema idempotently', async () => {
      const { db, prefix, stores } = await create()
      await Promise.all([stores.ensureSchema(), stores.ensureSchema()])
      await create({}, db, prefix).then(({ stores: other }) => other.ensureSchema())
      await cleanup(db, prefix)
    })

    it('keeps a migration ledger per extension, ordered, idempotent', async () => {
      const { db, prefix, stores } = await create()
      const { ledger } = stores
      expect(await ledger.applied('quiz')).toEqual([])
      await ledger.record('quiz', '002-b')
      await ledger.record('quiz', '001-a')
      await ledger.record('quiz', '001-a')
      await ledger.record('core', '001-z')
      expect(await ledger.applied('quiz')).toEqual(['001-a', '002-b'])
      expect(await ledger.applied('core')).toEqual(['001-z'])
      await ledger.remove('quiz', '001-a')
      expect(await ledger.applied('quiz')).toEqual(['002-b'])
      await cleanup(db, prefix)
    })

    it('shares state between instances on the same database', async () => {
      const first = await create()
      await first.stores.ledger.record('quiz', '001')
      const second = await create({}, await target.open(), first.prefix)
      expect(await second.stores.ledger.applied('quiz')).toEqual(['001'])
      await cleanup(first.db, first.prefix)
    })

    it('stores toggles and removes them with null', async () => {
      const { db, prefix, stores } = await create()
      const { toggles } = stores
      expect(await toggles.read()).toEqual({})
      await toggles.write('quiz', false)
      await toggles.write('analytics', true)
      expect(await toggles.read()).toEqual({ quiz: false, analytics: true })
      await toggles.write('quiz', true)
      await toggles.write('analytics', null)
      expect(await toggles.read()).toEqual({ quiz: true })
      await cleanup(db, prefix)
    })

    it('locks atomically, releases, and recovers from expired locks', async () => {
      let clock = 1_000
      const first = await create({ now: () => clock, ownerId: () => 'a' })
      const a = first.stores
      const b = (await create({ now: () => clock, ownerId: () => 'b' }, await target.open(), first.prefix)).stores

      const release = await a.acquireLock('migrations', 5_000)
      expect(release).toBeTypeOf('function')
      expect(await b.acquireLock('migrations', 5_000)).toBeUndefined()
      expect(await b.acquireLock('other', 5_000)).toBeTypeOf('function')

      await release?.()
      const second = await b.acquireLock('migrations', 5_000)
      expect(second).toBeTypeOf('function')

      clock += 6_000 // b's lock expired (e.g. a crashed process)
      expect(await a.acquireLock('migrations', 5_000)).toBeTypeOf('function')
      await second?.() // b releasing late must not drop a's lock
      expect(await b.acquireLock('migrations', 5_000)).toBeUndefined()
      await cleanup(first.db, first.prefix)
    })

    it('contends fairly: exactly one of many concurrent acquirers wins', async () => {
      const first = await create()
      const contenders = await Promise.all(
        Array.from({ length: 6 }, async (_, index) => (await create({ ownerId: () => `owner-${index}` }, await target.open(), first.prefix)).stores),
      )
      await first.stores.ensureSchema()
      const results = await Promise.all(contenders.map((stores) => stores.acquireLock('migrations', 60_000)))
      expect(results.filter(Boolean)).toHaveLength(1)
      await cleanup(first.db, first.prefix)
    })

    it('surfaces real failures instead of reporting a held lock', async () => {
      const { db, prefix, stores } = await create()
      await stores.ensureSchema()
      await target.raw(db, `DROP TABLE ${prefix}locks`)
      await expect(stores.acquireLock('migrations', 1_000)).rejects.toThrow()
      await cleanup(db, prefix)
    })
  })
}
