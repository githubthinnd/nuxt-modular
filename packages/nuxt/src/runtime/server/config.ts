import { useRuntimeConfig } from 'nitropack/runtime'

/** Normalized `runtimeConfig.modular` (env-overridable, e.g. `NUXT_MODULAR_MIGRATIONS_AUTO=true`). */
export interface ModularServerConfig {
  readonly storage: string
  readonly toggles: { readonly enabled: boolean; readonly ttl: number }
  readonly migrations: { readonly auto: boolean }
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : value === 'true' ? true : value === 'false' ? false : fallback

export function useModularConfig(): ModularServerConfig {
  const raw = record(record(useRuntimeConfig()).modular)
  const toggles = record(raw.toggles)
  const migrations = record(raw.migrations)
  const ttl = Number(toggles.ttl)
  return {
    storage: typeof raw.storage === 'string' && raw.storage ? raw.storage : 'nuxt-modular',
    toggles: { enabled: bool(toggles.enabled, true), ttl: Number.isFinite(ttl) && ttl >= 0 ? ttl : 1000 },
    migrations: { auto: bool(migrations.auto, false) },
  }
}
