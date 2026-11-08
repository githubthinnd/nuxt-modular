import type { ActionHandler, FilterHandler } from '@nuxt-modular/core/runtime'
import { defineNitroPlugin } from 'nitropack/runtime'
import { subscriptions } from '#nuxt-modular/server-hooks'
import { describeError } from '../utils/describe-error'
import { useModularConfig } from './config'
import { setModularContext } from './context'
import { closeModularDatabase } from './database'
import { useModularMigrations } from './migrations'
import { useModularToggles } from './toggles'
import { useModularServerHooks } from './utils'

/**
 * - Registers every `serverHooks` subscription from extension manifests on the
 *   server hook bus (owner = extension id).
 * - Exposes persistent toggles to the Nuxt renderer through the event context.
 * - Runs pending migrations at startup when `modular.migrations.auto` is set
 *   (never while prerendering); requests wait until they finish.
 * - Forwards Nitro lifecycle hooks to the bus: `nitro:request`,
 *   `nitro:after-response`, `nitro:error`.
 */
export default defineNitroPlugin((nitroApp) => {
  const bus = useModularServerHooks()
  const config = useModularConfig()
  const toggles = useModularToggles()

  for (const subscription of subscriptions) {
    const { extensionId, hook, type, order, handler } = subscription
    if (typeof handler !== 'function') {
      console.error(`[nuxt-modular] Hook handler for "${hook}" in extension "${extensionId}" has no default-exported function`)
      continue
    }
    const options = { order, owner: extensionId }
    if (type === 'action') bus.addAction(hook, handler as ActionHandler, options)
    else bus.addFilter(hook, handler as FilterHandler, options)
  }

  let ready: Promise<void> | undefined
  if (config.migrations.auto && !import.meta.prerender) {
    ready = useModularMigrations()
      .up()
      .then((report) => {
        if (report.executed.length) console.info(`[nuxt-modular] applied ${report.executed.length} migration(s)`)
      })
      .catch((error: unknown) => {
        console.error(`[nuxt-modular] automatic migrations did not run: ${describeError(error)}`)
      })
  }

  nitroApp.hooks.hook('request', async (event) => {
    if (ready) await ready
    setModularContext(event, { getOverrides: () => toggles.getOverrides() })
    if (bus.hasHook('nitro:request', 'action')) await bus.callHook('nitro:request', event)
  })
  nitroApp.hooks.hook('close', () => closeModularDatabase())
  nitroApp.hooks.hook('afterResponse', async (event) => {
    if (bus.hasHook('nitro:after-response', 'action')) await bus.callHook('nitro:after-response', event)
  })
  nitroApp.hooks.hook('error', async (error, context) => {
    if (bus.hasHook('nitro:error', 'action')) await bus.callHook('nitro:error', error, context.event)
  })
})
