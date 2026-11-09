import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type CommandIO,
  detectPackageManager,
  detectProject,
  type InitAnswers,
  main,
  patchNuxtConfig,
  planInit,
  type Prompter,
  runInit,
  SetupCancelled,
  validateAnswers,
} from '../src/index'

let cwd: string
let out: string[]
let err: string[]

const io = (): CommandIO => ({ cwd, out: (m) => void out.push(m), err: (m) => void err.push(m) })
const read = (path: string) => readFileSync(join(cwd, path), 'utf8')
const write = (path: string, content: string) => {
  mkdirSync(join(cwd, path, '..'), { recursive: true })
  writeFileSync(join(cwd, path), content)
}

const DEFAULT_CONFIG = `// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
})
`
const DEFAULT_APP = `<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtWelcome />
  </div>
</template>
`

function nuxtProject(options: { config?: string; app?: string | null; srcDir?: 'app' | '.'; lock?: string } = {}) {
  write('nuxt.config.ts', options.config ?? DEFAULT_CONFIG)
  write('package.json', `${JSON.stringify({ name: 'demo-app', private: true, scripts: { dev: 'nuxt dev' }, dependencies: { nuxt: '^4.0.0' } }, null, 2)}\n`)
  const src = options.srcDir === '.' ? '' : 'app/'
  if (options.app !== null) write(`${src}app.vue`, options.app ?? DEFAULT_APP)
  if (options.lock) write(options.lock, '')
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'nuxt-modular-init-'))
  out = []
  err = []
})
afterEach(() => rmSync(cwd, { recursive: true, force: true }))

/** Answers questions by matching a fragment of the message; anything unmatched keeps its default. */
function scripted(answers: Record<string, string | boolean>): Prompter & { asked: string[] } {
  const asked: string[] = []
  const find = (message: string) => Object.entries(answers).find(([fragment]) => message.includes(fragment))?.[1]
  return {
    asked,
    async text(message, options) {
      asked.push(message)
      return String(find(message) ?? options?.initial ?? '')
    },
    async confirm(message, options) {
      asked.push(message)
      return Boolean(find(message) ?? options?.initial ?? true)
    },
    async select(message, options) {
      asked.push(message)
      return (find(message) ?? options.initial ?? options.options[0]?.value) as never
    },
  }
}

describe('patchNuxtConfig', () => {
  const block = "  modular: {\n    tasks: true,\n  },"

  it('registers the module and appends the modular block to the default Nuxt config', () => {
    const result = patchNuxtConfig(DEFAULT_CONFIG, block)
    expect(result.changed).toBe(true)
    expect(result.manual).toEqual([])
    expect(result.source).toContain("modules: ['nuxt-modular'],")
    expect(result.source).toContain('devtools: { enabled: true },\n  modular: {\n    tasks: true,\n  },\n})')
  })

  it('adds to an existing multi-line modules array and keeps its indentation', () => {
    const source = "export default defineNuxtConfig({\n  modules: [\n    '@nuxt/ui',\n  ],\n})\n"
    const result = patchNuxtConfig(source, undefined)
    expect(result.source).toContain("modules: [\n    'nuxt-modular',\n    '@nuxt/ui',\n  ],")
  })

  it('adds to an inline modules array and to an empty one', () => {
    expect(patchNuxtConfig("export default defineNuxtConfig({ modules: ['@nuxt/ui'] })", undefined).source).toContain(
      "modules: ['nuxt-modular', '@nuxt/ui']",
    )
    expect(patchNuxtConfig('export default defineNuxtConfig({ modules: [] })', undefined).source).toContain("modules: ['nuxt-modular']")
  })

  it('does not register the module twice and is idempotent', () => {
    const once = patchNuxtConfig(DEFAULT_CONFIG, block)
    const twice = patchNuxtConfig(once.source, block)
    expect(twice.changed).toBe(false)
    expect(twice.source.match(/nuxt-modular/g)).toHaveLength(1)
    expect(twice.manual).toHaveLength(1) // the existing modular block is left for the user to merge
  })

  it('handles an empty config object', () => {
    const result = patchNuxtConfig('export default defineNuxtConfig({})\n', block)
    expect(result.source).toBe("export default defineNuxtConfig({\n  modules: ['nuxt-modular'],\n  modular: {\n    tasks: true,\n  },\n})\n")
  })

  it('ignores braces and brackets inside strings and comments', () => {
    const source = "export default defineNuxtConfig({\n  // modules: [ 'x'\n  app: { head: { title: 'a } ] b' } },\n})\n"
    const result = patchNuxtConfig(source, block)
    expect(result.manual).toEqual([])
    expect(result.source).toContain("modules: ['nuxt-modular'],")
    expect(result.source.trimEnd().endsWith('},\n})')).toBe(true)
  })

  it('returns snippets when the config is not a plain defineNuxtConfig object', () => {
    const result = patchNuxtConfig('module.exports = {}\n', block)
    expect(result.changed).toBe(false)
    expect(result.manual).toEqual(["modules: ['nuxt-modular'],", block])
  })

  it('only treats direct properties as modules or modular, not nested keys', () => {
    const source = "export default defineNuxtConfig({\n  runtimeConfig: { modular: 1, modules: [] },\n  vite: { modules: ['x'] },\n})\n"
    const result = patchNuxtConfig(source, block)
    expect(result.manual).toEqual([])
    expect(result.source).toContain("modules: ['nuxt-modular'],")
    expect(result.source).toContain("vite: { modules: ['x'] }")
    expect(result.source).toContain('  modular: {\n    tasks: true,')
  })

  it('keeps quoted keys and trailing comments intact', () => {
    const source = "export default defineNuxtConfig({\n  'modules': ['a'], // list\n})\n"
    expect(patchNuxtConfig(source, undefined).source).toContain("'modules': ['nuxt-modular', 'a']")
  })

  it('adds a missing comma before the block', () => {
    const result = patchNuxtConfig("export default defineNuxtConfig({\n  devtools: { enabled: true }\n})\n", block)
    expect(result.source).toContain('devtools: { enabled: true },\n  modular')
  })
})

