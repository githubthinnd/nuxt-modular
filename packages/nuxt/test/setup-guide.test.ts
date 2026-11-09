import { describe, expect, it } from 'vitest'
import { isCI, isModuleAddCommand, type SetupContext, wantsGuidedSetup } from '../src/setup-guide'

const context = (overrides: Partial<SetupContext> & { command?: string[] } = {}): SetupContext => ({
  argv: ['node', '/usr/bin/nuxi', ...(overrides.command ?? ['module', 'add', 'nuxt-modular'])],
  env: {},
  stdinIsTTY: true,
  stdoutIsTTY: true,
  ...overrides,
})

describe('isModuleAddCommand', () => {
  it('matches nuxi and nuxt module add, with or without extra arguments', () => {
    expect(isModuleAddCommand(['node', 'nuxi', 'module', 'add', 'nuxt-modular'])).toBe(true)
    expect(isModuleAddCommand(['node', 'nuxt', 'module', 'add', '--cwd', 'app', 'nuxt-modular'])).toBe(true)
  })
  it('does not match other commands', () => {
    for (const command of [['dev'], ['prepare'], ['build'], ['module', 'search', 'ui'], ['add', 'module']]) {
      expect(isModuleAddCommand(['node', 'nuxi', ...command])).toBe(false)
    }
  })
})

describe('wantsGuidedSetup', () => {
  it('asks after `nuxi module add` in a terminal', () => {
    expect(wantsGuidedSetup(context())).toBe(true)
  })

  it('stays out of the way after a plain install and manual configuration', () => {
    expect(wantsGuidedSetup(context({ command: ['dev'] }))).toBe(false)
    expect(wantsGuidedSetup(context({ command: ['prepare'] }))).toBe(false)
  })

  it('never asks without a terminal or in CI', () => {
    expect(wantsGuidedSetup(context({ stdinIsTTY: false }))).toBe(false)
    expect(wantsGuidedSetup(context({ stdoutIsTTY: false }))).toBe(false)
    expect(wantsGuidedSetup(context({ env: { CI: 'true' } }))).toBe(false)
    expect(wantsGuidedSetup(context({ env: { GITHUB_ACTIONS: 'true' } }))).toBe(false)
  })

  it('honours NUXT_MODULAR_INIT', () => {
    expect(wantsGuidedSetup(context({ env: { NUXT_MODULAR_INIT: '0' } }))).toBe(false)
    expect(wantsGuidedSetup(context({ env: { NUXT_MODULAR_INIT: 'false' } }))).toBe(false)
    expect(wantsGuidedSetup(context({ command: ['dev'], env: { NUXT_MODULAR_INIT: '1' } }))).toBe(true)
    // forcing still needs a terminal
    expect(wantsGuidedSetup(context({ command: ['dev'], env: { NUXT_MODULAR_INIT: '1' }, stdinIsTTY: false }))).toBe(false)
  })
})

describe('isCI', () => {
  it('detects common CI variables and ignores CI=false', () => {
    expect(isCI({ CI: 'true' })).toBe(true)
    expect(isCI({ GITHUB_ACTIONS: 'true' })).toBe(true)
    expect(isCI({ CI: 'false' })).toBe(false)
    expect(isCI({})).toBe(false)
  })
})
