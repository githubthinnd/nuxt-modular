/*
 * Runs the shared store suite on a real PostgreSQL engine without a server:
 * PGlite is PostgreSQL compiled to WebAssembly, so the DDL, `?` → `$n`
 * placeholders, BIGINT handling and unique-key lock semantics are verified for
 * the PostgreSQL dialect on every test run.
 */
import { PGlite } from '@electric-sql/pglite'
import type { SqlDatabase, SqlParam } from '../src/sql'
import { describeSqlStores } from './sql-suite'

const pg = new PGlite()

// The translation db0's PostgreSQL connector performs.
const normalize = (sql: string) => {
  let index = 0
  return sql.replace(/\?/g, () => `$${++index}`)
}

const db: SqlDatabase = {
  exec: (sql) => pg.exec(sql),
  prepare: (sql) => ({
    all: async (...params: SqlParam[]) => (await pg.query(normalize(sql), params)).rows,
    get: async (...params: SqlParam[]) => (await pg.query(normalize(sql), params)).rows[0],
    run: (...params: SqlParam[]) => pg.query(normalize(sql), params),
  }),
}

let counter = 0
describeSqlStores('PostgreSQL (PGlite)', {
  open: () => db,
  raw: async (handle, sql) => void (await handle.exec(sql)),
  prefix: () => `pg${++counter}_`,
})
