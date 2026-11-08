import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3210)
const baseURL = `http://127.0.0.1:${port}`

/**
 * End-to-end tests against a production build of the playground
 * (`nuxi build` + `node .output/server/index.mjs`), so SSR, hydration,
 * Nitro routes and storage behave as in a real deployment.
 */
export default defineConfig({
  testDir: './e2e',
  // Tests share the server and its persistent storage (toggles, migrations).
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Fresh storage each run: no toggles, migrations pending until the server starts.
    command: 'rm -rf .data && nuxi build && node .output/server/index.mjs',
    url: baseURL,
    env: { PORT: String(port), HOST: '127.0.0.1', NUXT_TELEMETRY_DISABLED: '1' },
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
