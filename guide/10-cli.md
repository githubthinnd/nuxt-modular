# 10. Command line

`@nuxt-modular/cli` scaffolds extensions and validates them without starting Nuxt.

```bash
pnpm add -D @nuxt-modular/cli
npx nuxt-modular --help
```

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
