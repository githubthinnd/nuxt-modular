import { defineExtensionManifest } from '#modular'

export default defineExtensionManifest({
  id: 'quiz',
  name: 'Quiz',
  version: '1.0.0',
  description: 'Course quizzes: a course tab, a progress widget, pages and a submit API.',
  requires: { modular: '>=1.0.0' },
  // Defaults; the host overrides them with `modular.config.quiz` (nuxt.config) or the environment.
  config: { bonusPoints: 5 },
  permissions: [
    { id: 'quiz.view', label: 'Take quizzes', defaultRoles: ['student', 'teacher'] },
    { id: 'quiz.manage', label: 'Manage quizzes', defaultRoles: ['teacher'] },
  ],
  navigation: [
    { id: 'quiz', label: 'Quizzes', path: '/quiz', icon: 'quiz', parent: 'sidebar', order: 20, permission: 'quiz.view' },
    { id: 'quiz.manage', label: 'Manage quizzes', path: '/quiz/manage', parent: 'quiz', permission: 'quiz.manage' },
  ],
  slots: [
    { id: 'tab', target: 'course.tabs', component: './components/QuizTab.vue', order: 20, permission: 'quiz.view' },
    { id: 'start', target: 'course.actions', component: 'QuizStartButton', order: 10, permission: 'quiz.view' },
    {
      id: 'progress',
      target: 'course.sidebar',
      component: 'QuizProgressWidget',
      order: 10,
      permission: 'quiz.view',
      props: { title: 'Your quiz progress' },
    },
    { id: 'metric', target: 'dashboard.metrics', component: 'QuizMetric', order: 20 },
  ],
  serverHooks: [{ hook: 'quiz:score', handler: './server/hooks/bonus-score.ts', type: 'filter' }],
})
