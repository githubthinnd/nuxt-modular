import { CliError } from '../io'
import type { DatabaseChoice } from './types'

/** Environment variable the module reads the connection URL from (keeps secrets out of the code). */
export const DATABASE_URL_ENV = 'NUXT_MODULAR_DATABASE_URL'

/** npm driver each database needs (SQLite uses `node:sqlite`, built into Node >= 22.5). */
export const DRIVERS: Readonly<Record<DatabaseChoice, string | undefined>> = {
  none: undefined,
  sqlite: undefined,
  postgresql: 'pg',
  mysql: 'mysql2',
}

export const URL_EXAMPLES: Readonly<Partial<Record<DatabaseChoice, string>>> = {
  postgresql: 'postgresql://user:password@localhost:5432/app',
  mysql: 'mysql://user:password@localhost:3306/app',
}

const ALIASES: Readonly<Record<string, DatabaseChoice>> = {
  none: 'none',
  false: 'none',
  sqlite: 'sqlite',
  postgresql: 'postgresql',
  postgres: 'postgresql',
  pg: 'postgresql',
  mysql: 'mysql',
  mysql2: 'mysql',
  mariadb: 'mysql',
}

export function parseDatabaseChoice(value: string): DatabaseChoice {
  const choice = ALIASES[value.trim().toLowerCase()]
  if (!choice) throw new CliError(`Invalid database "${value}" (use none, sqlite, postgresql or mysql)`)
  return choice
}

/** The value written to `modular.database` in nuxt.config. The URL itself never goes there. */
export function databaseExpression(choice: DatabaseChoice): string {
  switch (choice) {
    case 'sqlite':
      return "'sqlite:./.data/modular.sqlite'"
    case 'postgresql':
      return "{ connector: 'postgresql' }"
    case 'mysql':
      return "{ connector: 'mysql2' }"
    default:
      return 'false'
  }
}

/** Comment lines written above `database` in nuxt.config, so the way to change it is visible where it is set. */
export function databaseComment(choice: DatabaseChoice): string[] {
  const common = ['Database for migrations, seeders and nuxt-modular state. Switch it any time with: npx nuxt-modular db']
  if (choice === 'postgresql' || choice === 'mysql') {
    return [...common, `The connection URL comes from ${DATABASE_URL_ENV} in .env (never write it here).`]
  }
  if (choice === 'sqlite') return [...common, 'A local file, no driver or URL needed.']
  return common
}

const URL_PATTERNS: Readonly<Partial<Record<DatabaseChoice, RegExp>>> = {
  postgresql: /^(postgres|postgresql):\/\/\S+$/i,
  mysql: /^(mysql|mysql2|mariadb):\/\/\S+$/i,
}

/** Returns a message when `url` is not a usable connection URL for the database; an empty URL is allowed (fill in later). */
export function validateDatabaseUrl(choice: DatabaseChoice, url: string): string | undefined {
  if (!url) return undefined
  const pattern = URL_PATTERNS[choice]
  if (!pattern) return `${choice} does not use a connection URL`
  return pattern.test(url) ? undefined : `Expected a URL like ${URL_EXAMPLES[choice]}`
}

/** The choices offered by the database question of `init` and `db`. */
export const DATABASE_OPTIONS: ReadonlyArray<{ readonly label: string; readonly value: DatabaseChoice; readonly hint: string }> = [
  { label: 'SQLite', value: 'sqlite', hint: 'zero setup, a local file' },
  { label: 'PostgreSQL', value: 'postgresql', hint: 'needs the pg driver and a connection URL' },
  { label: 'MySQL / MariaDB', value: 'mysql', hint: 'needs the mysql2 driver and a connection URL' },
  { label: 'None', value: 'none', hint: 'state lives in Nitro storage, no migrations' },
]
