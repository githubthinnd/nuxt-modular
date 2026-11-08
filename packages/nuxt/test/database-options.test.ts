import { describe, expect, it } from 'vitest'
import { connectorOptions, dialectOf, inferConnector, resolveDatabaseInput, sqlitePath } from '../src/runtime/utils/database-options'

describe('inferConnector', () => {
  it.each([
    ['postgresql://u:p@h/db', 'postgresql'],
    ['postgres://u:p@h/db', 'postgresql'],
    ['mysql://u:p@h/db', 'mysql2'],
    ['mariadb://h/db', 'mysql2'],
    ['sqlite:./a.db', 'node-sqlite'],
    ['file:./a.db', 'node-sqlite'],
    [':memory:', 'node-sqlite'],
    ['libsql://x.turso.io', 'libsql'],
    ['https://example.com', undefined],
    ['nonsense', undefined],
  ])('%s → %s', (url, expected) => expect(inferConnector(url)).toBe(expected))
})

describe('connectorOptions', () => {
  it('shapes options per connector', () => {
    expect(connectorOptions('postgresql', 'postgresql://h/db')).toEqual({ url: 'postgresql://h/db' })
    expect(connectorOptions('mysql2', 'mysql://h/db')).toEqual({ uri: 'mysql://h/db' })
    expect(connectorOptions('node-sqlite', 'sqlite:./.data/m.db')).toEqual({ path: './.data/m.db' })
    expect(connectorOptions('better-sqlite3', 'file://./m.db')).toEqual({ path: './m.db' })
    expect(connectorOptions('node-sqlite', 'sqlite::memory:')).toEqual({ name: ':memory:' })
    expect(connectorOptions('libsql', 'libsql://x', { authToken: 't' })).toEqual({ url: 'libsql://x', authToken: 't' })
  })

  it('lets explicit options win and works without a url', () => {
    expect(connectorOptions('postgresql', 'postgresql://h/db', { url: 'postgresql://other/db', ssl: true })).toEqual({ url: 'postgresql://other/db', ssl: true })
    expect(connectorOptions('mysql2', undefined, { host: 'h', user: 'u' })).toEqual({ host: 'h', user: 'u' })
  })

  it('extracts sqlite paths', () => {
    expect(sqlitePath('sqlite:./a.db')).toBe('./a.db')
    expect(sqlitePath('sqlite:///abs/a.db')).toBe('/abs/a.db')
    expect(sqlitePath('sqlite:')).toBe(':memory:')
  })
})

describe('resolveDatabaseInput', () => {
  it('is disabled for undefined and false', () => {
    expect(resolveDatabaseInput(undefined)).toBeUndefined()
    expect(resolveDatabaseInput(false)).toBeUndefined()
  })

  it('accepts a URL string and infers connector and dialect', () => {
    expect(resolveDatabaseInput('postgresql://h/db')).toMatchObject({ connector: 'postgresql', dialect: 'postgresql', prefix: 'modular_', url: 'postgresql://h/db' })
    expect(resolveDatabaseInput('mysql://h/db')).toMatchObject({ connector: 'mysql2', dialect: 'mysql' })
    expect(resolveDatabaseInput('sqlite:./m.db')).toMatchObject({ connector: 'node-sqlite', dialect: 'sqlite' })
  })

  it('accepts a connector without a url (url comes from the environment)', () => {
    const resolved = resolveDatabaseInput({ connector: 'postgresql', prefix: 'mod_' })
    expect(resolved).toMatchObject({ connector: 'postgresql', prefix: 'mod_' })
    expect(resolved?.url).toBeUndefined()
  })

  it('supports a custom handler that declares its dialect', () => {
    expect(resolveDatabaseInput({ handler: '~/server/db', dialect: 'postgresql' })).toMatchObject({ handler: '~/server/db', dialect: 'postgresql' })
    expect(() => resolveDatabaseInput({ handler: '~/server/db' })).toThrow(/needs `dialect`/)
  })

  it('explains how to fix invalid input', () => {
    expect(() => resolveDatabaseInput({})).toThrow(/needs a `url`/)
    expect(() => resolveDatabaseInput('https://example.com')).toThrow(/set `modular.database.connector`/)
    expect(() => resolveDatabaseInput({ connector: 'oracle' as never })).toThrow(/Unknown connector/)
  })

  it('maps dialects', () => {
    expect(dialectOf('mysql2')).toBe('mysql')
    expect(dialectOf('libsql')).toBe('sqlite')
    expect(dialectOf('custom', 'postgresql')).toBe('postgresql')
    expect(() => dialectOf('custom')).toThrow(/Unknown SQL dialect/)
  })
})
