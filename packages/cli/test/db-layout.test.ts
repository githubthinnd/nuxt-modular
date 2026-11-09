import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  COMMANDS,
  type CommandIO,
  commandHelp,
  main,
  overview,
  type Prompter,
  readModularDatabase,
  runDb,
  setModularDatabase,
  standardLayout,
} from '../src/index'
import { upsertEnvValue } from '../src/init/env'

// The env file is a custom name on purpose: these tests must also run where reading `.env` is not allowed.
const ENV = '.env.test'

let cwd: string
let out: string[]
let err: string[]

const io = (): CommandIO => ({ cwd, out: (m) => void out.push(m), err: (m) => void err.push(m) })
const run = (...argv: string[]) => main(argv, io())
const read = (path: string) => readFileSync(join(cwd, path), 'utf8')
const write = (path: string, content: string) => {
  mkdirSync(join(cwd, path, '..'), { recursive: true })
  writeFileSync(join(cwd, path), content)
}

const CONFIG = `export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: ['nuxt-modular'],
})
`

function nuxtProject(config = CONFIG) {
  write('nuxt.config.ts', config)
  write('package.json', `${JSON.stringify({ name: 'demo', scripts: {}, dependencies: { nuxt: '^4.0.0' } }, null, 2)}\n`)
  write('.gitignore', 'node_modules\n')
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'nuxt-modular-db-'))
  out = []
  err = []
})
afterEach(() => rmSync(cwd, { recursive: true, force: true }))

function scripted(answers: Record<string, string | boolean>): Prompter {
  const find = (message: string) => Object.entries(answers).find(([fragment]) => message.includes(fragment))?.[1]
  return {
    text: async (message, options) => String(find(message) ?? options?.initial ?? ''),
    confirm: async (message, options) => Boolean(find(message) ?? options?.initial ?? true),
    select: async (message, options) => (find(message) ?? options.initial ?? options.options[0]?.value) as never,
  }
}

describe('modular.database in nuxt.config', () => {
  it('reads the configured expression', () => {
    expect(readModularDatabase(CONFIG)).toBeUndefined()
    const source = "export default defineNuxtConfig({\n  modular: {\n    tasks: true,\n    database: { connector: 'postgresql' },\n  },\n})\n"
    expect(readModularDatabase(source)).toBe("{ connector: 'postgresql' }")
    expect(readModularDatabase("export default defineNuxtConfig({ modular: { database: 'sqlite:./a.db' } })")).toBe("'sqlite:./a.db'")
  })

  it('creates the modular block when it is missing', () => {
    const result = setModularDatabase(CONFIG, "'sqlite:./.data/modular.sqlite'", ['A comment'])
    expect(result.changed).toBe(true)
    expect(result.source).toContain("  modular: {\n    // A comment\n    database: 'sqlite:./.data/modular.sqlite',\n  },")
  })

  it('adds database to an existing modular block', () => {
    const source = "export default defineNuxtConfig({\n  modular: {\n    tasks: true,\n  },\n})\n"
    const result = setModularDatabase(source, 'false')
    expect(result.source).toContain('modular: {\n    database: false,\n    tasks: true,')
  })

  it('replaces the existing value, whatever its shape, and leaves the rest alone', () => {
    const source = "export default defineNuxtConfig({\n  modular: {\n    database: { connector: 'postgresql', options: { max: 5 } }, // pool\n    tasks: true,\n  },\n})\n"
    const result = setModularDatabase(source, "{ connector: 'mysql2' }")
    expect(result.source).toContain("database: { connector: 'mysql2' }, // pool\n    tasks: true,")
    expect(result.source).not.toContain('postgresql')
  })

  it('is idempotent and reports snippets when it cannot place the value', () => {
    const once = setModularDatabase(CONFIG, 'false')
    expect(setModularDatabase(once.source, 'false').changed).toBe(false)
    expect(setModularDatabase('export default {}\n', 'false').manual.length).toBeGreaterThan(0)
  })
})

describe('env file helper', () => {
  it('sets, replaces and quotes values', () => {
    expect(upsertEnvValue('', 'A', 'x')).toBe('A=x\n')
    expect(upsertEnvValue('B=1\nA=old\n', 'A', 'new')).toBe('B=1\nA=new\n')
    expect(upsertEnvValue('B=1', 'A', 'x')).toBe('B=1\nA=x\n')
    expect(upsertEnvValue('', 'A', 'has space # hash')).toBe('A="has space # hash"\n')
  })
})

