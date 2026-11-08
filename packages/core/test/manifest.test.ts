import { describe, expect, it } from 'vitest'
import {
  defineExtensionManifest,
  type ExtensionManifestInput,
  ManifestValidationError,
  parseManifest,
  validateManifest,
} from '../src'

const minimal = { id: 'mod-quiz', name: 'Quiz', version: '1.0.0' } satisfies ExtensionManifestInput

function issuePaths(input: unknown): string[] {
  const result = validateManifest(input)
  if (result.success) throw new Error('expected validation to fail')
  return result.issues.map((issue) => issue.path)
}

describe('defineExtensionManifest', () => {
  it('fills defaults for a minimal manifest', () => {
    expect(defineExtensionManifest(minimal)).toEqual({
      ...minimal,
      enabled: true,
      dependsOn: [],
      requires: { extensions: {} },
      config: {},
      permissions: [],
      navigation: [],
      slots: [],
      serverHooks: [],
    })
  })

  it('accepts a complete manifest and normalizes nested defaults', () => {
    const manifest = defineExtensionManifest({
      ...minimal,
      description: 'Quizzes for courses',
      dependsOn: ['mod-course'],
      permissions: [{ id: 'quiz.view', defaultRoles: ['student', 'teacher'] }, { id: 'quiz.edit' }],
      navigation: [
        { id: 'quiz', label: 'Quizzes', path: '/quiz', icon: 'i-lucide-list', parent: 'sidebar', order: 20 },
        { id: 'quiz.new', label: 'New quiz', path: '/quiz/new', parent: 'quiz', permission: 'quiz.edit' },
        { id: 'quiz.docs', label: 'Docs', path: 'https://example.com/quiz' },
      ],
      slots: [
        { id: 'tab', target: 'course.tabs', component: './components/QuizTab.vue', order: 10, permission: 'quiz.view' },
        {
          target: 'course.sidebar',
          component: 'QuizSidebarWidget',
          permission: { anyOf: ['quiz.view', 'admin'] },
          props: { limit: 5, tags: ['a', 'b'], nested: { ok: true, none: null } },
        },
      ],
      serverHooks: [
        { hook: 'user:created', handler: './server/hooks/on-user-created.ts' },
        { hook: 'checkout:price', handler: './server/hooks/price.ts', type: 'filter', order: -5 },
      ],
    })

    expect(manifest.permissions[1]).toEqual({ id: 'quiz.edit', defaultRoles: [] })
    expect(manifest.navigation[2]?.order).toBe(0)
    expect(manifest.slots[0]?.props).toEqual({})
    expect(manifest.slots[1]?.order).toBe(0)
    expect(manifest.serverHooks[0]).toMatchObject({ type: 'action', order: 0 })
    expect(manifest.serverHooks[1]).toMatchObject({ type: 'filter', order: -5 })
  })

  it('throws a ManifestValidationError naming the extension and every issue', () => {
    let error: unknown
    try {
      defineExtensionManifest({ ...minimal, version: 'v1', slots: [{ target: 'Course Tabs', component: '' }] })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(ManifestValidationError)
    const validationError = error as ManifestValidationError
    expect(validationError.extensionId).toBe('mod-quiz')
    expect(validationError.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['version', 'slots[0].target', 'slots[0].component']),
    )
    expect(validationError.message).toContain('Invalid manifest for extension "mod-quiz"')
  })
})

describe('parseManifest', () => {
  it('includes the source in the error message', () => {
    expect(() => parseManifest({ id: 'x' }, 'extensions/x/manifest.ts')).toThrow(
      /extension "x" \(extensions\/x\/manifest\.ts\)/,
    )
  })

  it('rejects non-object input without an extension id', () => {
    expect(() => parseManifest(null)).toThrow(/Invalid manifest for extension:/)
  })
})

describe('validateManifest', () => {
  it('rejects malformed identifiers', () => {
    expect(
      issuePaths({
        id: 'Mod_Quiz',
        name: 'Quiz',
        version: '1.0',
        permissions: [{ id: 'Quiz View' }],
        navigation: [{ id: 'quiz', label: 'Quiz', path: '//evil.example' }],
        serverHooks: [{ hook: 'usercreated', handler: './h.ts' }],
      }),
    ).toEqual(
      expect.arrayContaining([
        'id',
        'version',
        'permissions[0].id',
        'navigation[0].path',
        'serverHooks[0].hook',
      ]),
    )
  })

  it('rejects unknown keys so typos surface early', () => {
    expect(issuePaths({ ...minimal, slot: [] })).toEqual([''])
    expect(
      issuePaths({ ...minimal, slots: [{ target: 'course.tabs', component: 'A', permision: 'x' }] }),
    ).toEqual(['slots[0]'])
  })

  it('rejects non-JSON slot props', () => {
    expect(
      issuePaths({ ...minimal, slots: [{ target: 'course.tabs', component: 'A', props: { onClick: () => {} } }] }),
    ).toEqual(['slots[0].props.onClick'])
  })

  it('rejects empty permission groups and non-integer order', () => {
    expect(
      issuePaths({
        ...minimal,
        slots: [{ target: 'course.tabs', component: 'A', order: 1.5, permission: { anyOf: [] } }],
      }),
    ).toEqual(expect.arrayContaining(['slots[0].order', 'slots[0].permission.anyOf']))
  })

  it('rejects self-dependency and duplicates', () => {
    expect(
      issuePaths({
        ...minimal,
        dependsOn: ['mod-quiz', 'mod-course', 'mod-course'],
        permissions: [{ id: 'quiz.view' }, { id: 'quiz.view' }],
        navigation: [
          { id: 'quiz', label: 'A' },
          { id: 'quiz', label: 'B' },
        ],
        slots: [
          { id: 'tab', target: 'course.tabs', component: 'A' },
          { id: 'tab', target: 'course.sidebar', component: 'B' },
          { target: 'course.tabs', component: 'C' },
          { target: 'course.tabs', component: 'D' },
        ],
        serverHooks: [
          { hook: 'user:created', handler: './h.ts' },
          { hook: 'user:created', handler: './h.ts', order: 3 },
        ],
      }),
    ).toEqual([
      'dependsOn[0]',
      'dependsOn[2]',
      'permissions[1]',
      'navigation[1]',
      'slots[1]',
      'serverHooks[1]',
    ])
  })

  it('rejects navigation parent cycles but allows host menu parents', () => {
    expect(
      issuePaths({
        ...minimal,
        navigation: [
          { id: 'a', label: 'A', parent: 'b' },
          { id: 'b', label: 'B', parent: 'a' },
          { id: 'c', label: 'C', parent: 'c' },
          { id: 'd', label: 'D', parent: 'sidebar' },
        ],
      }),
    ).toEqual(['navigation[0].parent', 'navigation[1].parent', 'navigation[2].parent'])
  })

  it('accepts semver prerelease and build metadata', () => {
    expect(validateManifest({ ...minimal, version: '2.0.0-beta.1+build.7' }).success).toBe(true)
  })
})
