import { defineComponent, h, onErrorCaptured, onMounted, type PropType, ref, shallowRef, type SlotsType, type VNode } from 'vue'

export interface ExtensionFallbackProps {
  readonly error: unknown
  readonly extensionId: string
  readonly slotKey: string
}

/**
 * Error boundary around one extension slot that is safe across SSR and hydration.
 *
 * Every slot renders inside a `display: contents` wrapper so the outlet keeps
 * the host layout. When a slot throws:
 * - on the server: the error is recorded in `failedSlots` (shipped in the
 *   payload) and swallowed, so the rest of the page renders normally;
 * - on the client during hydration of a slot that failed on the server: the
 *   wrapper is hydrated with an `innerHTML` prop, which makes Vue adopt the
 *   server DOM as-is instead of re-running the broken component — no
 *   mismatch — and the fallback replaces it after mount;
 * - on the client after hydration: the fallback is shown immediately.
 *
 * Only Vue is imported here so the component can be tested without Nuxt.
 */
export default defineComponent({
  name: 'ExtensionBoundary',
  props: {
    slotKey: { type: String, required: true },
    extensionId: { type: String, required: true },
    /** Shared record of slots that failed during SSR (from `useState`). */
    failedSlots: { type: Object as PropType<Record<string, string>>, required: true },
    /** Whether this render happens on the server. */
    server: { type: Boolean, default: false },
    /** Whether the client is hydrating server HTML at setup time. */
    hydrating: { type: Boolean, default: false },
    /** Tag of the per-slot wrapper; it is styled `display: contents`. */
    tag: { type: String, default: 'div' },
  },
  emits: {
    error: (_error: unknown, _info: { extensionId: string; slotKey: string }) => true,
  },
  slots: Object as SlotsType<{
    default: Record<string, never>
    fallback: ExtensionFallbackProps
  }>,
  setup(props, { slots, emit }) {
    const failedOnServer = !props.server && props.slotKey in props.failedSlots
    const error = shallowRef<unknown>(failedOnServer ? new Error(props.failedSlots[props.slotKey]) : undefined)
    const showFallback = ref(failedOnServer && !props.hydrating)

    onMounted(() => {
      if (failedOnServer) showFallback.value = true
    })

    onErrorCaptured((captured) => {
      error.value = captured
      if (props.server) {
        props.failedSlots[props.slotKey] = captured instanceof Error ? captured.message : String(captured)
      } else {
        showFallback.value = true
      }
      emit('error', captured, { extensionId: props.extensionId, slotKey: props.slotKey })
      return false
    })

    const wrapper = (key: string, extra: Record<string, unknown>, children?: VNode[] | (() => VNode[])) =>
      h(
        props.tag,
        {
          key,
          'data-extension': props.extensionId,
          'data-slot': props.slotKey,
          style: 'display: contents',
          ...extra,
        },
        children,
      )

    return () => {
      if (showFallback.value) {
        const fallbackProps: ExtensionFallbackProps = {
          error: error.value,
          extensionId: props.extensionId,
          slotKey: props.slotKey,
        }
        return wrapper('fallback', { 'data-state': 'error' }, () =>
          slots.fallback?.(fallbackProps) ?? [
            h(
              'div',
              { class: 'nuxt-modular-error', role: 'alert' },
              `Extension "${props.extensionId}" could not be displayed.`,
            ),
          ],
        )
      }
      // Adopt the server's (possibly partial) markup untouched while hydrating.
      if (failedOnServer) return wrapper('server-failed', { innerHTML: '' })
      return wrapper('content', {}, () => slots.default?.({}) ?? [])
    }
  },
})
