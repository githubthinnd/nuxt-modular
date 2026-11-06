import { z } from 'zod'

/*
 * Manifest contracts for nuxt-modular extensions.
 *
 * Design rule: everything a manifest declares must be JSON-serializable.
 * The runtime registry is shared between the Nitro render and the client via
 * Nuxt's `useState` payload, so components and server handlers are declared
 * as *string references* that the Nuxt module resolves at build time, never
 * as functions or component objects.
 */

// ---------------------------------------------------------------------------
// Identifier patterns
// ---------------------------------------------------------------------------

/** Kebab-case slug: `mod-quiz`, `analytics-banner`, `teacher`. */
export const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/** Dot-namespaced identifier: `course.tabs`, `quiz.view`, `dashboard.metrics`. */
export const DOTTED_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/

/** Colon-namespaced hook name: `user:created`, `checkout:price`. */
export const HOOK_NAME_PATTERN = /^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)+$/

/** Semantic Versioning 2.0.0 (https://semver.org). */
export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

/** In-app absolute path (`/quiz`) or an external http(s) URL. */
export const NAV_PATH_PATTERN = /^(?:\/(?!\/)|https?:\/\/)/

// ---------------------------------------------------------------------------
// Primitive schemas
// ---------------------------------------------------------------------------

export const ExtensionIdSchema = z
  .string()
  .max(64)
  .regex(SLUG_PATTERN, 'Must be a kebab-case slug, e.g. "mod-quiz"')

export const RoleSchema = z
  .string()
  .max(64)
  .regex(SLUG_PATTERN, 'Must be a kebab-case role slug, e.g. "teacher"')

export const CapabilitySchema = z
  .string()
  .max(128)
  .regex(DOTTED_ID_PATTERN, 'Must be a dot-namespaced capability, e.g. "quiz.view"')

export const OutletNameSchema = z
  .string()
  .max(128)
  .regex(DOTTED_ID_PATTERN, 'Must be a dot-namespaced outlet name, e.g. "course.tabs"')

export const HookNameSchema = z
  .string()
  .max(128)
  .regex(HOOK_NAME_PATTERN, 'Must be a colon-namespaced hook name, e.g. "user:created"')

export const SemverSchema = z
  .string()
  .regex(SEMVER_PATTERN, 'Must be a valid semantic version, e.g. "1.0.0"')

/**
 * Sort weight. Lower values come first; ties are broken deterministically by
 * the registry (extension id, then declaration index) to keep SSR and client
 * trees identical.
 */
export const OrderSchema = z.int().default(0)

/**
 * A reference to a file inside the extension directory (`./components/QuizTab.vue`)
 * or, for components, a globally registered component name (`QuizTab`).
 */
export const ModuleReferenceSchema = z.string().trim().min(1).max(512)

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * What a viewer must hold for an item to be shown or executed:
 * - `"quiz.view"`                         → that capability
 * - `{ anyOf: ["quiz.view", "admin"] }`   → at least one
 * - `{ allOf: ["quiz.view", "quiz.edit"] }` → all of them
 */
export const PermissionRequirementSchema = z.union([
  CapabilitySchema,
  z.strictObject({ anyOf: z.array(CapabilitySchema).min(1) }),
  z.strictObject({ allOf: z.array(CapabilitySchema).min(1) }),
])

/** A capability an extension introduces, with the roles granted it by default. */
export const PermissionDeclarationSchema = z.strictObject({
  id: CapabilitySchema,
  label: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  defaultRoles: z.array(RoleSchema).default([]),
})

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * A menu entry injected into a host menu. Entries are declared flat; `parent`
 * points either at a host menu id (`sidebar`, `navbar`) or at another
 * navigation item id, and the registry assembles the tree.
 */
export const NavigationItemSchema = z.strictObject({
  id: z.string().max(128).regex(DOTTED_ID_PATTERN, 'Must be a dot-namespaced id, e.g. "quiz.list"'),
  label: z.string().trim().min(1),
  path: z
    .string()
    .regex(NAV_PATH_PATTERN, 'Must start with "/" or be an http(s) URL')
    .optional(),
  icon: z.string().trim().min(1).optional(),
  order: OrderSchema,
  parent: z
    .string()
    .max(128)
    .regex(DOTTED_ID_PATTERN, 'Must be a host menu id or a navigation item id')
    .optional(),
  permission: PermissionRequirementSchema.optional(),
})

// ---------------------------------------------------------------------------
// Outlet slots
// ---------------------------------------------------------------------------

