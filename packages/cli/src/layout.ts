import { pascalCase } from '@nuxt-modular/core/node'
import { titleCase } from './stubs'

/*
 * The standard extension layout. Every extension created by `make:extension` or `init` follows it, so an unfamiliar
 * extension is readable at a glance:
 *
 *   shared/        types and pure validation used by both sides (no Nuxt, Vue or Nitro imports)
 *   server/        api (controllers) -> services (business rules) -> repositories (data access)
 *   composables/   the only place that calls the API; typed state and actions for the app
 *   components/    presentational: props in, events out, no data fetching
 *   pages/         containers: compose a composable with components
 */

/** Where the sample entity is stored: SQL (needs `modular.database`) or Nitro storage (no setup). */
export type DataSource = 'sql' | 'storage'

export interface LayoutOptions {
  readonly id: string
  /** Roles granted the sample permission (`defaultRoles`). */
  readonly roles: readonly string[]
  readonly data: DataSource
}

export interface LayoutFile {
  /** Path relative to the extension directory. */
  readonly path: string
  readonly content: string
}

const list = (items: readonly string[]): string => items.map((item) => `'${item}'`).join(', ')

/** Table of the sample entity, e.g. `my-shop` -> `my_shop_items`. */
export const tableName = (id: string): string => `${id.replace(/-/g, '_')}_items`

export const widgetName = (id: string): string => `${pascalCase(id)}Widget`
export const composableName = (id: string): string => `use${pascalCase(id)}Items`

function manifest({ id, roles }: LayoutOptions): string {
  const label = titleCase(id)
  return `import { defineExtensionManifest } from '#modular'

export default defineExtensionManifest({
  id: '${id}',
  name: '${label}',
  version: '0.1.0',
  description: '${label} extension.',
  permissions: [{ id: '${id}.view', label: 'View ${label}', defaultRoles: [${list(roles)}] }],
  navigation: [{ id: '${id}', label: '${label}', path: '/${id}', parent: 'sidebar', permission: '${id}.view' }],
  slots: [{ id: 'widget', target: 'dashboard.widgets', component: '${widgetName(id)}', permission: '${id}.view' }],
})
`
}

const sharedItem = (): string => `/*
 * Shared by the app and the server: types and pure validation that must agree on both sides.
 * Keep this folder free of Nuxt, Vue and Nitro imports.
 */

export interface Item {
  id: string
  title: string
  createdAt: number
}

export interface ItemInput {
  title: string
}

export const TITLE_MAX_LENGTH = 120

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** Checks untrusted input. The server rejects with the message; the form shows it before sending. */
export function validateItemInput(value: unknown): ValidationResult<ItemInput> {
  const raw = (value as { title?: unknown } | null)?.title
  const title = typeof raw === 'string' ? raw.trim() : ''
  if (!title) return { ok: false, error: 'Title is required' }
  if (title.length > TITLE_MAX_LENGTH) return { ok: false, error: \`Title must be at most \${TITLE_MAX_LENGTH} characters\` }
  return { ok: true, value: { title } }
}
`

const controllerList = (): string => `import { listItems } from '../../../services/item.service'

// Controller: turns the request into a service call and the result into a response. No logic of its own.
export default defineEventHandler(async () => {
  return { items: await listItems() }
})
`

const controllerCreate = (): string => `import { validateItemInput } from '../../../../shared/item'
import { addItem } from '../../../services/item.service'

export default defineEventHandler(async (event) => {
  const result = validateItemInput(await readBody(event))
  if (!result.ok) throw createError({ statusCode: 422, statusMessage: result.error })
  setResponseStatus(event, 201)
  return { item: await addItem(result.value) }
})
`

const controllerDelete = (): string => `import { deleteItem } from '../../../services/item.service'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  await deleteItem(id)
  setResponseStatus(event, 204)
  return null
})
`

