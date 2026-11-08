import type { ExtensionManifest, NavigationItem } from './manifest'
import { compareOrdered } from './ordering'
import type { PermissionChecker } from './permissions'
import type { JsonValue } from './json'

/*
 * Pure registry logic. State is a plain JSON-serializable object so the Nuxt
 * runtime can keep it in `useState` and ship it through the SSR payload.
 * Functions here never touch Vue or Nuxt.
 */

export interface RegistryEntry {
  readonly manifest: ExtensionManifest
  /** Registration sequence number; informational only, never used for ordering. */
  readonly seq: number
}

export interface RegistryState {
  extensions: Record<string, RegistryEntry>
  /** Runtime activation overrides; take precedence over `manifest.enabled`. */
  overrides: Record<string, boolean>
}

export type ConflictStrategy = 'error' | 'replace' | 'skip'

export interface RegisterOptions {
  /** What to do when a *different* manifest with the same id is registered. Default `error`. */
  readonly onConflict?: ConflictStrategy
}

export type RegisterOutcome = 'registered' | 'replaced' | 'unchanged' | 'skipped'

export class ExtensionConflictError extends Error {
  override readonly name = 'ExtensionConflictError'

  constructor(
    message: string,
    readonly extensionId: string,
    readonly conflictingExtensionId: string,
  ) {
    super(message)
  }
}

export function createRegistryState(manifests: readonly ExtensionManifest[] = []): RegistryState {
  const state: RegistryState = { extensions: {}, overrides: {} }
  for (const manifest of manifests) registerExtension(state, manifest)
  return state
}

function nextSeq(state: RegistryState): number {
  let max = -1
  for (const entry of Object.values(state.extensions)) max = Math.max(max, entry.seq)
  return max + 1
}

function findNavigationOwner(state: RegistryState, navigationId: string, except: string): string | undefined {
  for (const [id, entry] of Object.entries(state.extensions)) {
    if (id === except) continue
    if (entry.manifest.navigation.some((item) => item.id === navigationId)) return id
  }
  return undefined
}

/**
 * Adds a validated manifest to the registry (mutates `state`).
 * Registering an identical manifest twice is a no-op, which keeps the call
 * safe to run on both server and client and across HMR updates.
 * @throws {ExtensionConflictError} on id or navigation id conflicts when `onConflict` is `error`.
 */
export function registerExtension(
  state: RegistryState,
  manifest: ExtensionManifest,
  options: RegisterOptions = {},
): RegisterOutcome {
  const strategy = options.onConflict ?? 'error'
  const existing = state.extensions[manifest.id]

  if (existing && JSON.stringify(existing.manifest) === JSON.stringify(manifest)) return 'unchanged'
  if (existing && strategy === 'skip') return 'skipped'
  if (existing && strategy === 'error') {
    throw new ExtensionConflictError(
      `Extension "${manifest.id}" is already registered with a different manifest`,
      manifest.id,
      manifest.id,
    )
  }

  for (const item of manifest.navigation) {
    const owner = findNavigationOwner(state, item.id, manifest.id)
    if (owner === undefined) continue
    if (strategy === 'skip') return 'skipped'
    throw new ExtensionConflictError(
      `Navigation item "${item.id}" of extension "${manifest.id}" is already declared by "${owner}"`,
      manifest.id,
      owner,
    )
  }

  state.extensions[manifest.id] = { manifest, seq: existing?.seq ?? nextSeq(state) }
  return existing ? 'replaced' : 'registered'
}

/** Removes an extension and its override. Returns whether it was registered. */
export function unregisterExtension(state: RegistryState, id: string): boolean {
  if (!(id in state.extensions)) return false
  delete state.extensions[id]
  delete state.overrides[id]
  return true
}

/**
 * An extension is active when it is registered, switched on (override, else
 * `manifest.enabled`) and every extension it depends on is active too.
 * Dependency cycles make every member inactive.
 */
export function isExtensionActive(state: RegistryState, id: string): boolean {
  const memo = new Map<string, boolean>()
  const visiting = new Set<string>()

  const visit = (current: string): boolean => {
    const cached = memo.get(current)
    if (cached !== undefined) return cached
    if (visiting.has(current)) return false

    const entry = state.extensions[current]
    if (!entry) return false
    if (!(state.overrides[current] ?? entry.manifest.enabled)) {
      memo.set(current, false)
      return false
    }

    visiting.add(current)
    const active = entry.manifest.dependsOn.every(visit)
    visiting.delete(current)
    memo.set(current, active)
    return active
  }

  return visit(id)
}

