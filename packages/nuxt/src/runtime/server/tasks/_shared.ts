import type { MigrationReport, SeederReport } from '@nuxt-modular/core/runtime'
import { describeError } from '../../utils/describe-error'

/** Reads a string-list option from a task payload: `["a","b"]` or `"a,b"`. */
export function listOption(payload: Record<string, unknown>, key: string): string[] | undefined {
  const value = payload[key]
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const cleaned = items.map((item) => String(item).trim()).filter(Boolean)
  return cleaned.length ? cleaned : undefined
}

export function flag(payload: Record<string, unknown>, key: string): boolean {
  const value = payload[key]
  return value === true || value === 'true' || value === '1'
}

/** Turns a failed report into a thrown error so `nuxi task run` exits non-zero. */
export function assertSucceeded(report: MigrationReport | SeederReport, kind: 'migration' | 'seeder'): void {
  if (!report.failed) return
  const { extensionId, name, error } = report.failed
  throw new Error(`${kind} ${extensionId}/${name} failed: ${describeError(error)}`)
}
