# Publishing to npm (manual)

Three packages are published together, always with the same version:

| Order | Package | Directory |
|-------|---------|-----------|
| 1 | `@nuxt-modular/core` | `packages/core` |
| 2 | `nuxt-modular` | `packages/nuxt` |
| 2 | `@nuxt-modular/cli` | `packages/cli` |

`nuxt-modular` and `@nuxt-modular/cli` depend on `@nuxt-modular/core`, so **core goes first**.

> Use **either** this manual process **or** the `Release` GitHub workflow for one version, never both: npm refuses to
> publish a version twice, so the second attempt fails.

## 0. One-time setup

1. Create an npm account and enable **two-factor authentication** (Account → Security; choose "Authorization and publishing").
2. Create the scope. `@nuxt-modular/...` needs an npm **organization** named `nuxt-modular`
   (npmjs.com → profile → *Add Organization*; the free plan is enough for public packages).
3. Check the names are free (a `404` means available):
   ```bash
   npm view nuxt-modular
   npm view @nuxt-modular/core
   npm view @nuxt-modular/cli
   ```
4. Log in and confirm who you are:
   ```bash
   npm login
   npm whoami
   ```

## 1. Prepare the release

```bash
git checkout master && git pull          # release from master (merge your branch first)
git status                               # must be clean
pnpm install --frozen-lockfile
pnpm check                               # typecheck + tests + builds + SSR checks
```

Make sure the version in all three `packages/*/package.json` is the one you intend, and that `CHANGELOG.md` has a section
for it.

## 2. Inspect what will be published

```bash
for p in core nuxt cli; do (cd packages/$p && pnpm pack --pack-destination /tmp/pack-check); done
for t in /tmp/pack-check/*.tgz; do echo "== $t"; tar -xOf "$t" package/package.json | grep -E 'workspace|catalog'; done
```

The `grep` must print **nothing**: pnpm rewrites `workspace:*` and `catalog:` to real versions only when it packs or
publishes. Never publish with `npm publish` from inside `packages/*`, it would leave `workspace:*` in place and break
installs.

Optional full rehearsal (uploads nothing):

```bash
pnpm -r --filter "./packages/**" publish --dry-run --no-git-checks
```

## 3. Publish

From the repository root, in this order. Each command asks for your one-time password (or add `--otp=123456`).

```bash
cd packages/core  && pnpm publish --access public && cd ../..
cd packages/nuxt  && pnpm publish --access public && cd ../..
cd packages/cli   && pnpm publish --access public && cd ../..
```

Notes:

- If you are not on `master` with a clean tree, pnpm refuses; fix that, or add `--no-git-checks` knowingly.
- **Provenance** (`--provenance`) only works from CI. Manual publishes have none; use the workflow when you want it.
- First time on a pre-release? Publish a candidate under a tag so it is not `latest`:
  `pnpm publish --access public --tag next` (version `1.0.0-rc.1`).

## 4. Verify

```bash
npm view nuxt-modular version dist-tags
npm view @nuxt-modular/core version
npm view @nuxt-modular/cli version
```

Then try it in a clean project:

```bash
npx nuxi init /tmp/try-modular && cd /tmp/try-modular
pnpm add nuxt-modular && pnpm add -D @nuxt-modular/cli
npx nuxt-modular make:extension hello
pnpm dev
```

The package pages appear on npmjs.com within a minute (the README renders there; the badges need a published package).

## 5. Tag the release

```bash
git tag v1.0.0
git push origin master --tags
```

> Pushing a `v*` tag triggers `.github/workflows/release.yml`, which tries to publish again and **fails** because the
> versions already exist (harmless). To avoid the red run, tag and create the GitHub release only after you disable the
> workflow, or use the workflow instead of manual publishing for the next version.

Create the GitHub release from the tag and paste the matching `CHANGELOG.md` section.

## 6. If something goes wrong

| Situation | Action |
|-----------|--------|
| Published the wrong content within 72 hours | `npm unpublish nuxt-modular@1.0.0` (allowed only in this window, and only if nothing depends on it) |
| Later than that | Publish a fixed patch (`1.0.1`) and `npm deprecate nuxt-modular@1.0.0 "use 1.0.1"` |
| `E403` on a scoped package | The `nuxt-modular` organization does not exist or you are not a member with publish rights |
| `E402` payment required | Scoped packages are private by default: pass `--access public` (it is also set in `publishConfig`) |
| `EOTP` | The one-time password expired or is missing: run again with a fresh `--otp` |
| Published core but not the others | Run the remaining two commands; versions are independent per package |

Versions are immutable: a number can never be reused, even after unpublishing.

## 7. Next releases

1. Update versions in the three `package.json` files and move `CHANGELOG.md` *Unreleased* under the new version.
2. Commit (`chore(release): vX.Y.Z`), merge to `master`.
3. Repeat steps 1–5.

Automating this with the `Release` workflow needs an `NPM_TOKEN` repository secret (an npm *automation* token, so 2FA
does not block CI).
