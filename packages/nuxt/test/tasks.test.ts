import { describe, expect, it } from 'vitest'
import { assertSucceeded, flag, listOption } from '../src/runtime/server/tasks/_shared'

describe('task payload helpers', () => {
  it('reads string lists from arrays and comma-separated strings', () => {
    expect(listOption({ extensions: ['quiz', ' core '] }, 'extensions')).toEqual(['quiz', 'core'])
    expect(listOption({ extensions: 'quiz, core,,' }, 'extensions')).toEqual(['quiz', 'core'])
    expect(listOption({ extensions: '' }, 'extensions')).toBeUndefined()
    expect(listOption({}, 'extensions')).toBeUndefined()
    expect(listOption({ extensions: 5 }, 'extensions')).toBeUndefined()
  })

  it('reads boolean flags from booleans and CLI strings', () => {
    expect(flag({ confirm: true }, 'confirm')).toBe(true)
    expect(flag({ confirm: 'true' }, 'confirm')).toBe(true)
    expect(flag({ confirm: '1' }, 'confirm')).toBe(true)
    expect(flag({ confirm: 'no' }, 'confirm')).toBe(false)
    expect(flag({}, 'confirm')).toBe(false)
  })

  it('throws for failed reports so the CLI exits non-zero', () => {
    expect(() => assertSucceeded({ executed: [] }, 'migration')).not.toThrow()
    expect(() =>
      assertSucceeded({ executed: [], failed: { extensionId: 'quiz', name: '002', error: new Error('boom') } }, 'migration'),
    ).toThrow(/migration quiz\/002 failed: .*boom/)
  })
})
