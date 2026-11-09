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

export const serviceStub = (name: string): string => `// Service: the business rules of ${titleCase(name)}. Call repositories from here and throw createError(...) when a
// rule is broken. A service never reads the request and never knows how data is stored.
export async function list${pascalCase(name)}(): Promise<unknown[]> {
  return []
}
`

export function repositoryStub(name: string, data: 'sql' | 'storage'): string {
  const pascal = pascalCase(name)
  if (data === 'storage') {
    return `// Repository: data access for ${titleCase(name)}. Items live in Nitro storage (in memory until you configure a driver).
const storage = () => useStorage('${name}')

export async function findAll(): Promise<unknown[]> {
  return (await storage().getItem<unknown[]>('items')) ?? []
}
`
  }
  return `// Repository: data access for ${titleCase(name)}. SQL in, plain objects out; no business rules and no HTTP.
async function connection() {
  const database = await useModularDatabase()
  if (!database) throw createError({ statusCode: 503, statusMessage: 'No database configured: run "npx nuxt-modular db"' })
  return database.db
}

export async function findAll${pascal}(): Promise<unknown[]> {
  const db = await connection()
  return db.prepare('SELECT * FROM ${name.replace(/-/g, '_')}').all()
}
`
}

export const composableStub = (name: string): string => `/*
 * Data layer of the app for ${titleCase(name)}: the only place that calls the API. Pages and components use the
 * state and actions returned here. Auto-imported.
 */
export function use${pascalCase(name)}() {
  const loading = ref(false)

  async function load(): Promise<void> {
    loading.value = true
    try {
      // await $fetch('/api/...')
    } finally {
      loading.value = false
    }
  }

  return { loading, load }
}
`
