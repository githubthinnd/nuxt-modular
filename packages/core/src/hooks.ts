/*
 * Action/filter hook bus (WordPress-style), framework-agnostic.
 *
 * - Actions broadcast an event; handlers run in order and their results are ignored.
 * - Filters thread a value through handlers; each returns the next value.
 *
 * A failing handler is reported through `onError` and never stops the others.
 * A failing filter leaves the value as it was before that filter.
 */

/**
 * Typed action hooks. Augment from application code:
 *
 * ```ts
 * declare module '@nuxt-modular/core' {
 *   interface ModularActions { 'user:created': [user: User] }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation target
export interface ModularActions {}

/**
 * Typed filter hooks; the first tuple element is the filtered value.
 *
 * ```ts
 * declare module '@nuxt-modular/core' {
 *   interface ModularFilters { 'checkout:price': [price: number, cart: Cart] }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation target
export interface ModularFilters {}

type AnyFilterArgs = [value: unknown, ...rest: unknown[]]

export type ActionArgs<K extends string> = K extends keyof ModularActions
  ? ModularActions[K] extends unknown[]
    ? ModularActions[K]
    : unknown[]
  : unknown[]

export type FilterArgs<K extends string> = K extends keyof ModularFilters
  ? ModularFilters[K] extends AnyFilterArgs
    ? ModularFilters[K]
    : AnyFilterArgs
  : AnyFilterArgs

export type FilterValue<K extends string> = FilterArgs<K>[0]
export type FilterRest<K extends string> = FilterArgs<K> extends [unknown, ...infer Rest] ? Rest : unknown[]

type Awaitable<T> = T | Promise<T>

export type ActionHandler<K extends string = string> = (...args: ActionArgs<K>) => Awaitable<void>
export type FilterHandler<K extends string = string> = (
  value: FilterValue<K>,
  ...args: FilterRest<K>
) => Awaitable<FilterValue<K>>

export type HookType = 'action' | 'filter'

export interface HookSubscribeOptions {
  /** Lower runs first. Default `0`. Ties run in subscription order. */
  readonly order?: number
  /** Owner id (usually the extension id) so all its handlers can be removed at once. */
  readonly owner?: string
}

export interface HookRegistration {
  readonly hook: string
  readonly type: HookType
  readonly order: number
  readonly owner: string | undefined
}

export interface HookErrorInfo {
  readonly hook: string
  readonly type: HookType
  readonly owner: string | undefined
}

export interface HookBusOptions {
  /** Called for every handler that throws or rejects. Defaults to `console.error`. */
  readonly onError?: (error: unknown, info: HookErrorInfo) => void
  /**
   * Owners (extension ids) whose handlers must be skipped, e.g. extensions
   * switched off by a feature toggle. Evaluated once per dispatch; handlers
   * without an owner always run.
   */
  readonly getInactiveOwners?: () => ReadonlySet<string> | Promise<ReadonlySet<string>>
}

export interface HookBus {
  addAction<K extends string>(hook: K, handler: ActionHandler<K>, options?: HookSubscribeOptions): () => void
  addFilter<K extends string>(hook: K, handler: FilterHandler<K>, options?: HookSubscribeOptions): () => void
  /** Runs every action handler for `hook` in order; resolves when all have settled. */
  callHook<K extends string>(hook: K, ...args: ActionArgs<K>): Promise<void>
  /** Threads the value through every filter handler for `hook` and resolves with the result. */
  applyFilter<K extends string>(hook: K, ...args: FilterArgs<K>): Promise<FilterValue<K>>
  /** Removes every handler registered with `owner`; returns how many were removed. */
  removeOwner(owner: string): number
  hasHook(hook: string, type?: HookType): boolean
  listHooks(): HookRegistration[]
}

// Core targets every JS runtime and compiles without DOM/Node typings;
// `console` exists in all of them.
declare const console: { error(...data: unknown[]): void }

type StoredHandler = (...args: unknown[]) => unknown

interface Subscription extends HookRegistration {
  readonly seq: number
  readonly handler: StoredHandler
}

