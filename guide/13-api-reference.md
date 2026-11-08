# 13. API reference

## Components

### `<PluginOutlet>`

See [chapter 4](./04-ui.md#outlets-pluginoutlet): props `name`, `context`, `wrapWith`, `itemTag`; slots `#empty`, `#fallback`.

## Composables (auto-imported in the app)

### `useModuleRegistry()`

| Member | Description |
|--------|-------------|
| `extensions` | `ComputedRef<ExtensionInfo[]>` sorted by id: `id`, `manifest`, `active`, `source` (`'build'`\|`'runtime'`), `persistedOverride`, `sessionOverride`, `missingDependencies`. |
| `getSlotComponents(outlet)` | Ordered, permission-checked `ResolvedSlot[]`. |
| `getNavigation(parent?)` | `NavigationNode[]` tree under a host menu id. |
| `isModuleActive(id)` | Effective activation. |
| `setModuleActive(id, active \| null)` | Session override; `null` clears it. |
| `register(manifest, options?)` | Runtime registration; returns `'registered'`, `'replaced'`, `'unchanged'` or `'skipped'`. |
| `unregister(id)` | Removes a runtime-registered extension. |
| `capabilitiesForRoles(roles)` | Capabilities derived from `defaultRoles`. |

### `useModularPermissions()`

`granted`, `set(caps)`, `setRoles(roles, extra?)`, `grant(...caps)`, `revoke(...caps)`, `can(requirement?)`.

### `useExtensionConfig(id)`

Returns `{ values, get(path, fallback?) }`: manifest `config` merged with `modular.config[id]`.

## Server utilities (auto-imported in Nitro)

### `useModularServerHooks()` → `HookBus`

`addAction(name, handler, { order?, owner? })`, `addFilter(...)`, `callHook(name, ...args)`, `applyFilter(name, value, ...rest)`,
`removeOwner(owner)`, `hasHook(name, type?)`, `listHooks()`.

### `useModularToggles()`

`enabled`, `getOverrides()`, `getInactive()`, `list()`, `set(id, active | null)`.

### `useModularMigrations()`

`status()`, `up({ extensions?, includeInactive? })`, `down(extensionId, steps = 1)`, `reset({ extensions? })`, `refresh({ extensions? })`.
Reports: `{ executed: [{ extensionId, name }], failed?: { extensionId, name, error } }`.

### `useModularSeeders()`

`list(options?)`, `run({ extensions?, names?, includeInactive? })`.

### `useModularDatabase()`

`Promise<{ db, dialect, prefix } | undefined>`.

### `useModularExtensionConfig(id)`

Server counterpart of `useExtensionConfig`.

## Helpers for extension code (`#modular`)

| Export | Use |
|--------|-----|
| `defineExtensionManifest(manifest)` | Validated manifest, default export of `manifest.ts`. |
| `defineFilterHandler<'hook'>(fn)` / `defineActionHandler<'hook'>(fn)` | Typed hook handlers. |
| `defineMigration({ up, down? })` | Migration. |
| `defineSeeder({ run })` | Seeder. |
| Types | `ExtensionManifest`, `NavigationNode`, `PermissionRequirement`, `MigrationContext`, `SeederContext`, `SqlDatabase`, `SqlDialect`, `ModularActions`, `ModularFilters`, … |

## Module hook (build time)

```ts
nuxt.hook('modular:extensions', (extensions) => { /* inspect or filter the scanned extensions */ })
```

## `@nuxt-modular/core`

Importable outside Nuxt. `@nuxt-modular/core/runtime` is the same minus Zod (for the browser);
`@nuxt-modular/core/node` is the Node-only scanner.

| Area | Exports |
|------|---------|
| Manifest | `defineExtensionManifest`, `parseManifest`, `validateManifest`, `ManifestValidationError`, Zod schemas (`ExtensionManifestSchema`, …) |
| Registry | `createRegistryState`, `registerExtension`, `unregisterExtension`, `isExtensionActive`, `listActiveExtensions`, `findMissingDependencies`, `resolveSlots`, `resolveNavigation`, `listOutlets`, `capabilitiesForRoles`, `slotKey`, `componentKey` |
| Permissions | `hasPermission`, `createPermissionChecker`, `allowAll`, `WILDCARD_PERMISSION` |
| Hooks | `createHookBus`, `defineActionHandler`, `defineFilterHandler` |
| Migrations | `defineMigration`, `runMigrationsUp`, `runMigrationsDown`, `runMigrationsReset`, `migrationStatus`, `sortByDependencies`, `createMemoryLedger` |
| Seeders | `defineSeeder`, `runSeeders`, `planSeeders` |
| SQL | `createSqlStores`, `normalizeDialect` |
| Compatibility | `satisfies`, `isValidRange`, `compareVersions`, `parseVersion`, `checkRequirements`, `findDependencyCycles` |
| Settings | `mergeConfig`, `getConfigValue` |

## Naming rules

| Kind | Pattern | Example |
|------|---------|---------|
| Extension id, role | kebab-case slug | `mod-quiz`, `teacher` |
| Capability, outlet, navigation id | dot-namespaced | `quiz.view`, `course.tabs` |
| Hook | colon-namespaced | `quiz:score` |
| Version | semver | `1.2.0-beta.1` |
| Navigation path | `/abs` or `http(s)://` | `/quiz` |
