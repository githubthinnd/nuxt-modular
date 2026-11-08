import type { MigrationLedger } from './migrations'

/*
 * SQL-backed state for nuxt-modular: the migration ledger, the migration lock
 * and persistent feature toggles, on SQLite, MySQL/MariaDB or PostgreSQL.
 *
 * The code talks to a deliberately small structural interface that
 * [db0](https://db0.unjs.io) (Nitro's database layer) satisfies, so any db0
 * connector works, and so does a hand-written adapter. Every statement uses
 * `?` placeholders and only SQL that the three dialects share; the one real
 * difference — upserts — is avoided by delete-then-insert.
 */

export type SqlDialect = 'sqlite' | 'mysql' | 'postgresql'

/** Values accepted as statement parameters. */
export type SqlParam = string | number | boolean | null | undefined

export interface SqlStatement {
  all(...params: SqlParam[]): Promise<unknown[]> | unknown[]
  get(...params: SqlParam[]): Promise<unknown> | unknown
  run(...params: SqlParam[]): Promise<unknown> | unknown
}

/** The subset of a db0 `Database` the module needs. */
export interface SqlDatabase {
  exec(sql: string): Promise<unknown> | unknown
  prepare(sql: string): SqlStatement
}

/** Maps connector/dialect names used by db0 and drivers onto the three supported dialects. */
export function normalizeDialect(name: string | undefined): SqlDialect | undefined {
  switch (name?.toLowerCase()) {
    case 'sqlite':
    case 'sqlite3':
    case 'libsql':
    case 'better-sqlite3':
    case 'node-sqlite':
    case 'bun-sqlite':
    case 'cloudflare-d1':
      return 'sqlite'
    case 'mysql':
    case 'mysql2':
    case 'mariadb':
    case 'planetscale':
      return 'mysql'
    case 'postgres':
    case 'postgresql':
    case 'pg':
    case 'pglite':
      return 'postgresql'
    default:
      return undefined
  }
}

const PREFIX_PATTERN = /^[a-z][a-z0-9_]{0,24}$/

export interface SqlStoreOptions {
  readonly db: SqlDatabase
  /** Prefix of the three tables (`<prefix>migrations`, `<prefix>locks`, `<prefix>toggles`). Default `modular_`. */
  readonly prefix?: string
  /** Clock override for tests. */
  readonly now?: () => number
  /** Lock owner id override for tests. */
  readonly ownerId?: () => string
}

/** Releases a lock acquired with `acquireLock`. */
export type ReleaseLock = () => Promise<void>

export interface SqlStores {
  /** Creates the tables when missing; safe to call repeatedly and concurrently. */
  ensureSchema(): Promise<void>
  readonly ledger: MigrationLedger
  /**
   * Takes the named lock atomically (a unique key, not a read-then-write):
   * `undefined` when another owner holds it and it has not expired.
   */
  acquireLock(name: string, ttlMs: number): Promise<ReleaseLock | undefined>
  readonly toggles: {
    read(): Promise<Record<string, boolean>>
    /** `null` removes the override. */
    write(extensionId: string, active: boolean | null): Promise<void>
  }
}

function row(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

export function createSqlStores(options: SqlStoreOptions): SqlStores {
  const prefix = options.prefix ?? 'modular_'
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error(`Invalid table prefix "${prefix}": use lower-case letters, digits and "_" (max 25), starting with a letter`)
  }
  const { db } = options
  const now = options.now ?? Date.now
  const ownerId = options.ownerId ?? (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
  const migrations = `${prefix}migrations`
  const locks = `${prefix}locks`
  const toggles = `${prefix}toggles`

  let schema: Promise<void> | undefined
  const ensureSchema = (): Promise<void> => {
    schema ??= (async () => {
      // Key columns are VARCHAR (not TEXT) so MySQL can index them; the DDL is otherwise identical everywhere.
      await db.exec(
        `CREATE TABLE IF NOT EXISTS ${migrations} (extension_id VARCHAR(64) NOT NULL, name VARCHAR(191) NOT NULL, applied_at BIGINT NOT NULL, PRIMARY KEY (extension_id, name))`,
      )
      await db.exec(
        `CREATE TABLE IF NOT EXISTS ${locks} (name VARCHAR(64) NOT NULL PRIMARY KEY, owner VARCHAR(64) NOT NULL, expires_at BIGINT NOT NULL)`,
      )
      await db.exec(`CREATE TABLE IF NOT EXISTS ${toggles} (extension_id VARCHAR(64) NOT NULL PRIMARY KEY, active SMALLINT NOT NULL)`)
    })().catch((error: unknown) => {
      schema = undefined // allow a retry after a transient failure
      throw error
    })
    return schema
  }

  const all = async (sql: string, ...params: SqlParam[]): Promise<Record<string, unknown>[]> => {
    await ensureSchema()
    return (await db.prepare(sql).all(...params)).map(row)
  }
  const run = async (sql: string, ...params: SqlParam[]): Promise<void> => {
    await ensureSchema()
    await db.prepare(sql).run(...params)
  }

  const ledger: MigrationLedger = {
    async applied(extensionId) {
      const rows = await all(`SELECT name FROM ${migrations} WHERE extension_id = ? ORDER BY name`, extensionId)
      return rows.map((entry) => String(entry.name))
    },
    async record(extensionId, name) {
      // Recording is idempotent: a concurrent duplicate is treated as success.
      try {
        await run(`INSERT INTO ${migrations} (extension_id, name, applied_at) VALUES (?, ?, ?)`, extensionId, name, now())
      } catch (error) {
        const present = await all(`SELECT name FROM ${migrations} WHERE extension_id = ? AND name = ?`, extensionId, name)
        if (!present.length) throw error
      }
    },
    async remove(extensionId, name) {
      await run(`DELETE FROM ${migrations} WHERE extension_id = ? AND name = ?`, extensionId, name)
    },
  }

  return {
    ensureSchema,
    ledger,
    async acquireLock(name, ttlMs) {
      const owner = ownerId()
      await run(`DELETE FROM ${locks} WHERE name = ? AND expires_at < ?`, name, now())
      try {
        await run(`INSERT INTO ${locks} (name, owner, expires_at) VALUES (?, ?, ?)`, name, owner, now() + ttlMs)
      } catch (error) {
        // A unique-key violation means someone else holds it; anything else is a real failure.
        const [held] = await all(`SELECT owner FROM ${locks} WHERE name = ?`, name)
        if (held && held.owner !== owner) return undefined
        throw error
      }
      return () => run(`DELETE FROM ${locks} WHERE name = ? AND owner = ?`, name, owner)
    },
    toggles: {
      async read() {
        const result: Record<string, boolean> = {}
        for (const entry of await all(`SELECT extension_id, active FROM ${toggles}`)) {
          result[String(entry.extension_id)] = Number(entry.active) === 1
        }
        return result
      },
      async write(extensionId, active) {
        await run(`DELETE FROM ${toggles} WHERE extension_id = ?`, extensionId)
        if (active !== null) await run(`INSERT INTO ${toggles} (extension_id, active) VALUES (?, ?)`, extensionId, active ? 1 : 0)
      },
    },
  }
}
