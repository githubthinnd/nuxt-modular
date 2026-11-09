import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'pathe'
import type { CommandIO } from '../io'

const needsQuotes = (value: string): boolean => /[\s#'"]/.test(value)

/** Returns `source` with `KEY=value` set: the existing line is replaced, otherwise it is appended. */
export function upsertEnvValue(source: string, key: string, value: string): string {
  const line = `${key}=${needsQuotes(value) ? JSON.stringify(value) : value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  if (pattern.test(source)) return source.replace(pattern, () => line)
  const separator = source === '' || source.endsWith('\n') ? '' : '\n'
  return `${source}${separator}${line}\n`
}

/** Sets one variable in an env file (created when missing). Reports what happened; never prints the value. */
export function writeEnvValue(io: CommandIO, root: string, file: string, key: string, value: string): void {
  const target = join(root, file)
  const exists = existsSync(target)
  const current = exists ? readFileSync(target, 'utf8') : ''
  const next = upsertEnvValue(current, key, value)
  if (next === current) return
  writeFileSync(target, next)
  io.out(`  ${exists ? 'updated ' : 'created '} ${file} (${key})`)
}

/** Makes sure `entry` is listed in .gitignore (when the project has one). */
export function ensureIgnored(io: CommandIO, root: string, entry: string): void {
  const target = join(root, '.gitignore')
  if (!existsSync(target)) return
  const current = readFileSync(target, 'utf8')
  const present = current.split(/\r?\n/).some((line) => line.trim() === entry || line.trim() === `/${entry}`)
  if (present) return
  const separator = current === '' || current.endsWith('\n') ? '' : '\n'
  writeFileSync(target, `${current}${separator}${entry}\n`)
  io.out(`  updated  .gitignore (${entry})`)
}

/** Documents a variable in `.env.example` (created when missing) unless it is already listed. */
export function addEnvExample(io: CommandIO, root: string, key: string, block: string): void {
  const target = join(root, '.env.example')
  const exists = existsSync(target)
  const current = exists ? readFileSync(target, 'utf8') : ''
  if (new RegExp(`^${key}=`, 'm').test(current)) return
  const separator = current === '' ? '' : current.endsWith('\n') ? '\n' : '\n\n'
  writeFileSync(target, `${current}${separator}${block}\n`)
  io.out(`  ${exists ? 'updated ' : 'created '} .env.example (${key})`)
}
