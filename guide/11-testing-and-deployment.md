# 11. Testing and deployment

## Testing extensions

`@nuxt-modular/core` is plain TypeScript with no Nuxt dependency, so most logic is testable with Vitest alone.

```ts
import { createRegistryState, registerExtension, resolveSlots, createPermissionChecker, defineExtensionManifest } from '@nuxt-modular/core'
import { expect, it } from 'vitest'

it('shows the quiz tab only to students', () => {
  const state = createRegistryState([
    defineExtensionManifest({
      id: 'quiz', name: 'Quiz', version: '1.0.0',
      slots: [{ id: 'tab', target: 'course.tabs', component: 'QuizTab', permission: 'quiz.view' }],
    }),
  ])
  expect(resolveSlots(state, 'course.tabs', createPermissionChecker(['quiz.view'])).map((s) => s.key)).toEqual(['quiz/tab'])
  expect(resolveSlots(state, 'course.tabs', createPermissionChecker([]))).toEqual([])
})
```

| Subject | Tools |
|---------|-------|
| Manifests | `validateManifest()` returns `{ success, issues }` without throwing |
| Slots and navigation | `resolveSlots`, `resolveNavigation`, `isExtensionActive` over `createRegistryState` |
| Hook handlers | `createHookBus()` then `addFilter` / `applyFilter` |
| Migrations and seeders | `runMigrationsUp(...)`, `runSeeders(...)` with `createMemoryLedger()` and a fake context |
| SQL | `createSqlStores({ db })` over an in-memory SQLite |
| Whole extensions | `npx nuxt-modular validate` |

For end-to-end behaviour (hydration, toggles, real requests) use Playwright against a production build, as the
[playground](https://github.com/githubthinnd/nuxt-modular/tree/master/playground) does.

## Continuous integration

Minimum useful pipeline:

```yaml
- run: pnpm install --frozen-lockfile
- run: npx nuxt-modular validate --strict
- run: pnpm typecheck && pnpm test
- run: pnpm build
```

If your migrations target PostgreSQL or MySQL, run them in CI against a real server (a service container), with
`NUXT_MODULAR_DATABASE_URL` set. SQL that works on SQLite can still fail on another dialect.

## Production checklist

- [ ] **Database or persistent storage** configured. Without either, toggles and the migration ledger vanish on restart.
- [ ] **Database URL in the environment** (`NUXT_MODULAR_DATABASE_URL`), not in `nuxt.config.ts`.
- [ ] **Driver installed** (`pg`, `mysql2`, …) as a dependency of the deployed app.
- [ ] **Migrations strategy chosen**: `migrations.auto: true` for single-instance or database-backed setups, or run
      them as a deploy step. Back up before `reset`/`refresh`; never run those in production.
- [ ] **Authorization enforced on the server** for every extension API route, not only hidden in the UI.
- [ ] **Admin endpoints** for toggles protected by your own auth.
- [ ] **Only trusted extensions** installed (they run with full host privileges).
- [ ] **Extensions validated** in CI (`nuxt-modular validate --strict`).
- [ ] **Settings reviewed**: nothing secret in `config` (public).

## Deployment notes

- **Node server (`node-server` preset):** works as is. With several instances use `modular.database` so the migration
  lock is atomic and toggles are shared immediately.
- **Static generation (`nuxi generate`):** pages render once at build time, so role-dependent UI is baked in. Role-based
  slots and persistent toggles need per-request rendering (SSR) to be meaningful.
- **Serverless / edge:** local file storage and the `node-sqlite` connector are not available on most platforms. Use a
  network database (PostgreSQL, MySQL, libSQL/Turso) and check that your platform supports the driver.
- **Prerendering:** migrations never run during prerender; pages of inactive extensions answer 404, which makes
  `prerender.failOnError` fail if you link to them.
- **Containers:** mount or externalize storage; run migrations as a one-off job before rolling instances.

## Upgrading

The module follows [semantic versioning](https://semver.org): breaking changes only in major versions, new features in minor
versions, fixes in patches. Every release is described in the
[CHANGELOG](https://github.com/githubthinnd/nuxt-modular/blob/master/CHANGELOG.md). After upgrading run `npx nuxi prepare` and
`npx nuxt-modular validate`. The three packages (`nuxt-modular`, `@nuxt-modular/core`, `@nuxt-modular/cli`) are released
together with the same version number.
