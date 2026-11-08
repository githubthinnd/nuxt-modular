# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

### Changed

- Manifests are normalized with `requires` and `config` defaults.
- The scanner moved from `nuxt-modular` to `@nuxt-modular/core/node` (re-exported internally; no public API change).

## [0.1.0]

Initial release: outlets, navigation, permissions, pages, server routes, action/filter hook bus,
SSR-safe error boundaries, feature toggles, migrations and DevTools tab.
