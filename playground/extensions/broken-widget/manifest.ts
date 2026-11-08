import { defineExtensionManifest } from '#modular'

/**
 * Deliberately broken: its component throws during setup, on the server and
 * on the client. The host pages must still render and hydrate cleanly, with
 * the outlet's fallback in place of this widget.
 */
export default defineExtensionManifest({
  id: 'broken-widget',
  name: 'Broken widget (demo)',
  version: '0.0.1',
  description: 'Throws on render to demonstrate per-slot error isolation.',
  slots: [
    { id: 'metric', target: 'dashboard.metrics', component: 'BrokenWidget', order: 30 },
    { id: 'sidebar', target: 'course.sidebar', component: 'BrokenWidget', order: 99 },
  ],
})
