import { describe, expect, it } from 'vitest'
import {
  createMemoryLedger,
  defineMigration,
  type MigrationContext,
  type MigrationEntry,
  migrationStatus,
  runMigrationsDown,
  runMigrationsUp,
  sortByDependencies,
} from '../src'

function recorder() {
  const calls: string[] = []
  const entry = (extensionId: string, name: string, extra: { fail?: boolean; noDown?: boolean } = {}): MigrationEntry => ({
    extensionId,
    name,
    migration: defineMigration({
      up(context) {
        if (extra.fail) throw new Error(`${name} failed`)
        context.log('up')
        calls.push(`up ${extensionId}/${name}`)
      },
      ...(extra.noDown ? {} : { down: () => void calls.push(`down ${extensionId}/${name}`) }),
    }),
  })
  return { calls, entry }
}

const createContext = (base: MigrationContext) => base

describe('sortByDependencies', () => {
  it('puts dependencies first and orders ties by id', () => {
    expect(
      sortByDependencies([
        { id: 'grading', dependsOn: ['quiz'] },
        { id: 'quiz', dependsOn: ['course'] },
        { id: 'course', dependsOn: [] },
        { id: 'analytics', dependsOn: ['missing'] },
      ]),
    ).toEqual(['analytics', 'course', 'quiz', 'grading'])
  })

  it('appends dependency cycles after the rest', () => {
    expect(
      sortByDependencies([
        { id: 'a', dependsOn: ['b'] },
        { id: 'b', dependsOn: ['a'] },
        { id: 'z', dependsOn: [] },
      ]),
    ).toEqual(['z', 'a', 'b'])
  })
})

describe('runMigrationsUp', () => {
  it('applies pending migrations by dependency order then name, and records them', async () => {
    const { calls, entry } = recorder()
    const ledger = createMemoryLedger({ quiz: ['001-init'] })
    const logs: string[] = []
    const report = await runMigrationsUp({
      entries: [entry('quiz', '002-scores'), entry('quiz', '001-init'), entry('course', '001-courses')],
      ledger,
      createContext,
      order: ['course', 'quiz'],
      log: (message) => logs.push(message),
    })
    expect(calls).toEqual(['up course/001-courses', 'up quiz/002-scores'])
    expect(report).toEqual({
      executed: [
        { extensionId: 'course', name: '001-courses' },
        { extensionId: 'quiz', name: '002-scores' },
      ],
    })
    expect(ledger.snapshot()).toEqual({ quiz: ['001-init', '002-scores'], course: ['001-courses'] })
    expect(logs).toContain('[quiz/002-scores] up')
  })

  it('is idempotent', async () => {
    const { calls, entry } = recorder()
    const ledger = createMemoryLedger()
    const options = { entries: [entry('quiz', '001-init')], ledger, createContext }
    await runMigrationsUp(options)
    expect(await runMigrationsUp(options)).toEqual({ executed: [] })
    expect(calls).toEqual(['up quiz/001-init'])
  })

  it('stops at the first failure without recording it', async () => {
    const { calls, entry } = recorder()
    const ledger = createMemoryLedger()
    const report = await runMigrationsUp({
      entries: [entry('a', '001'), entry('a', '002', { fail: true }), entry('a', '003'), entry('b', '001')],
      ledger,
      createContext,
    })
    expect(calls).toEqual(['up a/001'])
    expect(report.failed).toMatchObject({ extensionId: 'a', name: '002' })
    expect(ledger.snapshot()).toEqual({ a: ['001'] })
  })

  it('rejects modules that are not migrations', async () => {
    const report = await runMigrationsUp({
      entries: [{ extensionId: 'a', name: '001', migration: { nope: true } }],
      ledger: createMemoryLedger(),
      createContext,
    })
    expect(String((report.failed?.error as Error).message)).toMatch(/not a migration/)
  })

  it('can be limited to some extensions and passes the host context', async () => {
    const seen: string[] = []
    await runMigrationsUp({
      entries: [
        { extensionId: 'a', name: '001', migration: defineMigration({ up: (context) => void seen.push(`${context.extensionId}:${(context as MigrationContext & { db: string }).db}`) }) },
        { extensionId: 'b', name: '001', migration: defineMigration({ up: () => void seen.push('b') }) },
      ],
      ledger: createMemoryLedger(),
      createContext: (base) => ({ ...base, db: 'sqlite' }),
      extensions: ['a'],
    })
    expect(seen).toEqual(['a:sqlite'])
  })
})

describe('runMigrationsDown and migrationStatus', () => {
  it('reverts the newest migrations of one extension', async () => {
    const { calls, entry } = recorder()
    const entries = [entry('a', '001'), entry('a', '002'), entry('a', '003')]
    const ledger = createMemoryLedger({ a: ['001', '002', '003'] })
    const report = await runMigrationsDown({ entries, ledger, createContext, extensionId: 'a', steps: 2 })
    expect(calls).toEqual(['down a/003', 'down a/002'])
    expect(report.executed.map((ref) => ref.name)).toEqual(['003', '002'])
    expect(ledger.snapshot()).toEqual({ a: ['001'] })
  })

  it('refuses to revert without a down function', async () => {
    const { entry } = recorder()
    const ledger = createMemoryLedger({ a: ['001'] })
    const report = await runMigrationsDown({ entries: [entry('a', '001', { noDown: true })], ledger, createContext, extensionId: 'a' })
    expect(report.failed?.name).toBe('001')
    expect(ledger.snapshot()).toEqual({ a: ['001'] })
  })

  it('reports applied, pending and unknown migrations', async () => {
    const { entry } = recorder()
    const status = await migrationStatus({
      entries: [entry('a', '001'), entry('a', '002'), entry('b', '001')],
      ledger: createMemoryLedger({ a: ['001', '000-removed'] }),
      order: ['b', 'a'],
    })
    expect(status).toEqual([
      { extensionId: 'b', applied: [], pending: ['001'], unknown: [] },
      { extensionId: 'a', applied: ['001'], pending: ['002'], unknown: ['000-removed'] },
    ])
  })
})