const service = (): string => `// Service: the business rules. It knows nothing about HTTP requests or about how items are stored.
import type { Item, ItemInput } from '../../shared/item'
import * as items from '../repositories/item.repository'

export const listItems = (): Promise<Item[]> => items.findAll()

export async function addItem(input: ItemInput): Promise<Item> {
  if (await items.findByTitle(input.title)) {
    throw createError({ statusCode: 409, statusMessage: 'An item with this title already exists' })
  }
  const item: Item = { id: crypto.randomUUID(), title: input.title, createdAt: Date.now() }
  await items.insert(item)
  return item
}

export async function deleteItem(id: string): Promise<void> {
  if (!(await items.remove(id))) throw createError({ statusCode: 404, statusMessage: 'Item not found' })
}
`

function repositorySql({ id }: LayoutOptions): string {
  const table = tableName(id)
  return `// Repository: data access only. SQL in, plain objects out; no business rules and no HTTP.
// Change the database with: npx nuxt-modular db
import type { Item } from '../../shared/item'

interface Row {
  id: string
  title: string
  created_at: number | string // BIGINT comes back as a string on PostgreSQL
}

const toItem = (row: Row): Item => ({ id: row.id, title: row.title, createdAt: Number(row.created_at) })

async function connection() {
  const database = await useModularDatabase()
  if (!database) throw createError({ statusCode: 503, statusMessage: 'No database configured: run "npx nuxt-modular db"' })
  return database.db
}

export async function findAll(): Promise<Item[]> {
  const db = await connection()
  const rows = (await db.prepare('SELECT id, title, created_at FROM ${table} ORDER BY created_at DESC').all()) as Row[]
  return rows.map(toItem)
}

export async function findByTitle(title: string): Promise<Item | undefined> {
  const db = await connection()
  const row = (await db.prepare('SELECT id, title, created_at FROM ${table} WHERE title = ?').get(title)) as Row | undefined
  return row ? toItem(row) : undefined
}

export async function insert(item: Item): Promise<void> {
  const db = await connection()
  await db.prepare('INSERT INTO ${table} (id, title, created_at) VALUES (?, ?, ?)').run(item.id, item.title, item.createdAt)
}

export async function remove(id: string): Promise<boolean> {
  const db = await connection()
  if (!(await db.prepare('SELECT id FROM ${table} WHERE id = ?').get(id))) return false
  await db.prepare('DELETE FROM ${table} WHERE id = ?').run(id)
  return true
}
`
}

function repositoryStorage({ id }: LayoutOptions): string {
  return `// Repository: data access only. Items live in Nitro storage under one key, so no database is needed.
// Storage is in memory until you configure a driver (nitro.storage in nuxt.config). To use SQL instead, run
// "npx nuxt-modular db" and keep these function names: the service does not change.
import type { Item } from '../../shared/item'

const storage = () => useStorage('${id}')
const KEY = 'items'

const readAll = async (): Promise<Item[]> => (await storage().getItem<Item[]>(KEY)) ?? []

export async function findAll(): Promise<Item[]> {
  return (await readAll()).sort((a, b) => b.createdAt - a.createdAt)
}

export async function findByTitle(title: string): Promise<Item | undefined> {
  return (await readAll()).find((item) => item.title === title)
}

export async function insert(item: Item): Promise<void> {
  await storage().setItem(KEY, [...(await readAll()), item])
}

export async function remove(id: string): Promise<boolean> {
  const all = await readAll()
  const next = all.filter((item) => item.id !== id)
  if (next.length === all.length) return false
  await storage().setItem(KEY, next)
  return true
}
`
}

const migration = (id: string): string => `import { defineMigration } from '#modular'

// Portable SQL that runs on SQLite, PostgreSQL and MySQL. Add the next change as 002-....ts.
export default defineMigration({
  async up({ db }) {
    await db.exec(
      'CREATE TABLE IF NOT EXISTS ${tableName(id)} (id VARCHAR(64) NOT NULL PRIMARY KEY, title VARCHAR(255) NOT NULL, created_at BIGINT NOT NULL)',
    )
  },
  async down({ db }) {
    await db.exec('DROP TABLE IF EXISTS ${tableName(id)}')
  },
})
`

