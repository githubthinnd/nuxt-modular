# 3. Writing extensions

## Directory layout

```
extensions/quiz/
  manifest.ts          required
  components/          auto-registered; slot components resolve here
  pages/               added to the router
  plugins/             Nuxt plugins (top level files only)
  server/
    api/               Nitro API routes      → /api/…
    routes/            Nitro routes          → /…
    middleware/        Nitro middleware
    plugins/           Nitro plugins
    utils/             auto-imported server utilities
    hooks/             handlers referenced by manifest.serverHooks
    migrations/        ordered migrations (001-name.ts)
    seeders/           idempotent seed data (001-name.ts)
```

Rules:

- A folder is an extension only if it contains `manifest.ts` (`.mts`, `.js`, `.mjs` also work).
- Folders starting with `_` or `.` are ignored: use `_drafts/` to park work in progress.
- Every extension id is unique. If two extension folders in the **same** root declare one id the build fails; if an app
  extension and a layer extension share an id, the app's wins (logged).
- Extensions can live in Nuxt **layers**: the `extensions/` folder of every layer is scanned.

## The manifest

```ts
import { defineExtensionManifest } from '#modular'

export default defineExtensionManifest({
  id: 'quiz',
  name: 'Quiz',
  version: '1.2.0',
  description: 'Course quizzes',
  enabled: true,
  dependsOn: ['core'],
  requires: { modular: '>=0.1.0', extensions: { core: '^2.0.0' } },
  config: { passingScore: 60 },
  permissions: [{ id: 'quiz.view', label: 'Take quizzes', defaultRoles: ['student'] }],
  navigation: [{ id: 'quiz', label: 'Quizzes', path: '/quiz', parent: 'sidebar', order: 20, permission: 'quiz.view' }],
  slots: [{ id: 'tab', target: 'course.tabs', component: './components/QuizTab.vue', order: 20, permission: 'quiz.view' }],
  serverHooks: [{ hook: 'quiz:score', handler: './server/hooks/bonus-score.ts', type: 'filter' }],
})
```

`defineExtensionManifest` validates immediately, so a mistake fails the build with a precise message instead of
failing for a visitor.

> **JSON only.** A manifest may not contain functions, component objects or class instances. Components and handlers
> are referenced by string. This is what makes the registry serializable through the SSR payload.

### Field reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | kebab-case string, ≤ 64 | required | Unique id, e.g. `mod-quiz`. |
| `name` | string, ≤ 128 | required | Human-readable name. |
| `version` | semver | required | `1.2.0`, `1.0.0-beta.1`. |
| `description` | string | – | Shown in DevTools and the CLI. |
| `enabled` | boolean | `true` | Default activation. Toggles may override it ([chapter 9](./09-toggles-and-compatibility.md)). |
| `dependsOn` | string[] | `[]` | Extension ids that must be present **and active**. |
| `requires.modular` | semver range | – | Supported `nuxt-modular` versions. |
| `requires.extensions` | `{ id: range }` | `{}` | Version range per dependency; every key must be in `dependsOn`. |
| `config` | JSON object | `{}` | Default settings ([chapter 8](./08-configuration.md)). Public. |
| `permissions` | array | `[]` | Capabilities this extension introduces. |
| `navigation` | array | `[]` | Menu entries. |
| `slots` | array | `[]` | Components rendered in outlets. |
| `serverHooks` | array | `[]` | Subscriptions to the server hook bus. |

### `permissions[]`

| Field | Description |
|-------|-------------|
| `id` | Dot-namespaced capability, `quiz.view`. |
| `label`, `description` | Optional text for admin UIs. |
| `defaultRoles` | Role slugs granted this capability by `setRoles()` / `capabilitiesForRoles()`. |

### `navigation[]`

| Field | Description |
|-------|-------------|
| `id` | Dot-namespaced, unique across **all** extensions (`quiz.list`). |
| `label` | Text. |
| `path` | `/absolute/path` or an `http(s)` URL. Omit for a group heading. |
| `icon` | Free string; your menu component decides how to render it. |
| `order` | Integer, lower first. Default `0`. |
| `parent` | A host menu id (`sidebar`) or another navigation id. |
| `permission` | Requirement (see [chapter 5](./05-permissions.md)). |

### `slots[]`

| Field | Description |
|-------|-------------|
| `id` | Optional kebab-case id, unique inside the extension. Derived from the position when omitted. |
| `target` | Outlet name, dot-namespaced (`course.tabs`). |
| `component` | `./components/X.vue` (a path inside the extension) **or** a component name from its `components/` folder (`QuizTab`; nested `quiz/Tab.vue` → `QuizTab`). |
| `order` | Integer, lower first. |
| `permission` | Requirement. |
| `props` | Static JSON props merged under the outlet's runtime `context`. |

### `serverHooks[]`

| Field | Description |
|-------|-------------|
| `hook` | Colon-namespaced name, `quiz:score`. |
| `handler` | Path inside the extension, `./server/hooks/bonus-score.ts`. |
| `type` | `action` (default) or `filter`. |
| `order` | Integer, lower first. |

## Validation you get for free

- Duplicate permissions, navigation ids, slot ids, dependency entries or hook subscriptions inside one manifest.
- Navigation parent cycles.
- An extension depending on itself.
- Unresolvable component or handler references (with the list of available component names).
- Navigation id clashes between different extensions, and route clashes between extensions or with the host (warning:
  Nitro would silently serve only one).

Run the same checks outside a build with `npx nuxt-modular validate` ([chapter 10](./10-cli.md)).
