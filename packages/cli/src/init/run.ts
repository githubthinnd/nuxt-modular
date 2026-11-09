import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'pathe'
import { CliError, type CommandIO } from '../io'
import { patchNuxtConfig } from './config-patch'
import { planInit, validateAnswers } from './plan'
import { detectProject } from './project'
import { consolaPrompter, type Prompter, SetupCancelled } from './prompter'
import type { DatabaseChoice, InitAnswers, InitPlan, PackageManagerName, ProjectInfo } from './types'

export interface InitOptions {
  /** Accept every default; flags still win. Needed when there is no terminal. */
  readonly yes?: boolean
  /** Started from `nuxi module add`: ask first whether to run the guided setup. */
  readonly guided?: boolean
  readonly dir?: string
  readonly database?: string
  readonly extension?: string
  /** Comma-separated role names. */
  readonly roles?: string
  readonly noStarter?: boolean
  readonly noShell?: boolean
  readonly noInstall?: boolean
  /** Override the terminal check (tests). */
  readonly interactive?: boolean
  readonly prompter?: Prompter
  /** Override the dependency installation (tests). */
  readonly installPackages?: (manager: PackageManagerName, packages: readonly string[], cwd: string) => void | Promise<void>
}

const DOCS = 'https://github.com/githubthinnd/nuxt-modular/blob/master/guide/01-getting-started.md'

const DATABASE_ALIASES: Record<string, DatabaseChoice> = {
  none: 'none',
  sqlite: 'sqlite',
  postgresql: 'postgresql',
  postgres: 'postgresql',
  pg: 'postgresql',
  mysql: 'mysql',
  mariadb: 'mysql',
}

function parseDatabase(value: string): DatabaseChoice {
  const choice = DATABASE_ALIASES[value.toLowerCase()]
  if (!choice) throw new CliError(`Invalid --database "${value}" (use none, sqlite, postgresql or mysql)`)
  return choice
}

const parseRoles = (value: string): string[] => [...new Set(value.split(',').map((role) => role.trim()).filter(Boolean))]

const DRIVER: Record<DatabaseChoice, string | undefined> = { none: undefined, sqlite: undefined, postgresql: 'pg', mysql: 'mysql2' }

export const isTerminal = (): boolean => Boolean(process.stdin.isTTY && process.stdout.isTTY)

async function gather(options: InitOptions, project: ProjectInfo, ask: Prompter | undefined): Promise<InitAnswers> {
  const extensionsDir = options.dir ?? (await ask?.text('Where should extensions live?', { initial: 'extensions' })) ?? 'extensions'

  const database =
    options.database !== undefined
      ? parseDatabase(options.database)
      : ((await ask?.select<DatabaseChoice>('Which database should nuxt-modular and your extensions use?', {
          initial: 'sqlite',
          options: [
            { label: 'SQLite', value: 'sqlite', hint: 'zero setup, a local file' },
            { label: 'PostgreSQL', value: 'postgresql', hint: 'needs the pg driver and a connection URL' },
            { label: 'MySQL / MariaDB', value: 'mysql', hint: 'needs the mysql2 driver and a connection URL' },
            { label: 'None', value: 'none', hint: 'state lives in Nitro storage, no migrations' },
          ],
        })) ?? 'sqlite')

  const roles =
    options.roles !== undefined
      ? parseRoles(options.roles)
      : parseRoles(
          (await ask?.text('Which roles does your app have? (comma separated)', {
            initial: 'admin,member',
            validate: (value) => (parseRoles(value).length ? undefined : 'Enter at least one role, for example admin,member'),
          })) ?? 'admin,member',
        )

  const lastRole = roles.at(-1) as string
  const defaultRole =
    roles.length > 1 && ask
      ? await ask.select<string>('Which role should the current visitor have while developing?', {
          initial: lastRole,
          options: roles.map((role) => ({ label: role, value: role })),
        })
      : lastRole

  let starter: string | false
  if (options.noStarter) starter = false
  else if (options.extension !== undefined) starter = options.extension
  else if (ask && !(await ask.confirm('Create a starter extension (manifest, widget, page and API route)?', { initial: true }))) starter = false
  else starter = ask ? await ask.text('Starter extension id', { initial: 'hello' }) : 'hello'

  const canShell = !project.hasAppVue || project.appVueIsDefault
  const hostShell = options.noShell
    ? false
    : canShell
      ? ((await ask?.confirm('Generate a host shell (menu, home page and an outlet for extensions)?', { initial: true })) ?? true)
      : false

  const hasDb = database !== 'none'
  const autoMigrate = hasDb
    ? ((await ask?.confirm('Run pending migrations automatically when the server starts?', { initial: true })) ?? true)
    : false
  const tasks = hasDb
    ? ((await ask?.confirm('Register the Nitro tasks (modular:migrate, modular:seed, ...)?', { initial: true })) ?? true)
    : false

  const driver = DRIVER[database]
  const installDriver =
    driver && !options.noInstall
      ? ((await ask?.confirm(`Install the ${driver} driver with ${project.packageManager} now?`, { initial: true })) ?? true)
      : false

  return { extensionsDir, database, roles, defaultRole, starter, hostShell, tasks, autoMigrate, installDriver }
}

