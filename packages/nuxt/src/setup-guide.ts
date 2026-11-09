/*
 * Decides whether the first start after installing the module should run the
 * guided setup. It must happen for `nuxi module add nuxt-modular` (which runs
 * `nuxt prepare` in the same terminal right after adding the module) and not
 * for a plain `npm install` followed by editing nuxt.config by hand, nor in CI.
 */

export interface SetupContext {
  /** `process.argv`. */
  readonly argv: readonly string[]
  readonly env: Readonly<Record<string, string | undefined>>
  readonly stdinIsTTY: boolean
  readonly stdoutIsTTY: boolean
}

const TRUE = new Set(['1', 'true', 'yes'])
const FALSE = new Set(['0', 'false', 'no'])

const flag = (value: string | undefined): boolean | undefined => {
  const normalized = value?.trim().toLowerCase()
  return normalized === undefined ? undefined : TRUE.has(normalized) ? true : FALSE.has(normalized) ? false : undefined
}

export const isCI = (env: SetupContext['env']): boolean => Boolean(env.CI && !FALSE.has(env.CI.toLowerCase())) || Boolean(env.GITHUB_ACTIONS)

/** `nuxi module add ...` or `nuxt module add ...`. */
export function isModuleAddCommand(argv: readonly string[]): boolean {
  const args = argv.slice(2)
  const index = args.indexOf('module')
  return index !== -1 && args[index + 1] === 'add'
}

/**
 * - `NUXT_MODULAR_INIT=0` never asks, `NUXT_MODULAR_INIT=1` asks on the first start whatever the command.
 * - Otherwise it asks only when `nuxi module add` triggered the start.
 * - Without a terminal on both ends, or in CI, it never asks.
 */
export function wantsGuidedSetup(context: SetupContext): boolean {
  if (!context.stdinIsTTY || !context.stdoutIsTTY) return false
  const override = flag(context.env.NUXT_MODULAR_INIT)
  if (override !== undefined) return override
  if (isCI(context.env)) return false
  return isModuleAddCommand(context.argv)
}
