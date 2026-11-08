# 6. Server features

## API routes and server code

Everything under `extensions/<id>/server/` is added to Nitro as a scan directory, using the usual conventions:

```
server/api/quiz/[id].get.ts     → GET  /api/quiz/:id
server/api/quiz/submit.post.ts  → POST /api/quiz/submit
server/routes/quiz-feed.xml.ts  → GET  /quiz-feed.xml
server/middleware/…             → runs on every request
server/plugins/…                → Nitro plugins
server/utils/…                  → auto-imported helpers
```

```ts
// extensions/quiz/server/api/quiz/submit.post.ts
export default defineEventHandler(async (event) => {
  const { courseId, answers } = await readBody(event)
  const score = await useModularServerHooks().applyFilter('quiz:score', compute(answers), { courseId })
  return { score }
})
```

- Route clashes (two extensions, or an extension and the host serving the same route and method) are reported at build
  time: Nitro would keep only one.
- A route of an extension switched off by a **persistent toggle** answers `404`.

## The hook bus

A server-wide event system with two kinds of hooks.

| Kind | Purpose | Returns |
|------|---------|---------|
| **action** | "something happened" broadcast | nothing |
| **filter** | "transform this value" pipeline | the (possibly changed) value |

```ts
const hooks = useModularServerHooks()
const score = await hooks.applyFilter('quiz:score', raw, { courseId })   // filter
await hooks.callHook('quiz:submitted', { courseId, score })              // action
```

Handlers are declared in manifests and live in `server/hooks/`:

```ts
// extensions/quiz/manifest.ts
serverHooks: [
  { hook: 'quiz:score',     handler: './server/hooks/bonus-score.ts', type: 'filter', order: 10 },
  { hook: 'quiz:submitted', handler: './server/hooks/notify.ts' },
]
```
```ts
// extensions/quiz/server/hooks/bonus-score.ts
import { defineFilterHandler } from '#modular'
export default defineFilterHandler<'quiz:score'>((score) => Math.min(100, score + 5))
```

Behaviour you can rely on:

- Handlers run **in `order`** (then extension id), one after another.
- A handler that throws is logged and **skipped**. For a filter the value passes on unchanged.
- Handlers of extensions switched off by a persistent toggle are skipped.
- Subscribe from your own code too: `hooks.addAction(name, fn, { order, owner })` / `addFilter(...)`, which return an
  unsubscribe function. `removeOwner(id)`, `hasHook(name)` and `listHooks()` help with tooling.

### Built-in hooks

| Hook | Type | Payload |
|------|------|---------|
| `nitro:request` | action | `event` |
| `nitro:after-response` | action | `event` |
| `nitro:error` | action | `error, event` |
| `modular:extension-toggled` | action | `extensionId, active` (`null` = back to default) |
| `modular:migration-context` | filter | the migration context ([chapter 7](./07-data.md)) |
| `modular:seeder-context` | filter | the seeder context |

### Typing your hooks

Declaration merging gives hook names, payloads and results real types:

```ts
// server/types/hooks.d.ts (or inside the extension)
declare module '#modular' {
  interface ModularActions {
    'quiz:submitted': [payload: { courseId: string; score: number }]
  }
  interface ModularFilters {
    'quiz:score': [score: number, context: { courseId: string }]
  }
}
export {}
```

Hook names must be colon-namespaced (`quiz:score`); that is what keeps extensions from colliding.

## Server utilities (auto-imported in Nitro)

| Utility | Purpose |
|---------|---------|
| `useModularServerHooks()` | The hook bus |
| `useModularToggles()` | Persistent feature toggles |
| `useModularMigrations()` | Run and inspect migrations |
| `useModularSeeders()` | Run seeders |
| `useModularDatabase()` | The configured SQL database |
| `useModularExtensionConfig(id)` | Per-extension settings |
