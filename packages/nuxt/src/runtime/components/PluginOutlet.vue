<script lang="ts">
import { type Component, computed, defineComponent, h, type PropType, type SlotsType, type VNode } from 'vue'
import { useNuxtApp, useState } from '#app'
import { slotComponents } from '#nuxt-modular/components'
import { componentKey } from '@nuxt-modular/core/runtime'
import { useModuleRegistry } from '../composables/useModuleRegistry'
import { describeError } from '../utils/describe-error'
import ExtensionBoundary, { type ExtensionFallbackProps } from './ExtensionBoundary'

export const FAILED_SLOTS_STATE_KEY = 'nuxt-modular:failed-slots'

/**
 * Renders every active, permitted extension component registered for an
 * outlet, in deterministic order, each isolated in its own error boundary.
 *
 * ```vue
 * <PluginOutlet name="course.tabs" :context="{ courseId }" wrap-with="nav" />
 * ```
 */
export default defineComponent({
  name: 'PluginOutlet',
  props: {
    /** Outlet identifier, e.g. `course.tabs`. */
    name: { type: String, required: true },
    /** Passed to every extension component as its `context` prop. */
    context: { type: Object as PropType<Record<string, unknown>>, default: () => ({}) },
    /** Element tag or component wrapping the whole outlet; not rendered when the outlet is empty. */
    wrapWith: { type: [String, Object, Function] as PropType<string | Component>, default: undefined },
    /** Tag of each item's `display: contents` wrapper (use `li` inside lists). */
    itemTag: { type: String, default: 'div' },
  },
  slots: Object as SlotsType<{
    /** Rendered when no extension contributes to the outlet. */
    empty: Record<string, never>
    /** Replaces the default error UI of a failed extension component. */
    fallback: ExtensionFallbackProps
  }>,
  setup(props, { slots }) {
    const nuxtApp = useNuxtApp()
    const registry = useModuleRegistry()
    const failedSlots = useState<Record<string, string>>(FAILED_SLOTS_STATE_KEY, () => ({}))
    const items = computed(() => registry.getSlotComponents(props.name))

    const report = (error: unknown, info: { extensionId: string; slotKey: string }) => {
      console.error(`[nuxt-modular] Extension "${info.extensionId}" failed in outlet "${props.name}" (${info.slotKey}): ${describeError(error)}`)
    }

    return () => {
      if (!items.value.length) return slots.empty?.({}) ?? null

      const children: VNode[] = items.value.map((slot) => {
        const component = slotComponents[componentKey(slot.extensionId, slot.component)]
        return h(
          ExtensionBoundary,
          {
            key: slot.key,
            slotKey: slot.key,
            extensionId: slot.extensionId,
            failedSlots: failedSlots.value,
            server: import.meta.server,
            hydrating: nuxtApp.isHydrating === true,
            tag: props.itemTag,
            onError: report,
          },
          {
            default: () => {
              if (!component) {
                throw new Error(`Component "${slot.component}" of extension "${slot.extensionId}" is not part of the build`)
              }
              return [h(component, { ...slot.props, context: props.context })]
            },
            fallback: slots.fallback ? (fallbackProps: ExtensionFallbackProps) => slots.fallback?.(fallbackProps) ?? [] : undefined,
          },
        )
      })

      if (!props.wrapWith) return children
      const attrs = { 'data-outlet': props.name }
      return typeof props.wrapWith === 'string'
        ? h(props.wrapWith, attrs, children)
        : h(props.wrapWith, attrs, { default: () => children })
    }
  },
})
</script>
