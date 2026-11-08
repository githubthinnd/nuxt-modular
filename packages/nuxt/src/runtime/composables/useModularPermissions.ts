import { type ComputedRef, computed } from 'vue'
import { useState } from '#app'
import { manifests } from '#nuxt-modular/manifests'
import {
  capabilitiesForRoles,
  createPermissionChecker,
  createRegistryState,
  type PermissionRequirement,
} from '@nuxt-modular/core/runtime'

export const PERMISSIONS_STATE_KEY = 'nuxt-modular:permissions'

export interface ModularPermissions {
  /** Capabilities granted to the current viewer, sorted and de-duplicated. */
  readonly granted: ComputedRef<readonly string[]>
  /** Replaces the granted capabilities. `'*'` grants everything. */
  set(capabilities: Iterable<string>): void
  /**
   * Grants the capabilities build-time extensions declare for these roles in
   * `permissions[].defaultRoles`, plus `extra` host capabilities. Replaces
   * the current set.
   */
  setRoles(roles: Iterable<string>, extra?: Iterable<string>): void
  grant(...capabilities: string[]): void
  revoke(...capabilities: string[]): void
  /** Whether the viewer satisfies a requirement; an absent requirement always passes. */
  can(requirement?: PermissionRequirement): boolean
}

const normalize = (capabilities: Iterable<string>): string[] => [...new Set(capabilities)].sort()

/**
 * Viewer capabilities used to filter outlets and navigation. The host sets
 * them (typically in a plugin or middleware that reads the session); they
 * live in `useState`, so server and client evaluate permissions identically.
 */
export function useModularPermissions(): ModularPermissions {
  const granted = useState<string[]>(PERMISSIONS_STATE_KEY, () => [])
  const checker = computed(() => createPermissionChecker(granted.value))

  return {
    granted: computed(() => granted.value),
    set(capabilities) {
      granted.value = normalize(capabilities)
    },
    setRoles(roles, extra = []) {
      granted.value = normalize([...capabilitiesForRoles(createRegistryState(manifests), roles), ...extra])
    },
    grant(...capabilities) {
      granted.value = normalize([...granted.value, ...capabilities])
    },
    revoke(...capabilities) {
      const removed = new Set(capabilities)
      granted.value = granted.value.filter((capability) => !removed.has(capability))
    },
    can(requirement) {
      return checker.value(requirement)
    },
  }
}
