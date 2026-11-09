# Contributing

Thanks for helping improve nuxt-modular.

## Setup

```bash
pnpm install
pnpm dev            # playground on http://localhost:3000
pnpm check          # typecheck + unit tests + builds + SSR verification
pnpm test:e2e       # Playwright (run `pnpm --dir playground exec playwright install chromium` once)
```

Requires Node ≥ 22.12 and pnpm (see `packageManager`).

## Ground rules

- **Manifests stay JSON-serializable.** They travel through the SSR payload; no functions or component objects.
- **SSR and client must agree.** State goes through `useState`; ordering is deterministic.
- **Core stays framework-agnostic.** `@nuxt-modular/core` (and `/runtime`) must not import Vue, Nuxt or Node built-ins;
  Node-only code lives in `core/src/node.ts`. `/runtime` must not import Zod.
- **Strict TypeScript**, no `any`.
- **Every behaviour change ships with a test** (Vitest in each package; SSR assertions in `scripts/check-ssr.mjs`,
  browser behaviour in `playground/e2e`).
- Document user-facing changes in `CHANGELOG.md` under *Unreleased* and in the package README.

## Pull requests

1. Branch from `master`; keep the change focused.
2. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat(core): …`, `fix(nuxt): …`).
3. Run `pnpm check` before opening the PR; CI runs it again plus the E2E suite.
4. Describe the problem, the approach and how you verified it.

## Releasing (maintainers)

1. Move *Unreleased* in `CHANGELOG.md` under the new version and bump the versions in `packages/*/package.json`.
2. Publish by tagging `vX.Y.Z` on `master`: the `Release` workflow verifies, then publishes with npm Trusted Publishing
   and provenance. The one-time setup is described at the top of `.github/workflows/release.yml`. A version can only be
   published once, so never publish the same version by hand as well.
