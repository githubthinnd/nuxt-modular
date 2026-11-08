import { abortNavigation, createError, defineNuxtRouteMiddleware } from '#app'
import { loadPersistedToggles, useModuleRegistry } from '../composables/useModuleRegistry'

export const EXTENSION_ROUTE_META = 'modularExtension'

/**
 * Pages contributed by an extension carry `meta.modularExtension`. When that
 * extension is inactive (session override, persistent toggle or a missing
 * dependency) the page answers 404, as if it were not installed.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const owner = to.meta[EXTENSION_ROUTE_META]
  if (typeof owner !== 'string') return
  // The router may run before plugins on the server; make sure toggles are loaded.
  await loadPersistedToggles()
  if (!useModuleRegistry().isModuleActive(owner)) {
    return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true }))
  }
})