function describePlan(io: CommandIO, plan: InitPlan, project: ProjectInfo): void {
  io.out('\nThis will:')
  for (const file of plan.files) io.out(`  ${existsSync(join(project.root, file.path)) && !file.overwrite ? 'keep   ' : 'create '} ${file.path}`)
  io.out(`  update  ${project.configFile}${plan.configBlock ? ' (module and modular options)' : ' (module)'}`)
  io.out(`  update  package.json (scripts: ${Object.keys(plan.scripts).join(', ')})`)
  for (const key of Object.keys(plan.env)) io.out(`  add     ${key} to .env.example`)
  if (plan.install.length) io.out(`  install ${plan.install.join(', ')}`)
}

const defaultInstall = (manager: PackageManagerName, packages: readonly string[], cwd: string): void => {
  const args = manager === 'npm' ? ['install', ...packages] : ['add', ...packages]
  const result = spawnSync(manager, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) throw new CliError(`"${manager} ${args.join(' ')}" failed`)
}

function hasDependency(root: string, name: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>
    return Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name])
  } catch {
    return false
  }
}

function writeNew(io: CommandIO, root: string, path: string, content: string, overwrite: boolean | undefined): void {
  const target = join(root, path)
  if (existsSync(target) && !overwrite) return io.out(`  kept     ${path} (already exists)`)
  const existed = existsSync(target)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
  io.out(`  ${existed ? 'replaced' : 'created '} ${path}`)
}

function updateScripts(io: CommandIO, root: string, scripts: Readonly<Record<string, string>>): void {
  const file = join(root, 'package.json')
  if (!existsSync(file)) return
  const raw = readFileSync(file, 'utf8')
  const pkg = JSON.parse(raw) as { scripts?: Record<string, string> }
  const indent = /^([ \t]+)"/m.exec(raw)?.[1] ?? '  '
  const missing = Object.entries(scripts).filter(([name]) => !pkg.scripts?.[name])
  if (!missing.length) return
  pkg.scripts = { ...pkg.scripts, ...Object.fromEntries(missing) }
  writeFileSync(file, `${JSON.stringify(pkg, null, indent)}\n`)
  io.out(`  updated  package.json (${missing.map(([name]) => name).join(', ')})`)
}