describe('planInit', () => {
  const answers = (overrides: Partial<InitAnswers> = {}): InitAnswers => ({
    extensionsDir: 'extensions',
    database: 'sqlite',
    roles: ['admin', 'member'],
    defaultRole: 'member',
    starter: 'hello',
    hostShell: true,
    tasks: true,
    autoMigrate: true,
    installDriver: false,
    ...overrides,
  })
  const project = (): ReturnType<typeof detectProject> => {
    nuxtProject()
    return detectProject(cwd)
  }

  it('plans a complete host for SQLite', () => {
    const plan = planInit(answers(), project())
    const paths = plan.files.map((file) => file.path)
    expect(paths).toEqual(
      expect.arrayContaining([
        'app/plugins/modular-permissions.ts',
        'app/app.vue',
        'app/pages/index.vue',
        'extensions/hello/manifest.ts',
        'extensions/hello/components/HelloWidget.vue',
        'extensions/hello/pages/hello/index.vue',
        'extensions/hello/server/api/hello/items.get.ts',
        'extensions/hello/server/migrations/001-create-items.ts',
        'extensions/hello/server/seeders/001-demo-items.ts',
      ]),
    )
    expect(plan.files.find((file) => file.path === 'app/app.vue')?.overwrite).toBe(true)
    expect(plan.configBlock).toBe(
      "  modular: {\n    database: 'sqlite:./.data/modular.sqlite',\n    migrations: { auto: true },\n    tasks: true,\n  },",
    )
    expect(plan.gitignore).toEqual(['.data'])
    expect(plan.install).toEqual([])
  })

  it('plans PostgreSQL with a driver, an env example and no URL in the config', () => {
    const plan = planInit(answers({ database: 'postgresql', installDriver: true }), project())
    expect(plan.configBlock).toContain("database: { connector: 'postgresql' }")
    expect(plan.configBlock).not.toContain('postgresql://')
    expect(Object.keys(plan.env)).toEqual(['NUXT_MODULAR_DATABASE_URL'])
    expect(plan.install).toEqual(['pg'])
    expect(plan.gitignore).toEqual([])
  })

  it('uses the mysql2 connector for MySQL and tells the user to install the driver when not installing', () => {
    const plan = planInit(answers({ database: 'mysql' }), project())
    expect(plan.configBlock).toContain("connector: 'mysql2'")
    expect(plan.install).toEqual([])
    expect(plan.notes.join('\n')).toContain('add mysql2')
  })

  it('without a database: no migrations, a ping route, no config block', () => {
    const plan = planInit(answers({ database: 'none', tasks: false, autoMigrate: false }), project())
    const paths = plan.files.map((file) => file.path)
    expect(paths).toContain('extensions/hello/server/api/hello/ping.get.ts')
    expect(paths.some((path) => path.includes('migrations'))).toBe(false)
    expect(plan.configBlock).toBeUndefined()
  })

  it('writes the Nuxt 3 layout without the app/ prefix', () => {
    nuxtProject({ srcDir: '.' })
    const plan = planInit(answers(), detectProject(cwd))
    expect(plan.files.map((file) => file.path)).toEqual(expect.arrayContaining(['plugins/modular-permissions.ts', 'app.vue', 'pages/index.vue']))
  })

  it('leaves a customised app.vue alone and explains how to wire the menu', () => {
    nuxtProject({ app: '<template><NuxtPage /></template>' })
    const plan = planInit(answers(), detectProject(cwd))
    expect(plan.files.some((file) => file.path === 'app/app.vue')).toBe(false)
    expect(plan.notes.join('\n')).toContain('already exists')
  })

  it('can skip the starter extension and the host shell', () => {
    const plan = planInit(answers({ starter: false, hostShell: false }), project())
    expect(plan.files.map((file) => file.path)).toEqual(['app/plugins/modular-permissions.ts'])
    expect(plan.notes.join('\n')).toContain('PluginOutlet')
  })

  it('writes a custom extensions directory into the config', () => {
    const plan = planInit(answers({ extensionsDir: 'modules' }), project())
    expect(plan.configBlock).toContain("extensionsDir: 'modules'")
    expect(plan.files.map((file) => file.path)).toContain('modules/hello/manifest.ts')
  })
})

