import { seeders } from '#nuxt-modular/seeders'
import { manifests } from '#nuxt-modular/server-manifests'
import {
  planSeeders,
  runSeeders,
  type SeederContext,
  type SeederContextBase,
  type SeederReport,
  sortByDependencies,
} from '@nuxt-modular/core/runtime'
import { describeError } from '../utils/describe-error'
import { useModularDatabase } from './database'
import { useModularToggles } from './toggles'
import { useModularServerHooks } from './utils'

export interface SeedOptions {
  /** Restrict to these extension ids. */
  readonly extensions?: readonly string[]
  /** Restrict to seeders with these names (e.g. `001-demo-data`). */
  readonly names?: readonly string[]
  /** Also seed extensions switched off by a persistent toggle. Default `false`. */
  readonly includeInactive?: boolean
}

export interface ModularSeeders {
  /** Seeders that `run()` would execute with these options, in order. */
  list(options?: SeedOptions): Promise<Array<{ extensionId: string; name: string }>>
  run(options?: SeedOptions): Promise<SeederReport>
}

const order = sortByDependencies(manifests)

/**
 * Runs extension seeders (`server/seeders/*`). Seeders are not recorded:
 * write them to be idempotent. Extend the seeder context (database client, …)
 * with the `modular:seeder-context` filter hook.
 */
export function useModularSeeders(): ModularSeeders {
  const selection = async (options: SeedOptions) => {
    const inactive = options.includeInactive ? new Set<string>() : await useModularToggles().getInactive()
    const extensions = (options.extensions ?? order).filter((id) => !inactive.has(id))
    return { entries: seeders, order, extensions, ...(options.names ? { names: options.names } : {}) }
  }

  return {
    async list(options = {}) {
      return planSeeders(await selection(options)).map(({ extensionId, name }) => ({ extensionId, name }))
    },
    async run(options = {}) {
      const report = await runSeeders({
        ...(await selection(options)),
        createContext: async (base: SeederContextBase) => {
          const database = await useModularDatabase()
          const seeded = database ? { ...base, db: database.db, dialect: database.dialect } : base
          return useModularServerHooks().applyFilter('modular:seeder-context', seeded as SeederContext)
        },
        log: (message) => console.info(`[nuxt-modular] seeder ${message}`),
      })
      if (report.failed) {
        console.error(`[nuxt-modular] seeder ${report.failed.extensionId}/${report.failed.name} failed: ${describeError(report.failed.error)}`)
      }
      return report
    },
  }
}
