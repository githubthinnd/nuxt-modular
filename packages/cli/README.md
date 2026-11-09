# @nuxt-modular/cli

> Command line for [nuxt-modular](https://www.npmjs.com/package/nuxt-modular): scaffold Nuxt extensions (`make:extension`,
> `make:component`, `make:page`, `make:api`, `make:hook`, `make:migration`, `make:seeder`) and validate them in CI (`validate`).

[![npm](https://img.shields.io/npm/v/@nuxt-modular/cli?color=4f46e5)](https://www.npmjs.com/package/@nuxt-modular/cli)
[![license](https://img.shields.io/npm/l/@nuxt-modular/cli?color=4f46e5)](https://github.com/githubthinnd/nuxt-modular/blob/master/LICENSE)

```bash
pnpm add -D @nuxt-modular/cli
npx nuxt-modular --help
```

The same command is also available as `npx nuxt-modular` once the `nuxt-modular` module is installed.

| Command | What it does |
|---------|--------------|
| `init` | Guided setup of a Nuxt project: config, permissions plugin, optional host shell and a starter extension (`--yes` accepts the defaults) |
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
Migrations and seeders run through Nitro tasks; see the [user guide](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/07-data.md).

Full documentation: [CLI chapter](https://github.com/githubthinnd/nuxt-modular/blob/master/guide/10-cli.md) · MIT
