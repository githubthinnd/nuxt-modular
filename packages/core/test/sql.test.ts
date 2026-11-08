import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createSqlStores, normalizeDialect, type SqlDatabase, type SqlParam } from '../src/sql'
import { describeSqlStores } from './sql-suite'

/** A db0-shaped adapter over Node's built-in SQLite, so the real SQL is executed. */
function sqliteDb(raw = new DatabaseSync(':memory:')): SqlDatabase & { raw: DatabaseSync } {
  return {
    raw,
    exec: (sql) => void raw.exec(sql),
    prepare: (sql) => ({
      all: async (...params: SqlParam[]) => raw.prepare(sql).all(...(params as never[])),
      get: async (...params: SqlParam[]) => raw.prepare(sql).get(...(params as never[])),
      run: async (...params: SqlParam[]) => raw.prepare(sql).run(...(params as never[])),
    }),
  }
}

describe('normalizeDialect', () => {
  it('maps connector and driver names', () => {
    expect(normalizeDialect('node-sqlite')).toBe('sqlite')
    expect(normalizeDialect('libsql')).toBe('sqlite')
    expect(normalizeDialect('mysql2')).toBe('mysql')
    expect(normalizeDialect('MariaDB')).toBe('mysql')
    expect(normalizeDialect('postgres')).toBe('postgresql')
    expect(normalizeDialect('pglite')).toBe('postgresql')
    expect(normalizeDialect('oracle')).toBeUndefined()
    expect(normalizeDialect(undefined)).toBeUndefined()
  })
})

describe('createSqlStores validation', () => {
  it('rejects unsafe table prefixes', () => {
    for (const prefix of ['', 'Bad', '1x', 'a-b', 'x; DROP TABLE y', 'a'.repeat(26)]) {
      expect(() => createSqlStores({ db: sqliteDb(), prefix })).toThrow(/Invalid table prefix/)
    }
  })

  it('creates the three tables with the default prefix', async () => {
    const db = sqliteDb()
    await createSqlStores({ db }).ensureSchema()
    const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>
    expect(tables.map((t) => t.name)).toEqual(['modular_locks', 'modular_migrations', 'modular_toggles'])
  })
})

// One shared in-memory database per run, so several "connections" see the same data.
let counter = 0
const shared = new DatabaseSync(':memory:')
describeSqlStores('SQLite', {
  open: () => sqliteDb(shared),
  raw: async (db, sql) => void (db as ReturnType<typeof sqliteDb>).raw.exec(sql),
  prefix: () => `t${++counter}_`,
})
