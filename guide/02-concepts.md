# 2. Core concepts

## The model

```
┌──────────────────────────── Host (your Nuxt app) ────────────────────────────┐
│  layouts, pages, auth, router, <PluginOutlet name="…"> placeholders           │
│                                                                              │
│   ┌── extensions/quiz ──┐  ┌── extensions/analytics ──┐                      │
│   │ manifest.ts         │  │ manifest.ts              │   … any number       │
│   │ components, pages,  │  │ components, pages,       │                      │
│   │ plugins, server/    │  │ plugins, server/         │                      │
│   └─────────────────────┘  └──────────────────────────┘                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Term | Meaning |
|------|---------|
| **Host** | Your application. It owns layouts, authentication, the router and the outlets. |
| **Extension** | A self-contained folder under `extensions/` with a `manifest.ts`. It adds components, pages, navigation, plugins, API routes, hooks, migrations. |
| **Manifest** | A JSON-only description of what an extension contributes. Validated at build time. |
| **Outlet** | A named placeholder (`<PluginOutlet name="course.tabs" />`) in the host where extensions render components. |
| **Slot** | One component an extension registers for an outlet. |
| **Capability** | A permission string such as `quiz.view`, declared by extensions and checked against the viewer. |
| **Registry** | The runtime catalogue of manifests: which extensions exist, which are active, what each outlet shows. |
| **Hook bus** | A server-side event system (actions and filters) that lets extensions talk to each other and to the host. |

## What happens at build time

1. The module finds every `extensions/*/manifest.ts` in the app and its layers (the app wins on duplicate ids).
2. Each manifest is loaded and **validated** (Zod). Every problem is reported at once, with the file and the field.
3. Component and handler references (`'./components/QuizTab.vue'`, `'QuizTab'`) are resolved to real files. A reference
   that does not resolve fails the build.
4. Compatibility is checked: `requires` ranges, dependency cycles ([chapter 9](./09-toggles-and-compatibility.md)).
5. Extensions are ordered dependencies-first; their pages, plugins, components and `server/` directories are wired into
   Nuxt and Nitro.
6. Typed virtual modules are generated, so extension code is type-checked together with your app.

## What happens at runtime

- **Server render.** The registry decides, for every outlet, which components render: active extensions only,
  permission-checked, in a deterministic order. A crashing component is isolated; the rest of the page renders.
- **Hydration.** The client reaches the same decisions from the same inputs, so the DOM matches and Vue reports no
  hydration mismatch.
- **Requests.** Extension API routes and hooks run in Nitro. A switched-off extension answers `404` and its hooks are
  skipped.

## Why it is SSR-safe

Three rules make server and client agree:

1. **Manifests are plain JSON.** Components and handlers are *string references*, never functions, so the registry can
   travel inside the Nuxt payload.
2. **Ordering is deterministic.** Items sort by `order`, then extension id, then declaration index.
3. **Shared state lives in `useState`.** Permissions, activation overrides and persistent toggles are serialized with the
   page, so the browser never recomputes them differently.

## Activation

An extension is **active** when it is built, switched on and all of its dependencies are active. Precedence, strongest
first: session override → persistent toggle → `manifest.enabled`. Inactive extensions disappear from outlets and
navigation, their pages answer 404, their API routes answer 404 and their hooks are skipped
([chapter 9](./09-toggles-and-compatibility.md)).

## Trust model

Extensions are **trusted code**: they run with the same privileges as the host. nuxt-modular isolates *failures* (a
broken component or hook does not take the page down), not *malice*. Install only extensions you would be willing to
add to your own codebase. See the [security policy](https://github.com/githubthinnd/nuxt-modular/blob/master/SECURITY.md).

## Packages

| Package | Role |
|---------|------|
| `nuxt-modular` | The Nuxt module: scanning, wiring, `<PluginOutlet>`, composables, Nitro integration |
| `@nuxt-modular/core` | Framework-agnostic logic (schemas, registry, hook bus, migrations, SQL stores). Re-exported to extensions as `#modular` |
| `@nuxt-modular/cli` | Scaffolding and validation |

You normally install `nuxt-modular` (and the CLI as a dev dependency). `@nuxt-modular/core` is installed for you.
