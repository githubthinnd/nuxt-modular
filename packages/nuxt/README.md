# nuxt-modular

<p align="center"><img src="https://raw.githubusercontent.com/githubthinnd/nuxt-modular/master/assets/demo.gif" alt="nuxt-modular playground demo" width="760"></p>

Turn a Nuxt app into an extensible **host platform**. Independent extensions
plug in components, pages, navigation, permissions, plugins, server routes and
server hooks — without editing host templates and without hydration mismatches.

- **Outlets**: the host places `<PluginOutlet name="course.tabs" />`; extensions declare what renders there.
- **SSR-safe**: deterministic ordering, permission checks and state that match on server and client.
- **Isolated failures**: a crashing extension component shows a fallback; the page keeps rendering, also during SSR.
- **Full-stack**: extension `server/` dirs become Nitro routes; an action/filter hook bus connects extensions on the server.
- **Build-time validation**: manifests are validated with Zod; broken references fail the build with every issue listed.
- **Feature toggles**: switch an extension off for everyone at runtime — its UI, pages, API routes and server hooks disappear.
- **Migrations & seeders**: extensions ship ordered `server/migrations/*` (tracked in a ledger) and idempotent `server/seeders/*`.
- **Databases**: SQLite, MySQL/MariaDB and PostgreSQL (via db0) for the migration ledger, an atomic lock, toggles and your migrations.
- **Settings**: manifest defaults overridden per environment, read with `useExtensionConfig()`.
- **Compatibility**: `requires` pins the host and dependency versions; incompatible sets fail the build.
- **Tooling**: Nitro tasks (`modular:migrate`, `modular:seed`, …) and the `nuxt-modular` CLI (`make:*`, `list`, `validate`).

Requires Nuxt ≥ 3.13 (tested with Nuxt 4.6).

## Install

```bash
pnpm add nuxt-modular
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-modular'],
  modular: {
    extensionsDir: 'extensions',          // relative to the app root and to every layer
    disabled: [],                         // extension ids to leave out of the build entirely
    devtools: true,                       // "Extensions" tab in Nuxt DevTools (dev only)
    storage: 'nuxt-modular',              // Nitro storage mount for toggles and the migration ledger
    toggles: { enabled: true, ttl: 1000 },// persistent feature toggles, cached per process (ms)
    migrations: { auto: false },          // run pending migrations when the server starts
    database: false,                      // 'postgresql://…' | 'mysql://…' | 'sqlite:./modular.db' (see Database)
    config: {},                           // per-extension settings: { quiz: { bonusPoints: 10 } }
    tasks: false,                         // register `modular:*` Nitro tasks (experimental.tasks)
  },
  nitro: {
    // Nitro's default storage is in-memory: give the mount a persistent driver.
    storage: { 'nuxt-modular': { driver: 'fs', base: './.data/modular' } },
  },
})
```

`storage`, `toggles` and `migrations` are also exposed as `runtimeConfig.modular`,
so they can be overridden per environment (e.g. `NUXT_MODULAR_MIGRATIONS_AUTO=true`).

## Write an extension

```
extensions/quiz/
  manifest.ts        required
  components/        auto-registered; slot components resolve here
  pages/             added to the router (host pages win on conflicts)
  plugins/           Nuxt plugins, registered only while the extension is built
  server/            Nitro scan dir: api/, routes/, middleware/, plugins/, utils/
  server/hooks/      handlers referenced by manifest.serverHooks
  server/migrations/ ordered migrations (`001-name.ts`), see below
  server/seeders/    idempotent seed data (`001-name.ts`), see below
```

Generate any of these with the [CLI](../cli/README.md): `nuxt-modular make:extension quiz`.

```ts
// extensions/quiz/manifest.ts
import { defineExtensionManifest } from '#modular'

export default defineExtensionManifest({
  id: 'quiz',
  name: 'Quiz',
  version: '1.0.0',
  dependsOn: [],
  requires: { modular: '>=0.1.0' },      // optional: host and dependency version ranges
  config: { bonusPoints: 5 },            // optional: default settings (public, JSON only)
  permissions: [{ id: 'quiz.view', defaultRoles: ['student'] }],
  navigation: [
    { id: 'quiz', label: 'Quizzes', path: '/quiz', parent: 'sidebar', order: 20, permission: 'quiz.view' },
  ],
  slots: [
    // A path inside the extension, or a component name from its components/ dir.
    { id: 'tab', target: 'course.tabs', component: './components/QuizTab.vue', order: 20, permission: 'quiz.view' },
    { target: 'course.sidebar', component: 'QuizProgressWidget', props: { title: 'Progress' } },
  ],
  serverHooks: [{ hook: 'quiz:score', handler: './server/hooks/bonus-score.ts', type: 'filter' }],
})
```

