import type { z } from 'zod'

/** Any JSON-serializable value, as accepted by `z.json()`. */
export type JsonValue = z.output<ReturnType<typeof z.json>>
