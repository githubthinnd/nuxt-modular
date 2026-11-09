# 1. Getting started

## Requirements

- Nuxt **3.13 or newer** (developed and tested with Nuxt 4.6)
- Node.js **22.12 or newer**
- A package manager: pnpm, npm or yarn

## The short path

```bash
npx nuxi@latest init my-app --template=minimal --packageManager=pnpm
cd my-app
npx nuxi module add nuxt-modular        # answer a few questions, or press Enter for the defaults
pnpm dev
```

Choose the **minimal** template; the *module* template is for writing Nuxt modules, not apps. Run every command from
the project folder (`my-app`), not from its parent.

When `pnpm dev` is up, open the address Nuxt prints and check three things:

1. The header shows a menu entry for **Hello** (built from the starter extension's `navigation`).
2. The home page shows a card from the extension (it renders in the `dashboard.widgets` outlet).
3. `/hello` has a form. Add an item, try the same title again (the service answers `409`), leave it empty (the form
   shows the message before sending), remove an item.

If one of them is missing, see [Troubleshooting](./12-troubleshooting.md#setup-and-command-line).

### Where things live

| What | Where |
|------|-------|
| Which database | `modular.database` in `nuxt.config.ts` (change it with `npx nuxt-modular db`) |
| Database connection URL | `NUXT_MODULAR_DATABASE_URL` in `.env` (copy `.env.example`) |
| Who the visitor is (roles) | `app/plugins/modular-permissions.ts` |
| The menu and the outlets | `app/app.vue` and your pages (`<PluginOutlet name="..." />`) |
| Your extensions | `extensions/<id>/`, each described by its `manifest.ts` |
| Every command | `npx nuxt-modular` (or `pnpm modular`) |

## Install

There are two ways: a guided setup that builds a working host for you, or a manual install where you wire things up
yourself.

### Guided setup

Run it inside a Nuxt project. To start from scratch, create one first:

```bash
npx nuxi@latest init my-app
cd my-app
```

Then:

```bash
npx nuxi module add nuxt-modular
```

`nuxi` installs the module and registers it in `nuxt.config.ts`; nuxt-modular then asks a few questions and writes
the files. Every question has a default, so pressing Enter all the way gives a working app.

| Question | What it decides |
|----------|-----------------|
| Where should extensions live? | The extensions directory (default `extensions`). |
| Which database? | SQLite (zero setup), PostgreSQL, MySQL/MariaDB, or none. Adds `modular.database`; the driver (`pg`, `mysql2`) is installed for you. |
| Connection URL? | PostgreSQL and MySQL only. Written to `.env` as `NUXT_MODULAR_DATABASE_URL` (never to `nuxt.config.ts`); leave it empty to fill in later. Change the database any time with `npx nuxt-modular db`. |
| Which roles does your app have? | The roles granted to the starter extension, and the choices for the next question. |
| Which role should the visitor have while developing? | The role set by the generated permissions plugin. |
| Create a starter extension? | A complete extension in the [standard layout](./14-architecture.md): shared types, API controllers, service, repository, composable, components and a page; with a database also a migration and a seeder. |
| Generate a host shell? | `app.vue` with a menu built from the extensions' navigation, and a home page with an outlet. Only offered when `app.vue` is still the default Nuxt welcome page. |
| Run migrations at startup? Register Nitro tasks? | `modular.migrations.auto` and `modular.tasks` (only with a database). |

The setup also adds the `modular`, `modular:list` and `modular:validate` scripts to `package.json`; run `pnpm modular`
to see every command the CLI offers. Nothing that already exists is
overwritten: existing files are kept, and an `app.vue` you changed is left alone. When `nuxt.config.ts` has an unusual
shape and cannot be edited safely, the setup prints the lines to add instead.

Start the app (`pnpm dev`) and you have a menu, a card on the home page, a page at `/hello` and an API at
`/api/hello/...`.

Run the same setup at any time, with or without questions:

```bash
npx nuxt-modular init                       # asks the questions
npx nuxt-modular init --yes                 # accepts the defaults (also works without a terminal)
npx nuxt-modular init --yes --database postgresql --roles admin,editor --extension blog --no-shell
```

The questions appear once per project, right after `nuxi module add`. They are never asked in CI or without a
terminal, and `NUXT_MODULAR_INIT=0` turns them off. Declining them is fine: `nuxt-modular init` is always available.

### Manual setup

A plain install changes nothing in your project; you configure it yourself:

```bash
pnpm add nuxt-modular
```

Register the module:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-modular'],
})
```

That is the whole setup. With no options, extensions are read from an `extensions/` folder at the root of your app
(and of every Nuxt layer). The rest of this page shows what the guided setup would have created.

## Create your first extension

Use the CLI (recommended) or create the files by hand. The CLI is available as `npx nuxt-modular` as soon as the
module is installed.

```bash
npx nuxt-modular make:extension hello
```

This creates:

```
extensions/hello/
  manifest.ts                      what the extension contributes
  README.md
  components/HelloWidget.vue       a component shown in an outlet
  pages/hello/index.vue            a page at /hello
  server/api/hello/ping.get.ts     GET /api/hello/ping
```

The manifest ties them together:

```ts
// extensions/hello/manifest.ts
import { defineExtensionManifest } from '#modular'

export default defineExtensionManifest({
  id: 'hello',
  name: 'Hello',
  version: '0.1.0',
  permissions: [{ id: 'hello.view', defaultRoles: [] }],
  navigation: [{ id: 'hello', label: 'Hello', path: '/hello', parent: 'sidebar', permission: 'hello.view' }],
  slots: [{ id: 'widget', target: 'dashboard.widgets', component: 'HelloWidget', permission: 'hello.view' }],
})
```

## Give the host a place to show it

An extension renders into **outlets** that your app declares. Put one in any page or layout:

```vue
<!-- app/pages/index.vue -->
<template>
  <h1>Dashboard</h1>
  <PluginOutlet name="dashboard.widgets" />
</template>
```

And render the extension's navigation entries where you want a menu:

```vue
<script setup lang="ts">
const registry = useModuleRegistry()
const menu = computed(() => registry.getNavigation('sidebar'))
</script>
```

## Decide who may see it

Extension content is hidden until the viewer holds the capability it requires. Grant capabilities from your session
data, for example in a plugin:

```ts
// app/plugins/permissions.ts
export default defineNuxtPlugin(() => {
  const user = useCookie('role')            // your own auth source
  useModularPermissions().setRoles([user.value ?? 'guest'])
})
```

For quick experiments grant everything: `useModularPermissions().set(['*'])`.

## Run it

```bash
pnpm dev
```

Open the app: the widget appears inside `dashboard.widgets`, the menu entry appears in `sidebar`, `/hello` renders the
page and `/api/hello/ping` answers. Edit `manifest.ts` and Nuxt restarts automatically; edit components, pages and
server files and they hot-reload as usual.

> Open **Nuxt DevTools** and pick the **Extensions** tab to see every extension, slot, page, hook and permission the
> module found.

## Where next

- Understand the moving parts: [Core concepts](./02-concepts.md)
- Everything a manifest can declare: [Writing extensions](./03-extensions.md)
- Store data: [Databases, migrations, seeders](./07-data.md)
