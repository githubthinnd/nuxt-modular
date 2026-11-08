import { describe, expect, it } from 'vitest'
import { getConfigValue, mergeConfig } from '../src/config'
import { parseManifest } from '../src/manifest'
import { createMemoryLedger, runMigrationsReset, runMigrationsUp, type MigrationEntry } from '../src/migrations'
import { planSeeders, runSeeders, type SeederEntry } from '../src/seeders'

describe('mergeConfig / getConfigValue', () => {
  it('deep-merges objects, replaces arrays and does not mutate', () => {
    const base = { a: { b: 1, c: [1, 2] }, d: 'x' }
    const merged = mergeConfig(base, { a: { c: [9] }, e: true })
    expect(merged).toEqual({ a: { b: 1, c: [9] }, d: 'x', e: true })
    expect(base).toEqual({ a: { b: 1, c: [1, 2] }, d: 'x' })
  })

  it('ignores non-object overrides and prototype-polluting keys', () => {
    expect(mergeConfig({ a: 1 }, 'nope')).toEqual({ a: 1 })
    const merged = mergeConfig({}, JSON.parse('{"__proto__":{"polluted":true},"safe":1}'))
    expect(merged).toEqual({ safe: 1 })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('reads dotted paths with fallbacks', () => {
    const config = { limits: { max: 5, off: null }, list: [1] }
    expect(getConfigValue(config, 'limits.max')).toBe(5)
    expect(getConfigValue(config, 'limits.min', 1)).toBe(1)
    expect(getConfigValue(config, 'limits.off', 'x')).toBe(null)
    expect(getConfigValue(config, 'list.0', 'x')).toBe('x')
    expect(getConfigValue(config, 'missing.deep')).toBeUndefined()
  })
})

describe('manifest requires/config', () => {
  const base = { id: 'quiz', name: 'Quiz', version: '1.0.0' }
  it('defaults to empty requirements and config', () => {
    const manifest = parseManifest(base)
    expect(manifest.requires).toEqual({ extensions: {} })
    expect(manifest.config).toEqual({})
  })

  it('validates ranges and requires dependsOn for versioned dependencies', () => {
    expect(() => parseManifest({ ...base, requires: { modular: 'banana' } })).toThrow(/semver range/)
    expect(() => parseManifest({ ...base, requires: { extensions: { core: '^1.0.0' } } })).toThrow(/not listed in dependsOn/)
    const ok = parseManifest({ ...base, dependsOn: ['core'], requires: { modular: '^1', extensions: { core: '^1.0.0' } }, config: { limit: 3, nested: { on: true } } })
    expect(ok.config).toEqual({ limit: 3, nested: { on: true } })
  })

  it('rejects non-JSON config', () => {
    expect(() => parseManifest({ ...base, config: { fn: () => 1 } })).toThrow()
  })
})

describe('seeders', () => {
  const run = (log: string[], name: string) => ({ run: () => void log.push(name) })
  const entries = (log: string[]): SeederEntry[] => [
    { extensionId: 'quiz', name: '002-b', seeder: run(log, 'quiz/002-b') },
    { extensionId: 'core', name: '001-a', seeder: run(log, 'core/001-a') },
    { extensionId: 'quiz', name: '001-a', seeder: run(log, 'quiz/001-a') },
  ]
  const createContext = (base: object) => base as never

  it('runs dependencies first, then names, and is repeatable', async () => {
    const log: string[] = []
    const options = { entries: entries(log), createContext, order: ['core', 'quiz'] }
    expect((await runSeeders(options)).executed.map((r) => `${r.extensionId}/${r.name}`)).toEqual(['core/001-a', 'quiz/001-a', 'quiz/002-b'])
    await runSeeders(options)
    expect(log).toHaveLength(6)
  })

  it('filters by extension and name', () => {
    const options = { entries: entries([]), order: ['core', 'quiz'] }
    expect(planSeeders({ ...options, extensions: ['quiz'] }).map((e) => e.name)).toEqual(['001-a', '002-b'])
    expect(planSeeders({ ...options, names: ['002-b'] })).toHaveLength(1)
  })

  it('stops at the first failure and validates the export', async () => {
    const log: string[] = []
    const failing: SeederEntry[] = [
      { extensionId: 'a', name: '1', seeder: run(log, 'a/1') },
      { extensionId: 'a', name: '2', seeder: { run: () => { throw new Error('boom') } } },
      { extensionId: 'a', name: '3', seeder: run(log, 'a/3') },
    ]
    const report = await runSeeders({ entries: failing, createContext })
    expect(report.executed).toHaveLength(1)
    expect(report.failed?.name).toBe('2')
    expect(log).toEqual(['a/1'])
    const invalid = await runSeeders({ entries: [{ extensionId: 'a', name: 'x', seeder: {} }], createContext })
    expect(String(invalid.failed?.error)).toContain('missing `run`')
  })
})

describe('runMigrationsReset', () => {
  it('reverts everything, dependents first, newest first', async () => {
    const log: string[] = []
    const mig = (extensionId: string, name: string): MigrationEntry => ({
      extensionId,
      name,
      migration: { up: () => void log.push(`up ${extensionId}/${name}`), down: () => void log.push(`down ${extensionId}/${name}`) },
    })
    const entries = [mig('core', '001'), mig('core', '002'), mig('quiz', '001')]
    const ledger = createMemoryLedger()
    const createContext = (base: object) => base as never
    const order = ['core', 'quiz']
    await runMigrationsUp({ entries, ledger, createContext, order })
    log.length = 0
    const report = await runMigrationsReset({ entries, ledger, createContext, order })
    expect(log).toEqual(['down quiz/001', 'down core/002', 'down core/001'])
    expect(report.executed).toHaveLength(3)
    expect(ledger.snapshot()).toEqual({ core: [], quiz: [] })
  })
})
