<h1 align="center">nuxt-modular</h1>

<p align="center"><strong>A plugin and extension system for Nuxt.</strong><br>
Build modular, extensible Nuxt apps with outlets, permissions, feature toggles, hooks and database migrations
(SQLite, PostgreSQL, MySQL).</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nuxt-modular"><img alt="npm version" src="https://img.shields.io/npm/v/nuxt-modular?color=4f46e5&label=npm"></a>
  <a href="https://github.com/githubthinnd/nuxt-modular/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/githubthinnd/nuxt-modular/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/npm/l/nuxt-modular?color=4f46e5"></a>
  <img alt="Nuxt 3.13+ and 4" src="https://img.shields.io/badge/Nuxt-3.13%2B%20%7C%204-00dc82">
</p>

<p align="center">
  <a href="./guide/README.md">Documentation</a> ·
  <a href="./guide/01-getting-started.md">Getting started</a> ·
  <a href="./CHANGELOG.md">Changelog</a> ·
  <a href="./CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <img src="./assets/demo.gif" alt="Playground demo: X-ray of extension contributions, role-based navigation, a quiz scored by a server filter hook with settings, and an extension switched off at runtime" width="860">
</p>

<p align="center"><sub>The playground: press <kbd>X</kbd> to outline what each extension contributes, switch roles to change navigation and slots,
take the quiz (a server filter hook adds a bonus configured in the manifest), then switch an extension off and watch its UI disappear.</sub></p>

## Overview

`nuxt-modular` turns a Nuxt application into an extensible host platform. Teams ship features as self-contained
**extensions** (a folder with a `manifest.ts`). The host decides where they appear with **outlets** and who may see them
with **permissions**. Extensions can add UI, pages, API routes, hooks, settings and database migrations, are isolated
from each other's failures, and render consistently on the server and the client.

## Quick start

Inside a Nuxt project (to start one: `npx nuxi@latest init my-app`):

```bash
npx nuxi module add nuxt-modular
```

The module is installed and registered, then a short guided setup asks about the database, roles, a starter
extension and a host shell, and writes a working app. Press Enter to accept the defaults. Run it again at any time
with `npx nuxt-modular init`.

A plain `pnpm add nuxt-modular` changes nothing in your project. Register the module yourself:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-modular'],
})
```

```bash
npx nuxt-modular make:extension quiz
```

Place an outlet in the host where extensions may contribute UI:

```vue
<PluginOutlet name="course.tabs" :context="{ courseId }" />
```

The full walkthrough is in [Getting started](./guide/01-getting-started.md).

## Packages

| Package | Directory | Purpose |
|---------|-----------|---------|
| [`nuxt-modular`](https://www.npmjs.com/package/nuxt-modular) | [`packages/nuxt`](./packages/nuxt) | The Nuxt module, runtime composables, `<PluginOutlet>`, Nitro integration and tasks |
| [`@nuxt-modular/core`](https://www.npmjs.com/package/@nuxt-modular/core) | [`packages/core`](./packages/core) | Framework-agnostic manifest schemas, registry, permissions, hook bus, migrations, seeders, semver and scanner |
| [`@nuxt-modular/cli`](https://www.npmjs.com/package/@nuxt-modular/cli) | [`packages/cli`](./packages/cli) | `nuxt-modular make:*`, `list` and `validate` |
| `playground` | [`playground`](./playground) | Host app with the `quiz`, `analytics-banner` and `broken-widget` extensions |

## Documentation

- [User guide](./guide/README.md): concepts, writing extensions, UI, permissions, server features, data, configuration, CLI
- [Module overview](./packages/nuxt/README.md) and [CLI reference](./packages/cli/README.md)
- [API reference](./guide/13-api-reference.md)
- [Changelog](./CHANGELOG.md), [Contributing](./CONTRIBUTING.md), [Security policy](./SECURITY.md)

## Development

Requires Node.js 22.12 or newer and pnpm.

```bash
pnpm install
pnpm dev          # playground on http://localhost:3000
pnpm check        # typecheck + unit tests + builds + SSR verification
```

| Script | What it does |
|--------|--------------|
| `pnpm build` | Builds `@nuxt-modular/core`, then `nuxt-modular` and `@nuxt-modular/cli` |
| `pnpm typecheck` | `tsc` for core, `vue-tsc` for the module and the playground |
| `pnpm test` | Vitest: manifest, registry and hook bus (core), CLI generators, scanner and SSR to hydration boundary tests (nuxt) |
| `pnpm verify:ssr` | `nuxi generate` the playground three times (all extensions, build-time removal, persistent toggle) and assert on HTML, payloads, routes and bundles (`scripts/check-ssr.mjs`) |
| `pnpm test:e2e` | Playwright against a production build: hydration warnings, roles, toggles, quiz flow, migrations (`playground/e2e`). Run `pnpm --dir playground exec playwright install chromium` once |
| `pnpm verify:sandbox` | Same checks for environments where `pnpm install` or local ports are blocked (`scripts/sandbox-verify.mjs`) |

### Playground

Switch the role in the sidebar to see permission-gated slots and navigation. Toggle extensions for your tab on the
dashboard, persist toggles for everyone as `admin`, and remove extensions at build time with
`NUXT_MODULAR_DISABLED=analytics-banner,broken-widget pnpm dev`. Playground data (toggles, migration ledger) lives in
`playground/.data`.

### Continuous integration

`.github/workflows/ci.yml` runs `pnpm check`, the database integration jobs and the E2E suite, and needs a committed,
complete `pnpm-lock.yaml`. Releases are described in [PUBLISHING.md](./PUBLISHING.md).

## License

[MIT](./LICENSE) © Nhữ Duy Thìn
