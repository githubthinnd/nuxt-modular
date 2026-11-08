/** Everything a command needs from its environment; swapped out in tests. */
export interface CommandIO {
  readonly cwd: string
  out(message: string): void
  err(message: string): void
}

export class CliError extends Error {
  override readonly name = 'CliError'
}

export const processIO = (cwd: string = process.cwd()): CommandIO => ({
  cwd,
  out: (message) => process.stdout.write(`${message}\n`),
  err: (message) => process.stderr.write(`${message}\n`),
})