describe('standard extension layout', () => {
  it('has the same layers for SQL and storage, and only SQL has migrations and seeders', () => {
    const sql = standardLayout({ id: 'my-shop', roles: ['admin'], data: 'sql' }).map((file) => file.path)
    const storage = standardLayout({ id: 'my-shop', roles: ['admin'], data: 'storage' }).map((file) => file.path)
    for (const layer of ['shared/item.ts', 'server/services/item.service.ts', 'server/repositories/item.repository.ts', 'composables/useMyShopItems.ts', 'components/MyShopItemList.vue', 'pages/my-shop/index.vue']) {
      expect(sql, layer).toContain(layer)
      expect(storage, layer).toContain(layer)
    }
    expect(sql).toContain('server/migrations/001-create-items.ts')
    expect(storage.some((path) => path.includes('migrations'))).toBe(false)
  })

  it('keeps each layer in its place', () => {
    const files = Object.fromEntries(standardLayout({ id: 'hello', roles: ['admin'], data: 'sql' }).map((file) => [file.path, file.content]))
    expect(files['server/repositories/item.repository.ts']).toContain('hello_items')
    expect(files['server/api/hello/items/index.post.ts']).toContain("from '../../../services/item.service'")
    expect(files['server/api/hello/items/index.post.ts']).toContain("from '../../../../shared/item'")
    expect(files['server/api/hello/items/index.get.ts']).not.toContain('prepare(')
    expect(files['server/services/item.service.ts']).not.toContain('readBody')
    expect(files['composables/useHelloItems.ts']).toContain('/api/hello/items')
    expect(files['components/HelloItemList.vue']).not.toContain('$fetch')
    expect(files['shared/item.ts']).not.toMatch(/from '(vue|nuxt|h3|#)/)
  })
})

describe('make:* generators for the layers', () => {
  it('make:extension uses SQL when the project configures a database, storage otherwise', async () => {
    nuxtProject()
    expect(await run('make:extension', 'plain')).toBe(0)
    expect(read('extensions/plain/server/repositories/item.repository.ts')).toContain('useStorage')
    nuxtProject(CONFIG.replace('modules:', "modular: { database: 'sqlite:./a.db' },\n  modules:"))
    expect(await run('make:extension', 'dbbed', '--roles', 'admin, editor')).toBe(0)
    expect(read('extensions/dbbed/server/repositories/item.repository.ts')).toContain('useModularDatabase')
    expect(read('extensions/dbbed/manifest.ts')).toContain("defaultRoles: ['admin', 'editor']")
    expect(existsSync(join(cwd, 'extensions/dbbed/server/migrations/001-create-items.ts'))).toBe(true)
    out.length = 0
    expect(await run('validate', '--strict')).toBe(0)
  })

  it('make:service, make:repository and make:composable write into the right folders', async () => {
    nuxtProject()
    await run('make:extension', 'blog', '--minimal')
    expect(await run('make:service', 'blog', 'Post Comments')).toBe(0)
    expect(read('extensions/blog/server/services/post-comments.service.ts')).toContain('listPostComments')
    expect(await run('make:repository', 'blog', 'posts')).toBe(0)
    expect(read('extensions/blog/server/repositories/posts.repository.ts')).toContain('useStorage')
    expect(await run('make:composable', 'blog', 'posts')).toBe(0)
    expect(read('extensions/blog/composables/usePosts.ts')).toContain('export function usePosts')
    expect(await run('make:service', 'blog', 'posts')).toBe(0)
    expect(await run('make:service', 'blog', 'posts')).toBe(2)
    expect(await run('make:service', 'nope', 'x')).toBe(2)
  })
})

describe('nuxt-modular db', () => {
  it('switches to PostgreSQL: config, env file, example and driver', async () => {
    nuxtProject()
    const installs: unknown[] = []
    const code = await runDb(io(), {
      database: 'postgresql',
      url: 'postgresql://u:p@localhost:5432/app',
      envFile: ENV,
      yes: true,
      installPackages: (...args) => void installs.push(args),
    })
    expect(code).toBe(0)
    expect(read('nuxt.config.ts')).toContain("database: { connector: 'postgresql' }")
    expect(read('nuxt.config.ts')).not.toContain('localhost')
    expect(read(ENV)).toBe('NUXT_MODULAR_DATABASE_URL=postgresql://u:p@localhost:5432/app\n')
    expect(read('.env.example')).toContain('NUXT_MODULAR_DATABASE_URL=postgresql://')
    expect(read('.gitignore')).toContain(ENV)
    expect(installs).toEqual([['npm', ['pg'], cwd]])
    expect(out.join('\n')).toContain('Existing data is not copied')
    expect(out.join('\n')).not.toContain('u:p@')
  })

  it('switches an existing setup and updates the URL instead of duplicating it', async () => {
    nuxtProject()
    await runDb(io(), { database: 'postgresql', url: 'postgresql://a/b', envFile: ENV, yes: true, noInstall: true })
    await runDb(io(), { database: 'mysql', url: 'mysql://c/d', envFile: ENV, yes: true, noInstall: true })
    expect(read('nuxt.config.ts')).toContain("database: { connector: 'mysql2' }")
    expect(read('nuxt.config.ts')).not.toContain('postgresql')
    expect(read(ENV)).toBe('NUXT_MODULAR_DATABASE_URL=mysql://c/d\n')
    await runDb(io(), { database: 'sqlite', yes: true, noInstall: true })
    expect(read('nuxt.config.ts')).toContain("database: 'sqlite:./.data/modular.sqlite'")
    await runDb(io(), { database: 'none', yes: true })
    expect(read('nuxt.config.ts')).toContain('database: false')
  })

  it('asks the questions in a terminal and accepts an empty URL', async () => {
    nuxtProject()
    const code = await runDb(io(), { interactive: true, envFile: ENV, prompter: scripted({ 'Which database': 'postgresql', 'Connection URL': '', 'Install the pg': false }) })
    expect(code).toBe(0)
    expect(read('nuxt.config.ts')).toContain("connector: 'postgresql'")
    expect(existsSync(join(cwd, ENV))).toBe(false)
    expect(out.join('\n')).toContain('Set NUXT_MODULAR_DATABASE_URL')
    expect(out.join('\n')).toContain('Install the driver: npm add pg')
  })

  it('tells the user which extensions still store data in Nitro storage', async () => {
    nuxtProject()
    await run('make:extension', 'notes')
    out.length = 0
    await runDb(io(), { database: 'sqlite', yes: true })
    expect(out.join('\n')).toContain('notes still keeps data in Nitro storage')
    nuxtProject(CONFIG.replace('modules:', "modular: { database: 'sqlite:./a.db' },\n  modules:"))
    await run('make:extension', 'orders')
    out.length = 0
    await runDb(io(), { database: 'sqlite', yes: true })
    expect(out.join('\n')).not.toContain('orders still')
  })

  it('does not install a driver that is already a dependency', async () => {
    nuxtProject()
    write('package.json', `${JSON.stringify({ name: 'demo', dependencies: { pg: '^8.0.0' } })}\n`)
    const installs: unknown[] = []
    await runDb(io(), { database: 'postgresql', yes: true, installPackages: (...args) => void installs.push(args), envFile: ENV })
    expect(installs).toEqual([])
  })

  it('validates its input before changing anything', async () => {
    nuxtProject()
    expect(await run('db', '--yes')).toBe(2)
    expect(err.join('\n')).toContain('Pass --database')
    expect(await run('db', '--yes', '--database', 'oracle')).toBe(2)
    expect(await run('db', '--yes', '--database', 'sqlite', '--url', 'postgresql://x/y')).toBe(2)
    expect(await run('db', '--yes', '--database', 'postgresql', '--url', 'mysql://x/y')).toBe(2)
    expect(read('nuxt.config.ts')).toBe(CONFIG)
  })

  it('works through the command line and stays quiet when cancelled', async () => {
    nuxtProject()
    expect(await run('db', '--yes', '--database', 'sqlite')).toBe(0)
    expect(read('nuxt.config.ts')).toContain("sqlite:./.data/modular.sqlite")
    const cancelling: Prompter = {
      text: async () => '',
      confirm: async () => true,
      select: async () => {
        const { SetupCancelled } = await import('../src/index')
        throw new SetupCancelled('cancelled')
      },
    }
    nuxtProject()
    out.length = 0
    expect(await runDb(io(), { interactive: true, prompter: cancelling })).toBe(0)
    expect(read('nuxt.config.ts')).toBe(CONFIG)
  })
})

describe('init and the connection URL', () => {
  it('writes the URL given with --database-url to the chosen env file', async () => {
    nuxtProject()
    expect(await run('init', '--yes', '--no-install', '--database', 'postgresql', '--database-url', 'postgresql://u:p@h/db', '--env-file', ENV)).toBe(0)
    expect(read(ENV)).toContain('NUXT_MODULAR_DATABASE_URL=postgresql://u:p@h/db')
    expect(read('nuxt.config.ts')).not.toContain('u:p@h')
    expect(JSON.parse(read('package.json')).scripts).toMatchObject({ modular: 'nuxt-modular', 'modular:validate': 'nuxt-modular validate --strict' })
  })
})

describe('discoverable help', () => {
  it('lists every command, grouped, when run without arguments or with --help', async () => {
    expect(await run()).toBe(0)
    const text = out.join('\n')
    for (const group of ['Set up', 'Generate (inside an extension)', 'Inspect']) expect(text).toContain(group)
    for (const command of COMMANDS) expect(text, command.name).toContain(command.name)
    expect(text).toContain('nuxt-modular help <command>')
    out.length = 0
    await run('--help')
    expect(out.join('\n')).toBe(overview())
  })

  it('shows options and examples of one command, in both spellings', async () => {
    for (const argv of [['help', 'db'], ['db', '--help']]) {
      out.length = 0
      expect(await run(...argv)).toBe(0)
      expect(out.join('\n')).toContain('--database <name>')
      expect(out.join('\n')).toContain('Examples')
    }
    expect(commandHelp('make:extension')).toContain('--roles')
    expect(commandHelp('nope')).toBeUndefined()
    expect(await run('help', 'nope')).toBe(2)
  })

  it('documents every command the CLI accepts', async () => {
    const accepted = ['init', 'db', 'list', 'validate', 'make:extension', 'make:service', 'make:repository', 'make:composable', 'make:component', 'make:page', 'make:api', 'make:hook', 'make:plugin', 'make:migration', 'make:seeder']
    expect(COMMANDS.map((command) => command.name).sort()).toEqual([...accepted].sort())
    for (const name of accepted) expect(await run('help', name), name).toBe(0)
  })
})