Manifests must be **JSON-only**: components and handlers are string references
resolved at build time, and `props` must be JSON values. This keeps the
registry serializable through the SSR payload.

Permissions accept `"cap"`, `{ anyOf: [...] }` or `{ allOf: [...] }`.
Ordering is `order` ascending, then extension id, then declaration index — the
same on every server and browser.

## Host API

### `<PluginOutlet>`

```vue
<PluginOutlet name="course.tabs" :context="{ courseId }" />
<PluginOutlet name="course.sidebar" wrap-with="aside" item-tag="section">
  <template #empty>Nothing here yet.</template>
  <template #fallback="{ extensionId, error }">{{ extensionId }} failed.</template>
</PluginOutlet>
```

| Prop | Type | Description |
|------|------|-------------|
| `name` | `string` | Outlet id. |
| `context` | `object` | Passed to every extension component as the `context` prop (static `props` from the manifest are spread too). |
| `wrapWith` | `string \| Component` | Wraps the whole outlet; not rendered when the outlet is empty. |
| `itemTag` | `string` | Tag of each item's `display: contents` wrapper (default `div`; use `li` inside lists). |

### Composables (auto-imported)

```ts
const registry = useModuleRegistry()
registry.extensions.value          // [{ id, manifest, active, source, missingDependencies }]
registry.getSlotComponents('course.tabs')
registry.getNavigation('sidebar')  // tree, filtered by permission and activation
registry.isModuleActive('quiz')
registry.setModuleActive('quiz', false) // per request/session; null restores the default
registry.register(manifest)        // runtime registration (its components must be in the build)

const permissions = useModularPermissions()
// Usually in a plugin reading the session. Extension capabilities come from the
// manifests' `permissions[].defaultRoles`; the second argument adds host capabilities.
permissions.setRoles(['teacher'], ['course.view'])
permissions.set(['course.view', 'quiz.view']) // or set capabilities directly; '*' grants all
permissions.can({ anyOf: ['quiz.manage', 'admin'] })
registry.capabilitiesForRoles(['teacher'])    // ['quiz.manage', 'quiz.view']
```

Both keep their state in `useState`, so the server and the client agree.

### Server hook bus

```ts
// any server route
const hooks = useModularServerHooks()
const score = await hooks.applyFilter('quiz:score', raw, { courseId })
await hooks.callHook('quiz:submitted', { courseId, score })
```

```ts
// extensions/quiz/server/hooks/bonus-score.ts
import { defineFilterHandler } from '#modular'
export default defineFilterHandler<'quiz:score'>((score) => Math.min(100, score + 5))
```

Handlers run in `order`, one after another. A failing handler is logged and
skipped; a failing filter leaves the value unchanged. Nitro lifecycle hooks are
forwarded as actions: `nitro:request`, `nitro:after-response`, `nitro:error`.

Type your hooks with declaration merging:

```ts
declare module '#modular' {
  interface ModularActions { 'quiz:submitted': [payload: { courseId: string; score: number }] }
  interface ModularFilters { 'quiz:score': [score: number, context: { courseId: string }] }
}
```

## Database

By default nuxt-modular keeps its state (migration ledger, toggles) in Nitro
storage. Point it at a SQL database instead and you get an **atomic migration
lock** that is safe with many instances, toggles that every instance sees
immediately, and a ready-made `db` in every migration and seeder.

| Database | `modular.database` | Driver to install |
|----------|--------------------|-------------------|
| SQLite | `'sqlite:./.data/modular.db'` | none (Node ≥ 22.5 built-in); or `better-sqlite3`, `@libsql/client` |
| PostgreSQL | `'postgresql://user:pass@host/db'` | `pg` |
| MySQL / MariaDB | `'mysql://user:pass@host/db'` | `mysql2` |

```ts
// nuxt.config.ts: keep secrets out of the build, pass only the connector
modular: { database: { connector: 'postgresql' } }
```
```bash
NUXT_MODULAR_DATABASE_URL=postgresql://user:pass@host/db   # read at runtime
```

The connector is inferred from a URL (`postgresql:`, `postgres:`, `mysql:`, `mariadb:`, `sqlite:`, `file:`, `libsql:`).
Options: `connector`, `options` (driver settings, they win over the URL), `dialect`, `prefix` (table prefix,
default `modular_`: tables `modular_migrations`, `modular_locks`, `modular_toggles`). Nothing is bundled when
`database` is unset.

