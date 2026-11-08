// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Component, createSSRApp, defineComponent, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import ExtensionBoundary from '../src/runtime/components/ExtensionBoundary'

const Healthy = defineComponent({ name: 'Healthy', setup: () => () => h('b', 'healthy') })
const ThrowsInSetup = defineComponent({
  name: 'ThrowsInSetup',
  setup() {
    throw new Error('setup boom')
  },
})
const ThrowsInRender = defineComponent({
  name: 'ThrowsInRender',
  render() {
    throw new Error('render boom')
  },
})
const PartiallyRendered = defineComponent({
  name: 'PartiallyRendered',
  setup: () => () => h('section', [h('h3', 'title'), h(ThrowsInSetup), h('p', 'after')]),
})

type FallbackSlot = Parameters<NonNullable<InstanceType<typeof ExtensionBoundary>['$slots']['fallback']>>[0]

function page(child: Component, failedSlots: Record<string, string>, flags: { server: boolean; hydrating: boolean }, fallback?: (p: FallbackSlot) => ReturnType<typeof h>[]) {
  return () =>
    h('main', [
      h('header', 'host header'),
      h(
        ExtensionBoundary,
        { slotKey: 'quiz/tab', extensionId: 'quiz', failedSlots, ...flags },
        { default: () => [h(child)], ...(fallback ? { fallback } : {}) },
      ),
      h('footer', 'host footer'),
    ])
}

let logs: string[] = []
beforeEach(() => {
  logs = []
  const capture = (...args: unknown[]) => void logs.push(args.map(String).join(' '))
  vi.spyOn(console, 'warn').mockImplementation(capture)
  vi.spyOn(console, 'error').mockImplementation(capture)
})
afterEach(() => vi.restoreAllMocks())

async function ssrThenHydrate(child: Component, fallback?: (p: FallbackSlot) => ReturnType<typeof h>[]) {
  const failedSlots: Record<string, string> = {}
  const html = await renderToString(createSSRApp({ render: page(child, failedSlots, { server: true, hydrating: false }, fallback) }))
  const serverLogs = logs.splice(0)

  const container = document.createElement('div')
  container.innerHTML = html
  // The payload carries `failedSlots` to the client.
  const payload = JSON.parse(JSON.stringify(failedSlots)) as Record<string, string>
  createSSRApp({ render: page(child, payload, { server: false, hydrating: true }, fallback) }).mount(container)
  await nextTick()
  await nextTick()
  return { html, failedSlots, serverLogs, clientLogs: logs.splice(0), dom: container.innerHTML }
}

const hydrationWarnings = (lines: string[]) => lines.filter((line) => /hydration/i.test(line))

describe('ExtensionBoundary', () => {
  it('renders healthy slots inside a display:contents wrapper and hydrates cleanly', async () => {
    const result = await ssrThenHydrate(Healthy)
    expect(result.html).toBe(
      '<main><header>host header</header><div data-extension="quiz" data-slot="quiz/tab" style="display: contents"><b>healthy</b></div><footer>host footer</footer></main>',
    )
    expect(result.failedSlots).toEqual({})
    expect(result.clientLogs).toEqual([])
    expect(result.dom).toBe(result.html)
  })

  it.each([
    ['setup', ThrowsInSetup, 'setup boom'],
    ['render', ThrowsInRender, 'render boom'],
    ['a nested component', PartiallyRendered, 'setup boom'],
  ])('contains an SSR error thrown in %s without hydration mismatches', async (_label, child, message) => {
    const result = await ssrThenHydrate(child)
    expect(result.html).toContain('<header>host header</header>')
    expect(result.html).toContain('<footer>host footer</footer>')
    expect(result.failedSlots).toEqual({ 'quiz/tab': message })
    expect(hydrationWarnings(result.clientLogs)).toEqual([])
    expect(result.dom).toContain('role="alert"')
    expect(result.dom).toContain('Extension "quiz" could not be displayed.')
    expect(result.dom).not.toContain('title') // stale partial server markup is replaced
    expect(result.dom).toMatch(/^<main><header>host header<\/header><div[^>]*data-state="error"/)
  })

  it('uses the fallback slot with error details', async () => {
    const result = await ssrThenHydrate(ThrowsInSetup, ({ error, extensionId, slotKey }) => [
      h('em', `${extensionId} ${slotKey} ${(error as Error).message}`),
    ])
    expect(hydrationWarnings(result.clientLogs)).toEqual([])
    expect(result.dom).toContain('<em>quiz quiz/tab setup boom</em>')
  })

  it('shows the fallback for errors after hydration and emits the error', async () => {
    let fail = false
    const Flaky = defineComponent({
      setup: () => () => {
        if (fail) throw new Error('late boom')
        return h('b', 'fine')
      },
    })
    const onError = vi.fn()
    const container = document.createElement('div')
    const app = createSSRApp({
      data: () => ({ tick: 0 }),
      render() {
        return h(
          ExtensionBoundary,
          { slotKey: 'x/y', extensionId: 'x', failedSlots: {}, onError },
          { default: () => [h(Flaky, { tick: (this as { tick: number }).tick })] },
        )
      },
    })
    const vm = app.mount(container) as unknown as { tick: number }
    expect(container.textContent).toBe('fine')
    fail = true
    vm.tick++
    await nextTick()
    await nextTick()
    expect(container.textContent).toBe('Extension "x" could not be displayed.')
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'late boom' }), { extensionId: 'x', slotKey: 'x/y' })
  })

  it('renders the fallback immediately on client navigation to a slot that failed on the server', () => {
    const container = document.createElement('div')
    createSSRApp({ render: page(ThrowsInSetup, { 'quiz/tab': 'setup boom' }, { server: false, hydrating: false }) }).mount(container)
    expect(container.textContent).toContain('could not be displayed')
  })
})
