import { type ComputedRef, computed } from 'vue'
import { useRequestEvent, useState } from '#app'
import { manifests } from '#nuxt-modular/manifests'
import {
  capabilitiesForRoles,
  createRegistryState,
  type ExtensionManifest,
  findMissingDependencies,
  isExtensionActive,
  type NavigationNode,
  registerExtension,
  type RegisterOptions,
  type RegisterOutcome,
  type RegistryEntry,
  type RegistryState,
  resolveNavigation,
  resolveSlots,
  type ResolvedSlot,
} from '@nuxt-modular/core/runtime'
import { getModularContext } from '../server/context'
import { useModularPermissions } from './useModularPermissions'

export const REGISTRY_STATE_KEY = 'nuxt-modular:registry'
export const PERSISTED_STATE_KEY = 'nuxt-modular:persisted'

/** Per-request, serializable part of the registry. */
export interface RuntimeRegistryState {
  /** Extensions registered at runtime with `register()`. */
  registered: Record<string, RegistryEntry>
  /** Session overrides set with `setModuleActive()`; win over persistent ones. */
  overrides: Record<string, boolean>
}

/** Persistent feature toggles loaded from the server during SSR. */
export interface PersistedToggleState {
  loaded: boolean
  overrides: Record<string, boolean>
}

export interface ExtensionInfo {
  readonly id: string
  readonly manifest: ExtensionManifest
  readonly active: boolean
  readonly source: 'build' | 'runtime'
  /** Persistent override from the server, `null` when following the manifest. */
  readonly persistedOverride: boolean | null
  /** Session override from `setModuleActive()`, `null` when unset. */
  readonly sessionOverride: boolean | null
  readonly missingDependencies: readonly string[]
}

export interface ModuleRegistry {
  /** Every registered extension, sorted by id. */
  readonly extensions: ComputedRef<readonly ExtensionInfo[]>
  /** Registers a validated manifest at runtime. Its components must exist in the build. */
  register(manifest: ExtensionManifest, options?: RegisterOptions): RegisterOutcome
  /** Removes a runtime-registered extension. Build-time extensions can only be deactivated. */
  unregister(id: string): boolean
  /** Ordered, permission-checked slots for an outlet. Reactive when called inside a computed/render. */
  getSlotComponents(outlet: string): ResolvedSlot[]
  /** Navigation tree under a host menu id (e.g. `sidebar`); `undefined` returns root items. */
  getNavigation(parent?: string): NavigationNode[]
  isModuleActive(id: string): boolean
  /**
   * Session override (this request on the server, this tab on the client).
   * `null` falls back to the persistent toggle, then to the manifest default.
   */
  setModuleActive(id: string, active: boolean | null): void
  /** Capabilities the registered extensions grant by default to these roles. */
  capabilitiesForRoles(roles: Iterable<string>): string[]
}

// Build-time manifests are identical on server and client and never change,
// so they stay out of the payload and are shared safely across requests.
const buildState: Readonly<RegistryState> = createRegistryState(manifests)
Object.freeze(buildState.extensions)

export function usePersistedToggleState() {
  return useState<PersistedToggleState>(PERSISTED_STATE_KEY, () => ({ loaded: false, overrides: {} }))
}

/**
 * Loads persistent toggles for the current request (server only, once). The
 * result travels to the client in the payload, so both sides agree.
 */
export async function loadPersistedToggles(server: boolean = import.meta.server): Promise<void> {
  if (!server) return
  const persisted = usePersistedToggleState()
  if (persisted.value.loaded) return
  const event = useRequestEvent()
  const context = event ? getModularContext(event) : undefined
  let overrides: Record<string, boolean> = {}
  try {
    overrides = context ? await context.getOverrides() : {}
  } catch (error) {
    console.error(`[nuxt-modular] could not load extension toggles: ${error instanceof Error ? error.message : String(error)}`)
  }
  persisted.value = { loaded: true, overrides }
}

export function useModuleRegistry(): ModuleRegistry {
  const runtime = useState<RuntimeRegistryState>(REGISTRY_STATE_KEY, () => ({ registered: {}, overrides: {} }))
  const persisted = usePersistedToggleState()
  const permissions = useModularPermissions()

  const state = computed<RegistryState>(() => ({
    extensions: { ...buildState.extensions, ...runtime.value.registered },
    overrides: { ...persisted.value.overrides, ...runtime.value.overrides },
  }))

  const extensions = computed<ExtensionInfo[]>(() =>
    Object.keys(state.value.extensions)
      .sort()
      .flatMap((id) => {
        const entry = state.value.extensions[id]
        if (!entry) return []
        return [
          {
            id,
            manifest: entry.manifest,
            active: isExtensionActive(state.value, id),
            source: id in runtime.value.registered ? ('runtime' as const) : ('build' as const),
            persistedOverride: persisted.value.overrides[id] ?? null,
            sessionOverride: runtime.value.overrides[id] ?? null,
            missingDependencies: findMissingDependencies(state.value, id),
          },
        ]
      }),
  )

  return {
    extensions,
    register(manifest, options) {
      const draft: RegistryState = { extensions: { ...state.value.extensions }, overrides: {} }
      const outcome = registerExtension(draft, manifest, options)
      const entry = draft.extensions[manifest.id]
      if ((outcome === 'registered' || outcome === 'replaced') && entry) {
        runtime.value.registered[manifest.id] = entry
      }
      return outcome
    },
    unregister(id) {
      if (!(id in runtime.value.registered)) return false
      delete runtime.value.registered[id]
      if (!(id in buildState.extensions)) delete runtime.value.overrides[id]
      return true
    },
    getSlotComponents(outlet) {
      return resolveSlots(state.value, outlet, permissions.can)
    },
    getNavigation(parent) {
      return resolveNavigation(state.value, permissions.can, parent)
    },
    isModuleActive(id) {
      return isExtensionActive(state.value, id)
    },
    setModuleActive(id, active) {
      if (active === null) delete runtime.value.overrides[id]
      else runtime.value.overrides[id] = active
    },
    capabilitiesForRoles(roles) {
      return capabilitiesForRoles(state.value, roles)
    },
  }
}
