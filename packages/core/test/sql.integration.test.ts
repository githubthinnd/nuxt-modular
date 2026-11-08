/*
 * Runs the shared store suite against real PostgreSQL and MySQL/MariaDB servers.
 * Skipped unless TEST_POSTGRES_URL / TEST_MYSQL_URL are set (CI starts both as
 * service containers; locally: docker run -p 5432:5432 -e POSTGRES_PASSWORD=pw postgres).
 * Needs the `pg` and `mysql2` packages, which CI installs on demand.
 */
import { describe } from 'vitest'
import type { SqlDatabase, SqlParam } from '../src/sql'
import { describeSqlStores } from './sql-suite'

const postgresUrl = process.env.TEST_POSTGRES_URL
const mysqlUrl = process.env.TEST_MYSQL_URL
let counter = 0
const prefix = () => `t${Date.now().toString(36)}${++counter}_`

interface Connection extends SqlDatabase {
  close(): Promise<void>
}

async function postgres(url: string): Promise<Connection> {
  const driver = 'pg' // a variable keeps TypeScript from requiring the optional driver
  const { default: pg } = (await import(driver)) as { default: { Client: new (url: string) => { connect(): Promise<void>; query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>; end(): Promise<void> } } }
  const client = new pg.Client(url)
  await client.connect()
  // Same translation db0's PostgreSQL connector performs.
  const normalize = (sql: string) => {
    let index = 0
    return sql.replace(/\?/g, () => `$${++index}`)
  }
  return {
    exec: (sql) => client.query(sql),
    prepare: (sql) => ({
      all: async (...params: SqlParam[]) => (await client.query(normalize(sql), params)).rows,
      get: async (...params: SqlParam[]) => (await client.query(normalize(sql), params)).rows[0],
      run: (...params: SqlParam[]) => client.query(normalize(sql), params),
    }),
    close: () => client.end(),
  }
}

async function mysql(url: string): Promise<Connection> {
  const driver = 'mysql2/promise'
  const { default: mysql2 } = (await import(driver)) as {
    default: { createConnection(options: { uri: string }): Promise<{ query(sql: string, params?: unknown[]): Promise<[unknown]>; end(): Promise<void> }> }
  }
  const connection = await mysql2.createConnection({ uri: url })
  const query = async (sql: string, params?: unknown[]) => (await connection.query(sql, params))[0]
  return {
    exec: (sql) => query(sql),
    prepare: (sql) => ({
      all: async (...params: SqlParam[]) => (await query(sql, params)) as unknown[],
      get: async (...params: SqlParam[]) => ((await query(sql, params)) as unknown[])[0],
      run: (...params: SqlParam[]) => query(sql, params),
    }),
    close: () => connection.end(),
  }
}

function suite(name: string, url: string | undefined, connect: (url: string) => Promise<Connection>): void {
  if (!url) {
    describe.skip(`createSqlStores (${name}) — set TEST_${name === 'PostgreSQL' ? 'POSTGRES' : 'MYSQL'}_URL`, () => {})
    return
  }
  const opened: Connection[] = []
  describeSqlStores(name, {
    open: async () => {
      const connection = await connect(url)
      opened.push(connection)
      return connection
    },
    raw: async (db, sql) => void (await db.exec(sql)),
    prefix,
  })
}

suite('PostgreSQL', postgresUrl, postgres)
suite('MySQL', mysqlUrl, mysql)