const seeder = (id: string): string => `import { defineSeeder } from '#modular'

// Demo data for local development. Idempotent: the fixed ids are replaced, not duplicated.
export default defineSeeder({
  async run({ db, log }) {
    const rows = [
      ['${id}-1', 'First item'],
      ['${id}-2', 'Second item'],
    ] as const
    for (const [id, title] of rows) {
      await db.prepare('DELETE FROM ${tableName(id)} WHERE id = ?').run(id)
      await db.prepare('INSERT INTO ${tableName(id)} (id, title, created_at) VALUES (?, ?, ?)').run(id, title, Date.now())
    }
    log(\`stored \${rows.length} items\`)
  },
})
`

const composable = (id: string): string => `import type { Item, ItemInput } from '../shared/item'

/*
 * Data layer of the app: the only place that knows the API routes. Pages and components get typed state and
 * actions from here and never call $fetch themselves. Auto-imported, like the composables of the host.
 */
export async function ${composableName(id)}() {
  const { data, pending, error, refresh } = await useFetch<{ items: Item[] }>('/api/${id}/items', { key: '${id}:items' })
  const items = computed(() => data.value?.items ?? [])

  async function add(input: ItemInput): Promise<void> {
    await $fetch('/api/${id}/items', { method: 'POST', body: input })
    await refresh()
  }

  async function remove(itemId: string): Promise<void> {
    await $fetch(\`/api/${id}/items/\${encodeURIComponent(itemId)}\`, { method: 'DELETE' })
    await refresh()
  }

  return { items, pending, error, add, remove, refresh }
}
`

const widget = (id: string): string => `<script setup lang="ts">
// Rendered by the "dashboard.widgets" outlet of the host (see slots in manifest.ts).
defineProps<{ context?: Record<string, unknown> }>()
</script>

<template>
  <section class="${id}-widget">
    <h2>${titleCase(id)}</h2>
    <p>This card comes from the <strong>${id}</strong> extension.</p>
    <NuxtLink to="/${id}">Open ${titleCase(id)}</NuxtLink>
  </section>
</template>
`

const itemList = (): string => `<script setup lang="ts">
import type { Item } from '../shared/item'

// Presentational: data in through props, intent out through events. No fetching, no store.
defineProps<{ items: readonly Item[] }>()
defineEmits<{ remove: [id: string] }>()
</script>

<template>
  <ul v-if="items.length">
    <li v-for="item in items" :key="item.id">
      <span>{{ item.title }}</span>
      <button type="button" @click="$emit('remove', item.id)">Remove</button>
    </li>
  </ul>
  <p v-else>No items yet.</p>
</template>
`

const itemForm = (): string => `<script setup lang="ts">
import { type ItemInput, validateItemInput } from '../shared/item'

const emit = defineEmits<{ submit: [input: ItemInput] }>()

const title = ref('')
const error = ref('')

// The same validation as the server, so the user gets the message before the request is sent.
function onSubmit() {
  const result = validateItemInput({ title: title.value })
  error.value = result.ok ? '' : result.error
  if (!result.ok) return
  emit('submit', result.value)
  title.value = ''
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <input v-model="title" type="text" placeholder="New item" aria-label="Title">
    <button type="submit">Add</button>
    <p v-if="error" role="alert">{{ error }}</p>
  </form>
</template>
`

