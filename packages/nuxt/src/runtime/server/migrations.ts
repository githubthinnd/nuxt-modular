import { migrations } from '#nuxt-modular/migrations'
import { manifests } from '#nuxt-modular/server-manifests'
import {
  type ExtensionMigrationStatus,
  type MigrationContext,
  type MigrationContextBase,
  type MigrationLedger,
  type MigrationReport,
  migrationStatus,
  runMigrationsDown,
  runMigrationsReset,
  runMigrationsUp,
  sortByDependencies,
} from '@nuxt-modular/core/runtime'
import { describeError } from '../utils/describe-error'
import { useModularDatabase } from './database'
import { useModularStateStore } from './state-store'
import { useModularToggles } from './toggles'
import { useModularServerHooks } from './utils'

export interface MigrationUpOptions {
  /** Restrict to these extension ids. */
  readonly extensions?: readonly string[]
  /** Also migrate extensions switched off by a persistent toggle. Default `false`. */
  readonly includeInactive?: boolean
}

export interface ModularMigrations {
  status(): Promise<ExtensionMigrationStatus[]>
  up(options?: MigrationUpOptions): Promise<MigrationReport>
  down(extensionId: string, steps?: number): Promise<MigrationReport>
  /** Reverts every applied migration (dependents first, newest first). Destructive. */
  reset(options?: Pick<MigrationUpOptions, 'extensions'>): Promise<MigrationReport>
  /** `reset()` followed by `up()`. Destructive. */
  refresh(options?: Pick<MigrationUpOptions, 'extensions'>): Promise<MigrationReport>
}

/** A migration run is already in progress (another request or server instance). */
export class MigrationLockError extends Error {
  override readonly name = 'MigrationLockError'
}

const LOCK_TTL_MS = 5 * 60 * 1000
const order = sortByDependencies(manifests)

/**
 * Runs extension migrations (`server/migrations/*`). The ledger and a
 * best-effort lock live in Nitro storage (`modular.storage`). Extend the
 * migration context (database client, …) with the `modular:migration-context`
 * filter hook.
 */
export function useModularMigrations(): ModularMigrations {
  // Resolved per call: SQL tables when `modular.database` is set, Nitro storage otherwise.
  const ledger: MigrationLedger = {
    applied: async (extensionId) => (await useModularStateStore()).ledger.applied(extensionId),
    record: async (extensionId, name) => (await useModularStateStore()).ledger.record(extensionId, name),
    remove: async (extensionId, name) => (await useModularStateStore()).ledger.remove(extensionId, name),
  }

  // The configured database is handed to every migration; the host filter may still add or replace fields.
  const createContext = async (base: MigrationContextBase): Promise<MigrationContext> => {
    const database = await useModularDatabase()
    const seeded = database ? { ...base, db: database.db, dialect: database.dialect } : base
    return useModularServerHooks().applyFilter('modular:migration-context', seeded as MigrationContext)
  }

  const log = (message: string) => console.info(`[nuxt-modular] migration ${message}`)

  const withLock = async <T>(run: () => Promise<T>): Promise<T> => {
    const release = await (await useModularStateStore()).acquireLock('migrations', LOCK_TTL_MS)
    if (!release) throw new MigrationLockError('[nuxt-modular] Migrations are already running')
    try {
      return await run()
    } finally {
      await release()
    }
  }

  const report = (result: MigrationReport): MigrationReport => {
    if (result.failed) {
      console.error(
        `[nuxt-modular] migration ${result.failed.extensionId}/${result.failed.name} failed: ${describeError(result.failed.error)}`,
      )
    }
    return result
  }

  return {
    status() {
      return migrationStatus({ entries: migrations, ledger, order })
    },
    async up(options = {}) {
      const inactive = options.includeInactive ? new Set<string>() : await useModularToggles().getInactive()
      const extensions = (options.extensions ?? order).filter((id) => !inactive.has(id))
      return withLock(async () => report(await runMigrationsUp({ entries: migrations, ledger, createContext, order, extensions, log })))
    },
    down(extensionId, steps = 1) {
      return withLock(async () => report(await runMigrationsDown({ entries: migrations, ledger, createContext, extensionId, steps, log })))
    },
    reset(options = {}) {
      return withLock(async () =>
        report(await runMigrationsReset({ entries: migrations, ledger, createContext, order, extensions: options.extensions, log })),
      )
    },
    refresh(options = {}) {
      return withLock(async () => {
        const reverted = report(await runMigrationsReset({ entries: migrations, ledger, createContext, order, extensions: options.extensions, log }))
        if (reverted.failed) return reverted
        const applied = report(await runMigrationsUp({ entries: migrations, ledger, createContext, order, extensions: options.extensions ?? order, log }))
        return { executed: [...reverted.executed, ...applied.executed], ...(applied.failed ? { failed: applied.failed } : {}) }
      })
    },
  }
}