/** Ids of every registered extension that is currently active, sorted. */
export function listActiveExtensions(state: RegistryState): string[] {
  return Object.keys(state.extensions)
    .filter((id) => isExtensionActive(state, id))
    .sort()
}

/** Ids of declared dependencies that are not registered. */
export function findMissingDependencies(state: RegistryState, id: string): string[] {
  const entry = state.extensions[id]
  if (!entry) return []
  return entry.manifest.dependsOn.filter((dependency) => !(dependency in state.extensions))
}

/**
 * Capabilities that registered extensions grant by default to any of `roles`
 * (from `permissions[].defaultRoles`), sorted and de-duplicated. Lets a host
 * map its user roles to extension capabilities without hard-coding them.
 */
export function capabilitiesForRoles(state: RegistryState, roles: Iterable<string>): string[] {
  const wanted = new Set(roles)
  const capabilities = new Set<string>()
  for (const entry of Object.values(state.extensions)) {
    for (const permission of entry.manifest.permissions) {
      if (permission.defaultRoles.some((role) => wanted.has(role))) capabilities.add(permission.id)
    }
  }
  return [...capabilities].sort()
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export interface ResolvedSlot {
  /** Globally unique, stable key: `<extensionId>/<slotId>`. Use as the Vue `key`. */
  readonly key: string
  readonly extensionId: string
  readonly slotId: string
  readonly target: string
  /** Component reference exactly as declared in the manifest. */
  readonly component: string
  readonly order: number
  readonly props: Readonly<Record<string, JsonValue>>
}

export function slotKey(extensionId: string, slotId: string): string {
  return `${extensionId}/${slotId}`
}

/** Key the Nuxt module uses to map a manifest component reference to a loader. */
export function componentKey(extensionId: string, component: string): string {
  return `${extensionId}:${component}`
}

/** Components for one outlet: active extensions only, permission-checked, deterministically ordered. */
export function resolveSlots(state: RegistryState, outlet: string, can: PermissionChecker): ResolvedSlot[] {
  const resolved: Array<ResolvedSlot & { index: number }> = []

  for (const [extensionId, entry] of Object.entries(state.extensions)) {
    if (!isExtensionActive(state, extensionId)) continue
    entry.manifest.slots.forEach((slot, index) => {
      if (slot.target !== outlet || !can(slot.permission)) return
      const slotId = slot.id ?? `slot-${index}`
      resolved.push({
        key: slotKey(extensionId, slotId),
        extensionId,
        slotId,
        target: slot.target,
        component: slot.component,
        order: slot.order,
        props: slot.props,
        index,
      })
    })
  }

  return resolved.sort(compareOrdered).map(({ index: _index, ...slot }) => slot)
}

/** Outlet names targeted by at least one slot of a registered extension. */
export function listOutlets(state: RegistryState): string[] {
  const outlets = new Set<string>()
  for (const entry of Object.values(state.extensions)) {
    for (const slot of entry.manifest.slots) outlets.add(slot.target)
  }
  return [...outlets].sort()
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export interface NavigationNode extends NavigationItem {
  readonly extensionId: string
  readonly children: NavigationNode[]
}

/**
 * Builds the navigation tree under `parent` (a host menu id such as
 * `sidebar`; `undefined` returns items declared without a parent).
 * Items of inactive extensions, items the viewer may not see, and every
 * descendant of a hidden item are left out.
 */
export function resolveNavigation(
  state: RegistryState,
  can: PermissionChecker,
  parent?: string,
): NavigationNode[] {
  type Candidate = NavigationItem & { extensionId: string; index: number }
  const childrenOf = new Map<string | undefined, Candidate[]>()

  for (const [extensionId, entry] of Object.entries(state.extensions)) {
    if (!isExtensionActive(state, extensionId)) continue
    entry.manifest.navigation.forEach((item, index) => {
      if (!can(item.permission)) return
      const siblings = childrenOf.get(item.parent) ?? []
      siblings.push({ ...item, extensionId, index })
      childrenOf.set(item.parent, siblings)
    })
  }

  const build = (key: string | undefined, path: ReadonlySet<string>): NavigationNode[] =>
    (childrenOf.get(key) ?? [])
      .filter((item) => !path.has(item.id))
      .sort(compareOrdered)
      .map(({ index: _index, ...item }) => ({
        ...item,
        children: build(item.id, new Set([...path, item.id])),
      }))

  return build(parent, new Set(parent === undefined ? [] : [parent]))
}
