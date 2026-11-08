/*
 * Extension seeders, storage-agnostic.
 *
 * An extension ships `server/seeders/*.ts` exporting `defineSeeder({ run })`.
 * Seeders load initial or demo data and are meant to be idempotent: unlike
 * migrations nothing is recorded, so they run every time they are requested.
 * Order: extensions with dependencies first, then seeder names. The first
 * failure stops the run.
 */

type Awaitable<T> = T | Promise<T>

export interface SeederContextBase {
  readonly extensionId: string
  /** Seeder name (file name without extension), e.g. `001-demo-questions`. */
  readonly name: string
  log(message: string): void
}

/**
 * Host-provided seeder context (database client, …). Augment it and fill it
 * through the `modular:seeder-context` filter.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation target
export interface ModularSeederContext {}

export type SeederContext = SeederContextBase & ModularSeederContext

export interface Seeder {
  run(context: SeederContext): Awaitable<void>
}

export function defineSeeder(seeder: Seeder): Seeder {
  return seeder
}

export interface SeederEntry {
  readonly extensionId: string
  readonly name: string
  /** The module's default export; validated before running. */
  readonly seeder: unknown
}

export interface SeederRef {
  readonly extensionId: string
  readonly name: string
}

export interface SeederReport {
  readonly executed: readonly SeederRef[]
  readonly failed?: SeederRef & { readonly error: unknown }
}

export interface RunSeedersOptions {
  readonly entries: readonly SeederEntry[]
  readonly createContext: (base: SeederContextBase) => Awaitable<SeederContext>
  /** Extension ids in run order (dependencies first). Others run last, by id. */
  readonly order?: readonly string[]
  /** Restrict the run to these extensions. */
  readonly extensions?: readonly string[]
  /** Restrict the run to seeders with these names (any extension). */
  readonly names?: readonly string[]
  readonly log?: (message: string) => void
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function isSeeder(value: unknown): value is Seeder {
  return typeof value === 'object' && value !== null && 'run' in value && typeof value.run === 'function'
}

/** The seeders `runSeeders` would execute, in order. */
export function planSeeders(options: Pick<RunSeedersOptions, 'entries' | 'order' | 'extensions' | 'names'>): SeederEntry[] {
  const rank = new Map((options.order ?? []).map((id, index) => [id, index]))
  const position = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER
  return options.entries
    .filter((entry) => !options.extensions || options.extensions.includes(entry.extensionId))
    .filter((entry) => !options.names || options.names.includes(entry.name))
    .sort((a, b) => position(a.extensionId) - position(b.extensionId) || byCodeUnit(a.extensionId, b.extensionId) || byCodeUnit(a.name, b.name))
}

export async function runSeeders(options: RunSeedersOptions): Promise<SeederReport> {
  const executed: SeederRef[] = []
  for (const entry of planSeeders(options)) {
    try {
      if (!isSeeder(entry.seeder)) throw new TypeError('The default export is not a seeder (missing `run` function)')
      options.log?.(`● ${entry.extensionId}/${entry.name}`)
      const prefix = `[${entry.extensionId}/${entry.name}]`
      const context = await options.createContext({
        extensionId: entry.extensionId,
        name: entry.name,
        log: (message) => options.log?.(`${prefix} ${message}`),
      })
      await entry.seeder.run(context)
      executed.push({ extensionId: entry.extensionId, name: entry.name })
    } catch (error) {
      return { executed, failed: { extensionId: entry.extensionId, name: entry.name, error } }
    }
  }
  return { executed }
}
