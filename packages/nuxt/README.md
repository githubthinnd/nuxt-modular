<h1 align="center">nuxt-modular</h1>

<p align="center"><strong>A plugin and extension system for Nuxt.</strong><br>
Build a modular, extensible Nuxt app: drop in extensions that add UI, pages, API routes, permissions, hooks and database migrations,
without editing your templates and without hydration mismatches.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nuxt-modular"><img alt="npm version" src="https://img.shields.io/npm/v/nuxt-modular?color=4f46e5&label=npm"></a>
  <a href="https://www.npmjs.com/package/nuxt-modular"><img alt="npm downloads" src="https://img.shields.io/npm/dm/nuxt-modular?color=4f46e5"></a>
  <a href="https://github.com/githubthinnd/nuxt-modular/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/githubthinnd/nuxt-modular/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/githubthinnd/nuxt-modular/blob/master/LICENSE"><img alt="license" src="https://img.shields.io/npm/l/nuxt-modular?color=4f46e5"></a>
  <img alt="Nuxt 3.13+ and 4" src="https://img.shields.io/badge/Nuxt-3.13%2B%20%7C%204-00dc82">
</p>

<p align="center"><img src="https://raw.githubusercontent.com/githubthinnd/nuxt-modular/master/assets/demo.gif" alt="nuxt-modular demo: outlets, role-based navigation, a quiz extension and a live feature toggle" width="820"></p>

## What is nuxt-modular?

`nuxt-modular` is a [Nuxt module](https://nuxt.com/modules) that turns a Nuxt application into an **extensible host platform**,
in the spirit of [Laravel Modules](https://github.com/nWidart/laravel-modules) and WordPress plugins, but typed, SSR-safe and built for
the Vue ecosystem. Teams ship features as self-contained **extensions** (a folder with a `manifest.ts`); the host decides where
they appear with **outlets** and who may see them with **permissions**.

## Features

| Capability | What you get |
|------------|--------------|
| **Outlets and slots** | Place `<PluginOutlet name="course.tabs" />` in the host; extensions contribute components to it. |
| **Navigation, pages, plugins** | Extensions add menu entries, routes and Nuxt plugins. |
| **Permissions** | Capability-based gating (`anyOf` / `allOf`), identical on server and client. |
| **Failure isolation** | A crashing extension renders a fallback; the rest of the page still renders, also during SSR. |
| **Hydration safety** | Deterministic ordering and serializable state, so there is no hydration mismatch. |
| **Full-stack extensions** | An extension's `server/` folder becomes Nitro routes; an action/filter hook bus connects extensions. |
| **Feature toggles** | Switch an extension off for everyone at runtime, or remove it from the build. |
| **Databases** | SQLite, PostgreSQL and MySQL/MariaDB with ordered migrations, seeders, an atomic lock and a typed `db`. |
| **Settings and compatibility** | Per-extension config, semver `requires` and a dependency graph with cycle detection. |
| **Tooling** | Scaffolding CLI (`make:extension`, `validate`), Nitro tasks, a Nuxt DevTools tab and strict TypeScript types. |

## Quick start

Inside a Nuxt project (to start one: `npx nuxi@latest init my-app`):

```bash
npx nuxi module add nuxt-modular
```

This installs the module, registers it and asks a few questions (database, roles, a starter extension, a host shell).
Press Enter to accept the defaults and you get a working app: a menu, a home page with an outlet, and a starter
extension in the standard layout (controllers, service, repository, composable, components, page and, with a database,
a migration and a seeder). Run the same setup later with `npx nuxt-modular init`, change the database with
`npx nuxt-modular db`, and list every command by running `npx nuxt-modular`.

Prefer to wire it up yourself? A plain `pnpm add nuxt-modular` changes nothing; register the module and you are set:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-modular'],
})
```

Create an extension (or run `npx nuxt-modular make:extension quiz`):

```ts
// extensions/quiz/manifest.ts
import { defineExtensionManifest } from '#modular'

export default defineExtensionManifest({
  id: 'quiz',
  name: 'Quiz',
  version: '1.0.0',
  permissions: [{ id: 'quiz.view', defaultRoles: ['student'] }],
  navigation: [{ id: 'quiz', label: 'Quizzes', path: '/quiz', parent: 'sidebar', permission: 'quiz.view' }],
  slots: [{ target: 'course.tabs', component: './components/QuizTab.vue', permission: 'quiz.view' }],
  serverHooks: [{ hook: 'quiz:score', handler: './server/hooks/bonus-score.ts', type: 'filter' }],
})
```

Give the host a place for it, and tell the module who the viewer is:

```vue
<!-- any page or layout -->
<PluginOutlet name="course.tabs" :context="{ courseId }" />
```
```ts
// app/plugins/permissions.ts
export default defineNuxtPlugin(() => useModularPermissions().setRoles(['student']))
```

That is it: the tab renders for students, hidden for everyone else; `pages/`, `server/api/`, `plugins/` and `components/`
inside the extension are wired in automatically. Full walkthrough: **[Getting started](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/01-getting-started.md)**.

## Databases and migrations

```ts
modular: { database: 'postgresql://user:pass@host/db' }   // or 'mysql://…' or 'sqlite:./modular.db'
```

```ts
// extensions/quiz/server/migrations/001-create-attempts.ts
import { defineMigration } from '#modular'

