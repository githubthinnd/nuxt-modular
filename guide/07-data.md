# 7. Data: databases, migrations, seeders and tasks

## Two kinds of state

1. **Your data.** Tables and records that extensions need. nuxt-modular does not own your schema: extensions create it
   with **migrations**.
2. **nuxt-modular's own state.** The migration ledger, a migration lock and persistent feature toggles. By default this
   is kept in Nitro storage; with `modular.database` it lives in SQL tables.

## Choosing and configuring the database

The quickest way is the command, in a terminal inside your Nuxt project:

```bash
npx nuxt-modular db
```

It asks which database you want and then, in one step:

1. sets `modular.database` in `nuxt.config.ts` (a comment above it points back to this command),
2. writes the connection URL of PostgreSQL or MySQL to `.env` as `NUXT_MODULAR_DATABASE_URL` (and keeps `.env` out of
   git),
3. documents the variable in `.env.example`,
4. installs the driver (`pg`, `mysql2`) with your package manager,
5. tells you what happens next.

```bash
npx nuxt-modular db --database postgresql --url postgresql://user:pass@localhost:5432/app
npx nuxt-modular db --database sqlite --yes
```

**Where the settings live**

| Setting | Place |
|---------|-------|
| Which database | `modular.database` in `nuxt.config.ts` |
| Connection URL (PostgreSQL, MySQL) | `NUXT_MODULAR_DATABASE_URL` in `.env`; production sets it in the environment |
| Driver | `dependencies` of your `package.json` (`pg`, `mysql2`) |

The URL never goes into `nuxt.config.ts`, so it cannot be committed by accident.

Switching databases starts a new, empty database: the migration ledger is stored in the database, so your migrations
run again against it (when the server starts with `modular.migrations.auto`, or with `nuxt task run modular:migrate`).
Existing data is not copied, and extensions that still keep their data in Nitro storage keep doing so until their
repository is rewritten with SQL ([chapter 14](./14-architecture.md)).

### By hand

| Database | `modular.database` | Driver to install |
|----------|--------------------|-------------------|
| SQLite | `'sqlite:./.data/modular.db'` | none (Node ≥ 22.5 built-in); or `better-sqlite3`, `@libsql/client` |
| PostgreSQL | `'postgresql://user:pass@host/db'` | `pg` |
| MySQL / MariaDB | `'mysql://user:pass@host/db'` | `mysql2` |
| PostgreSQL in-process (dev and tests) | `'pglite:./.data/pg'` (create the folder first) | `@electric-sql/pglite` |

```ts
// nuxt.config.ts: development
modular: { database: 'sqlite:./.data/modular.db' }

// production: connector only, URL from the environment
modular: { database: { connector: 'postgresql' } }
```
```bash
NUXT_MODULAR_DATABASE_URL=postgresql://user:pass@host/db
```

The driver is resolved from **your app** at build time (a missing one fails the build with the exact `pnpm add` command), so it works with strict package managers such as pnpm.

The connector is inferred from the URL scheme (`postgresql:`/`postgres:`, `mysql:`/`mariadb:`, `sqlite:`/`file:`,
`libsql:`). Anything written in `nuxt.config` is compiled into the build, so **keep credentials in
`NUXT_MODULAR_DATABASE_URL`**. Nothing database-related is bundled when `database` is unset.

| Option | Description |
|--------|-------------|
| `url` | Connection URL (prefer the environment variable). |
| `connector` | `postgresql`, `mysql2`, `node-sqlite`, `better-sqlite3`, `libsql`, `pglite`, `planetscale`, `bun-sqlite`, `sqlite3`. |
| `options` | Driver options; they win over values derived from the URL. |
| `dialect` | `sqlite`, `mysql` or `postgresql`; only needed for a custom handler or unusual connector. |
| `prefix` | Table prefix for nuxt-modular's tables. Default `modular_`. |
| `handler` | A module whose default export returns your own db0-compatible database (pools, replicas, Drizzle…). Needs `dialect`. |

```ts
// Bring your own connection
modular: { database: { handler: '~/server/modular-db', dialect: 'postgresql' } }
```
```ts
// server/modular-db.ts
import { createDatabase } from 'db0'
import postgresql from 'db0/connectors/postgresql'
export default () => createDatabase(postgresql({ url: process.env.DATABASE_URL, max: 10 }))
```

### What you get with a database

- **An atomic migration lock** that is safe when several instances start at once (with Nitro storage the lock is best
  effort). A crashed process frees it after five minutes.
- **Toggles every instance sees immediately**, with no per-process cache delay.
- **`db` and `dialect` in every migration and seeder**, typed.
- `useModularDatabase()` for routes, hooks and utilities.

nuxt-modular creates its three tables on first use (`modular_migrations`, `modular_locks`, `modular_toggles`).

## Migrations

A migration is a file in `extensions/<id>/server/migrations/` named `NNN-description.ts`:

