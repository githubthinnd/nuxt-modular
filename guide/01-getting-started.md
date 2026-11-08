# 1. Getting started

## Requirements

- Nuxt **3.13 or newer** (developed and tested with Nuxt 4.6)
- Node.js **22.12 or newer**
- A package manager: pnpm, npm or yarn

## Install

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
(and of every Nuxt layer).

## Create your first extension

Use the CLI (recommended) or create the files by hand.

```bash
pnpm add -D @nuxt-modular/cli
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
