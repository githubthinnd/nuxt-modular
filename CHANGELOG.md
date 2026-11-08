# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-11-08

First stable release of `nuxt-modular`, `@nuxt-modular/core` and `@nuxt-modular/cli`. It includes outlets and slots, navigation,
pages, permissions, SSR-safe error boundaries, the server hook bus, feature toggles, migrations and the Nuxt DevTools tab, plus:

### Added

- **Compatibility**: manifests accept `requires: { modular, extensions }` (semver ranges). The module fails the build
  when the host or a dependency version is not satisfied or when `dependsOn` has a cycle. Extensions are processed
  dependencies-first. Includes a dependency-free semver (`satisfies`, `isValidRange`, `compareVersions`).
- **Settings**: `manifest.config` defaults, `modular.config` overrides, `useExtensionConfig()` (app) and
  `useModularExtensionConfig()` (server).
- **Seeders**: `server/seeders/*`, `defineSeeder`, `useModularSeeders()`, `modular:seeder-context` filter.
- **Migrations**: `reset()` and `refresh()`.
- **Events**: `modular:extension-toggled` action when a persistent toggle changes.
- **Tasks**: opt-in Nitro tasks `modular:list|migrate|migrate:status|migrate:rollback|migrate:reset|migrate:refresh|seed`
  (`modular.tasks: true`).
- **CLI** `@nuxt-modular/cli`: `make:extension|component|page|api|hook|plugin|migration|seeder`, `list`, `validate`.
- `@nuxt-modular/core/node`: the extension scanner, shared by the module and the CLI.
- Repository hygiene: `CONTRIBUTING`, `SECURITY`, `CODE_OF_CONDUCT`, issue/PR templates, release workflow, Dependabot.

- **Databases**: `modular.database` (SQLite, PostgreSQL, MySQL/MariaDB through db0). Migration ledger, an atomic lock and
  toggles move to SQL tables; migrations and seeders receive a typed `db` and `dialect`; `useModularDatabase()`;
  `NUXT_MODULAR_DATABASE_URL`; custom `handler`; table `prefix`. Nitro storage stays the default.
- The store suite also runs on PostgreSQL itself on every test run, through PGlite (PostgreSQL compiled to WebAssembly).
- CI job running the store suite against real PostgreSQL, MySQL and MariaDB servers.

### Fixed

- Database connectors work with db0 0.3 and 0.4: for 0.4 the module resolves the driver (`pg`, `mysql2`, `@libsql/client`, `@electric-sql/pglite`, …) from the app and passes it as `lib`; a missing driver fails the build with the install command.
- The `libsql` connector pointed at a module that does not exist; it now loads `db0/connectors/libsql/node`.

### Changed

- Playground UI: top bar with breadcrumbs, light/dark theme switch (cookie, SSR-safe) and an extension X-ray overlay (`X`).
- Manifests are normalized with `requires` and `config` defaults.
- The scanner moved from `nuxt-modular` to `@nuxt-modular/core/node` (re-exported internally; no public API change).