describe('validateAnswers', () => {
  const base: InitAnswers = {
    extensionsDir: 'extensions',
    database: 'none',
    roles: ['admin'],
    defaultRole: 'admin',
    starter: 'hello',
    hostShell: true,
    tasks: false,
    autoMigrate: false,
    installDriver: false,
  }
  it.each([
    [{ extensionsDir: '../outside' }, 'Invalid extensions directory'],
    [{ extensionsDir: '/abs' }, 'Invalid extensions directory'],
    [{ roles: [] }, 'at least one role'],
    [{ roles: ['Admin'] }, 'Invalid role'],
    [{ roles: ['a', 'a'], defaultRole: 'a' }, 'unique'],
    [{ defaultRole: 'ghost' }, 'not one of'],
    [{ starter: 'Not Valid' }, 'Invalid extension id'],
  ] satisfies [Partial<InitAnswers>, string][])('rejects %j', (override, message) => {
    expect(() => validateAnswers({ ...base, ...override })).toThrow(message)
  })
  it('accepts a valid set', () => {
    expect(() => validateAnswers(base)).not.toThrow()
    expect(() => validateAnswers({ ...base, starter: false })).not.toThrow()
  })
})

describe('detectProject', () => {
  it('fails clearly outside a Nuxt project', () => {
    expect(() => detectProject(cwd)).toThrow(/No nuxt\.config found/)
  })

  it('detects layout, package manager, default app.vue and existing setup', () => {
    nuxtProject({ lock: 'pnpm-lock.yaml' })
    write('app/pages/index.vue', '<template><div /></template>')
    const project = detectProject(cwd)
    expect(project).toMatchObject({ srcDir: 'app', packageManager: 'pnpm', appVueIsDefault: true, hasIndexPage: true, hasExtensions: false, name: 'demo-app' })
  })

  it('detects the package manager from lockfiles, packageManager and the user agent', () => {
    expect(detectPackageManager(cwd, 'yarn/4.0')).toBe('yarn')
    expect(detectPackageManager(cwd, '')).toBe('npm')
    write('bun.lock', '')
    expect(detectPackageManager(cwd, '')).toBe('bun')
  })
})

describe('make:extension hint', () => {
  it('tells the user how to make the new extension visible', async () => {
    nuxtProject()
    expect(await main(['make:extension', 'shop'], io())).toBe(0)
    expect(out.join('\n')).toContain('defaultRoles')
    expect(out.join('\n')).toContain('nuxt-modular init')
  })
})

