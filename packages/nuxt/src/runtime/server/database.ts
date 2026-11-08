import { connectorName, createModularDatabase, dialectName } from '#nuxt-modular/database'
import type { SqlDatabase, SqlDialect } from '@nuxt-modular/core/runtime'
import { connectorOptions } from '../utils/database-options'
import { useModularConfig } from './config'

export interface ModularDatabase {
  /** A db0-compatible database: `await db.prepare('select …').all(params)`, `db.exec(sql)`, `db.sql\`…\``. */
  readonly db: SqlDatabase
  readonly dialect: SqlDialect
  /** Prefix of the tables nuxt-modular itself creates. */
  readonly prefix: string
}

let instance: Promise<ModularDatabase | undefined> | undefined

/**
 * The database configured with `modular.database` (shared by the migration
 * ledger, toggles, migration/seeder contexts and your own code), or
 * `undefined` when none is configured. The connection opens on first use.
 */
export function useModularDatabase(): Promise<ModularDatabase | undefined> {
  const config = useModularConfig()
  if (!config.database.enabled || !createModularDatabase) return Promise.resolve(undefined)
  instance ??= (async () => {
    const options = connectorOptions(connectorName ?? '', config.database.url || undefined, config.database.options)
    if (connectorName && !config.database.url && !Object.keys(options).length) {
      throw new Error('[nuxt-modular] No database URL: set the NUXT_MODULAR_DATABASE_URL environment variable (or `modular.database.url`)')
    }
    const db = (await createModularDatabase(options)) as SqlDatabase
    return { db, dialect: dialectName, prefix: config.database.prefix }
  })().catch((error: unknown) => {
    instance = undefined // retry on the next call instead of caching a failure
    throw error
  })
  return instance
}

/** Closes the connection (server shutdown). */
export async function closeModularDatabase(): Promise<void> {
  const current = await instance?.catch(() => undefined)
  instance = undefined
  await (current?.db as { dispose?: () => unknown } | undefined)?.dispose?.()
}
