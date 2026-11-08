import { describe, expect, it, vi } from 'vitest'
import { createHookBus, type HookErrorInfo } from '../src'

declare module '../src/hooks' {
  interface ModularActions {
    'test:greet': [name: string]
  }
  interface ModularFilters {
    'test:price': [price: number, currency: string]
  }
}

function silentBus() {
  const errors: Array<{ error: unknown; info: HookErrorInfo }> = []
  const bus = createHookBus({ onError: (error, info) => errors.push({ error, info }) })
  return { bus, errors }
}

describe('actions', () => {
  it('runs handlers sequentially by order, then subscription order', async () => {
    const { bus } = silentBus()
    const calls: string[] = []
    bus.addAction('test:greet', async (name) => {
      // Yield a few ticks: a non-sequential bus would let "c" run first.
      for (let tick = 0; tick < 3; tick++) await Promise.resolve()
      calls.push(`b:${name}`)
    })
    bus.addAction('test:greet', (name) => void calls.push(`c:${name}`))
    bus.addAction('test:greet', (name) => void calls.push(`a:${name}`), { order: -1 })
    await bus.callHook('test:greet', 'ana')
    expect(calls).toEqual(['a:ana', 'b:ana', 'c:ana'])
  })

  it('isolates failing handlers and reports them with the owner', async () => {
    const { bus, errors } = silentBus()
    const after = vi.fn()
    bus.addAction('test:greet', () => {
      throw new Error('boom')
    }, { owner: 'broken' })
    bus.addAction('test:greet', () => Promise.reject(new Error('async boom')))
    bus.addAction('test:greet', after)
    await expect(bus.callHook('test:greet', 'x')).resolves.toBeUndefined()
    expect(after).toHaveBeenCalledWith('x')
    expect(errors.map(({ info }) => info)).toEqual([
      { hook: 'test:greet', type: 'action', owner: 'broken' },
      { hook: 'test:greet', type: 'action', owner: undefined },
    ])
  })

  it('survives a throwing error reporter', async () => {
    const bus = createHookBus({ onError: () => { throw new Error('reporter') } })
    const after = vi.fn()
    bus.addAction('x:y', () => { throw new Error('boom') })
    bus.addAction('x:y', after)
    await bus.callHook('x:y')
    expect(after).toHaveBeenCalled()
  })

  it('is a no-op for hooks without handlers', async () => {
    const { bus } = silentBus()
    await expect(bus.callHook('nobody:listens')).resolves.toBeUndefined()
  })
})

describe('filters', () => {
  it('threads the value through handlers in order with extra arguments', async () => {
    const { bus } = silentBus()
    bus.addFilter('test:price', (price) => price * 2, { order: 10 })
    bus.addFilter('test:price', (price, currency) => (currency === 'EUR' ? price + 1 : price))
    expect(await bus.applyFilter('test:price', 10, 'EUR')).toBe(22)
    expect(await bus.applyFilter('test:price', 10, 'USD')).toBe(20)
  })

  it('keeps the previous value when a filter fails', async () => {
    const { bus, errors } = silentBus()
    bus.addFilter('test:price', (price) => price + 1)
    bus.addFilter('test:price', () => {
      throw new Error('bad filter')
    }, { owner: 'pricing' })
    bus.addFilter('test:price', async (price) => price * 10)
    expect(await bus.applyFilter('test:price', 1, 'EUR')).toBe(20)
    expect(errors[0]?.info).toEqual({ hook: 'test:price', type: 'filter', owner: 'pricing' })
  })

  it('returns the input unchanged without handlers', async () => {
    const { bus } = silentBus()
    expect(await bus.applyFilter('test:price', 5, 'EUR')).toBe(5)
  })
})

describe('subscription management', () => {
  it('unsubscribes, removes by owner and lists registrations', async () => {
    const { bus } = silentBus()
    const handler = vi.fn()
    const off = bus.addAction('test:greet', handler)
    bus.addAction('test:greet', vi.fn(), { owner: 'quiz', order: 5 })
    bus.addFilter('test:price', (price) => price, { owner: 'quiz' })
    bus.addAction('a:first', vi.fn(), { owner: 'other' })

    off()
    off()
    await bus.callHook('test:greet', 'x')
    expect(handler).not.toHaveBeenCalled()

    expect(bus.listHooks()).toEqual([
      { hook: 'a:first', type: 'action', order: 0, owner: 'other' },
      { hook: 'test:greet', type: 'action', order: 5, owner: 'quiz' },
      { hook: 'test:price', type: 'filter', order: 0, owner: 'quiz' },
    ])
    expect(bus.hasHook('test:price', 'action')).toBe(false)
    expect(bus.hasHook('test:price')).toBe(true)

    expect(bus.removeOwner('quiz')).toBe(2)
    expect(bus.listHooks().map((registration) => registration.hook)).toEqual(['a:first'])
  })

  it('rejects non-function handlers', () => {
    const { bus } = silentBus()
    expect(() => bus.addAction('x:y', 'nope' as unknown as () => void)).toThrow(TypeError)
  })
})

describe('inactive owners', () => {
  it('skips handlers of inactive owners, evaluated per dispatch', async () => {
    const inactive = new Set<string>()
    const lookups = vi.fn(() => inactive)
    const bus = createHookBus({ onError: () => {}, getInactiveOwners: lookups })
    const calls: string[] = []
    bus.addAction('x:y', () => void calls.push('quiz'), { owner: 'quiz' })
    bus.addAction('x:y', () => void calls.push('host'))
    bus.addFilter('test:price', (price) => price + 1, { owner: 'pricing' })

    await bus.callHook('x:y')
    inactive.add('quiz').add('pricing')
    await bus.callHook('x:y')
    expect(calls).toEqual(['quiz', 'host', 'host'])
    expect(await bus.applyFilter('test:price', 1, 'EUR')).toBe(1)
    expect(lookups).toHaveBeenCalledTimes(3)
    await bus.callHook('nobody:listens')
    expect(lookups).toHaveBeenCalledTimes(3)
  })

  it('fails open when the toggle source throws', async () => {
    const errors: unknown[] = []
    const bus = createHookBus({
      onError: (error) => errors.push(error),
      getInactiveOwners: async () => {
        throw new Error('storage down')
      },
    })
    const handler = vi.fn()
    bus.addAction('x:y', handler, { owner: 'quiz' })
    await bus.callHook('x:y')
    expect(handler).toHaveBeenCalled()
    expect(errors).toHaveLength(1)
  })
})
