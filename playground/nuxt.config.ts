// Comma-separated extension ids to leave out of the build, e.g.
// NUXT_MODULAR_DISABLED=analytics-banner,broken-widget pnpm dev
const disabled = (process.env.NUXT_MODULAR_DISABLED ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean)

const built = (id: string) => !disabled.includes(id)

export default defineNuxtConfig({
  // The playground consumes the module from source.
  modules: ['../packages/nuxt/src/module'],

  modular: {
    disabled,
    // Pending extension migrations run when the server starts (not while prerendering).
    migrations: { auto: true },
    // `pnpm --dir playground exec nuxt task run modular:seed` (needs the dev server).
    tasks: true,
    config: { quiz: { bonusPoints: 5 } },
  },

  css: ['~/assets/main.css'],
  devtools: { enabled: true },
  compatibilityDate: '2026-11-01',

  nitro: {
    // Persist toggles, the migration ledger and app data on disk (Nitro's default is memory).
    storage: {
      'nuxt-modular': { driver: 'fs', base: './.data/modular' },
      'app-data': { driver: 'fs', base: './.data/app' },
    },
    devStorage: {
      'nuxt-modular': { driver: 'fs', base: './.data/modular' },
      'app-data': { driver: 'fs', base: './.data/app' },
    },
    // Prerendering is only for scripts/check-ssr.mjs (PLAYGROUND_PRERENDER=1); a normal build
    // must render per request so roles and toggles apply.
    prerender: process.env.PLAYGROUND_PRERENDER === '1'
      ? {
          crawlLinks: true,
          // Set when 404s are expected (extensions switched off by a toggle).
          failOnError: process.env.PRERENDER_ALLOW_ERRORS !== '1',
          routes: [
            '/',
            '/course/nuxt-basics',
            '/api/demo/hooks',
            '/api/demo/migrations',
            ...(built('quiz') ? ['/api/quiz/questions'] : []),
            ...(built('analytics-banner') ? ['/api/analytics/stats'] : []),
          ],
        }
      : {},
  },
})