```ts
// extensions/quiz/server/migrations/001-create-attempts.ts
import { defineMigration } from '#modular'

export default defineMigration({
  async up({ db, dialect, log }) {
    await db.exec(
      'CREATE TABLE IF NOT EXISTS quiz_attempts (id VARCHAR(64) NOT NULL PRIMARY KEY, score INT NOT NULL, created_at BIGINT NOT NULL)',
    )
    if (dialect === 'postgresql') await db.exec('CREATE INDEX IF NOT EXISTS quiz_attempts_score ON quiz_attempts (score)')
    log('created quiz_attempts')
  },
  async down({ db }) {
    await db.exec('DROP TABLE IF EXISTS quiz_attempts')
  },
})
```

Generate the next numbered file with `npx nuxt-modular make:migration quiz create-attempts`.

Rules of the road:

- **Order**: extensions sorted so dependencies run first, then migration names (so keep the `001-` prefixes).
- **Recorded after success.** The first failure stops the whole run; nothing is recorded for the failed migration, and
  nothing after it runs.
- **Never edit an applied migration.** Add a new one.
- A migration's `down` is optional but required for `down()`, `reset()` and `refresh()`.
- Extensions switched off by a persistent toggle are skipped (unless `includeInactive`).

### Writing portable SQL

`db` is a [db0](https://db0.unjs.io) database:

```ts
await db.exec('CREATE TABLE …')                                        // no parameters
const rows = await db.prepare('SELECT * FROM t WHERE id = ?').all(id)  // array
const row  = await db.prepare('SELECT * FROM t WHERE id = ?').get(id)  // first row
await db.prepare('INSERT INTO t (id) VALUES (?)').run(id)              // statements
```

`?` placeholders work on every dialect. To run on SQLite, MySQL and PostgreSQL alike:

- use `VARCHAR(n)`, `INT`, `BIGINT`, `SMALLINT`, `TEXT` for non-key columns, plain `CREATE TABLE IF NOT EXISTS`;
- use `VARCHAR`, not `TEXT`, for indexed/primary-key columns (MySQL cannot index `TEXT` without a length);
- store timestamps as `BIGINT` milliseconds and booleans as `SMALLINT` 0/1;
- avoid dialect-specific features, or branch on `dialect`.

There is deliberately no schema builder. If you prefer Drizzle or Kysely, use them inside a migration.

### Running migrations

| How | When |
|-----|------|
| `modular.migrations.auto: true` | At server start; requests wait until it finishes. Never while prerendering. |
| `useModularMigrations().up()` | From your own code. |
| `nuxt task run modular:migrate` | From the CLI against the dev server (see Tasks). |

```ts
const migrations = useModularMigrations()
await migrations.up()                      // apply pending
await migrations.status()                  // [{ extensionId, applied, pending, unknown }]
await migrations.down('quiz', 1)           // revert the last migration of one extension
await migrations.reset()                   // revert everything (destructive)
await migrations.refresh()                 // reset + up (destructive)
```

`unknown` lists migrations recorded in the ledger that the extension no longer ships.

### Giving migrations extra context

The module adds `db` and `dialect`. To add your own services (a storage client, a logger…), use the filter:

```ts
// server/plugins/migration-context.ts
export default defineNitroPlugin(() => {
  useModularServerHooks().addFilter('modular:migration-context', (context) => ({ ...context, s3: useS3() }))
})
```
```ts
// server/types/modular.d.ts
declare module '#modular' {
  interface ModularMigrationContext { s3: S3Client }
}
export {}
```

Without a configured `database` you can supply your own `db` the same way.

## Seeders

Seeders load initial or demo data. Unlike migrations they are **not recorded**, so write them to be idempotent.

```ts
// extensions/quiz/server/seeders/001-demo-attempts.ts
import { defineSeeder } from '#modular'

export default defineSeeder({
  async run({ db, log }) {
    await db.prepare('DELETE FROM quiz_attempts WHERE id = ?').run('demo-1')
    await db.prepare('INSERT INTO quiz_attempts (id, score, created_at) VALUES (?, ?, ?)').run('demo-1', 80, Date.now())
    log('seeded')
  },
})
```

```ts
await useModularSeeders().run({ extensions: ['quiz'], names: ['001-demo-attempts'] })
```

Context customization uses the `modular:seeder-context` filter and `ModularSeederContext`.

## Tasks

With `modular.tasks: true` the module registers [Nitro tasks](https://nitro.build/guide/tasks) (it turns on Nitro's
`experimental.tasks`):

| Task | Payload | Effect |
|------|---------|--------|
| `modular:list` | | Extensions and their activation state |
| `modular:migrate` | `extensions`, `includeInactive` | Run pending migrations |
| `modular:migrate:status` | | Applied / pending / unknown per extension |
| `modular:migrate:rollback` | `extension`, `steps` | Revert the last migrations of one extension |
| `modular:migrate:reset` | `confirm: true`, `extensions` | Revert everything |
| `modular:migrate:refresh` | `confirm: true`, `extensions` | Revert, then re-apply everything |
| `modular:seed` | `extensions`, `names`, `includeInactive` | Run seeders |

```bash
npx nuxt task run modular:migrate:status
npx nuxt task run modular:seed --payload '{"extensions":["quiz"]}'
npx nuxt task run modular:migrate:reset --payload '{"confirm":true}'
```

A failed run makes the command exit non-zero, so it is safe in scripts. Nitro serves `/_nitro/tasks` only in
development; in a production process call `runTask('modular:migrate')` from your own entry point or use
`migrations.auto`.
