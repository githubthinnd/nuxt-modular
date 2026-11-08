/**
 * Client plugin shipped by the extension: reports each navigation. It is only
 * registered when the extension is part of the build, and it respects the
 * runtime toggle.
 */
export default defineNuxtPlugin(() => {
  const router = useRouter()
  const registry = useModuleRegistry()

  router.afterEach((to, from) => {
    if (to.fullPath === from.fullPath || !registry.isModuleActive('analytics-banner')) return
    $fetch<unknown>('/api/analytics/track', { method: 'POST', body: { path: to.path } }).catch(() => {
      // Analytics must never break navigation.
    })
  })
})
