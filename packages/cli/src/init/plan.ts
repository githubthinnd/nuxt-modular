import { join } from 'pathe'
import { CliError } from '../io'
import {
  homePageStub,
  hostShellStub,
  permissionsPluginStub,
  starterItemsApiStub,
  starterManifestStub,
  starterMigrationStub,
  starterPageStub,
  starterPingStub,
  starterReadmeStub,
  starterSeederStub,
  starterWidgetName,
  starterWidgetStub,
  tableName,
} from './templates'
import type { DatabaseChoice, InitAnswers, InitPlan, PlannedFile, ProjectInfo } from './types'

export const DATABASE_URL_ENV = 'NUXT_MODULAR_DATABASE_URL'

const DRIVERS: Record<DatabaseChoice, string | undefined> = {
  none: undefined,
  sqlite: undefined, // node:sqlite ships with Node >= 22.5
  postgresql: 'pg',
  mysql: 'mysql2',
}

const URL_EXAMPLES: Partial<Record<DatabaseChoice, string>> = {
  postgresql: 'postgresql://user:password@localhost:5432/app',
  mysql: 'mysql://user:password@localhost:3306/app',
}

/** The `modular: { ... },` entry for nuxt.config, or `undefined` when every option keeps its default. */
export function configBlock(answers: InitAnswers): string | undefined {
  const lines: string[] = []
  if (answers.extensionsDir !== 'extensions') lines.push(`    extensionsDir: '${answers.extensionsDir}',`)
  if (answers.database === 'sqlite') lines.push("    database: 'sqlite:./.data/modular.sqlite',")
  if (answers.database === 'postgresql') lines.push(`    // Connection URL: ${DATABASE_URL_ENV} (see .env.example)\n    database: { connector: 'postgresql' },`)
  if (answers.database === 'mysql') lines.push(`    // Connection URL: ${DATABASE_URL_ENV} (see .env.example)\n    database: { connector: 'mysql2' },`)
  if (answers.database !== 'none' && answers.autoMigrate) lines.push('    migrations: { auto: true },')
  if (answers.tasks) lines.push('    tasks: true,')
  return lines.length ? `  modular: {\n${lines.join('\n')}\n  },` : undefined
}

/** Turns the answers into files and edits. Pure: nothing is read from or written to disk. */
export function planInit(answers: InitAnswers, project: ProjectInfo): InitPlan {
  const files: PlannedFile[] = []
  const notes: string[] = []
  const src = (path: string): string => (project.srcDir === '.' ? path : join('app', path))
  const hasDb = answers.database !== 'none'

  files.push({ path: src('plugins/modular-permissions.ts'), content: permissionsPluginStub(answers.roles, answers.defaultRole) })

  if (answers.hostShell) {
    if (!project.hasAppVue || project.appVueIsDefault) {
      files.push({ path: src('app.vue'), content: hostShellStub(project.name), overwrite: project.appVueIsDefault })
    } else {
      notes.push(
        `${src('app.vue')} already exists and was left alone. Render the menu with\n` +
          "    const navigation = computed(() => useModuleRegistry().getNavigation('sidebar'))",
      )
    }
    if (!project.hasIndexPage) files.push({ path: src('pages/index.vue'), content: homePageStub() })
  } else {
    notes.push('Add <PluginOutlet name="dashboard.widgets" /> to a page where the starter extension should appear.')
  }

  if (answers.starter) {
    const id = answers.starter
    const options = { id, roles: answers.roles, database: answers.database }
    const dir = join(answers.extensionsDir, id)
    files.push(
      { path: join(dir, 'manifest.ts'), content: starterManifestStub(options) },
      { path: join(dir, 'README.md'), content: starterReadmeStub(id) },
      { path: join(dir, 'components', `${starterWidgetName(id)}.vue`), content: starterWidgetStub(options) },
      { path: join(dir, 'pages', id, 'index.vue'), content: starterPageStub(options) },
    )
    if (hasDb) {
      files.push(
        { path: join(dir, 'server/api', id, 'items.get.ts'), content: starterItemsApiStub(id) },
        { path: join(dir, 'server/migrations/001-create-items.ts'), content: starterMigrationStub(id) },
        { path: join(dir, 'server/seeders/001-demo-items.ts'), content: starterSeederStub(id) },
      )
      notes.push(
        answers.autoMigrate
          ? `Table "${tableName(id)}" is created when the server starts. Add demo rows with: npx nuxt task run modular:seed (dev server running).`
          : `Create the tables with: npx nuxt task run modular:migrate (dev server running).`,
      )
    } else {
      files.push({ path: join(dir, 'server/api', id, 'ping.get.ts'), content: starterPingStub(id) })
    }
  }

  const env: Record<string, string> = {}
  const example = URL_EXAMPLES[answers.database]
  if (example) {
    env[DATABASE_URL_ENV] = `# Connection URL for nuxt-modular (also used by your migrations)\n${DATABASE_URL_ENV}=${example}`
    notes.push(`Set ${DATABASE_URL_ENV} in .env (see .env.example) before starting the server.`)
  }

  const driver = DRIVERS[answers.database]
  if (driver && !answers.installDriver) notes.push(`Install the ${answers.database} driver: ${project.packageManager} add ${driver}`)

  return {
    files,
    configBlock: configBlock(answers),
    scripts: { 'modular:list': 'nuxt-modular list', 'modular:validate': 'nuxt-modular validate --strict' },
    env,
    gitignore: answers.database === 'sqlite' ? ['.data'] : [],
    install: driver && answers.installDriver ? [driver] : [],
    notes,
  }
}

const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/** Validates user input for the answers. Throws a `CliError` with a message the user can act on. */
export function validateAnswers(answers: InitAnswers): void {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_\-./]*$/.test(answers.extensionsDir) || answers.extensionsDir.split('/').includes('..')) {
    throw new CliError(`Invalid extensions directory "${answers.extensionsDir}": use a relative path such as "extensions"`)
  }
  if (!answers.roles.length) throw new CliError('Define at least one role, for example "admin,member"')
  for (const role of answers.roles) {
    if (!SLUG.test(role)) throw new CliError(`Invalid role "${role}": use lowercase letters, digits and "-" (for example "admin")`)
  }
  if (new Set(answers.roles).size !== answers.roles.length) throw new CliError('Roles must be unique')
  if (!answers.roles.includes(answers.defaultRole)) {
    throw new CliError(`Default role "${answers.defaultRole}" is not one of: ${answers.roles.join(', ')}`)
  }
  if (answers.starter !== false && (!SLUG.test(answers.starter) || answers.starter.length > 64)) {
    throw new CliError(`Invalid extension id "${answers.starter}": use a kebab-case slug such as "hello"`)
  }
}
