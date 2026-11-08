import { describe, expect, it } from 'vitest'
import {
  allowAll,
  capabilitiesForRoles,
  createPermissionChecker,
  createRegistryState,
  defineExtensionManifest,
  ExtensionConflictError,
  type ExtensionManifestInput,
  findMissingDependencies,
  hasPermission,
  isExtensionActive,
  listActiveExtensions,
  listOutlets,
  type NavigationNode,
  registerExtension,
  type RegistryState,
  resolveNavigation,
  resolveSlots,
  unregisterExtension,
} from '../src'

function ext(id: string, extra: Partial<ExtensionManifestInput> = {}) {
  return defineExtensionManifest({ id, name: id, version: '1.0.0', ...extra })
}

function navIds(nodes: NavigationNode[]): unknown[] {
  return nodes.map((node) => (node.children.length ? [node.id, navIds(node.children)] : node.id))
}

describe('permissions', () => {
  const granted = new Set(['quiz.view', 'course.view'])

  it('evaluates string, anyOf and allOf requirements', () => {
    expect(hasPermission(undefined, new Set())).toBe(true)
    expect(hasPermission('quiz.view', granted)).toBe(true)
    expect(hasPermission('quiz.edit', granted)).toBe(false)
    expect(hasPermission({ anyOf: ['quiz.edit', 'course.view'] }, granted)).toBe(true)
    expect(hasPermission({ anyOf: ['quiz.edit', 'admin'] }, granted)).toBe(false)
    expect(hasPermission({ allOf: ['quiz.view', 'course.view'] }, granted)).toBe(true)
    expect(hasPermission({ allOf: ['quiz.view', 'quiz.edit'] }, granted)).toBe(false)
  })

  it('treats "*" as granting everything', () => {
    const can = createPermissionChecker(['*'])
    expect(can('anything.at-all')).toBe(true)
    expect(can({ allOf: ['a', 'b'] })).toBe(true)
  })
})

describe('registerExtension', () => {
  it('registers, ignores identical re-registration and rejects conflicts', () => {
    const state = createRegistryState()
    expect(registerExtension(state, ext('quiz'))).toBe('registered')
    expect(registerExtension(state, ext('quiz'))).toBe('unchanged')
    expect(() => registerExtension(state, ext('quiz', { version: '2.0.0' }))).toThrow(ExtensionConflictError)
    expect(registerExtension(state, ext('quiz', { version: '2.0.0' }), { onConflict: 'skip' })).toBe('skipped')
    expect(state.extensions.quiz?.manifest.version).toBe('1.0.0')
    expect(registerExtension(state, ext('quiz', { version: '2.0.0' }), { onConflict: 'replace' })).toBe('replaced')
    expect(state.extensions.quiz?.manifest.version).toBe('2.0.0')
    expect(state.extensions.quiz?.seq).toBe(0)
  })

  it('rejects navigation ids already owned by another extension', () => {
    const state = createRegistryState([ext('quiz', { navigation: [{ id: 'learn', label: 'Learn' }] })])
    const forum = ext('forum', { navigation: [{ id: 'learn', label: 'Learn too' }] })
    expect(() => registerExtension(state, forum)).toThrow(/already declared by "quiz"/)
    expect(registerExtension(state, forum, { onConflict: 'skip' })).toBe('skipped')
    expect(state.extensions.forum).toBeUndefined()
  })

  it('keeps state JSON-serializable', () => {
    const state = createRegistryState([ext('quiz', { slots: [{ target: 'a.b', component: 'X', props: { n: 1 } }] })])
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })

  it('unregisters extensions and their overrides', () => {
    const state = createRegistryState([ext('quiz')])
    state.overrides.quiz = false
    expect(unregisterExtension(state, 'quiz')).toBe(true)
    expect(unregisterExtension(state, 'quiz')).toBe(false)
    expect(state).toEqual({ extensions: {}, overrides: {} })
  })
})

describe('isExtensionActive', () => {
  it('honours manifest.enabled and runtime overrides', () => {
    const state = createRegistryState([ext('quiz'), ext('beta', { enabled: false })])
    expect(isExtensionActive(state, 'quiz')).toBe(true)
    expect(isExtensionActive(state, 'beta')).toBe(false)
    state.overrides.beta = true
    state.overrides.quiz = false
    expect(listActiveExtensions(state)).toEqual(['beta'])
    expect(isExtensionActive(state, 'unknown')).toBe(false)
  })

  it('requires every dependency to be registered and active', () => {
    const state = createRegistryState([
      ext('course'),
      ext('quiz', { dependsOn: ['course'] }),
      ext('grading', { dependsOn: ['quiz'] }),
      ext('orphan', { dependsOn: ['missing'] }),
    ])
    expect(listActiveExtensions(state)).toEqual(['course', 'grading', 'quiz'])
    expect(findMissingDependencies(state, 'orphan')).toEqual(['missing'])

    state.overrides.course = false
    expect(listActiveExtensions(state)).toEqual([])
  })

  it('treats dependency cycles as inactive', () => {
    const state = createRegistryState([ext('a', { dependsOn: ['b'] }), ext('b', { dependsOn: ['a'] }), ext('c')])
    expect(listActiveExtensions(state)).toEqual(['c'])
  })
})

