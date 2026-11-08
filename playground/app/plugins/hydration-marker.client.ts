/**
 * Marks `<html data-hydrated>` once Nuxt finished hydrating the first page.
 * Used by the E2E tests as a reliable "app is interactive" signal (Vue does
 * not set `data-v-app` when hydrating server-rendered HTML).
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hooks.hookOnce('app:suspense:resolve', () => {
    document.documentElement.dataset.hydrated = 'true'
  })
})
