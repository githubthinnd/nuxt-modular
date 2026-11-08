import { describe, expect, it } from 'vitest'
import { compileRoutePattern, compileRoutes, findRouteOwner } from '../src/runtime/server/route-pattern'
import { serverRouteFromPath } from '../src/scan'

describe('serverRouteFromPath', () => {
  it('follows Nitro file conventions', () => {
    expect(serverRouteFromPath('quiz/submit.post.ts', '/api')).toEqual({ route: '/api/quiz/submit', method: 'post' })
    expect(serverRouteFromPath('quiz/[id].get.ts', '/api')).toEqual({ route: '/api/quiz/:id', method: 'get' })
    expect(serverRouteFromPath('quiz/index.ts', '/api')).toEqual({ route: '/api/quiz', method: undefined })
    expect(serverRouteFromPath('docs/[...slug].ts', '/api')).toEqual({ route: '/api/docs/**', method: undefined })
    expect(serverRouteFromPath('feed.xml.ts', '')).toEqual({ route: '/feed.xml', method: undefined })
    expect(serverRouteFromPath('index.get.ts', '')).toEqual({ route: '/', method: 'get' })
  })
})

describe('route patterns', () => {
  it('matches static, parameter and catch-all segments', () => {
    expect(compileRoutePattern('/api/quiz/submit').test('/api/quiz/submit')).toBe(true)
    expect(compileRoutePattern('/api/quiz/submit').test('/api/quiz/submit/')).toBe(true)
    expect(compileRoutePattern('/api/quiz/submit').test('/api/quiz/submitx')).toBe(false)
    expect(compileRoutePattern('/api/quiz/:id').test('/api/quiz/42')).toBe(true)
    expect(compileRoutePattern('/api/quiz/:id').test('/api/quiz/42/x')).toBe(false)
    expect(compileRoutePattern('/api/item-:id').test('/api/item-7')).toBe(true)
    expect(compileRoutePattern('/api/docs/**').test('/api/docs')).toBe(true)
    expect(compileRoutePattern('/api/docs/**').test('/api/docs/a/b')).toBe(true)
    expect(compileRoutePattern('/feed.xml').test('/feedxxml')).toBe(false)
  })

  it('resolves the most specific owner and ignores query strings', () => {
    const routes = compileRoutes([
      { extensionId: 'docs', route: '/api/**' },
      { extensionId: 'quiz', route: '/api/quiz/:id' },
      { extensionId: 'admin', route: '/api/quiz/stats' },
    ])
    expect(findRouteOwner(routes, '/api/quiz/stats?x=1')).toBe('admin')
    expect(findRouteOwner(routes, '/api/quiz/9')).toBe('quiz')
    expect(findRouteOwner(routes, '/api/anything/else')).toBe('docs')
    expect(findRouteOwner(routes, '/about')).toBeUndefined()
  })
})
