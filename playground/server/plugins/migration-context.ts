/**
 * Host side of extension migrations: every migration receives the app's data
 * storage in its context. A real host would add its database client here.
 */
export default defineNitroPlugin(() => {
  const hooks = useModularServerHooks()
  hooks.addFilter('modular:migration-context', (context) => ({ ...context, storage: useStorage('app-data') }))
  hooks.addFilter('modular:seeder-context', (context) => ({ ...context, storage: useStorage('app-data') }))
})
