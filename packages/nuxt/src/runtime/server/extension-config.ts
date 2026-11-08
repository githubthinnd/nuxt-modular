import { useRuntimeConfig } from 'nitropack/runtime'
import { manifests } from '#nuxt-modular/server-manifests'
import type { JsonObject } from '@nuxt-modular/core/runtime'
import { type ExtensionConfig, resolveExtensionConfig } from '../utils/extension-config'

/**
 * Server-side counterpart of the `useExtensionConfig()` composable: manifest
 * defaults overlaid with `modular.config[<id>]`.
 */
export function useModularExtensionConfig<T extends JsonObject = JsonObject>(id: string): ExtensionConfig<T> {
  return resolveExtensionConfig<T>(manifests, useRuntimeConfig().public.modular, id)
}
