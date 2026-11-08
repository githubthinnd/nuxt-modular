import { createError, defineEventHandler } from 'h3'
import { routes } from '#nuxt-modular/server-routes'
import { compileRoutes, findRouteOwner } from './route-pattern'
import { useModularToggles } from './toggles'

const compiled = compileRoutes(routes)

/**
 * Server middleware: requests to API routes of an extension that is switched
 * off by a persistent toggle (or whose dependency is) answer 404, exactly as
 * if the extension were not installed.
 */
export default defineEventHandler(async (event) => {
  if (!compiled.length) return
  const owner = findRouteOwner(compiled, event.path)
  if (!owner) return
  const inactive = await useModularToggles().getInactive()
  if (inactive.has(owner)) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
})
