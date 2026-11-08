# 9. Enabling, disabling and compatibility

## Four ways to turn an extension off

| How | Scope | Effect |
|-----|-------|--------|
| `modular.disabled: ['id']` | **Build** | Removed from the build: no components, pages, plugins, routes or hooks, and not in the bundle. |
| `enabled: false` in the manifest | **Default** | Built but inactive until a toggle switches it on. |
| `useModularToggles().set(id, false)` | **Everyone, persistent** | Slots, navigation and pages disappear (pages answer 404), API routes answer 404, hooks are skipped. `null` restores the default. |
| `registry.setModuleActive(id, false)` | **This request or tab** | Hides slots, navigation and makes pages 404. Server routes and hooks are unaffected. |

**Precedence:** session override → persistent toggle → `manifest.enabled`. Then every `dependsOn` entry must be active
too, so switching an extension off also deactivates its dependents.

## Persistent toggles

Stored in the configured database (or Nitro storage) and visible to every visitor.

```ts
const toggles = useModularToggles()
await toggles.set('quiz', false)    // switch off for everyone
await toggles.set('quiz', null)     // follow the manifest default again
await toggles.list()                // [{ id, name, version, enabledByDefault, override, active, missingDependencies }]
```

The module deliberately ships **no admin endpoint**: write yours behind your own authorization.

```ts
// server/api/admin/extensions/[id].put.ts
export default defineEventHandler(async (event) => {
  await requireAdmin(event)                                   // your check
  const { active } = await readBody<{ active: boolean | null }>(event)
  await useModularToggles().set(getRouterParam(event, 'id')!, active)
  return useModularToggles().list()
})
```

With Nitro storage, other server instances pick a change up within `toggles.ttl` ms; with a database, immediately.
After a change the *rendered* UI of already-open tabs updates on their next navigation or reload.

React to changes with the `modular:extension-toggled` action ([chapter 6](./06-server.md)).

## Dependencies

```ts
dependsOn: ['core'],
```

- A dependent is active only when its dependencies are active.
- A dependency that is **not installed** (or was removed with `disabled`) only produces a warning; the dependent stays
  inactive.
- A **dependency cycle** fails the build, listing every member.
- Extensions are processed **dependencies first**: their plugins register earlier and their migrations run earlier.

## Version compatibility

```ts
requires: {
  modular: '^0.1.0',                // nuxt-modular versions this extension supports
  extensions: { core: '^2.0.0' },   // ranges for dependencies (each must be in dependsOn)
}
```

Ranges use semver syntax: `^1.2.0`, `~1.2.0`, `>=1 <3`, `1.x`, `1.2.3 - 2.0.0`, `^1 || ^2`. Pre-release versions only
match when the range itself names the same `major.minor.patch` pre-release, as in npm.

If the host or a dependency does not satisfy a range, **the build fails** with every problem listed:

```
[nuxt-modular] Incompatible extensions:
  - Extension "quiz" requires nuxt-modular ^2.0.0, but 0.1.0 is installed
  - Extension "grading" requires "quiz" ^3.0.0, but 1.2.0 is installed
```

Check without building: `npx nuxt-modular validate`.

## Choosing the right switch

- Shipping a build without a feature at all (smaller bundle, nothing exposed): **`disabled`**.
- A feature that is installed but off until you decide: **`enabled: false`** plus a persistent toggle.
- A feature flag an admin flips live: **persistent toggle**.
- A per-user preview or A/B experiment: **session override** (`setModuleActive`) from your own plugin.