/** Declares that a component renders inside a host `<PluginOutlet name="…">`. */
export const OutletSlotDefinitionSchema = z.strictObject({
  /** Stable id, unique within the extension. Derived by the registry when omitted. */
  id: z.string().max(64).regex(SLUG_PATTERN, 'Must be a kebab-case slug').optional(),
  target: OutletNameSchema,
  component: ModuleReferenceSchema,
  order: OrderSchema,
  permission: PermissionRequirementSchema.optional(),
  /** Static props, merged under the outlet's runtime `context`. Must be JSON. */
  props: z.record(z.string(), z.json()).default({}),
})

// ---------------------------------------------------------------------------
// Server hooks
// ---------------------------------------------------------------------------

export const ServerHookTypeSchema = z.enum(['action', 'filter'])

/**
 * Subscribes a server-side handler to a hook on the Nitro hook bus.
 * - `action`: fire-and-forget broadcast; return value ignored.
 * - `filter`: receives the current value and returns the transformed value.
 */
export const ServerHookSubscriptionSchema = z.strictObject({
  hook: HookNameSchema,
  handler: ModuleReferenceSchema,
  type: ServerHookTypeSchema.default('action'),
  order: OrderSchema,
})

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

const ExtensionManifestShape = z.strictObject({
  id: ExtensionIdSchema,
  name: z.string().trim().min(1).max(128),
  version: SemverSchema,
  description: z.string().trim().min(1).optional(),
  /** Default activation state; a host feature toggle may override it at runtime. */
  enabled: z.boolean().default(true),
  /** Ids of extensions that must be registered and active for this one to load. */
  dependsOn: z.array(ExtensionIdSchema).default([]),
  permissions: z.array(PermissionDeclarationSchema).default([]),
  navigation: z.array(NavigationItemSchema).default([]),
  slots: z.array(OutletSlotDefinitionSchema).default([]),
  serverHooks: z.array(ServerHookSubscriptionSchema).default([]),
})

type ManifestShape = z.output<typeof ExtensionManifestShape>
type RefinementContext = z.RefinementCtx<ManifestShape>

function reportDuplicates(
  ctx: RefinementContext,
  values: ReadonlyArray<string | undefined>,
  field: string,
  describe: (value: string) => string,
): void {
  const seen = new Map<string, number>()
  values.forEach((value, index) => {
    if (value === undefined) return
    const first = seen.get(value)
    if (first === undefined) {
      seen.set(value, index)
      return
    }
    ctx.addIssue({
      code: 'custom',
      path: [field, index],
      message: `${describe(value)} is already declared at ${field}[${first}]`,
    })
  })
}

function reportNavigationCycles(ctx: RefinementContext, manifest: ManifestShape): void {
  const parentOf = new Map<string, string | undefined>()
  for (const item of manifest.navigation) parentOf.set(item.id, item.parent)

  manifest.navigation.forEach((item, index) => {
    const visited = new Set<string>([item.id])
    let cursor = item.parent
    while (cursor !== undefined && parentOf.has(cursor)) {
      if (visited.has(cursor)) {
        ctx.addIssue({
          code: 'custom',
          path: ['navigation', index, 'parent'],
          message: `Navigation item "${item.id}" is part of a parent cycle`,
        })
        return
      }
      visited.add(cursor)
      cursor = parentOf.get(cursor)
    }
  })
}

export const ExtensionManifestSchema = ExtensionManifestShape.superRefine((manifest, ctx) => {
  manifest.dependsOn.forEach((dependency, index) => {
    if (dependency === manifest.id) {
      ctx.addIssue({
        code: 'custom',
        path: ['dependsOn', index],
        message: 'An extension cannot depend on itself',
      })
    }
  })
  reportDuplicates(ctx, manifest.dependsOn, 'dependsOn', (id) => `Dependency "${id}"`)
  reportDuplicates(ctx, manifest.permissions.map((p) => p.id), 'permissions', (id) => `Permission "${id}"`)
  reportDuplicates(ctx, manifest.navigation.map((n) => n.id), 'navigation', (id) => `Navigation item "${id}"`)
  reportDuplicates(ctx, manifest.slots.map((s) => s.id), 'slots', (id) => `Slot "${id}"`)
  reportDuplicates(
    ctx,
    manifest.serverHooks.map((h) => `${h.hook} -> ${h.handler}`),
    'serverHooks',
    (key) => `Server hook subscription "${key}"`,
  )
  reportNavigationCycles(ctx, manifest)
})
