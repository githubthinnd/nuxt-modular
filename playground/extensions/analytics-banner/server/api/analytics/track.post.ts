import { countPageView } from '../../store'

export default defineEventHandler(async (event) => {
  const body = await readBody<unknown>(event)
  const path = typeof body === 'object' && body !== null && 'path' in body ? body.path : undefined
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 512) {
    throw createError({ statusCode: 400, statusMessage: 'path must be an absolute app path' })
  }
  countPageView(path)
  return { ok: true }
})
