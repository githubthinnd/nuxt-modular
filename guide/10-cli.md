# 10. Command line

`@nuxt-modular/cli` sets up a Nuxt project, scaffolds extensions and validates them without starting Nuxt.

The `nuxt-modular` command is available as soon as the module is installed (`npx nuxt-modular --help`). To use it in
CI or scripts without the module, install the CLI on its own: `pnpm add -D @nuxt-modular/cli`.

## Setting up a project

```bash
npx nuxt-modular init
```

Asks a few questions and writes a working host into the current Nuxt project: the `modular` options in
`nuxt.config.ts`, a permissions plugin, an optional host shell (`app.vue` and a home page with an outlet), a starter
extension and the `modular:list` / `modular:validate` scripts. It is the same setup that `npx nuxi module add
nuxt-modular` offers right after installing; see [Getting started](./01-getting-started.md#guided-setup) for the
questions.

| Option | Effect |
|--------|--------|
| `-y`, `--yes` | Accept the defaults instead of asking. Needed without a terminal. |
| `--database <name>` | `none`, `sqlite` (default), `postgresql` or `mysql`. |
| `--roles <a,b>` | Roles of the app (default `admin,member`). The last one is the visitor's role. |
| `--extension <id>` | Id of the starter extension (default `hello`). |
| `--no-starter` | Do not create a starter extension. |
| `--no-shell` | Do not generate `app.vue` and a home page. |
| `--no-install` | Do not install the database driver (`pg`, `mysql2`). |
| `--dir <path>` | Extensions directory (default `extensions`). |

It must run inside a Nuxt project (a folder with `nuxt.config.*`). Files that already exist are kept, so running it
again is safe. Exit code `2` for a usage error such as an invalid role or no terminal without `--yes`.

## Generators

| Command | Creates |
|---------|---------|
| `make:extension <id>` | Manifest, README, a slot component, a page and an API route. `--minimal`: manifest and README only. |
| `make:component <ext> <Name>` | `components/<Name>.vue`; prints the slot reference to use. Accepts folders: `quiz/score-card`. |
| `make:page <ext> <path>` | `pages/<path>.vue`, e.g. `quiz/[id]` → `/quiz/:id`. |
| `make:api <ext> <route>` | `server/api/<route>.<method>.ts`. `--method get\|post\|put\|patch\|delete`. |
| `make:hook <ext> <hook>` | `server/hooks/on-<hook>.ts` and the manifest line to add. `--type action\|filter`, `--name <file>`. |
| `make:plugin <ext> <name>` | `plugins/<name>.ts`. `--mode client\|server`. |
| `make:migration <ext> <name>` | The next `server/migrations/NNN-name.ts`. |
| `make:seeder <ext> <name>` | The next `server/seeders/NNN-name.ts`. |

```bash
npx nuxt-modular make:extension mod-quiz
npx nuxt-modular make:api mod-quiz "quiz/[id]" --method post
npx nuxt-modular make:hook mod-quiz quiz:score --type filter
npx nuxt-modular make:migration mod-quiz "create attempts"     # → 001-create-attempts.ts
```

Safety: names are validated, generators never write outside the extension directory, and an existing file is never
overwritten unless you pass `--force`.

## Inspecting

```bash
npx nuxt-modular list            # table of extensions and what they contribute
npx nuxt-modular list --json     # machine-readable
```

## Validating

```bash
npx nuxt-modular validate
```

Checks, for every extension: manifest schema, resolvable references, `requires` ranges, dependency cycles, route and
page clashes, directories without a manifest. Output is grouped as errors (exit code `1`) and warnings.

| Option | Effect |
|--------|--------|
| `--strict` | Warnings fail the command too. |
| `--json` | `{ ok, extensions, errors, warnings }`. |
| `--host-version <semver>` | Also check `requires.modular` against this nuxt-modular version. |
| `--dir <path>` | Extensions directory (default `extensions`). |

Add it to CI to catch broken extensions before a build:

```yaml
- run: npx nuxt-modular validate --strict --host-version "$(node -p "require('./node_modules/nuxt-modular/package.json').version")"
```

## Exit codes

`0` success · `1` validation failed · `2` usage error (unknown command, bad name, file exists).

## Programmatic use

The CLI exports its building blocks (`main`, `makeExtension`, `scanAll`, `validateExtensions`, …) for custom tooling.
