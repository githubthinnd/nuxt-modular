/*
 * Extension migrations, storage-agnostic.
 *
 * An extension ships `server/migrations/NNN-name.ts` files exporting
 * `defineMigration({ up, down })`. The runner applies pending migrations in a
 * deterministic order — extensions sorted so dependencies come first, then
 * migration names — and records each one in a ledger supplied by the host
 * runtime. The first failure stops the run so later migrations never execute
 * against a half-migrated schema.
 */

type Awaitable<T> = T | Promise<T>

export interface MigrationContextBase {
  readonly extensionId: string
  /** Migration name (file name without extension), e.g. `001-create-tables`. */
  readonly name: string
  log(message: string): void
}

/**
 * Host-provided migration context (database client, storage, …). Augment it
 * and fill it through the `modular:migration-context` filter:
 *
 * ```ts
 * declare module '#modular' {
 *   interface ModularMigrationContext { db: Database }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation target
export interface ModularMigrationContext {}

export type MigrationContext = MigrationContextBase & ModularMigrationContext

export interface Migration {
  up(context: MigrationContext): Awaitable<void>
  down?(context: MigrationContext): Awaitable<void>
}

export function defineMigration(migration: Migration): Migration {
  return migration
}

export interface MigrationEntry {
  readonly extensionId: string
  readonly name: string
  /** The module's default export; validated before running. */
  readonly migration: unknown
}

/** Where applied migrations are recorded. */
export interface MigrationLedger {
  applied(extensionId: string): Promise<readonly string[]>
  record(extensionId: string, name: string): Promise<void>
  remove(extensionId: string, name: string): Promise<void>
}

export interface MigrationRef {
  readonly extensionId: string
  readonly name: string
}

export interface MigrationFailure extends MigrationRef {
  readonly error: unknown
}

export interface MigrationReport {
  /** Migrations executed by this run, in execution order. */
  readonly executed: readonly MigrationRef[]
  /** Set when a migration failed; nothing after it was executed. */
  readonly failed?: MigrationFailure
}

export interface ExtensionMigrationStatus {
  readonly extensionId: string
  readonly applied: readonly string[]
  readonly pending: readonly string[]
  /** Recorded in the ledger but no longer shipped by the extension. */
  readonly unknown: readonly string[]
}

interface RunnerOptions {
  readonly entries: readonly MigrationEntry[]
  readonly ledger: MigrationLedger
  /** Builds the context handed to `up`/`down`; the host adds its own fields. */
  readonly createContext: (base: MigrationContextBase) => Awaitable<MigrationContext>
  /** Extension ids in run order (dependencies first). Extensions not listed run last, by id. */
  readonly order?: readonly string[]
  /** Restrict the run to these extensions. */
  readonly extensions?: readonly string[]
  readonly log?: (message: string) => void
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Orders extension ids so every dependency precedes its dependents. Ties and
 * independent extensions are ordered by id; members of a dependency cycle are
 * appended in id order (they are inactive anyway).
 */
export function sortByDependencies(extensions: ReadonlyArray<{ id: string; dependsOn: readonly string[] }>): string[] {
  const known = new Map(extensions.map((extension) => [extension.id, extension.dependsOn]))
  const result: string[] = []
  const done = new Set<string>()
  const visiting = new Set<string>()

  const visit = (id: string): boolean => {
    if (done.has(id)) return true
    if (visiting.has(id)) return false
    visiting.add(id)
    const dependencies = [...(known.get(id) ?? [])].filter((dependency) => known.has(dependency)).sort(byCodeUnit)
    const acyclic = dependencies.every(visit)
    visiting.delete(id)
    if (!acyclic) return false
    done.add(id)
    result.push(id)
    return true
  }

  const ids = [...known.keys()].sort(byCodeUnit)
  for (const id of ids) visit(id)
  for (const id of ids) if (!done.has(id)) result.push(id)
  return result
}

function isMigration(value: unknown): value is Migration {
  return (
    typeof value === 'object' &&
    value !== null &&
    'up' in value &&
    typeof value.up === 'function' &&
    (!('down' in value) || value.down === undefined || typeof value.down === 'function')
  )
}

function groupEntries(options: RunnerOptions): Array<[string, MigrationEntry[]]> {
  const groups = new Map<string, MigrationEntry[]>()
  for (const entry of options.entries) {
    if (options.extensions && !options.extensions.includes(entry.extensionId)) continue
    const group = groups.get(entry.extensionId) ?? []
    group.push(entry)
    groups.set(entry.extensionId, group)
  }
  const rank = new Map((options.order ?? []).map((id, index) => [id, index]))
  return [...groups.entries()]
    .map(([id, group]): [string, MigrationEntry[]] => [id, group.sort((a, b) => byCodeUnit(a.name, b.name))])
    .sort(([a], [b]) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER) || byCodeUnit(a, b))
}

async function context(options: RunnerOptions, entry: MigrationEntry): Promise<MigrationContext> {
  const prefix = `[${entry.extensionId}/${entry.name}]`
  return options.createContext({
    extensionId: entry.extensionId,
    name: entry.name,
    log: (message) => options.log?.(`${prefix} ${message}`),
  })
}

