import { useStorage } from 'nitropack/runtime'
import { manifests } from '#nuxt-modular/server-manifests'
import {
  createRegistryState,
  findMissingDependencies,
  isExtensionActive,
  type RegistryState,
} from '@nuxt-modular/core/runtime'
import { useModularConfig } from './config'
import { useModularServerHooks } from './utils'

export interface ExtensionToggleState {
  readonly id: string
  readonly name: string
  readonly version: string
  /** `manifest.enabled` — the state without any override. */
  readonly enabledByDefault: boolean
  /** Persistent override, or `null` when following the default. */
  readonly override: boolean | null
  /** Effective state, including dependencies. */
  readonly active: boolean
  readonly missingDependencies: readonly string[]
}

export interface ModularToggles {
  /** Whether persistent toggles are enabled (`modular.toggles`). */
  readonly enabled: boolean
  getOverrides(): Promise<Record<string, boolean>>
  /** Ids of built extensions that are inactive with the current overrides. */
  getInactive(): Promise<ReadonlySet<string>>
  list(): Promise<ExtensionToggleState[]>
  /**
   * Persists an override for every server instance sharing the storage;
   * `null` restores the manifest default.
   * @throws when toggles are disabled or the id is not a built extension.
   */
  set(id: string, active: boolean | null): Promise<void>
}

const STORAGE_KEY = 'toggles'
const buildState: Readonly<RegistryState> = createRegistryState(manifests)

let cache: { at: number; value: Promise<Record<string, boolean>> } | undefined

function sanitize(value: unknown): Record<string, boolean> {
  const overrides: Record<string, boolean> = {}
  if (typeof value !== 'object' || value === null) return overrides
  for (const [id, active] of Object.entries(value)) {
    if (id in buildState.extensions && typeof active === 'boolean') overrides[id] = active
  }
  return overrides
}

/**
 * Persistent feature toggles for extensions, stored in Nitro storage
 * (`modular.storage`, default mount `nuxt-modular`, key `toggles`).
 * Reads are cached per server process for `modular.toggles.ttl` ms.
 */
export function useModularToggles(): ModularToggles {
  const config = useModularConfig()
  const storage = () => useStorage(config.storage)

  const getOverrides = (): Promise<Record<string, boolean>> => {
    if (!config.toggles.enabled) return Promise.resolve({})
    const now = Date.now()
    if (!cache || now - cache.at > config.toggles.ttl) {
      const value = storage()
        .getItem(STORAGE_KEY)
        .then(sanitize)
        .catch((error: unknown) => {
          cache = undefined
          throw error
        })
      cache = { at: now, value }
    }
    return cache.value.then((overrides) => ({ ...overrides }))
  }

  const stateWith = (overrides: Record<string, boolean>): RegistryState => ({
    extensions: buildState.extensions,
    overrides,
  })

  return {
    enabled: config.toggles.enabled,
    getOverrides,
    async getInactive() {
      const state = stateWith(await getOverrides())
      return new Set(Object.keys(state.extensions).filter((id) => !isExtensionActive(state, id)))
    },
    async list() {
      const overrides = await getOverrides()
      const state = stateWith(overrides)
      return Object.keys(state.extensions)
        .sort()
        .flatMap((id) => {
          const entry = state.extensions[id]
          if (!entry) return []
          return [
            {
              id,
              name: entry.manifest.name,
              version: entry.manifest.version,
              enabledByDefault: entry.manifest.enabled,
              override: overrides[id] ?? null,
              active: isExtensionActive(state, id),
              missingDependencies: findMissingDependencies(state, id),
            },
          ]
        })
    },
    async set(id, active) {
      if (!config.toggles.enabled) throw new Error('[nuxt-modular] Persistent toggles are disabled (`modular.toggles: false`)')
      if (!(id in buildState.extensions)) throw new Error(`[nuxt-modular] Unknown extension "${id}"`)
      const current = sanitize(await storage().getItem(STORAGE_KEY))
      if (active === null) delete current[id]
      else current[id] = active
      await storage().setItem(STORAGE_KEY, current)
      cache = undefined
      await useModularServerHooks().callHook('modular:extension-toggled', id, active)
    },
  }
}