describe('runInit', () => {
  it('builds a complete project from the answers and the result validates', async () => {
    nuxtProject({ lock: 'pnpm-lock.yaml' })
    write('.gitignore', 'node_modules\n')
    const prompter = scripted({ 'Which database': 'sqlite', 'Which roles': 'admin,editor,viewer', 'current visitor': 'editor', 'Starter extension id': 'blog' })
    const installs: unknown[] = []
    expect(await runInit(io(), { prompter, interactive: true, installPackages: (...args) => void installs.push(args) })).toBe(0)

    expect(read('nuxt.config.ts')).toContain("modules: ['nuxt-modular'],")
    expect(read('nuxt.config.ts')).toContain("database: 'sqlite:./.data/modular.sqlite'")
    expect(read('app/plugins/modular-permissions.ts')).toContain("default: () => 'editor'")
    expect(read('app/app.vue')).toContain('<NuxtPage />')
    expect(read('app/app.vue')).not.toContain('NuxtWelcome')
    expect(read('extensions/blog/manifest.ts')).toContain("defaultRoles: ['admin', 'editor', 'viewer']")
    expect(read('extensions/blog/server/migrations/001-create-items.ts')).toContain('blog_items')
    expect(JSON.parse(read('package.json')).scripts).toMatchObject({ dev: 'nuxt dev', 'modular:list': 'nuxt-modular list', 'modular:validate': 'nuxt-modular validate --strict' })
    expect(read('.gitignore')).toBe('node_modules\n.data\n')
    expect(installs).toEqual([])

    out.length = 0
    expect(await main(['validate', '--strict'], io())).toBe(0)
    expect(out.join('\n')).toContain('1 extension(s) valid')
  })

  it('is idempotent: a second run keeps files and does not duplicate config', async () => {
    nuxtProject()
    await runInit(io(), { yes: true, noInstall: true })
    const config = read('nuxt.config.ts')
    const manifest = read('extensions/hello/manifest.ts')
    write('extensions/hello/manifest.ts', `${manifest}// edited\n`)
    out.length = 0
    expect(await runInit(io(), { yes: true, noInstall: true })).toBe(0)
    expect(read('extensions/hello/manifest.ts')).toContain('// edited')
    expect(read('nuxt.config.ts').match(/nuxt-modular/g)).toHaveLength(config.match(/nuxt-modular/g)?.length as number)
    expect(read('nuxt.config.ts').match(/modular: \{/g)).toHaveLength(1)
    expect(out.join('\n')).toContain('kept')
  })

  it('installs the PostgreSQL driver and survives an install failure', async () => {
    nuxtProject({ lock: 'package-lock.json' })
    const calls: unknown[] = []
    const prompter = scripted({ 'Which database': 'postgresql' })
    await runInit(io(), { prompter, interactive: true, installPackages: (...args) => void calls.push(args) })
    expect(calls).toEqual([['npm', ['pg'], cwd]])
    expect(read('.env.example')).toContain('NUXT_MODULAR_DATABASE_URL=postgresql://')

    rmSync(join(cwd, 'extensions'), { recursive: true })
    err.length = 0
    expect(
      await runInit(io(), {
        prompter: scripted({ 'Which database': 'postgresql' }),
        interactive: true,
        installPackages: () => {
          throw new Error('offline')
        },
      }),
    ).toBe(0)
    expect(err.join('\n')).toContain('Install it yourself: npm install pg')
  })

  it('--yes uses defaults and flags: sqlite, admin and member, starter hello', async () => {
    nuxtProject()
    expect(await main(['init', '--yes', '--roles', 'owner,guest', '--extension', 'shop', '--no-shell'], io())).toBe(0)
    expect(existsSync(join(cwd, 'extensions/shop/manifest.ts'))).toBe(true)
    expect(read('app/plugins/modular-permissions.ts')).toContain("default: () => 'guest'")
    expect(read('app/app.vue')).toContain('NuxtWelcome')
  })

  it('needs a terminal or --yes', async () => {
    nuxtProject()
    expect(await main(['init'], io())).toBe(2)
    expect(err.join('\n')).toContain('needs a terminal')
    expect(existsSync(join(cwd, 'extensions'))).toBe(false)
  })

  it('refuses to run outside a Nuxt project', async () => {
    expect(await main(['init', '--yes'], io())).toBe(2)
    expect(err.join('\n')).toContain('No nuxt.config found')
  })

  it('rejects bad flags before writing anything', async () => {
    nuxtProject()
    expect(await main(['init', '--yes', '--database', 'oracle'], io())).toBe(2)
    expect(await main(['init', '--yes', '--roles', 'Admin'], io())).toBe(2)
    expect(await main(['init', '--yes', '--extension', 'Bad Id'], io())).toBe(2)
    expect(read('nuxt.config.ts')).toBe(DEFAULT_CONFIG)
    expect(existsSync(join(cwd, 'extensions'))).toBe(false)
  })

  it('guided mode can be declined without touching the project', async () => {
    nuxtProject()
    expect(await runInit(io(), { guided: true, interactive: true, prompter: scripted({ 'Set up a working project': 'skip' }) })).toBe(0)
    expect(read('nuxt.config.ts')).toBe(DEFAULT_CONFIG)
    expect(out.join('\n')).toContain('npx nuxt-modular init')
  })

  it('does nothing when the final confirmation is declined or the user cancels', async () => {
    nuxtProject()
    expect(await runInit(io(), { interactive: true, prompter: scripted({ 'Apply these changes': false }) })).toBe(0)
    expect(read('nuxt.config.ts')).toBe(DEFAULT_CONFIG)

    const cancelling: Prompter = {
      text: async () => {
        throw new SetupCancelled('cancelled')
      },
      confirm: async () => true,
      select: async () => 'sqlite' as never,
    }
    out.length = 0
    expect(await runInit(io(), { interactive: true, prompter: cancelling })).toBe(0)
    expect(out.join('\n')).toContain('cancelled')
    expect(existsSync(join(cwd, 'extensions'))).toBe(false)
  })

  it('shows the config snippet when nuxt.config cannot be patched', async () => {
    nuxtProject({ config: 'export default {}\n' })
    await runInit(io(), { yes: true, noInstall: true })
    expect(read('nuxt.config.ts')).toBe('export default {}\n')
    expect(out.join('\n')).toContain("modules: ['nuxt-modular'],")
  })
})
