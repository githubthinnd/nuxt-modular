import { getConfigValue, type JsonObject, type JsonValue, mergeConfig } from '@nuxt-modular/core/runtime'

/** The settings of one extension: manifest defaults overlaid with host overrides. */
export interface ExtensionConfig<T extends JsonObject = JsonObject> {
  /** The merged settings object (do not mutate). */
  readonly values: Readonly<T>
  /** Reads a dotted path, e.g. `get('limits.max', 10)`. */
  get<V extends JsonValue = JsonValue>(path: string, fallback: V): V
  get<V extends JsonValue = JsonValue>(path: string): V | undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Resolves `manifest.config` + `runtimeConfig.public.modular.config[id]`.
 * Pure so the client composable and the server utility behave identically.
 * @throws when `id` is not a built extension, to catch typos early.
 */
export function resolveExtensionConfig<T extends JsonObject = JsonObject>(
  manifests: ReadonlyArray<{ id: string; config: JsonObject }>,
  publicModular: unknown,
  id: string,
): ExtensionConfig<T> {
  const manifest = manifests.find((candidate) => candidate.id === id)
  if (!manifest) throw new Error(`[nuxt-modular] Unknown extension "${id}"`)
  const overrides = isRecord(publicModular) && isRecord(publicModular.config) ? publicModular.config[id] : undefined
  const values = mergeConfig(manifest.config, overrides) as T
  return {
    values,
    get: ((path: string, fallback?: JsonValue) => getConfigValue(values, path, fallback as JsonValue)) as ExtensionConfig<T>['get'],
  }
}
