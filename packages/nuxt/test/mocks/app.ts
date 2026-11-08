// Minimal stand-ins for the `#app` APIs used by the runtime, for unit tests.
import { type Ref, ref } from 'vue'

const states = new Map<string, Ref<unknown>>()
let requestEvent: unknown

export function useState<T>(key: string, init?: () => T): Ref<T> {
  if (!states.has(key)) states.set(key, ref(init?.()) as Ref<unknown>)
  return states.get(key) as Ref<T>
}

export function useRequestEvent(): unknown {
  return requestEvent
}

export function useNuxtApp() {
  return { isHydrating: false }
}

export const defineNuxtPlugin = <T>(plugin: T): T => plugin
export const defineNuxtRouteMiddleware = <T>(middleware: T): T => middleware

export function createError(input: { statusCode: number; statusMessage?: string; fatal?: boolean }) {
  return Object.assign(new Error(input.statusMessage), input)
}

export function abortNavigation(error: unknown) {
  return { aborted: error }
}

/** Test helpers (not part of `#app`). */
export function __resetApp(event?: unknown): void {
  states.clear()
  requestEvent = event
}
