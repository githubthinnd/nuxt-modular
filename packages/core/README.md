# @nuxt-modular/core

> Framework-agnostic core of [nuxt-modular](https://www.npmjs.com/package/nuxt-modular), the plugin and extension system for Nuxt:
> extension manifest schemas, a serializable registry, an action/filter hook bus, migration and seeder runners, SQL state stores
> (SQLite, PostgreSQL, MySQL), semver compatibility checks.

[![npm](https://img.shields.io/npm/v/@nuxt-modular/core?color=4f46e5)](https://www.npmjs.com/package/@nuxt-modular/core)
[![license](https://img.shields.io/npm/l/@nuxt-modular/core?color=4f46e5)](https://github.com/githubthinnd/nuxt-modular/blob/master/LICENSE)

```bash
npm install @nuxt-modular/core
```

Building blocks:

- `defineExtensionManifest`, `validateManifest`, `parseManifest` and the Zod schemas
- registry functions over a JSON-serializable state: `registerExtension`, `resolveSlots`,
  `resolveNavigation`, `isExtensionActive`, …
- permissions: `hasPermission`, `createPermissionChecker`
- an action/filter hook bus: `createHookBus`, `defineActionHandler`, `defineFilterHandler`
- a storage-agnostic migration runner: `defineMigration`, `runMigrationsUp`, `runMigrationsDown`,
  `migrationStatus`, `sortByDependencies`, `createMemoryLedger`
- `capabilitiesForRoles` to derive capabilities from manifests' `defaultRoles`
- `runMigrationsReset` (revert everything) and a seeder runner: `defineSeeder`, `runSeeders`, `planSeeders`
- compatibility: a dependency-free semver (`satisfies`, `isValidRange`, `compareVersions`) and
  `checkRequirements` / `findDependencyCycles` for `requires` and `dependsOn` diagnostics
- SQL state stores over a tiny db0-compatible interface: `createSqlStores` (migration ledger, atomic lock, toggles) on SQLite,
  MySQL and PostgreSQL, and `normalizeDialect`
- per-extension settings: `mergeConfig`, `getConfigValue`

`@nuxt-modular/core/runtime` exports everything except the Zod schemas and
validation, for code that ships to the browser.

`@nuxt-modular/core/node` is the Node-only scanner (`findExtensionDirs`, `scanExtension`) shared by
the Nuxt module and `@nuxt-modular/cli`. Never import it from browser code.

Nuxt users do not need to install this package: `nuxt-modular` exposes it as `#modular`.

Documentation: [User guide](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/README.md) · [API reference](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/13-api-reference.md) · MIT
