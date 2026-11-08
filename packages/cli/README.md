# @nuxt-modular/cli

Scaffolding and diagnostics for [nuxt-modular](../nuxt/README.md) extensions.

```bash
pnpm add -D @nuxt-modular/cli
npx nuxt-modular --help
```

| Command | What it does |
|---------|--------------|
| `make:extension <id>` | Manifest, README, a slot component, a page and an API route (`--minimal`: manifest only) |
| `make:component <ext> <Name>` | `components/<Name>.vue` and the slot reference to use |
| `make:page <ext> <path>` | `pages/<path>.vue`, e.g. `quiz/[id]` → `/quiz/:id` |
| `make:api <ext> <route>` | `server/api/<route>.<method>.ts` (`--method get|post|…`) |
| `make:hook <ext> <hook>` | `server/hooks/on-<hook>.ts` (`--type action|filter`, `--name`) and the manifest line |
| `make:plugin <ext> <name>` | `plugins/<name>.ts` (`--mode client|server`) |
| `make:migration <ext> <name>` | Next `server/migrations/NNN-name.ts` |
| `make:seeder <ext> <name>` | Next `server/seeders/NNN-name.ts` |
| `list` | Table (or `--json`) of extensions and their contributions |
| `validate` | Manifest and reference errors, `requires` and dependency-cycle problems, route/page conflicts |

Options: `--dir <path>` (default `extensions`), `--force`, `--json`, `--strict`
(warnings fail `validate`), `--host-version <semver>` (check `requires.modular`).

Exit codes: `0` success, `1` validation failed, `2` usage error. Generators never
write outside the extension directory and refuse to overwrite without `--force`.

Use `validate --strict` in CI to catch broken extensions before a build.
Migrations and seeders run through Nitro tasks, see the module README.
