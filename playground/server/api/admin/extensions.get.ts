/** Lists extensions with their persistent toggle state (admin only). */
export default defineEventHandler(async (event) => {
  requireDemoAdmin(event)
  return useModularToggles().list()
})
