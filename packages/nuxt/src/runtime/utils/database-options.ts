import { normalizeDialect, type SqlDialect } from '@nuxt-modular/core/runtime'

/** db0 connectors the module can load by name. */
export const CONNECTORS = ['postgresql', 'mysql2', 'node-sqlite', 'better-sqlite3', 'libsql', 'pglite', 'planetscale', 'bun-sqlite', 'sqlite3'] as const
export type ConnectorName = (typeof CONNECTORS)[number]

/**
 * The npm package each connector loads at runtime. db0 ≥ 0.4 imports it from db0's own location, which a strict
 * package manager (pnpm) cannot resolve for a package installed in the *app*, so the module resolves the driver
 * itself and hands it to the connector (`lib`). `import` is the specifier to load when it differs from the name.
 */
export const CONNECTOR_DRIVERS: Readonly<Partial<Record<ConnectorName, { readonly name: string; readonly import?: string }>>> = {
  postgresql: { name: 'pg' },
  mysql2: { name: 'mysql2', import: 'mysql2/promise' },
  'better-sqlite3': { name: 'better-sqlite3' },
  libsql: { name: '@libsql/client' },
  pglite: { name: '@electric-sql/pglite' },
  planetscale: { name: '@planetscale/database' },
  sqlite3: { name: 'sqlite3' },
}

/** The db0 module that implements a connector (`libsql` lives in a sub-folder). */
export const connectorModule = (connector: string): string => (connector === 'libsql' ? 'libsql/node' : connector)

const SCHEMES: Record<string, ConnectorName> = {
  postgres: 'postgresql',
  postgresql: 'postgresql',
  mysql: 'mysql2',
  mysql2: 'mysql2',
  mariadb: 'mysql2',
  sqlite: 'node-sqlite',
  file: 'node-sqlite',
  libsql: 'libsql',
  pglite: 'pglite',
}

/** Picks the connector from a connection URL (`postgresql://…`, `mysql://…`, `sqlite:./db.sqlite`, …). */
export function inferConnector(url: string): ConnectorName | undefined {
  if (url === ':memory:') return 'node-sqlite'
  const scheme = /^([a-z0-9+.-]+):/i.exec(url)?.[1]?.toLowerCase()
  return scheme ? SCHEMES[scheme] : undefined
}

export function dialectOf(connector: string, override?: string): SqlDialect {
  const dialect = normalizeDialect(override ?? connector)
  if (!dialect) throw new Error(`[nuxt-modular] Unknown SQL dialect for "${override ?? connector}"; set modular.database.dialect to sqlite, mysql or postgresql`)
  return dialect
}

const isSqliteFamily = (connector: string) => normalizeDialect(connector) === 'sqlite'

/** `sqlite:./a.db`, `file:./a.db`, `sqlite://./a.db` → `./a.db`; `:memory:` variants → `':memory:'`. */
export function sqlitePath(url: string): string {
  const stripped = url.replace(/^(?:sqlite|file):(?:\/\/)?/i, '')
  return stripped === '' ? ':memory:' : stripped
}

/**
 * Connector options from a URL plus explicit overrides. Explicit `options`
 * always win, so any driver-specific setting stays reachable.
 */
export function connectorOptions(connector: string, url: string | undefined, options: Record<string, unknown> = {}): Record<string, unknown> {
  if (!url) return { ...options }
  if (connector === 'mysql2') return { uri: url, ...options }
  if (connector === 'pglite') return { dataDir: url.replace(/^pglite:(?:\/\/)?/i, ''), ...options }
  if (isSqliteFamily(connector) && connector !== 'libsql') {
    const path = sqlitePath(url)
    return path === ':memory:' ? { name: ':memory:', ...options } : { path, ...options }
  }
  return { url, ...options } // postgresql, libsql, planetscale, …
}

/** What the user may write for `modular.database`. */
export type DatabaseInput =
  | false
  | string
  | {
      /** Connection URL. Prefer the `NUXT_MODULAR_DATABASE_URL` environment variable over writing it here. */
      url?: string
      /** db0 connector; inferred from `url` when omitted. */
      connector?: ConnectorName
      /** Extra connector options (win over the URL). */
      options?: Record<string, unknown>
      /** A module whose default export returns a db0-compatible database, for full control (pools, Drizzle, …). */
      handler?: string
      /** Override when the dialect cannot be derived from the connector. */
      dialect?: SqlDialect
      /** Prefix of the tables created by nuxt-modular. @default 'modular_' */
      prefix?: string
    }

export interface ResolvedDatabase {
  readonly connector?: ConnectorName
  readonly handler?: string
  readonly url?: string
  readonly options: Record<string, unknown>
  readonly dialect: SqlDialect
  readonly prefix: string
}

/** Validates the option; `undefined` when no database is configured. @throws with a fix-it message. */
export function resolveDatabaseInput(input: DatabaseInput | undefined): ResolvedDatabase | undefined {
  if (input === undefined || input === false) return undefined
  const config = typeof input === 'string' ? { url: input } : input
  const prefix = config.prefix ?? 'modular_'

  if (config.handler) {
    if (!config.dialect) throw new Error('[nuxt-modular] `modular.database.handler` needs `dialect` (sqlite, mysql or postgresql)')
    return { handler: config.handler, options: {}, dialect: config.dialect, prefix }
  }
  const connector = config.connector ?? (config.url ? inferConnector(config.url) : undefined)
  if (!connector) {
    throw new Error(
      config.url
        ? `[nuxt-modular] Cannot tell which database \`modular.database.url\` points to; set \`modular.database.connector\` (${CONNECTORS.join(', ')})`
        : `[nuxt-modular] \`modular.database\` needs a \`url\` (e.g. "postgresql://…", "mysql://…", "sqlite:./modular.db") or a \`connector\``,
    )
  }
  if (!(CONNECTORS as readonly string[]).includes(connector)) {
    throw new Error(`[nuxt-modular] Unknown connector "${connector}"; use one of ${CONNECTORS.join(', ')}`)
  }
  return {
    connector,
    ...(config.url ? { url: config.url } : {}),
    options: config.options ?? {},
    dialect: dialectOf(connector, config.dialect),
    prefix,
  }
}
