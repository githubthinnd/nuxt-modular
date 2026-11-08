import { createHookBus, type HookBus } from '@nuxt-modular/core/runtime'
import { describeError } from '../utils/describe-error'
import { useModularToggles } from './toggles'

let bus: HookBus | undefined

/**
 * The server-wide hook bus. One instance per server process; extension hook
 * handlers declared in manifests are registered on it at startup. Handlers of
 * extensions switched off by a persistent toggle are skipped.
 *
 * ```ts
 * const hooks = useModularServerHooks()
 * await hooks.callHook('user:created', user)
 * const price = await hooks.applyFilter('checkout:price', rawPrice, cart)
 * ```
 */
export function useModularServerHooks(): HookBus {
  bus ??= createHookBus({
    onError(error, info) {
      const owner = info.owner ? ` of extension "${info.owner}"` : ''
      console.error(`[nuxt-modular] ${info.type} hook "${info.hook}"${owner} failed: ${describeError(error)}`)
    },
    getInactiveOwners: () => useModularToggles().getInactive(),
  })
  return bus
}
