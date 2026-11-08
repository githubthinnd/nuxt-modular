import { describe, expect, it } from 'vitest'
import type { JsonObject } from '@nuxt-modular/core'
import { resolveExtensionConfig } from '../src/runtime/utils/extension-config'

const manifests: Array<{ id: string; config: JsonObject }> = [{ id: 'quiz', config: { limits: { max: 20, min: 1 }, labels: ['a'] } }, { id: 'plain', config: {} }]

describe('resolveExtensionConfig', () => {
  it('returns manifest defaults without overrides', () => {
    const config = resolveExtensionConfig(manifests, undefined, 'quiz')
    expect(config.values).toEqual({ limits: { max: 20, min: 1 }, labels: ['a'] })
    expect(config.get('limits.max', 0)).toBe(20)
    expect(config.get('limits.nope', 7)).toBe(7)
  })

  it('deep-merges host overrides for that extension only', () => {
    const publicModular = { config: { quiz: { limits: { max: 5 }, labels: ['x', 'y'] }, plain: { a: 1 } } }
    const quiz = resolveExtensionConfig(manifests, publicModular, 'quiz')
    expect(quiz.values).toEqual({ limits: { max: 5, min: 1 }, labels: ['x', 'y'] })
    expect(resolveExtensionConfig(manifests, publicModular, 'plain').values).toEqual({ a: 1 })
  })

  it('tolerates malformed runtime config and rejects unknown ids', () => {
    expect(resolveExtensionConfig(manifests, 'junk', 'quiz').values).toEqual(manifests[0]!.config)
    expect(resolveExtensionConfig(manifests, { config: 5 }, 'quiz').values).toEqual(manifests[0]!.config)
    expect(() => resolveExtensionConfig(manifests, {}, 'ghost')).toThrow(/Unknown extension "ghost"/)
  })
})