function page(id: string): string {
  const pascal = pascalCase(id)
  return `<script setup lang="ts">
useHead({ title: '${titleCase(id)}' })

// Container: wires the composable (data) to the components (presentation).
const { items, error, add, remove } = await ${composableName(id)}()

const actionError = ref('')
async function run(action: () => Promise<void>) {
  actionError.value = ''
  try {
    await action()
  } catch (cause) {
    actionError.value = (cause as { statusMessage?: string }).statusMessage ?? 'Something went wrong'
  }
}
</script>

<template>
  <main>
    <h1>${titleCase(id)}</h1>
    <${pascal}ItemForm @submit="(input) => run(() => add(input))" />
    <p v-if="actionError" role="alert">{{ actionError }}</p>
    <p v-if="error">The items could not be loaded.</p>
    <${pascal}ItemList :items="items" @remove="(itemId) => run(() => remove(itemId))" />
  </main>
</template>
`
}

function readme({ id, data }: LayoutOptions): string {
  const label = titleCase(id)
  const pascal = pascalCase(id)
  const store = data === 'sql' ? 'SQL through `useModularDatabase()`' : 'Nitro storage'
  return `# ${label}

Generated by \`nuxt-modular\`. It shows the standard layout every extension follows; rename the sample \`item\`
entity or delete what you do not need.

\`\`\`
${id}/
  manifest.ts                              what the extension contributes (menu, slot, permission)
  shared/item.ts                           types and validation used by both sides
  server/
    api/${id}/items/*.ts                   controllers: request in, response out
    services/item.service.ts               business rules
    repositories/item.repository.ts        data access (${store})
${data === 'sql' ? `    migrations/001-create-items.ts         schema, run in order
    seeders/001-demo-items.ts              demo data
` : ''}  composables/${composableName(id)}.ts        the only code that calls the API
  components/${pascal}ItemList.vue         presentational
  components/${pascal}ItemForm.vue         presentational
  components/${widgetName(id)}.vue             card shown in the "dashboard.widgets" outlet
  pages/${id}/index.vue                    container for the page at /${id}
\`\`\`

## Rules of the layout

- **Controllers** (\`server/api\`) validate input and call a service. No business rules, no queries.
- **Services** hold the rules and call repositories. They do not read the request.
- **Repositories** are the only code that touches storage. Swap the data source here and nothing else changes.
- **Composables** are the only app code that knows the API routes. **Components** never fetch.
- **\`shared/\`** is imported by both sides, so it has no Nuxt, Vue or Nitro imports.

## Commands

\`\`\`bash
npx nuxt-modular                 # list every command
npx nuxt-modular make:service ${id} <name>
npx nuxt-modular make:repository ${id} <name>
npx nuxt-modular make:composable ${id} <name>
npx nuxt-modular make:api ${id} <route> --method post
npx nuxt-modular validate        # check manifests and references
npx nuxt-modular db              # choose or change the database
\`\`\`
`
}

/** Files of the standard layout for one extension, relative to its directory. */
export function standardLayout(options: LayoutOptions): LayoutFile[] {
  const { id, data } = options
  const files: LayoutFile[] = [
    { path: 'manifest.ts', content: manifest(options) },
    { path: 'README.md', content: readme(options) },
    { path: 'shared/item.ts', content: sharedItem() },
    { path: `server/api/${id}/items/index.get.ts`, content: controllerList() },
    { path: `server/api/${id}/items/index.post.ts`, content: controllerCreate() },
    { path: `server/api/${id}/items/[id].delete.ts`, content: controllerDelete() },
    { path: 'server/services/item.service.ts', content: service() },
    { path: 'server/repositories/item.repository.ts', content: data === 'sql' ? repositorySql(options) : repositoryStorage(options) },
    { path: `composables/${composableName(id)}.ts`, content: composable(id) },
    { path: `components/${widgetName(id)}.vue`, content: widget(id) },
    { path: `components/${pascalCase(id)}ItemList.vue`, content: itemList() },
    { path: `components/${pascalCase(id)}ItemForm.vue`, content: itemForm() },
    { path: `pages/${id}/index.vue`, content: page(id) },
  ]
  if (data === 'sql') {
    files.push(
      { path: 'server/migrations/001-create-items.ts', content: migration(id) },
      { path: 'server/seeders/001-demo-items.ts', content: seeder(id) },
    )
  }
  return files
}