function appendLines(io: CommandIO, root: string, file: string, lines: readonly string[], create: boolean): void {
  const target = join(root, file)
  const exists = existsSync(target)
  if (!exists && !create) return
  const current = exists ? readFileSync(target, 'utf8') : ''
  const present = new Set(current.split(/\r?\n/).map((line) => line.trim()))
  const add = lines.filter((line) => !present.has(line.trim().replace(/^\//, '')) && !present.has(line.trim()))
  if (!add.length) return
  const separator = current === '' || current.endsWith('\n') ? '' : '\n'
  writeFileSync(target, `${current}${separator}${add.join('\n')}\n`)
  io.out(`  ${exists ? 'updated ' : 'created '} ${file}`)
}

/** Writes everything in the plan. Existing files are never replaced, except the untouched default `app.vue`. */
export async function applyInit(io: CommandIO, project: ProjectInfo, plan: InitPlan, options: Pick<InitOptions, 'installPackages'> = {}): Promise<void> {
  for (const file of plan.files) writeNew(io, project.root, file.path, file.content, file.overwrite)

  const patch = patchNuxtConfig(project.configSource, plan.configBlock)
  if (patch.changed) {
    writeFileSync(join(project.root, project.configFile), patch.source)
    io.out(`  updated  ${project.configFile}`)
  }
  if (patch.manual.length) {
    io.out(`\n  Add this to ${project.configFile} yourself (it could not be placed automatically):\n`)
    for (const snippet of patch.manual) io.out(snippet.split('\n').map((line) => `    ${line}`).join('\n'))
  }

  updateScripts(io, project.root, plan.scripts)
  for (const [key, value] of Object.entries(plan.env)) {
    const target = join(project.root, '.env.example')
    const has = existsSync(target) && new RegExp(`^${key}=`, 'm').test(readFileSync(target, 'utf8'))
    if (!has) appendLines(io, project.root, '.env.example', ['', ...value.split('\n')], true)
  }
  if (plan.gitignore.length) appendLines(io, project.root, '.gitignore', plan.gitignore, false)

  if (plan.install.length) {
    io.out(`\nInstalling ${plan.install.join(', ')} with ${project.packageManager}...`)
    try {
      await (options.installPackages ?? defaultInstall)(project.packageManager, plan.install, project.root)
    } catch (error) {
      // A package manager can exit with an error after adding the package (pnpm does when a dependency has build
      // scripts that were not approved), so trust package.json over the exit code.
      const missing = plan.install.filter((name) => !hasDependency(project.root, name))
      if (!missing.length) {
        io.out(`  installed ${plan.install.join(', ')} (${project.packageManager} finished with a warning)`)
        if (project.packageManager === 'pnpm') io.out('  If pnpm mentioned ignored build scripts, review them with: pnpm approve-builds')
      } else {
        io.err(`warning: ${error instanceof Error ? error.message : String(error)}`)
        io.err(`Install it yourself: ${project.packageManager} ${project.packageManager === 'npm' ? 'install' : 'add'} ${missing.join(' ')}`)
      }
    }
  }
}

const devCommand = (manager: PackageManagerName): string => (manager === 'npm' ? 'npm run dev' : `${manager} dev`)

/**
 * The guided setup behind `nuxt-modular init` and `nuxi module add nuxt-modular`:
 * asks a few questions, then writes a working host (config, permissions plugin,
 * optional shell and starter extension) into the current Nuxt project.
 */
export async function runInit(io: CommandIO, options: InitOptions = {}): Promise<number> {
  try {
    const project = detectProject(io.cwd, options.dir)
    const interactive = !options.yes && (options.interactive ?? isTerminal())
    if (!options.yes && !interactive) {
      throw new CliError('init asks questions and needs a terminal. Run it in a terminal, or pass --yes to accept the defaults (flags: --database, --roles, --extension, --no-starter, --no-shell, --no-install).')
    }
    const ask = interactive ? (options.prompter ?? consolaPrompter()) : undefined

    if (options.guided && ask) {
      const choice = await ask.select<'guide' | 'skip'>('nuxt-modular is installed. Set up a working project now?', {
        initial: 'guide',
        options: [
          { label: 'Yes, ask me a few questions', value: 'guide', hint: 'config, permissions, host shell, starter extension' },
          { label: 'No, I will configure it myself', value: 'skip' },
        ],
      })
      if (choice === 'skip') {
        io.out(`Skipped. Run "npx nuxt-modular init" whenever you want the guided setup. Guide: ${DOCS}`)
        return 0
      }
    }

    io.out('nuxt-modular setup')
    if (project.hasExtensions || project.hasModularConfig) {
      io.out('Found an existing nuxt-modular setup. Files that already exist are kept.')
    }

    const answers = await gather(options, project, ask)
    validateAnswers(answers)
    const plan = planInit(answers, project)

    describePlan(io, plan, project)
    if (ask && !(await ask.confirm('Apply these changes?', { initial: true }))) {
      io.out('Nothing was changed.')
      return 0
    }

    io.out('')
    await applyInit(io, project, plan, options.installPackages ? { installPackages: options.installPackages } : {})

    io.out(`\nDone. Start the app with: ${devCommand(project.packageManager)}`)
    if (answers.starter) io.out(`The starter extension "${answers.starter}" adds a menu entry, a card on the home page, a page at /${answers.starter} and an API.`)
    for (const note of plan.notes) io.out(`- ${note}`)
    io.out(`Validate extensions any time: ${project.packageManager === 'npm' ? 'npm run' : project.packageManager} modular:validate`)
    return 0
  } catch (error) {
    if (error instanceof SetupCancelled) {
      io.out('Setup cancelled. Nothing was changed. Run "npx nuxt-modular init" to try again.')
      return 0
    }
    throw error
  }
}