**In migrations and seeders** the database arrives in the context, typed:

```ts
export default defineMigration({
  async up({ db, dialect }) {
    await db.exec('CREATE TABLE IF NOT EXISTS quiz_attempts (id VARCHAR(64) NOT NULL PRIMARY KEY, score INT NOT NULL)')
    if (dialect === 'postgresql') await db.exec('CREATE INDEX IF NOT EXISTS quiz_attempts_score ON quiz_attempts (score)')
  },
  async down({ db }) { await db.exec('DROP TABLE IF EXISTS quiz_attempts') },
})
```

`db` is a [db0](https://db0.unjs.io) database: `db.exec(sql)`, `db.prepare(sql).all/get/run(...params)` with `?`
placeholders on every dialect. **Write portable SQL** (`VARCHAR`, `INT`, `BIGINT`, plain `CREATE TABLE IF NOT EXISTS`)
and branch on `dialect` for the rest. There is no schema builder on purpose: use your own (Drizzle, Kysely) inside
a migration if you want one.

**In routes and hooks** use `useModularDatabase()` (`{ db, dialect, prefix }`, or `undefined` when unset).
The module also still calls the `modular:migration-context` / `modular:seeder-context` filters, after adding `db`.

**Bring your own connection** (pools, read replicas, Drizzle…):

```ts
modular: { database: { handler: '~/server/modular-db', dialect: 'postgresql' } }
// server/modular-db.ts: default export returns a db0-compatible database
export default () => createDatabase(postgresql({ url: process.env.DATABASE_URL, max: 10 }))
```

Notes: toggles are written with delete-then-insert (no upsert) to stay portable; the lock is a unique-key insert
with an expiry, so a crashed process frees it after five minutes. Tested against SQLite on every run; PostgreSQL,
MySQL and MariaDB suites run in CI against real servers.

## Settings

`manifest.config` holds an extension's defaults. The host overrides them per
environment without touching the extension:

```ts
// nuxt.config.ts
modular: { config: { quiz: { bonusPoints: 10 } } }
// or: NUXT_PUBLIC_MODULAR_CONFIG_QUIZ_BONUSPOINTS=10
```

```ts
const quiz = useExtensionConfig('quiz')                  // components, pages, plugins
quiz.get('limits.maxQuestions', 20)

const { get } = useModularExtensionConfig('quiz')        // server routes and hook handlers
```

Objects merge deeply; arrays and scalars replace. Settings are **public** (they
ship to the browser): never put secrets in them, use `runtimeConfig` for those.

## Compatibility

```ts
requires: {
  modular: '^0.1.0',                 // nuxt-modular versions this extension supports
  extensions: { core: '^2.0.0' },    // version ranges of dependencies (must be in dependsOn)
}
```

Ranges use semver syntax (`^`, `~`, `>=1 <3`, `1.x`, `||`). At build time the
module fails with every problem listed when a range is not met or when `dependsOn`
forms a cycle; a dependency that is merely absent only warns (the extension stays
inactive). Extensions are processed dependencies-first, so a dependency's plugins
register before its dependents'.

## Enabling and disabling

| How | Scope | Effect |
|-----|-------|--------|
| `modular.disabled: ['id']` | build | Removed from the build: no components, pages, plugins, routes or hooks. |
| `enabled: false` in the manifest | default | Built, but inactive unless a toggle switches it on. |
| `useModularToggles().set(id, false)` (server) | everyone, persistent | Slots, navigation and pages disappear (pages answer 404), its API routes answer 404 and its server hooks are skipped. `null` restores the default. |
| `setModuleActive(id, false)` | this request / tab | Hides slots and navigation and makes its pages 404. Server routes and hooks are unaffected. |

Precedence: session override → persistent toggle → `manifest.enabled`; then every
`dependsOn` must be active too, so switching an extension off also deactivates its dependents.

The module does not expose an admin endpoint: write your own, behind your own authorization.

```ts
// server/api/admin/extensions/[id].put.ts
export default defineEventHandler(async (event) => {
  await requireAdmin(event) // your check
  const { active } = await readBody<{ active: boolean | null }>(event)
  await useModularToggles().set(getRouterParam(event, 'id')!, active)
  return useModularToggles().list()
})
```

Toggles are cached per server process for `toggles.ttl` ms, so other instances
sharing the storage pick a change up within that delay.

## Migrations

```ts
// extensions/quiz/server/migrations/001-question-bank.ts
import { defineMigration } from '#modular'

export default defineMigration({
  async up({ db, log }) { await db.exec('create table quiz_scores (...)'); log('created') },
  async down({ db }) { await db.exec('drop table quiz_scores') },
})
```

- Order: extensions sorted so dependencies run first, then file names.
- The first failure stops the run; nothing is recorded for the failed migration.
- The ledger and a best-effort lock live in the `storage` mount.
- `migrations.auto` runs pending migrations at server start (never while prerendering);
  requests wait for them. Extensions switched off by a toggle are skipped.
- On demand: `useModularMigrations().up()`, `.down(extensionId, steps)`, `.status()`,
  and the destructive `.reset()` (revert all, dependents first) and `.refresh()` (reset + up).

Give migrations your database through the `modular:migration-context` filter:

```ts
// server/plugins/migration-context.ts
export default defineNitroPlugin(() => {
  useModularServerHooks().addFilter('modular:migration-context', (context) => ({ ...context, db: useDatabase() }))
})

// server/types/modular.d.ts
declare module '#modular' {
  interface ModularMigrationContext { db: ReturnType<typeof useDatabase> }
}
export {}
```

## Seeders

```ts
// extensions/quiz/server/seeders/001-demo-attempts.ts
import { defineSeeder } from '#modular'

export default defineSeeder({
  async run({ db, log }) { await db.upsert('attempts', [...]); log('done') },
})
```

Seeders load initial or demo data and **are not recorded**: write them to be
idempotent. Run with `useModularSeeders().run({ extensions?, names? })` (extensions
switched off are skipped unless `includeInactive`). Provide the context with the
`modular:seeder-context` filter and `ModularSeederContext`, exactly like migrations.

## Events

`modular:extension-toggled` fires (as an action on the hook bus) whenever
`useModularToggles().set(id, active)` succeeds — use it to clear caches or audit changes:

```ts
useModularServerHooks().addAction('modular:extension-toggled', (id, active) => audit(id, active))
```

## Tasks

With `modular.tasks: true` the module registers Nitro tasks (it enables Nitro's
`experimental.tasks`):

| Task | Payload | Effect |
|------|---------|--------|
| `modular:list` | | Extensions and their activation state |
| `modular:migrate` | `extensions`, `includeInactive` | Run pending migrations |
| `modular:migrate:status` | | Applied / pending / unknown per extension |
| `modular:migrate:rollback` | `extension`, `steps` | Revert the last migrations of one extension |
| `modular:migrate:reset` | `confirm: true`, `extensions` | Revert everything |
| `modular:migrate:refresh` | `confirm: true`, `extensions` | Revert, then re-apply everything |
| `modular:seed` | `extensions`, `names`, `includeInactive` | Run seeders |

```bash
npx nuxt task run modular:migrate:status          # against the dev server (nuxt dev)
npx nuxt task run modular:seed --payload '{"extensions":["quiz"]}'
```

Failures make the command exit non-zero. Nitro only serves `/_nitro/tasks` in
development; in production call `runTask('modular:migrate')` from your own entry
point, or use `migrations.auto`.

## Error isolation

Each slot renders inside its own boundary:

- **During SSR**, an error is recorded in the payload and swallowed; the rest of the page renders.
- **During hydration**, a slot that failed on the server adopts the server markup as-is (no mismatch) and switches to the fallback after mount.
- **After hydration**, the fallback replaces the slot immediately.

Errors that happen *only* in the browser while hydrating still produce one Vue
hydration warning, because the server and client genuinely rendered different content.

## Limitations

- Each slot adds a `display: contents` wrapper element. Inside tables use an
  outlet-level structure that accepts it (or set `item-tag`).
- Manifests are evaluated at build time; editing one restarts the dev server.
- Two extensions (or an extension and the host) serving the same route and method: the
  build warns, and Nitro answers with only one of them.
- Session overrides (`setModuleActive`) only affect the UI and pages; use persistent
  toggles to switch off server routes and hooks.
- With Nitro storage the migration lock is best-effort (no atomic compare-and-set); configure `modular.database`
  when several instances run migrations (`migrations.auto`) at the same time.

## Testing extensions

`@nuxt-modular/core/runtime` is plain TypeScript: unit-test registry logic with
`createRegistryState`, `resolveSlots` and `resolveNavigation`, handlers with
`createHookBus`, and migrations or seeders with `runMigrationsUp(...)` /
`runSeeders(...)` plus `createMemoryLedger()` — no Nuxt required.

## License

MIT
