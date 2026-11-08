import { defineExtensionManifest } from '#modular'

export default defineExtensionManifest({
  id: 'analytics-banner',
  name: 'Analytics banner',
  version: '1.0.0',
  description: 'Top banner, page-view tracking on navigation, and server-side counters fed by hooks.',
  permissions: [{ id: 'analytics.view', label: 'View analytics', defaultRoles: ['admin'] }],
  navigation: [
    { id: 'analytics', label: 'Analytics', path: '/analytics', icon: 'chart', parent: 'sidebar', order: 90, permission: 'analytics.view' },
  ],
  slots: [
    { id: 'banner', target: 'dashboard.header', component: './components/AnalyticsBanner.vue' },
    { id: 'page-views', target: 'dashboard.metrics', component: './components/PageViewsMetric.vue', order: 10, permission: 'analytics.view' },
  ],
  serverHooks: [
    { hook: 'quiz:submitted', handler: './server/hooks/count-quiz-submission.ts' },
    { hook: 'nitro:request', handler: './server/hooks/count-request.ts' },
  ],
})
