import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'pathe'
import { CliError, type CommandIO } from './io'
import { readModularDatabase, setModularDatabase } from './init/config-patch'
import {
  databaseComment,
  databaseExpression,
  DATABASE_OPTIONS,
  DATABASE_URL_ENV,
  DRIVERS,
  parseDatabaseChoice,
  URL_EXAMPLES,
  validateDatabaseUrl,
} from './init/database'
import { addEnvExample, ensureIgnored, writeEnvValue } from './init/env'
import { detectProject } from './init/project'
import { consolaPrompter, type Prompter, SetupCancelled } from './init/prompter'
import { defaultInstall, hasDependency, type InitOptions, isTerminal } from './init/run'
import type { DatabaseChoice } from './init/types'

/** Extensions whose repositories still keep data in Nitro storage, so a new database does not change where they write. */
function storageBackedExtensions(root: string, extensionsDir: string): string[] {
  const base = join(root, extensionsDir)
  if (!existsSync(base)) return []
  return readdirSync(base, { withFileTypes: true }).flatMap((entry) => {
    const folder = join(base, entry.name, 'server/repositories')
    if (!entry.isDirectory() || !existsSync(folder)) return []
    const usesStorage = readdirSync(folder).some((file) => /\.repository\.[cm]?[jt]s$/.test(file) && readFileSync(join(folder, file), 'utf8').includes('useStorage('))
    return usesStorage ? [entry.name] : []
  })
}

export interface DbOptions {
  /** Do not ask; the flags decide. */
  readonly yes?: boolean
  readonly database?: string
  /** Connection URL for PostgreSQL or MySQL; written to the env file, never to nuxt.config. */
  readonly url?: string
  readonly noInstall?: boolean
  /** Env file that receives the URL (default `.env`). */
  readonly envFile?: string
  readonly interactive?: boolean
  readonly prompter?: Prompter
  readonly installPackages?: InitOptions['installPackages']
}

/**
 * `nuxt-modular db`: the one place to choose or change the database. It sets `modular.database` in nuxt.config,
 * writes the connection URL to the env file, installs the driver and explains what happens next.
 */
export async function runDb(io: CommandIO, options: DbOptions = {}): Promise<number> {
  try {
    const project = detectProject(io.cwd)
    const interactive = !options.yes && (options.interactive ?? isTerminal())
    const ask = interactive ? (options.prompter ?? consolaPrompter()) : undefined
    const current = readModularDatabase(project.configSource)
    io.out(`nuxt-modular database (currently: ${current ?? 'not configured'})`)

    let database: DatabaseChoice
    if (options.database !== undefined) database = parseDatabaseChoice(options.database)
    else if (ask) {
      database = await ask.select<DatabaseChoice>('Which database should nuxt-modular and your extensions use?', { initial: 'sqlite', options: DATABASE_OPTIONS })
    } else {
      throw new CliError('Pass --database none|sqlite|postgresql|mysql, or run it in a terminal to be asked.')
    }

    if (options.url !== undefined && !URL_EXAMPLES[database]) {
      throw new CliError(`--url does not apply to ${database}: only PostgreSQL and MySQL use a connection URL`)
    }
    const example = URL_EXAMPLES[database]
    const url =
      options.url ??
      (example && ask
        ? await ask.text(`Connection URL, for example ${example} (leave empty to fill in later)`, {
            initial: '',
            validate: (value) => validateDatabaseUrl(database, value),
          })
        : '')
    const problem = validateDatabaseUrl(database, url)
    if (problem) throw new CliError(`Invalid database URL: ${problem}`)

    const driver = DRIVERS[database]
    const needsInstall = Boolean(driver && !options.noInstall && !hasDependency(project.root, driver))
    const install =
      needsInstall && driver ? (options.yes || !ask ? true : await ask.confirm(`Install the ${driver} driver with ${project.packageManager} now?`, { initial: true })) : false

    io.out('')
    const patch = setModularDatabase(project.configSource, databaseExpression(database), databaseComment(database))
    if (patch.changed) {
      writeFileSync(join(project.root, project.configFile), patch.source)
      io.out(`  updated  ${project.configFile} (modular.database)`)
    } else if (!patch.manual.length) {
      io.out(`  kept     ${project.configFile} (modular.database is already ${databaseExpression(database)})`)
    }
    if (patch.manual.length) {
      io.out(`\n  Set this in ${project.configFile} yourself (it could not be placed automatically):\n`)
      for (const snippet of patch.manual) io.out(snippet.split('\n').map((line) => `    ${line}`).join('\n'))
    }

    const envFile = options.envFile ?? '.env'
    if (database === 'sqlite') ensureIgnored(io, project.root, '.data')
    if (example) {
      addEnvExample(io, project.root, DATABASE_URL_ENV, `# Connection URL for nuxt-modular (also used by your migrations)\n${DATABASE_URL_ENV}=${example}`)
      if (url) {
        writeEnvValue(io, project.root, envFile, DATABASE_URL_ENV, url)
        ensureIgnored(io, project.root, envFile)
      }
    }

    if (install && driver) {
      io.out(`\nInstalling ${driver} with ${project.packageManager}...`)
      try {
        await (options.installPackages ?? defaultInstall)(project.packageManager, [driver], project.root)
      } catch (error) {
        if (hasDependency(project.root, driver)) {
          io.out(`  installed ${driver} (${project.packageManager} finished with a warning)`)
        } else {
          io.err(`warning: ${error instanceof Error ? error.message : String(error)}`)
          io.err(`Install it yourself: ${project.packageManager} ${project.packageManager === 'npm' ? 'install' : 'add'} ${driver}`)
        }
      }
    }

    io.out('\nNext steps')
    if (example && !url) io.out(`- Set ${DATABASE_URL_ENV} in ${envFile} (see .env.example), or run: npx nuxt-modular db --database ${database} --url <connection url>`)
    if (driver && !install && !hasDependency(project.root, driver)) io.out(`- Install the driver: ${project.packageManager} add ${driver}`)
    if (database === 'none') io.out('- No database: nuxt-modular keeps its state in Nitro storage and extensions cannot use migrations.')
    else {
      io.out('- Migrations are recorded in the database: a new database starts empty and your migrations run when the server starts')
      io.out('  (modular.migrations.auto) or with: npx nuxt task run modular:migrate. Existing data is not copied.')
    }
    if (database !== 'none') {
      const stored = storageBackedExtensions(project.root, 'extensions')
      if (stored.length) {
        io.out(`- ${stored.join(', ')} still keep${stored.length === 1 ? 's' : ''} data in Nitro storage (server/repositories). To use the database, rewrite that`)
        io.out('  repository with SQL (see the SQL example in "make:repository"); controllers and services do not change.')
      }
    }
    io.out('- Restart the dev server so the new settings are loaded.')
    return 0
  } catch (error) {
    if (error instanceof SetupCancelled) {
      io.out('Cancelled. Nothing was changed.')
      return 0
    }
    throw error
  }
}
