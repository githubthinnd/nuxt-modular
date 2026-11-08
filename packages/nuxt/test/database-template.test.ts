import { describe, expect, it } from 'vitest'
import { CONNECTOR_DRIVERS, CONNECTORS, connectorModule } from '../src/runtime/utils/database-options'
import { databaseTemplate } from '../src/templates'

const base = { connector: 'postgresql', dialect: 'postgresql', connectorFile: '/x/db0/connectors/postgresql.mjs', db0File: '/x/db0/index.mjs' }

describe('databaseTemplate', () => {
  it('exports undefined placeholders when no database is configured', () => {
    const code = databaseTemplate(undefined)
    expect(code).toContain('export const createModularDatabase = undefined')
    expect(code).not.toContain('import ')
  })

  it('hands the driver to the connector as `lib` for db0 >= 0.4', () => {
    const code = databaseTemplate({ ...base, driverFile: '/app/node_modules/pg/lib/index.js' })
    expect(code).toContain('import connector from "/x/db0/connectors/postgresql.mjs"')
    expect(code).toContain('connector({ ...options, lib: () => import("/app/node_modules/pg/lib/index.js") })')
    expect(code).toContain('export const dialectName = "postgresql"')
  })

  it('calls the connector with the plain options otherwise (db0 0.3, or a connector without a driver)', () => {
    expect(databaseTemplate(base)).toContain('createDatabase(connector(options))')
    expect(databaseTemplate(base)).not.toContain('lib:')
  })

  it('imports a custom handler and keeps its dialect', () => {
    const code = databaseTemplate({ handler: '/app/server/db.ts', dialect: 'mysql' })
    expect(code).toContain('import handler from "/app/server/db.ts"')
    expect(code).toContain('createModularDatabase = () => handler()')
    expect(code).toContain('export const dialectName = "mysql"')
  })
})

describe('connector drivers', () => {
  it('names the driver package every driver-based connector loads', () => {
    expect(CONNECTOR_DRIVERS.postgresql).toEqual({ name: 'pg' })
    expect(CONNECTOR_DRIVERS.mysql2).toEqual({ name: 'mysql2', import: 'mysql2/promise' })
    expect(CONNECTOR_DRIVERS.pglite?.name).toBe('@electric-sql/pglite')
  })

  it('needs no driver for the built-in SQLite connector', () => {
    expect(CONNECTOR_DRIVERS['node-sqlite']).toBeUndefined()
    expect(CONNECTOR_DRIVERS['bun-sqlite']).toBeUndefined()
  })

  it('maps every connector to a db0 module (libsql lives in a sub-folder)', () => {
    expect(connectorModule('libsql')).toBe('libsql/node')
    for (const connector of CONNECTORS.filter((name) => name !== 'libsql')) expect(connectorModule(connector)).toBe(connector)
  })
})
