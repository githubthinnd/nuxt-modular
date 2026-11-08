import type { JsonValue } from './json'

/*
 * Per-extension settings. Manifests declare defaults in `config`; the host
 * overrides them (`modular.config[<id>]`, environment-specific runtime config).
 * Everything is plain JSON so it can travel in the SSR payload.
 */

export type JsonObject = { [key: string]: JsonValue }

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Deep-merges `override` onto `base` without mutating either. Objects merge
 * recursively; arrays and scalars in `override` replace the base value.
 * Prototype-polluting keys are dropped.
 */
export function mergeConfig(base: JsonObject, override: unknown): JsonObject {
  const result: JsonObject = {}
  for (const [key, value] of Object.entries(base)) result[key] = value
  if (!isObject(override)) return result
  for (const [key, value] of Object.entries(override)) {
    if (FORBIDDEN_KEYS.has(key)) continue
    const current = result[key]
    result[key] = isObject(current) && isObject(value) ? mergeConfig(current, value) : value
  }
  return result
}

/** Reads a dotted path (`'limits.maxQuestions'`) from a config object. */
export function getConfigValue<T extends JsonValue = JsonValue>(config: JsonObject, path: string): T | undefined
export function getConfigValue<T extends JsonValue = JsonValue>(config: JsonObject, path: string, fallback: T): T
export function getConfigValue(config: JsonObject, path: string, fallback?: JsonValue): JsonValue | undefined {
  let cursor: JsonValue | undefined = config
  for (const segment of path.split('.')) {
    if (!isObject(cursor) || !Object.hasOwn(cursor, segment)) return fallback
    cursor = cursor[segment]
  }
  return cursor === undefined ? fallback : cursor
}
