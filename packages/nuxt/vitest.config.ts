import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const mock = (file: string) => fileURLToPath(new URL(`./test/mocks/${file}`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '#app': mock('app.ts'),
      '#nuxt-modular/manifests': mock('manifests.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
})