describe('resolveSlots', () => {
  const quiz = ext('quiz', {
    permissions: [{ id: 'quiz.view' }],
    slots: [
      { id: 'tab', target: 'course.tabs', component: './components/QuizTab.vue', order: 10, permission: 'quiz.view' },
      { target: 'course.sidebar', component: 'QuizWidget', props: { limit: 3 } },
      { target: 'course.tabs', component: 'QuizSecondTab', order: 10 },
    ],
  })
  const forum = ext('forum', {
    slots: [
      { id: 'tab', target: 'course.tabs', component: 'ForumTab', order: 10 },
      { id: 'first', target: 'course.tabs', component: 'ForumFirst', order: -1 },
    ],
  })

  it('orders deterministically regardless of registration order', () => {
    const forward = resolveSlots(createRegistryState([quiz, forum]), 'course.tabs', allowAll)
    const reverse = resolveSlots(createRegistryState([forum, quiz]), 'course.tabs', allowAll)
    expect(forward.map((slot) => slot.key)).toEqual(['forum/first', 'forum/tab', 'quiz/tab', 'quiz/slot-2'])
    expect(reverse).toEqual(forward)
  })

  it('filters by permission and returns the resolved shape', () => {
    const state = createRegistryState([quiz, forum])
    const keys = resolveSlots(state, 'course.tabs', createPermissionChecker([])).map((slot) => slot.key)
    expect(keys).toEqual(['forum/first', 'forum/tab', 'quiz/slot-2'])
    expect(resolveSlots(state, 'course.sidebar', allowAll)).toEqual([
      {
        key: 'quiz/slot-1',
        extensionId: 'quiz',
        slotId: 'slot-1',
        target: 'course.sidebar',
        component: 'QuizWidget',
        order: 0,
        props: { limit: 3 },
      },
    ])
  })

  it('drops slots of inactive extensions', () => {
    const state: RegistryState = createRegistryState([quiz, forum])
    state.overrides.forum = false
    expect(resolveSlots(state, 'course.tabs', allowAll).map((slot) => slot.extensionId)).toEqual(['quiz', 'quiz'])
    expect(listOutlets(state)).toEqual(['course.sidebar', 'course.tabs'])
  })
})

describe('resolveNavigation', () => {
  const state = createRegistryState([
    ext('quiz', {
      navigation: [
        { id: 'quiz', label: 'Quizzes', path: '/quiz', parent: 'sidebar', order: 20 },
        { id: 'quiz.new', label: 'New', path: '/quiz/new', parent: 'quiz', permission: 'quiz.edit' },
        { id: 'quiz.list', label: 'All', path: '/quiz', parent: 'quiz' },
        { id: 'quiz.reports', label: 'Reports', parent: 'quiz.new' },
      ],
    }),
    ext('forum', {
      navigation: [
        { id: 'forum', label: 'Forum', path: '/forum', parent: 'sidebar', order: 20 },
        { id: 'home', label: 'Home', path: '/', parent: 'sidebar', order: -10 },
        { id: 'top', label: 'Top', path: '/top' },
        { id: 'forum.quiz', label: 'Quiz threads', parent: 'quiz' },
      ],
    }),
  ])

  it('builds a sorted tree under a host menu, merging across extensions', () => {
    expect(navIds(resolveNavigation(state, allowAll, 'sidebar'))).toEqual([
      'home',
      'forum',
      ['quiz', ['forum.quiz', ['quiz.new', ['quiz.reports']], 'quiz.list']],
    ])
    expect(navIds(resolveNavigation(state, allowAll))).toEqual(['top'])
  })

  it('hides items without permission together with their descendants', () => {
    const tree = resolveNavigation(state, createPermissionChecker([]), 'sidebar')
    expect(navIds(tree)).toEqual(['home', 'forum', ['quiz', ['forum.quiz', 'quiz.list']]])
    expect(tree[2]?.extensionId).toBe('quiz')
    expect(tree[2]?.children[0]?.extensionId).toBe('forum')
  })

  it('hides children of an inactive parent extension', () => {
    const toggled: RegistryState = { ...state, overrides: { quiz: false } }
    expect(navIds(resolveNavigation(toggled, allowAll, 'sidebar'))).toEqual(['home', 'forum'])
  })
})

describe('capabilitiesForRoles', () => {
  it('collects default capabilities of every role, sorted and unique', () => {
    const state = createRegistryState([
      ext('quiz', {
        permissions: [
          { id: 'quiz.view', defaultRoles: ['student', 'teacher'] },
          { id: 'quiz.manage', defaultRoles: ['teacher'] },
        ],
      }),
      ext('forum', { permissions: [{ id: 'forum.post', defaultRoles: ['student'] }, { id: 'quiz.view', defaultRoles: ['guest'] }] }),
    ])
    expect(capabilitiesForRoles(state, ['student'])).toEqual(['forum.post', 'quiz.view'])
    expect(capabilitiesForRoles(state, ['teacher', 'student'])).toEqual(['forum.post', 'quiz.manage', 'quiz.view'])
    expect(capabilitiesForRoles(state, ['guest'])).toEqual(['quiz.view'])
    expect(capabilitiesForRoles(state, [])).toEqual([])
  })
})
