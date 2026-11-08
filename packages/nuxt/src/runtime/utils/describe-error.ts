/**
 * Formats an error as a plain string (stack when available). Nuxt forwards
 * server logs to the browser in development through devalue, which cannot
 * serialize Error instances, so loggers here only ever pass strings.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`
  return String(error)
}