function defaultOnError(error: unknown, info: HookErrorInfo): void {
  const owner = info.owner ? ` (extension "${info.owner}")` : ''
  console.error(`[nuxt-modular] ${info.type} handler for "${info.hook}"${owner} failed:`, error)
}

export function createHookBus(options: HookBusOptions = {}): HookBus {
  const onError = options.onError ?? defaultOnError
  const getInactiveOwners = options.getInactiveOwners
  const subscriptions: Subscription[] = []
  let seq = 0

  const subscribe = (
    hook: string,
    type: HookType,
    handler: StoredHandler,
    { order = 0, owner }: HookSubscribeOptions,
  ): (() => void) => {
    if (typeof handler !== 'function') {
      throw new TypeError(`Handler for ${type} hook "${hook}" must be a function`)
    }
    const subscription: Subscription = { hook, type, order, owner, seq: seq++, handler }
    subscriptions.push(subscription)
    return () => {
      const index = subscriptions.indexOf(subscription)
      if (index !== -1) subscriptions.splice(index, 1)
    }
  }

  const handlersFor = async (hook: string, type: HookType): Promise<Subscription[]> => {
    const matching = subscriptions.filter((subscription) => subscription.hook === hook && subscription.type === type)
    if (!matching.length) return matching
    let inactive: ReadonlySet<string> | undefined
    if (getInactiveOwners) {
      try {
        inactive = await getInactiveOwners()
      } catch (error) {
        // Fail open: a broken toggle source must not silence every hook.
        try {
          onError(error, { hook, type, owner: undefined })
        } catch {
          // ignore a broken reporter
        }
      }
    }
    return matching
      .filter((subscription) => !(subscription.owner && inactive?.has(subscription.owner)))
      .sort((a, b) => a.order - b.order || a.seq - b.seq)
  }

  const report = (error: unknown, subscription: Subscription): void => {
    try {
      onError(error, { hook: subscription.hook, type: subscription.type, owner: subscription.owner })
    } catch {
      // A broken error reporter must not break the hook pipeline.
    }
  }

  return {
    addAction(hook, handler, subscribeOptions = {}) {
      return subscribe(hook, 'action', handler as unknown as StoredHandler, subscribeOptions)
    },

    addFilter(hook, handler, subscribeOptions = {}) {
      return subscribe(hook, 'filter', handler as unknown as StoredHandler, subscribeOptions)
    },

    async callHook(hook, ...args) {
      for (const subscription of await handlersFor(hook, 'action')) {
        try {
          await subscription.handler(...args)
        } catch (error) {
          report(error, subscription)
        }
      }
    },

    async applyFilter(hook, ...args) {
      const [initial, ...rest] = args
      let value: unknown = initial
      for (const subscription of await handlersFor(hook, 'filter')) {
        try {
          value = await subscription.handler(value, ...rest)
        } catch (error) {
          report(error, subscription)
        }
      }
      return value as FilterValue<typeof hook>
    },

    removeOwner(owner) {
      let removed = 0
      for (let index = subscriptions.length - 1; index >= 0; index--) {
        if (subscriptions[index]?.owner === owner) {
          subscriptions.splice(index, 1)
          removed++
        }
      }
      return removed
    },

    hasHook(hook, type) {
      return subscriptions.some((subscription) => subscription.hook === hook && (!type || subscription.type === type))
    },

    listHooks() {
      return [...subscriptions]
        .sort((a, b) => (a.hook < b.hook ? -1 : a.hook > b.hook ? 1 : 0) || a.order - b.order || a.seq - b.seq)
        .map(({ hook, type, order, owner }) => ({ hook, type, order, owner }))
    },
  }
}

/** Typed identity helper for `server/hooks/*` files subscribed as actions. */
export function defineActionHandler<K extends string = string>(handler: ActionHandler<K>): ActionHandler<K> {
  return handler
}

/** Typed identity helper for `server/hooks/*` files subscribed as filters. */
export function defineFilterHandler<K extends string = string>(handler: FilterHandler<K>): FilterHandler<K> {
  return handler
}
