# 12. Troubleshooting and FAQ

## Setup and command line

**`nuxi module add` says no usable `@nuxt/cli` was found (or nothing happens).**
It must run inside a Nuxt project. Create one first: `npx nuxi@latest init my-app --template=minimal`, then
`cd my-app`.

**I picked the "module" template and the setup does not make sense.**
That template is a starter for writing a Nuxt module, not an application. Delete the folder and create the project again
with `--template=minimal`.

**No questions appeared after `nuxi module add`.**
They are asked once per project (Nuxt records it in `.nuxtrc`), in a terminal, outside CI, and only right after
`nuxi module add`. Run `npx nuxt-modular init` whenever you want them. `NUXT_MODULAR_INIT=0` turns them off.

**`pnpm did not run build scripts for esbuild` or `ERR_PNPM_IGNORED_BUILDS`.**
That is a pnpm safety feature, not nuxt-modular. The package you asked for was still added; approve the build scripts
with `pnpm approve-builds` when you want pnpm to run them.

**`Port 3000 is in use, using port 3001 instead.`**
Another server already uses 3000. Open the address Nuxt prints, or stop the other server. Check that you started
`pnpm dev` from your project folder: running it from another folder starts a different app.

**`command not found: nuxt-modular`.**
Use `npx nuxt-modular` or `pnpm modular` inside a project that has the module installed. Without the module, use
`npx @nuxt-modular/cli`.

**`No nuxt.config found`.**
You are not in a Nuxt project folder. `cd` into it, or create one (`npx nuxi@latest init my-app --template=minimal`).

**The menu entry or the card of my extension is not visible.**
The visitor holds no role that the extension grants. The generated `app/plugins/modular-permissions.ts` reads the role
from the `role` cookie (default: the role you chose); the extension lists who may see it in `defaultRoles` in its
`manifest.ts`. Add the role there, or create the extension with `make:extension <id> --roles admin,editor`.

**`No database URL: set the NUXT_MODULAR_DATABASE_URL environment variable`.**
You chose PostgreSQL or MySQL and left the connection URL empty. Put it in `.env` (copy `.env.example`), or run
`npx nuxt-modular db --url postgresql://user:password@localhost:5432/app`. To try the app without installing a
server, switch to SQLite: `npx nuxt-modular db --database sqlite`.

**`ECONNREFUSED` or an authentication error from PostgreSQL or MySQL.**
The URL is reachable only if the database server is running and the user, password, host, port and database name are
right. Check the URL with the database's own client (`psql "$NUXT_MODULAR_DATABASE_URL"`) before blaming the app.

**I switched databases and my data is gone.**
A new database starts empty and data is not copied. The migrations run again on it when the server starts. Extensions
whose repository still uses Nitro storage keep writing there until the repository is rewritten with SQL
([chapter 14](./14-architecture.md)).

## Build errors

**`Invalid manifest for extension "quiz" (…/manifest.ts): - slots[0].target: Must be a dot-namespaced outlet name`**
Fix the field named in the message. Every problem in the manifest is listed at once.

**`slots[0].component "QuizTab" matches no component in …/components (available: …)`**
The name must match a file under the extension's `components/` (Nuxt naming: `quiz/Tab.vue` → `QuizTab`), or use a path
starting with `./`.

**`Duplicate extension id "x" in extensions/a and extensions/b`**
Two folders in the same root declare the same `id`. Rename one.

**`Navigation item "x" of extension "a" is already declared by "b"`**
Navigation ids are global. Prefix them with the extension id (`quiz.list`).

**`Incompatible extensions: …`**
A `requires` range is not satisfied or `dependsOn` forms a cycle. See [chapter 9](./09-toggles-and-compatibility.md).

**`modular.database needs a url … or a connector`** / **`Cannot tell which database … points to`**
Give a URL with a known scheme, or set `connector`.

## Runtime behaviour

