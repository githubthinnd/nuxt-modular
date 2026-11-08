# 8. Configuration

## Module options

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-modular'],
  modular: {
    extensionsDir: 'extensions',
    disabled: [],
    devtools: true,
    storage: 'nuxt-modular',
    toggles: { enabled: true, ttl: 1000 },
    migrations: { auto: false },
    database: false,
    config: {},
    tasks: false,
  },
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `extensionsDir` | `'extensions'` | Directory, relative to the app root and every layer, whose sub-directories are extensions. |
| `disabled` | `[]` | Extension ids removed from the build entirely: no components, pages, plugins, routes or hooks. |
| `devtools` | `true` | "Extensions" tab in Nuxt DevTools (development only). |
| `storage` | `'nuxt-modular'` | Nitro storage mount for toggles and the migration ledger when no database is configured. |
| `toggles` | `{ enabled: true, ttl: 1000 }` | Persistent toggles; `ttl` caches stored toggles per server process (ms). |
| `migrations` | `{ auto: false }` | `auto` runs pending migrations at server start. |
| `database` | `false` | SQL database; see [chapter 7](./07-data.md). |
| `config` | `{}` | Per-extension setting overrides, see below. |
| `tasks` | `false` | Registers the `modular:*` Nitro tasks. |

### Nitro storage

Without a database, give the mount a persistent driver, because Nitro's default is memory (state is lost on restart):

```ts
nitro: { storage: { 'nuxt-modular': { driver: 'fs', base: './.data/modular' } } }
```

On serverless platforms use a network driver (Redis, KV, …) or, better, `modular.database`.

## Per-extension settings

An extension ships defaults; the host overrides them without touching the extension.

```ts
// extensions/quiz/manifest.ts
config: { passingScore: 60, limits: { maxQuestions: 20 } }
```
```ts
// nuxt.config.ts: override per environment
modular: { config: { quiz: { limits: { maxQuestions: 50 } } } }
```
```bash
# or at runtime, for keys you declared in nuxt.config (Nuxt only maps existing keys; camelCase becomes SNAKE_CASE)
NUXT_PUBLIC_MODULAR_CONFIG_QUIZ_PASSING_SCORE=70
```

Read them:

```ts
// components, pages, plugins
const quiz = useExtensionConfig('quiz')
quiz.get('limits.maxQuestions', 20)        // dotted path with a fallback
quiz.values                                 // the merged object

// server routes and hook handlers
const { get } = useModularExtensionConfig('quiz')
```

Objects merge deeply; arrays and scalars replace. An unknown extension id throws, which catches typos early.

> **Settings are public.** They ship to the browser with the page. Never store secrets in them; use `runtimeConfig`.

## Environment variables

| Variable | Effect |
|----------|--------|
| `NUXT_MODULAR_DATABASE_URL` | Database connection URL (runtime). |
| `NUXT_MODULAR_MIGRATIONS_AUTO` | `true` / `false`: run migrations at start. |
| `NUXT_MODULAR_STORAGE` | Storage mount name. |
| `NUXT_MODULAR_TOGGLES_ENABLED`, `NUXT_MODULAR_TOGGLES_TTL` | Toggle behaviour. |
| `NUXT_PUBLIC_MODULAR_CONFIG_<ID>_<KEY>` | Override a setting that is declared in `modular.config` (e.g. `…_QUIZ_PASSING_SCORE`). |

`modular.disabled` is a build-time option. If you want an environment variable for it, read your own in
`nuxt.config.ts`:

```ts
const disabled = (process.env.MY_DISABLED_EXTENSIONS ?? '').split(',').filter(Boolean)
export default defineNuxtConfig({ modular: { disabled } })
```

## Layers

Extensions can ship in Nuxt layers: each layer's `extensionsDir` is scanned. When an app and a layer both define an
extension with the same id, the app's version is used and the override is logged.

## TypeScript

The module generates types for `#modular` (manifest and hook types, `defineMigration`, `defineSeeder`, …), the virtual
server modules, and includes extension sources in the type-check. Run `npx nuxi prepare` after adding an extension if
your editor has not picked them up.
