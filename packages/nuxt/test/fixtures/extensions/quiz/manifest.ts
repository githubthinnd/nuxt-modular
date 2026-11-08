import { defineExtensionManifest } from '#modular'

export default defineExtensionManifest({
  id: 'quiz',
  name: 'Quiz',
  version: '1.2.0',
  slots: [
    { id: 'tab', target: 'course.tabs', component: './components/quiz/QuizTab.vue' },
    { id: 'widget', target: 'course.sidebar', component: 'QuizWidget' },
    { id: 'tab-again', target: 'course.actions', component: './components/quiz/QuizTab' },
  ],
  serverHooks: [{ hook: 'quiz:submitted', handler: './server/hooks/on-submitted', type: 'action', order: 5 }],
})
