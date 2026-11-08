import type { H3Event } from 'h3'

/** Demo-only authorization: the role cookie. A real host checks its session. */
export function requireDemoAdmin(event: H3Event): void {
  if (getCookie(event, 'demo-role') !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin role required' })
  }
}