export default defineMigration({
  async up({ db }) { await db.exec('CREATE TABLE IF NOT EXISTS quiz_attempts (id VARCHAR(64) NOT NULL PRIMARY KEY, score INT NOT NULL)') },
  async down({ db }) { await db.exec('DROP TABLE IF EXISTS quiz_attempts') },
})
```

Migrations run in dependency order, are tracked in a ledger, and are guarded by an atomic lock so several instances can start safely.
Put the URL in `NUXT_MODULAR_DATABASE_URL` for production. See **[Databases, migrations, seeders](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/07-data.md)**.

## Documentation

| | |
|---|---|
| [Getting started](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/01-getting-started.md) | Install and build your first extension |
| [Core concepts](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/02-concepts.md) | Host, extension, manifest, outlet, registry |
| [Writing extensions](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/03-extensions.md) | Layout and the full manifest reference |
| [User interface](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/04-ui.md) | Outlets, navigation, pages, error isolation |
| [Permissions](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/05-permissions.md) | Capabilities and roles |
| [Server features](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/06-server.md) | API routes, hook bus, events |
| [Data](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/07-data.md) | SQLite, PostgreSQL, MySQL, migrations, seeders, tasks |
| [Configuration](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/08-configuration.md) | Options, settings, environment variables |
| [Toggles and compatibility](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/09-toggles-and-compatibility.md) | Feature flags, dependencies, semver |
| [CLI](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/10-cli.md) | `make:*`, `list`, `validate` |
| [Testing and deployment](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/11-testing-and-deployment.md) | Tests, CI, production checklist |
| [Troubleshooting and FAQ](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/12-troubleshooting.md) | Symptoms and fixes |
| [API reference](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/13-api-reference.md) | Composables, utilities, exports |

## How it compares

| | nuxt-modular | Nuxt layers | Nuxt modules | Micro-frontends |
|---|:---:|:---:|:---:|:---:|
| Add features without editing host templates | Yes (outlets) | Partial (file overrides) | Partial (build time only) | Yes |
| Runtime activation (feature flags) | Yes | No | No | Yes |
| Permission-gated UI, SSR-consistent | Yes | No | No | Partial |
| Crash isolation per extension | Yes | No | No | Yes |
| Migrations, seeders, server hook bus | Yes | No | No | No |
| One build, one Vue app, full SSR | Yes | Yes | Yes | No |

nuxt-modular complements layers: extensions can ship inside a layer or an npm package. It is not a micro-frontend system:
extensions are compiled into the host build, which is what makes SSR and hydration reliable.

## Requirements

Nuxt ≥ 3.13 (tested with Nuxt 4.6) · Node.js ≥ 22.12. SQLite works without a driver on Node ≥ 22.5; install `pg` or `mysql2`
for PostgreSQL or MySQL/MariaDB.

## Packages

| Package | Purpose |
|---------|---------|
| [`nuxt-modular`](https://www.npmjs.com/package/nuxt-modular) | The Nuxt module |
| [`@nuxt-modular/cli`](https://www.npmjs.com/package/@nuxt-modular/cli) | Scaffolding and validation |
| [`@nuxt-modular/core`](https://www.npmjs.com/package/@nuxt-modular/core) | Framework-agnostic core (schemas, registry, hook bus, migrations) |

## FAQ

**Does nuxt-modular work with Nuxt 3 and Nuxt 4?** Yes: Nuxt 3.13 and newer.

**Is it safe to run third-party extensions?** Extensions are trusted code with full host privileges. The module isolates
*failures*, not malicious code. See the [security policy](https://github.com/githubthinnd/nuxt-modular/blob/master/SECURITY.md).

**Can extensions come from npm packages?** Yes, through Nuxt layers.

**Which databases are supported?** SQLite, PostgreSQL and MySQL/MariaDB (via [db0](https://db0.unjs.io)); Nitro storage if you configure none.

More answers: [Troubleshooting and FAQ](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/12-troubleshooting.md).

## Contributing

Issues and pull requests are welcome: see [CONTRIBUTING](https://github.com/githubthinnd/nuxt-modular/blob/master/CONTRIBUTING.md).
Report vulnerabilities privately ([SECURITY](https://github.com/githubthinnd/nuxt-modular/blob/master/SECURITY.md)).

## License

[MIT](https://github.com/githubthinnd/nuxt-modular/blob/master/LICENSE) © Nhữ Duy Thìn