/** Applies every pending migration. Stops at the first failure. */
export async function runMigrationsUp(options: RunnerOptions): Promise<MigrationReport> {
  const executed: MigrationRef[] = []
  for (const [extensionId, group] of groupEntries(options)) {
    const applied = new Set(await options.ledger.applied(extensionId))
    for (const entry of group) {
      if (applied.has(entry.name)) continue
      try {
        if (!isMigration(entry.migration)) throw new TypeError('The default export is not a migration (missing `up` function)')
        options.log?.(`↑ ${extensionId}/${entry.name}`)
        await entry.migration.up(await context(options, entry))
        await options.ledger.record(extensionId, entry.name)
        executed.push({ extensionId, name: entry.name })
      } catch (error) {
        return { executed, failed: { extensionId, name: entry.name, error } }
      }
    }
  }
  return { executed }
}

/** Reverts the last `steps` applied migrations of one extension, newest first. */
export async function runMigrationsDown(
  options: Omit<RunnerOptions, 'extensions' | 'order'> & { readonly extensionId: string; readonly steps?: number },
): Promise<MigrationReport> {
  const { extensionId, steps = 1 } = options
  const shipped = new Map(
    options.entries.filter((entry) => entry.extensionId === extensionId).map((entry) => [entry.name, entry]),
  )
  const applied = [...(await options.ledger.applied(extensionId))].sort(byCodeUnit).reverse().slice(0, Math.max(0, steps))
  const executed: MigrationRef[] = []
  for (const name of applied) {
    const entry = shipped.get(name)
    try {
      if (!entry) throw new Error('Migration is recorded as applied but no longer shipped by the extension')
      if (!isMigration(entry.migration) || !entry.migration.down) throw new TypeError('Migration has no `down` function')
      options.log?.(`↓ ${extensionId}/${name}`)
      await entry.migration.down(await context(options, entry))
      await options.ledger.remove(extensionId, name)
      executed.push({ extensionId, name })
    } catch (error) {
      return { executed, failed: { extensionId, name, error } }
    }
  }
  return { executed }
}

/**
 * Reverts every applied migration of the selected extensions, newest first,
 * dependents before their dependencies (the reverse of `up`). Stops at the first failure.
 */
export async function runMigrationsReset(options: Omit<RunnerOptions, 'order'> & { readonly order?: readonly string[] }): Promise<MigrationReport> {
  const executed: MigrationRef[] = []
  const ids = [...new Set(options.entries.map((entry) => entry.extensionId))]
  const rank = new Map((options.order ?? []).map((id, index) => [id, index]))
  const position = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER
  const reversed = ids
    .filter((id) => !options.extensions || options.extensions.includes(id))
    .sort((a, b) => position(b) - position(a) || byCodeUnit(b, a))
  for (const extensionId of reversed) {
    const applied = await options.ledger.applied(extensionId)
    const result = await runMigrationsDown({ ...options, extensionId, steps: applied.length })
    executed.push(...result.executed)
    if (result.failed) return { executed, failed: result.failed }
  }
  return { executed }
}

/** Applied, pending and unknown migrations per extension, in run order. */
export async function migrationStatus(
  options: Pick<RunnerOptions, 'entries' | 'ledger' | 'order' | 'extensions'>,
): Promise<ExtensionMigrationStatus[]> {
  const groups = groupEntries({ ...options, createContext: () => ({}) as MigrationContext })
  const ids = new Set(groups.map(([id]) => id))
  for (const id of options.extensions ?? []) ids.add(id)
  const statuses: ExtensionMigrationStatus[] = []
  for (const extensionId of [...ids]) {
    const shipped = (groups.find(([id]) => id === extensionId)?.[1] ?? []).map((entry) => entry.name)
    const applied = [...(await options.ledger.applied(extensionId))].sort(byCodeUnit)
    statuses.push({
      extensionId,
      applied: applied.filter((name) => shipped.includes(name)),
      pending: shipped.filter((name) => !applied.includes(name)),
      unknown: applied.filter((name) => !shipped.includes(name)),
    })
  }
  return statuses
}

/** An in-memory ledger, for tests and ephemeral environments. */
export function createMemoryLedger(initial: Record<string, readonly string[]> = {}): MigrationLedger & {
  snapshot(): Record<string, string[]>
} {
  const data = new Map(Object.entries(initial).map(([id, names]) => [id, [...names]]))
  return {
    async applied(extensionId) {
      return [...(data.get(extensionId) ?? [])]
    },
    async record(extensionId, name) {
      const names = data.get(extensionId) ?? []
      if (!names.includes(name)) names.push(name)
      data.set(extensionId, names)
    },
    async remove(extensionId, name) {
      data.set(extensionId, (data.get(extensionId) ?? []).filter((entry) => entry !== name))
    },
    snapshot() {
      return Object.fromEntries([...data.entries()].map(([id, names]) => [id, [...names].sort(byCodeUnit)]))
    },
  }
}
