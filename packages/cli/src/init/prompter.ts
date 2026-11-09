/** Thrown when the user aborts a question (Ctrl+C). Not an error: setup just stops. */
export class SetupCancelled extends Error {
  override readonly name = 'SetupCancelled'
}

export interface SelectOption<T extends string> {
  readonly label: string
  readonly value: T
  readonly hint?: string
}

/** The questions the setup can ask. Tests pass a scripted implementation. */
export interface Prompter {
  text(message: string, options?: { initial?: string; validate?: (value: string) => string | undefined }): Promise<string>
  confirm(message: string, options?: { initial?: boolean }): Promise<boolean>
  select<T extends string>(message: string, options: { options: readonly SelectOption<T>[]; initial?: T }): Promise<T>
}

/** Interactive prompts on the terminal, powered by consola (already a dependency of Nuxt). */
export function consolaPrompter(): Prompter {
  const ask = async <R>(run: (consola: typeof import('consola').consola) => Promise<R>): Promise<R> => {
    const { consola } = await import('consola')
    try {
      return await run(consola)
    } catch (error) {
      throw new SetupCancelled(error instanceof Error ? error.message : 'cancelled')
    }
  }
  return {
    async text(message, options = {}) {
      for (;;) {
        const value = (await ask((consola) =>
          consola.prompt(message, {
            type: 'text',
            cancel: 'reject',
            ...(options.initial !== undefined ? { initial: options.initial, default: options.initial } : {}),
          }),
        )) as string
        const problem = options.validate?.(value.trim())
        if (!problem) return value.trim()
        const { consola } = await import('consola')
        consola.warn(problem)
      }
    },
    confirm: (message, options = {}) =>
      ask((consola) => consola.prompt(message, { type: 'confirm', cancel: 'reject', initial: options.initial ?? true })) as Promise<boolean>,
    select: (message, options) =>
      ask((consola) =>
        consola.prompt(message, {
          type: 'select',
          cancel: 'reject',
          options: options.options.map((option) => ({ label: option.label, value: option.value, ...(option.hint ? { hint: option.hint } : {}) })),
          ...(options.initial !== undefined ? { initial: options.initial } : {}),
        }),
      ) as Promise<(typeof options.options)[number]['value']>,
  }
}
