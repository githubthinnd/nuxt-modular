import { test as base, type APIRequestContext, expect, type Page } from '@playwright/test'

export type DemoRole = 'guest' | 'student' | 'teacher' | 'admin'

interface Fixtures {
  /** Console messages and uncaught errors collected for the current page. */
  consoleLog: string[]
  /** Sets the demo role cookie before navigating. */
  useRole: (role: DemoRole) => Promise<void>
  /** Persists a toggle through the admin API; every toggle is reset after the test. */
  setToggle: (id: string, active: boolean | null) => Promise<void>
}

export const test = base.extend<Fixtures>({
  consoleLog: async ({ page }, use) => {
    const log: string[] = []
    page.on('console', (message) => log.push(`[${message.type()}] ${message.text()}`))
    page.on('pageerror', (error) => log.push(`[pageerror] ${error.message}`))
    await use(log)
  },

  useRole: async ({ context, baseURL }, use) => {
    await use(async (role) => {
      await context.addCookies([{ name: 'demo-role', value: role, url: baseURL ?? 'http://127.0.0.1' }])
    })
  },

  setToggle: async ({ playwright, baseURL }, use) => {
    const admin = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { cookie: 'demo-role=admin' } })
    const touched = new Set<string>()
    await use(async (id, active) => {
      touched.add(id)
      const response = await admin.put(`/api/admin/extensions/${id}`, { data: { active } })
      expect(response.status(), await response.text()).toBe(200)
      await waitForToggleCache()
    })
    for (const id of touched) await admin.put(`/api/admin/extensions/${id}`, { data: { active: null } })
    if (touched.size) await waitForToggleCache()
    await admin.dispose()
  },
})

export { expect }

/** Toggles are cached per server process for `modular.toggles.ttl` (1000 ms by default). */
export const waitForToggleCache = () => new Promise((resolve) => setTimeout(resolve, 1100))

/** Waits until Nuxt finished hydrating (see app/plugins/hydration-marker.client.ts) and the network settled. */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForSelector('html[data-hydrated="true"]', { state: 'attached' })
  await page.waitForLoadState('networkidle')
}

export const hydrationIssues = (log: readonly string[]) => log.filter((line) => /hydration/i.test(line))

export async function getJson<T>(request: APIRequestContext, url: string): Promise<{ status: number; body: T | undefined }> {
  const response = await request.get(url)
  return { status: response.status(), body: response.ok() ? ((await response.json()) as T) : undefined }
}
