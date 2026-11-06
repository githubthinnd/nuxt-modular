import type { z } from 'zod'
import { ExtensionManifestSchema } from './schema'
import type {
  NavigationItemSchema,
  OutletSlotDefinitionSchema,
  PermissionDeclarationSchema,
  PermissionRequirementSchema,
  ServerHookSubscriptionSchema,
  ServerHookTypeSchema,
} from './schema'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
// `*Input` types describe what extension authors write (defaults optional).
// The un-suffixed types describe the normalized, validated result.

export type ExtensionManifestInput = z.input<typeof ExtensionManifestSchema>
export type ExtensionManifest = z.output<typeof ExtensionManifestSchema>

export type PermissionRequirement = z.output<typeof PermissionRequirementSchema>

export type PermissionDeclarationInput = z.input<typeof PermissionDeclarationSchema>
export type PermissionDeclaration = z.output<typeof PermissionDeclarationSchema>

export type NavigationItemInput = z.input<typeof NavigationItemSchema>
export type NavigationItem = z.output<typeof NavigationItemSchema>

export type OutletSlotDefinitionInput = z.input<typeof OutletSlotDefinitionSchema>
export type OutletSlotDefinition = z.output<typeof OutletSlotDefinitionSchema>

export type ServerHookType = z.output<typeof ServerHookTypeSchema>
export type ServerHookSubscriptionInput = z.input<typeof ServerHookSubscriptionSchema>
export type ServerHookSubscription = z.output<typeof ServerHookSubscriptionSchema>

// ---------------------------------------------------------------------------
// Validation results & errors
// ---------------------------------------------------------------------------

export interface ManifestIssue {
  /** Dotted path into the manifest, e.g. `slots[0].target`. Empty for the root. */
  readonly path: string
  readonly message: string
  readonly code: string
}

export type ManifestValidationResult =
  | { readonly success: true; readonly manifest: ExtensionManifest }
  | { readonly success: false; readonly issues: readonly ManifestIssue[] }

export class ManifestValidationError extends Error {
  override readonly name = 'ManifestValidationError'

  constructor(
    readonly issues: readonly ManifestIssue[],
    /** The `id` field of the rejected input, when it had a string one. */
    readonly extensionId?: string,
    /** Where the manifest came from (file path), for error messages. */
    readonly source?: string,
  ) {
    super(ManifestValidationError.format(issues, extensionId, source))
  }

  private static format(
    issues: readonly ManifestIssue[],
    extensionId: string | undefined,
    source: string | undefined,
  ): string {
    const subject = extensionId ? `extension "${extensionId}"` : 'extension'
    const origin = source ? ` (${source})` : ''
    const lines = issues.map((issue) => `  - ${issue.path || '<root>'}: ${issue.message}`)
    return `Invalid manifest for ${subject}${origin}:\n${lines.join('\n')}`
  }
}

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>((out, key) => {
    if (typeof key === 'number') return `${out}[${key}]`
    const segment = String(key)
    return out ? `${out}.${segment}` : segment
  }, '')
}

function readExtensionId(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || !('id' in input)) return undefined
  const { id } = input
  return typeof id === 'string' ? id : undefined
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Validates untrusted input without throwing. */
export function validateManifest(input: unknown): ManifestValidationResult {
  const result = ExtensionManifestSchema.safeParse(input)
  if (result.success) return { success: true, manifest: result.data }
  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      path: formatPath(issue.path),
      message: issue.message,
      code: issue.code,
    })),
  }
}

/**
 * Validates and normalizes untrusted input.
 * @throws {ManifestValidationError} listing every issue found.
 */
export function parseManifest(input: unknown, source?: string): ExtensionManifest {
  const result = validateManifest(input)
  if (result.success) return result.manifest
  throw new ManifestValidationError(result.issues, readExtensionId(input), source)
}

/**
 * Declares an extension manifest. Use it as the default export of
 * `extensions/<name>/manifest.ts`:
 *
 * ```ts
 * export default defineExtensionManifest({
 *   id: 'mod-quiz',
 *   name: 'Quiz',
 *   version: '1.0.0',
 *   slots: [{ target: 'course.tabs', component: './components/QuizTab.vue', permission: 'quiz.view' }],
 * })
 * ```
 *
 * The manifest is validated eagerly, so a broken manifest fails the build
 * instead of failing at request time.
 * @throws {ManifestValidationError}
 */
export function defineExtensionManifest(manifest: ExtensionManifestInput): ExtensionManifest {
  return parseManifest(manifest)
}
