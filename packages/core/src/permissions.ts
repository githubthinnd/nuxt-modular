import type { PermissionRequirement } from './manifest'

/** Granting this capability satisfies every requirement. */
export const WILDCARD_PERMISSION = '*'

/** Decides whether the current viewer satisfies a requirement. */
export type PermissionChecker = (requirement: PermissionRequirement | undefined) => boolean

/**
 * Evaluates a permission requirement against a set of granted capabilities.
 * An absent requirement is always satisfied.
 */
export function hasPermission(
  requirement: PermissionRequirement | undefined,
  granted: ReadonlySet<string>,
): boolean {
  if (requirement === undefined) return true
  if (granted.has(WILDCARD_PERMISSION)) return true
  if (typeof requirement === 'string') return granted.has(requirement)
  if ('anyOf' in requirement) return requirement.anyOf.some((capability) => granted.has(capability))
  return requirement.allOf.every((capability) => granted.has(capability))
}

export function createPermissionChecker(granted: Iterable<string>): PermissionChecker {
  const set = new Set(granted)
  return (requirement) => hasPermission(requirement, set)
}

/** A checker that grants everything; useful for tooling and tests. */
export const allowAll: PermissionChecker = () => true
