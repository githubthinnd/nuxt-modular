import type { H3Event } from 'h3'

/** What the Nitro side exposes to the Nuxt renderer for one request. */
export interface ModularRequestContext {
  /** Persistent activation overrides (feature toggles), keyed by extension id. */
  getOverrides(): Promise<Record<string, boolean>>
}

const KEY = 'nuxt-modular'

export function setModularContext(event: H3Event, context: ModularRequestContext): void {
  ;(event.context as Record<string, unknown>)[KEY] = context
}

function isModularContext(value: unknown): value is ModularRequestContext {
  return typeof value === 'object' && value !== null && 'getOverrides' in value && typeof value.getOverrides === 'function'
}

export function getModularContext(event: H3Event): ModularRequestContext | undefined {
  const value = (event.context as Record<string, unknown>)[KEY]
  return isModularContext(value) ? value : undefined
}
