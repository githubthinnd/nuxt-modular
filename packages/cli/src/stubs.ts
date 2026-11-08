import { pascalCase } from '@nuxt-modular/core/node'

/*
 * File templates. Kept dependency-free and deterministic so generated code is
 * easy to review and to snapshot in tests.
 */

export const titleCase = (id: string): string => id.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')

export function manifestStub(id: string, options: { minimal: boolean }): string {
  const label = titleCase(id)
  const pascal = pascalCase(id)
  if (options.minimal) {
    return `import { defineExtensionManifest } from '#modular'

export default defineExtensionManifest({
  id: '${id}',
  name: '${label}',
  version: '0.1.0',
})
`
  }
  return `import { defineExtensionManifest } from '#modular'

export default defineExtensionManifest({
  id: '${id}',
  name: '${label}',
  version: '0.1.0',
  description: '${label} extension.',
  permissions: [{ id: '${id}.view', label: 'View ${label}', defaultRoles: [] }],
  navigation: [
    { id: '${id}', label: '${label}', path: '/${id}', parent: 'sidebar', permission: '${id}.view' },
  ],
  slots: [
    // Renders inside <PluginOutlet name="dashboard.widgets" /> in the host.
    { id: 'widget', target: 'dashboard.widgets', component: '${pascal}Widget', permission: '${id}.view' },
  ],
})
`
}

export const widgetStub = (name: string): string => `<script setup lang="ts">
defineProps<{ context?: Record<string, unknown> }>()
</script>

<template>
  <div class="${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}">
    ${name}
  </div>
</template>
`

export const pageStub = (title: string): string => `<script setup lang="ts">
useHead({ title: '${title}' })
</script>

<template>
  <main>
    <h1>${title}</h1>
  </main>
</template>
`

export const apiStub = (extensionId: string, route: string, method: string): string => `export default defineEventHandler(() => {
  return { ok: true, extension: '${extensionId}', route: '${route}', method: '${method}' }
})
`

export function hookStub(type: 'action' | 'filter', hook: string): string {
  return type === 'filter'
    ? `import { defineFilterHandler } from '#modular'

// Subscribed with: { hook: '${hook}', handler: './server/hooks/<file>.ts', type: 'filter' }
export default defineFilterHandler<'${hook}'>((value) => {
  return value
})
`
    : `import { defineActionHandler } from '#modular'

// Subscribed with: { hook: '${hook}', handler: './server/hooks/<file>.ts' }
export default defineActionHandler<'${hook}'>(() => {
  // React to the event.
})
`
}

export const pluginStub = (): string => `export default defineNuxtPlugin(() => {
  // Runs only while this extension is part of the build.
})
`

export const migrationStub = (): string => `import { defineMigration } from '#modular'

export default defineMigration({
  async up(_context) {
    // Apply the change.
  },
  async down(_context) {
    // Revert it.
  },
})
`

export const seederStub = (): string => `import { defineSeeder } from '#modular'

// Seeders are not recorded: keep \`run\` idempotent.
export default defineSeeder({
  async run(_context) {
    // Insert initial or demo data.
  },
})
`

export const readmeStub = (id: string): string => `# ${titleCase(id)}

An extension of the host application (see \`manifest.ts\`).
`
