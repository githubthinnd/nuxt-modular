/**
 * Persists an extension toggle for every visitor (admin only).
 * Body: `{ "active": true | false | null }` — `null` restores the manifest default.
 */
export default defineEventHandler(async (event) => {
  requireDemoAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<unknown>(event)
  const active = typeof body === 'object' && body !== null && 'active' in body ? body.active : undefined
  if (active !== true && active !== false && active !== null) {
    throw createError({ statusCode: 400, statusMessage: '`active` must be true, false or null' })
  }

  const toggles = useModularToggles()
  try {
    await toggles.set(id, active)
  } catch (error) {
    throw createError({ statusCode: 404, statusMessage: error instanceof Error ? error.message : 'Unknown extension' })
  }
  return (await toggles.list()).find((extension) => extension.id === id)
})