**An outlet is empty.**
Walk the chain: Is the extension built (`list`)? Active (DevTools → Extensions, or `registry.extensions`)? Does the slot's
`target` equal the outlet `name` exactly? Does the viewer hold the slot's `permission`? Is `dependsOn` satisfied? Press
the DevTools **Extensions** tab: it shows every slot and its component file.

**The menu is empty.**
Navigation needs `parent` equal to the menu id you query (`getNavigation('sidebar')`) and the viewer's permission.

**An extension page returns 404.**
The extension is inactive (toggle, session override, missing dependency), or a host page with the same path wins.

**An extension API route returns 404.**
It is switched off by a persistent toggle, or the file name/method suffix does not map to the route you call
(`ping.get.ts` answers only `GET`).

**I changed a manifest and nothing happened.**
Manifests are evaluated at build time; Nuxt restarts automatically in dev. In production, rebuild.

**Hydration mismatch warnings.**
nuxt-modular's own rendering is deterministic. Common causes are inside extension components (using `Date.now()` or
`Math.random()` during render, reading `window` in setup) or setting permissions on the client only. Set permissions in a
plugin that runs on the server as well.

**A component error shows a fallback, but I want the stack trace.**
Errors are logged to the server console and the browser console with the extension id and slot key.

**Toggles reset after a restart.**
You are on Nitro's default in-memory storage. Configure a persistent driver or `modular.database`.

**`Migrations are already running`.**
Another instance holds the lock. With a database it expires after five minutes if a process crashed; with Nitro storage
remove the `migrations:lock` key.

**A migration "worked" locally and failed on PostgreSQL/MySQL.**
Use portable SQL ([chapter 7](./07-data.md)): `VARCHAR` primary keys, no SQLite-only features, `?` placeholders. Test on the
real target database in CI.

**`The "postgresql" database connector needs the \`pg\` package`** (or `mysql2`, `@libsql/client`, …).
Install the driver in the **app** that deploys the server: `pnpm add pg`. The module looks for it in your project first, and fails the build early with this message when it is missing. This also applies to db0 0.4 and newer, which no longer find drivers on their own.

**`nuxt task run` says tasks are unavailable.**
Set `modular.tasks: true` and run it against the development server; production servers do not expose
`/_nitro/tasks`.

## FAQ

**Does it work with Nuxt 3?** Yes, Nuxt 3.13 and newer. It is developed and tested with Nuxt 4.6.

**Is this a micro-frontend system?** No. Extensions are compiled into the same Nuxt build as the host (same Vue app, same
router). That is what makes SSR and hydration reliable. Use it for in-repo or package-distributed plugins, not for
independently deployed UIs.

**Can extensions come from npm packages?** Yes, through Nuxt layers: a package that ships an `extensions/` folder and is
listed in `extends` is scanned like local code.

**Can I add extensions at runtime without rebuilding?** Metadata can be registered (`registry.register`), but the
components must already be part of the build. There is no hot-loading of new code.

**Is it secure to run third-party extensions?** Extensions are trusted code with full host privileges; there is no sandbox.
Review them like any dependency.

**Why must manifests be JSON?** So the registry can be serialized into the SSR payload and rebuilt identically in the
browser.

**Can two extensions modify the same outlet?** Yes; they render in `order`, then extension id.

**How do I let extensions talk to each other?** Server side with the hook bus (actions and filters). Client side, expose
composables or shared state from the host.

**Which databases are supported?** SQLite, PostgreSQL and MySQL/MariaDB for nuxt-modular's state and for migrations; your
own data access in routes can use anything.

## Getting help

- Search or open an issue: <https://github.com/githubthinnd/nuxt-modular/issues>
- Include: nuxt-modular and Nuxt versions, the manifest, `npx nuxt-modular validate` output, and a minimal reproduction.
- Security problems: see the [security policy](https://github.com/githubthinnd/nuxt-modular/blob/master/SECURITY.md); do not open a public issue.
