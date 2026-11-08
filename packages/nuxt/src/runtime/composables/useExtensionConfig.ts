import { useRuntimeConfig } from '#app'
import { manifests } from '#nuxt-modular/manifests'
import type { JsonObject } from '@nuxt-modular/core/runtime'
import { type ExtensionConfig, resolveExtensionConfig } from '../utils/extension-config'

export type { ExtensionConfig } from '../utils/extension-config'

/**
 * Settings of an extension: defaults from its manifest (`config`) overlaid
 * with `modular.config[<id>]` from `nuxt.config` or the environment
 * (`NUXT_PUBLIC_MODULAR_CONFIG_QUIZ_LIMIT=5`). Public: it ships to the browser.
 *
 * ```ts
 * const quiz = useExtensionConfig('quiz')
 * quiz.get('limits.maxQuestions', 20)
 * ```
 */
export function useExtensionConfig<T extends JsonObject = JsonObject>(id: string): ExtensionConfig<T> {
  return resolveExtensionConfig<T>(manifests, useRuntimeConfig().public.modular, id)
}
