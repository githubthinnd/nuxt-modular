import { defineExtensionManifest } from '@nuxt-modular/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetApp } from './mocks/app'
import {
  loadPersistedToggles,
  useModuleRegistry,
  usePersistedToggleState,
} from '../src/runtime/composables/useModuleRegistry'
import { useModularPermissions } from '../src/runtime/composables/useModularPermissions'
import extensionPages from '../src/runtime/middleware/extension-pages'
import { setModularContext } from '../src/runtime/server/context'
import type { H3Event } from 'h3'

const keys = (slots: Array<{ key: string }>) => slots.map((slot) => slot.key)

function fakeEvent(getOverrides: () => Promise<Record<string, boolean>>): H3Event {
  const event = { context: {} } as unknown as H3Event
  setModularContext(event, { getOverrides })
  return event
}

beforeEach(() => __resetApp())
afterEach(() => vi.restoreAllMocks())

describe('useModuleRegistry', () => {
  it('filters slots and navigation by permission and activation', () => {
    const registry = useModuleRegistry()
    expect(keys(registry.getSlotComponents('course.tabs'))).toEqual(['grading/panel'])
    useModularPermissions().set(['quiz.view'])
    expect(keys(registry.getSlotComponents('course.tabs'))).toEqual(['quiz/tab', 'grading/panel'])
    expect(registry.getNavigation('sidebar').map((node) => node.id)).toEqual(['quiz'])
    expect(registry.extensions.value.map((info) => [info.id, info.active])).toEqual([
      ['beta', false],
      ['grading', true],
      ['quiz', true],
    ])
  })

  it('applies session > persistent > manifest precedence, then dependencies', () => {
    const registry = useModuleRegistry()
    const persisted = usePersistedToggleState()

    persisted.value = { loaded: true, overrides: { quiz: false, beta: true } }
    expect(registry.isModuleActive('quiz')).toBe(false)
    expect(registry.isModuleActive('grading')).toBe(false) // depends on quiz
    expect(registry.isModuleActive('beta')).toBe(true)

    registry.setModuleActive('quiz', true)
    expect(registry.isModuleActive('grading')).toBe(true)
    const quiz = registry.extensions.value.find((info) => info.id === 'quiz')
    expect(quiz).toMatchObject({ persistedOverride: false, sessionOverride: true, active: true })

    registry.setModuleActive('quiz', null)
    expect(registry.isModuleActive('quiz')).toBe(false)
  })

  it('registers and unregisters runtime extensions only', () => {
    const registry = useModuleRegistry()
    const forum = defineExtensionManifest({ id: 'forum', name: 'Forum', version: '1.0.0', slots: [{ target: 'course.tabs', component: 'ForumTab', order: 50 }] })
    expect(registry.register(forum)).toBe('registered')
    expect(registry.register(forum)).toBe('unchanged')
    expect(keys(registry.getSlotComponents('course.tabs'))).toEqual(['grading/panel', 'forum/slot-0'])
    expect(registry.extensions.value.find((info) => info.id === 'forum')?.source).toBe('runtime')
    expect(registry.unregister('quiz')).toBe(false)
    expect(registry.unregister('forum')).toBe(true)
    expect(registry.extensions.value.map((info) => info.id)).toEqual(['beta', 'grading', 'quiz'])
  })

  it('maps roles to capabilities from manifests', () => {
    expect(useModuleRegistry().capabilitiesForRoles(['teacher'])).toEqual(['quiz.manage', 'quiz.view'])
    const permissions = useModularPermissions()
    permissions.setRoles(['student'], ['course.view', 'quiz.view'])
    expect(permissions.granted.value).toEqual(['course.view', 'quiz.view'])
    expect(permissions.can('quiz.manage')).toBe(false)
    permissions.grant('quiz.manage')
    permissions.revoke('course.view')
    expect(permissions.granted.value).toEqual(['quiz.manage', 'quiz.view'])
  })
})

describe('loadPersistedToggles', () => {
  it('does nothing on the client', async () => {
    __resetApp(fakeEvent(async () => ({ quiz: false })))
    await loadPersistedToggles(false)
    expect(usePersistedToggleState().value.loaded).toBe(false)
  })

  it('loads toggles once per request on the server', async () => {
    const getOverrides = vi.fn(async () => ({ quiz: false }))
    __resetApp(fakeEvent(getOverrides))
    await loadPersistedToggles(true)
    await loadPersistedToggles(true)
    expect(getOverrides).toHaveBeenCalledTimes(1)
    expect(usePersistedToggleState().value).toEqual({ loaded: true, overrides: { quiz: false } })
    expect(useModuleRegistry().isModuleActive('quiz')).toBe(false)
  })

  it('falls back to manifest defaults when the store fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    __resetApp(fakeEvent(async () => {
      throw new Error('storage down')
    }))
    await loadPersistedToggles(true)
    expect(usePersistedToggleState().value).toEqual({ loaded: true, overrides: {} })
    expect(error).toHaveBeenCalledWith(expect.stringContaining('storage down'))
  })
})

describe('extension-pages middleware', () => {
  const route = (meta: Record<string, unknown>) => ({ meta }) as Parameters<typeof extensionPages>[0]
  const run = (meta: Record<string, unknown>) => extensionPages(route(meta), route({}))

  it('lets host pages and active extension pages through', async () => {
    expect(await run({})).toBeUndefined()
    expect(await run({ modularExtension: 'quiz' })).toBeUndefined()
  })

  it('answers 404 for pages of inactive extensions', async () => {
    useModuleRegistry().setModuleActive('quiz', false)
    expect(await run({ modularExtension: 'grading' })).toEqual({
      aborted: expect.objectContaining({ statusCode: 404, fatal: true }),
    })
  })
})
