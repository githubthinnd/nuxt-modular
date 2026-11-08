import { useStorage } from 'nitropack/runtime'
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
import { useModularConfig } from './config'
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

const LOCK_KEY = 'migrations:lock'
const LOCK_TTL_MS = 5 * 60 * 1000
const order = sortByDependencies(manifests)

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : []
}

/**
 * Runs extension migrations (`server/migrations/*`). The ledger and a
 * best-effort lock live in Nitro storage (`modular.storage`). Extend the
 * migration context (database client, …) with the `modular:migration-context`
 * filter hook.
 */
export function useModularMigrations(): ModularMigrations {
  const config = useModularConfig()
  const storage = () => useStorage(config.storage)

  const ledger: MigrationLedger = {
    async applied(extensionId) {
      return names(await storage().getItem(`migrations:${extensionId}`))
    },
    async record(extensionId, name) {
      const applied = names(await storage().getItem(`migrations:${extensionId}`))
      if (!applied.includes(name)) applied.push(name)
      await storage().setItem(`migrations:${extensionId}`, applied)
    },
    async remove(extensionId, name) {
      const applied = names(await storage().getItem(`migrations:${extensionId}`)).filter((entry) => entry !== name)
      await storage().setItem(`migrations:${extensionId}`, applied)
    },
  }

  // The base context lacks host-provided fields until the filter adds them.
  const createContext = async (base: MigrationContextBase): Promise<MigrationContext> =>
    useModularServerHooks().applyFilter('modular:migration-context', base as MigrationContext)

  const log = (message: string) => console.info(`[nuxt-modular] migration ${message}`)

  const withLock = async <T>(run: () => Promise<T>): Promise<T> => {
    const held = await storage().getItem(LOCK_KEY)
    if (typeof held === 'number' && Date.now() - held < LOCK_TTL_MS) {
      throw new MigrationLockError('[nuxt-modular] Migrations are already running')
    }
    await storage().setItem(LOCK_KEY, Date.now())
    try {
      return await run()
    } finally {
      await storage().removeItem(LOCK_KEY)
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
