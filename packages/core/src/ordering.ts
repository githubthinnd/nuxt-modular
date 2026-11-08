/** Anything the registry sorts: slots, navigation items, hook handlers. */
export interface Ordered {
  readonly order: number
  readonly extensionId: string
  /** Position of the item inside its extension's manifest array. */
  readonly index: number
}

/**
 * Total, deterministic order: `order` ascending, then extension id, then
 * declaration index. Ids are compared by UTF-16 code units rather than
 * `localeCompare`, whose result depends on the ICU data of the runtime and
 * could differ between the Nitro server and the browser.
 */
export function compareOrdered(a: Ordered, b: Ordered): number {
  if (a.order !== b.order) return a.order - b.order
  if (a.extensionId !== b.extensionId) return a.extensionId < b.extensionId ? -1 : 1
  return a.index - b.index
}
