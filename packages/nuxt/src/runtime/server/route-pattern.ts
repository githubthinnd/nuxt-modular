/** A compiled route owned by an extension. */
export interface CompiledRoute {
  readonly extensionId: string
  readonly route: string
  readonly pattern: RegExp
  /** Lower is more specific: static segments < params < catch-all. */
  readonly weight: number
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Compiles a Nitro route (`/api/quiz/:id`, `/api/docs/**`, `/api/item-:id`)
 * into a RegExp matching request paths (without query string).
 */
export function compileRoutePattern(route: string): RegExp {
  const segments = route.split('/').filter(Boolean)
  const source = segments
    .map((segment) => {
      if (segment === '**') return '(?:/.*)?'
      const parts = segment.split(/(:\w+)/).filter(Boolean)
      return `/${parts.map((part) => (part.startsWith(':') ? '[^/]+' : escapeRegExp(part))).join('')}`
    })
    .join('')
  return new RegExp(`^${source}/?$`)
}

function weightOf(route: string): number {
  return route.split('/').reduce((weight, segment) => {
    if (segment === '**') return weight + 100
    if (segment.includes(':')) return weight + 1
    return weight
  }, 0)
}

export function compileRoutes(routes: ReadonlyArray<{ extensionId: string; route: string }>): CompiledRoute[] {
  return routes
    .map((entry) => ({ ...entry, pattern: compileRoutePattern(entry.route), weight: weightOf(entry.route) }))
    .sort((a, b) => a.weight - b.weight || (a.route < b.route ? -1 : a.route > b.route ? 1 : 0))
}

/** The extension owning the most specific route that matches `path`, if any. */
export function findRouteOwner(routes: readonly CompiledRoute[], path: string): string | undefined {
  const pathname = path.split('?')[0] ?? path
  return routes.find((route) => route.pattern.test(pathname))?.extensionId
}
