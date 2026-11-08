import { defineNuxtPlugin } from '#app'
import { loadPersistedToggles } from '../composables/useModuleRegistry'

/** Loads persistent extension toggles before the app renders (server only). */
export default defineNuxtPlugin({
  name: 'nuxt-modular:toggles',
  enforce: 'pre',
  async setup() {
    await loadPersistedToggles()
  },
})
