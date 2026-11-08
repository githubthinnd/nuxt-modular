import { defineExtensionManifest } from '@nuxt-modular/core'

/** Stand-in for the generated `#nuxt-modular/manifests`. */
export const manifests = [
  defineExtensionManifest({
    id: 'quiz',
    name: 'Quiz',
    version: '1.0.0',
    permissions: [
      { id: 'quiz.view', defaultRoles: ['student', 'teacher'] },
      { id: 'quiz.manage', defaultRoles: ['teacher'] },
    ],
    navigation: [{ id: 'quiz', label: 'Quizzes', path: '/quiz', parent: 'sidebar', permission: 'quiz.view' }],
    slots: [{ id: 'tab', target: 'course.tabs', component: 'QuizTab', permission: 'quiz.view' }],
  }),
  defineExtensionManifest({
    id: 'grading',
    name: 'Grading',
    version: '1.0.0',
    dependsOn: ['quiz'],
    slots: [{ id: 'panel', target: 'course.tabs', component: 'GradingPanel', order: 5 }],
  }),
  defineExtensionManifest({ id: 'beta', name: 'Beta', version: '0.1.0', enabled: false }),
]
