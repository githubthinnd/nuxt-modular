# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.0] - 2026-11-09

### Added

- **Standard extension layout.** `make:extension` and the guided setup now create one architecture: `shared/` types and
  validation, API controllers, `services/`, `repositories/` (SQL or Nitro storage), a composable, presentational
  components and a container page, with a README that explains the rules. New chapter 14 of the guide.
- `make:service`, `make:repository` and `make:composable` generate the matching layers; `make:extension --roles`.
- `composables/` and `utils/` of an extension are auto-imported in its pages and components.
- `nuxt-modular db`: choose or switch the database in one step: `modular.database` in `nuxt.config`, the connection URL
  in `.env` (kept out of git), `.env.example`, the driver, and the next steps. `init` asks for the connection URL too
  (`--database-url`, `--env-file`).
- Discoverable CLI: `nuxt-modular` lists every command grouped, `nuxt-modular help <command>` shows options and
  examples, `init` ends with a command cheat sheet and adds a `modular` script (`pnpm modular`).

## [1.1.1] - 2026-11-09

### Fixed

- `nuxt-modular init` no longer reports a failed driver install when the package manager added the package but exited
  with an error (pnpm does this when another dependency has unapproved build scripts); it checks `package.json` instead.

### Changed

- Release workflow: publishes with npm Trusted Publishing (no `NPM_TOKEN` secret), pins its actions by commit,
  uses the `next` dist-tag for pre-releases and creates the GitHub release from the changelog. Setup is in
  `PUBLISHING.md`.

## [1.1.0] - 2026-11-09

### Added

- **Guided setup**: `npx nuxi module add nuxt-modular` now asks a few questions right after installing (database, roles,
  starter extension, host shell, migrations and tasks) and writes a working host: the `modular` options in
  `nuxt.config`, a permissions plugin, an optional `app.vue` shell with a home page and outlet, and a starter extension
  (with a migration and a seeder when a database is chosen). A plain `npm install nuxt-modular` still changes nothing.
- `nuxt-modular init` (also `npx nuxt-modular init`): the same setup on demand, with `--yes`, `--database`, `--roles`,
  `--extension`, `--no-starter`, `--no-shell` and `--no-install` for scripts and CI. Existing files are never overwritten.
- The `nuxt-modular` package now ships the `nuxt-modular` command, so `npx nuxt-modular make:extension ...` works as soon
  as the module is installed. It depends on `@nuxt-modular/cli`.
- `make:extension` explains how to make the new extension visible (`defaultRoles`, the outlet, `init`).

### Fixed

- The module declares its version in its meta so Nuxt runs its install hook; it records the setup in `.nuxtrc`
  (ignored in the playground).

## [1.0.2] - 2026-11-09

### Changed

- Documentation: the `nuxt-modular` package README no longer uses emoji; the features list and the comparison table are
  plain text. The repository README has an overview, quick start and packages section.
- Tooling: `pnpm dev:prepare` also generates the module's `.nuxt` types, which fixes the Playwright E2E job on CI; the
  Release workflow skips versions that are already on npm.

No runtime changes. The three packages stay on the same version.

## [1.0.1] - 2026-11-09

First version published to npm, with the same content as 1.0.0. `1.0.0` was never published: the number is permanently
reserved on npm for `nuxt-modular` (a former owner's unpublished release), so all three packages moved to `1.0.1` to
keep their versions aligned.

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
