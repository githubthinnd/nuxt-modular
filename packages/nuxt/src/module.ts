import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import {
  addComponent,
  addComponentsDir,
  addImports,
  addImportsDir,
  addPlugin,
  addRouteMiddleware,
  addServerHandler,
  addServerImports,
  addServerPlugin,
  addServerScanDir,
  addServerTemplate,
  addTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  extendPages,
  resolvePath,
  tryResolveModule,
  useLogger,
} from '@nuxt/kit'
import {
  checkRequirements,
  createRegistryState,
  ExtensionConflictError,
  findMissingDependencies,
  type JsonObject,
  registerExtension,
  satisfies,
  sortByDependencies,
} from '@nuxt-modular/core'
import { dirname, join, relative, resolve } from 'pathe'
import { addDevtoolsTypes, setupDevtools } from './devtools'
import { isCI, wantsGuidedSetup } from './setup-guide'
import { CONNECTOR_DRIVERS, connectorModule, type DatabaseInput, resolveDatabaseInput } from './runtime/utils/database-options'
import { glob } from 'tinyglobby'
import {
  describeDir,
  findExtensionDirs,
  MANIFEST_FILENAMES,
  scanExtension,
  type ScannedExtension,
  serverRouteFromPath,
} from './scan'
import {
  componentsTemplate,
  componentsTypes,
  databaseContextTypes,
  databaseTemplate,
  manifestsTemplate,
  manifestsTypes,
  migrationsTemplate,
  nitroHooksTypes,
  seedersTemplate,
  serverDataTypes,
  serverHooksTemplate,
  serverHooksTypes,
  serverManifestsTemplate,
  serverRoutesTemplate,
} from './templates'

export interface ModuleOptions {
  /**
   * Directory, relative to the root of the app and of every layer, whose
   * sub-directories are extensions.
   * @default 'extensions'
   */
  extensionsDir: string
  /**
   * Extension ids to leave out of the build entirely: none of their
   * components, pages, plugins, server routes or hooks are registered.
   * @default []
   */
  disabled: string[]
  /**
   * Adds an "Extensions" tab to Nuxt DevTools (development only).
   * @default true
   */
  devtools: boolean
  /**
   * Nitro storage mount for persistent toggles and the migration ledger.
   * Configure its driver with `nitro.storage[<mount>]`; Nitro's default is
   * in-memory, which forgets everything on restart.
   * @default 'nuxt-modular'
   */
  storage: string
  /**
   * Persistent feature toggles (`useModularToggles()` on the server). When an
   * extension is switched off, its slots, navigation, pages, API routes and
   * server hooks all behave as if it were not installed.
   * `ttl` caches the stored toggles per server process (ms).
   * @default { enabled: true, ttl: 1000 }
   */
  toggles: { enabled: boolean; ttl: number }
  /**
   * Extension migrations (`server/migrations/*`). With `auto`, pending
   * migrations run when the server starts and requests wait for them.
   * @default { auto: false }
   */
  migrations: { auto: boolean }
  /**
   * Per-extension settings, deep-merged over `manifest.config` and read with
   * `useExtensionConfig(id)` / `useModularExtensionConfig(id)`. Public: they
   * ship to the browser. Keys declared here can be overridden at runtime with
   * `NUXT_PUBLIC_MODULAR_CONFIG_<ID>_<KEY>` (camelCase keys become SNAKE_CASE).
   * @default {}
   */
  config: Record<string, JsonObject>
  /**
   * SQL database for nuxt-modular's own state (migration ledger with an atomic
   * lock, persistent toggles) and for your migrations and seeders (`db` in
   * their context). SQLite, MySQL/MariaDB and PostgreSQL via db0.
   *
   * - `'postgresql://user:pass@host/db'`, `'mysql://…'`, `'sqlite:./modular.db'`: URL string
   * - `{ connector: 'postgresql' }` with the URL in `NUXT_MODULAR_DATABASE_URL` (keeps secrets out of the build)
   * - `{ handler: '~/server/modular-db', dialect: 'postgresql' }` to supply your own db0 instance
   *
   * Install the driver you use (`pg`, `mysql2`; SQLite needs none on Node ≥ 22.5).
   * @default false (state lives in Nitro storage)
   */
  database: DatabaseInput
  /**
   * Registers Nitro tasks (`nuxt task run modular:migrate`, `modular:seed`,
   * `modular:migrate:status|rollback|reset|refresh`, `modular:list`). Turns on
   * Nitro's `experimental.tasks`.
   * @default false
   */
  tasks: boolean
}

export interface ModuleHooks {
  /** Called with the extensions that will be built, after validation. Mutating the array is allowed. */
  'modular:extensions': (extensions: ScannedExtension[]) => void | Promise<void>
}

export type { ConnectorName, DatabaseInput } from './runtime/utils/database-options'
export type { ScannedExtension, ScannedMigration, ScannedPage, ScannedSeeder, ScannedServerHook, ScannedServerRoute } from './scan'

/** Import path for extension code (manifests, server hook handlers) → `@nuxt-modular/core`. */
export const CORE_ALIAS = '#modular'

/** Route meta key marking pages contributed by an extension (see runtime/middleware/extension-pages). */
const EXTENSION_ROUTE_META = 'modularExtension'

function readPackageVersion(file: string): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown }
    return typeof pkg.version === 'string' ? pkg.version : undefined
  } catch {
    return undefined
  }
}

const readOwnVersion = (): string | undefined => readPackageVersion(fileURLToPath(new URL('../package.json', import.meta.url)))

const TASKS = [
  'list',
  'migrate',
  'migrate-status',
  'migrate-rollback',
  'migrate-reset',
  'migrate-refresh',
  'seed',
] as const
const taskName = (file: string): string => `modular:${file.replace('-', ':')}`

export default defineNuxtModule<ModuleOptions>().with({
  meta: {
    name: 'nuxt-modular',
    // Nuxt only calls `onInstall` for modules whose meta has both a name and a version.
    version: readOwnVersion() ?? '0.0.0',
    configKey: 'modular',
    compatibility: { nuxt: '>=3.13.0' },
  },
  defaults: {
    extensionsDir: 'extensions',
    disabled: [],
    devtools: true,
    storage: 'nuxt-modular',
    toggles: { enabled: true, ttl: 1000 },
    migrations: { auto: false },
    config: {},
    database: false,
    tasks: false,
  },
  /**
   * Runs once per project, the first time the module starts after being added.
   * `nuxi module add nuxt-modular` triggers the guided setup (questions, then a working host);
   * any other way of adding the module only gets a hint, so a plain install stays untouched.
   */
  async onInstall(nuxt) {
    const logger = useLogger('nuxt-modular')
    const context = { argv: process.argv, env: process.env, stdinIsTTY: Boolean(process.stdin.isTTY), stdoutIsTTY: Boolean(process.stdout.isTTY) }
    if (!wantsGuidedSetup(context)) {
      if (!isCI(process.env)) logger.info('Run `npx nuxt-modular init` for a guided setup (config, permissions, host shell, starter extension).')
      return
    }
    try {
      const { processIO, runInit } = await import('@nuxt-modular/cli')
      await runInit(processIO(nuxt.options.rootDir), { guided: true })
    } catch (error) {
      logger.warn(`Guided setup stopped: ${error instanceof Error ? error.message : String(error)}\nRun \`npx nuxt-modular init\` to try again.`)
    }
  },
  async setup(options, nuxt) {
    const logger = useLogger('nuxt-modular')
    const resolver = createResolver(import.meta.url)
    // Bundlers, Nitro externals and jiti need the entry *file*. TypeScript gets
    // the package directory instead (see the Nitro `types:extend` hook below):
    // Nitro strips the file extension in tsconfig paths, and TypeScript never
    // tries `.d.mts` for an extension-less path.
    const corePath = fileURLToPath(import.meta.resolve('@nuxt-modular/core'))
    const coreDir = dirname(dirname(corePath)) // <pkg>/dist/index.mjs → <pkg>
    const label = (dir: string) => describeDir(nuxt.options.rootDir, dir)

    // Nuxt forwards its aliases to Vite, Nitro and the generated tsconfig.
    nuxt.options.alias[CORE_ALIAS] = corePath

    // -----------------------------------------------------------------------
    // 1. Discover and validate extensions. Layers are ordered app-first, so an
    //    extension in the app overrides one with the same id in a layer.
    // -----------------------------------------------------------------------
    const roots = [...new Set(nuxt.options._layers.map((layer) => resolve(layer.config.rootDir, options.extensionsDir)))]
    const disabled = new Set(options.disabled)
    const found: ScannedExtension[] = []
    const origin = new Map<string, { dir: string; rootIndex: number }>()

    for (const [rootIndex, root] of roots.entries()) {
      for (const dir of await findExtensionDirs(root)) {
        const extension = await scanExtension(dir, { alias: { [CORE_ALIAS]: corePath } })
        const id = extension.manifest.id
        const previous = origin.get(id)
        if (previous?.rootIndex === rootIndex) {
          throw new Error(`[nuxt-modular] Duplicate extension id "${id}" in ${label(previous.dir)} and ${label(dir)}`)
        }
        if (previous) {
          logger.info(`Extension "${id}" from ${label(dir)} is overridden by ${label(previous.dir)}`)
          continue
        }
        origin.set(id, { dir, rootIndex })
        found.push(extension)
      }
    }

    for (const id of disabled) {
      if (!origin.has(id)) logger.warn(`\`modular.disabled\` lists "${id}", but no extension has that id`)
    }
    // Dependencies first: their plugins register (and their handlers tie-break) before dependents'.
    const rank = new Map(sortByDependencies(found.map((extension) => extension.manifest)).map((id, index) => [id, index]))
    const extensions = found
      .filter((extension) => !disabled.has(extension.manifest.id))
      .sort((a, b) => (rank.get(a.manifest.id) ?? 0) - (rank.get(b.manifest.id) ?? 0))

    // Registry-level checks at build time: navigation id conflicts and missing dependencies.
    const state = createRegistryState()
    for (const extension of extensions) {
      try {
        registerExtension(state, extension.manifest)
      } catch (error) {
        if (error instanceof ExtensionConflictError) throw new Error(`[nuxt-modular] ${error.message}`)
        throw error
      }
    }
    const incompatible = checkRequirements(
      extensions.map((extension) => extension.manifest),
      { disabled, ...(readOwnVersion() ? { hostVersion: readOwnVersion() as string } : {}) },
    ).filter((issue) => issue.code !== 'missing-dependency')
    if (incompatible.length) {
      throw new Error(`[nuxt-modular] Incompatible extensions:\n${incompatible.map((issue) => `  - ${issue.message}`).join('\n')}`)
    }
    for (const id of Object.keys(options.config)) {
      if (!origin.has(id)) logger.warn(`\`modular.config\` has settings for "${id}", but no extension has that id`)
    }
    for (const extension of extensions) {
      const missing = findMissingDependencies(state, extension.manifest.id)
      if (!missing.length) continue
      const reasons = missing.map((id) => `"${id}" (${disabled.has(id) ? 'disabled' : 'not found'})`).join(', ')
      logger.warn(`Extension "${extension.manifest.id}" will stay inactive; missing dependencies: ${reasons}`)
    }

    await nuxt.callHook('modular:extensions', extensions)

    if (extensions.length) {
      const list = extensions.map((extension) => `${extension.manifest.id}@${extension.manifest.version}`).join(', ')
      logger.info(`Extensions: ${list}${disabled.size ? ` (disabled: ${[...disabled].join(', ')})` : ''}`)
    }

    // -----------------------------------------------------------------------
    // 2. Build-time artifacts consumed by the runtime. Aliases point at the
    //    extension-less path so TypeScript picks the `.d.ts` and bundlers the `.mjs`.
    // -----------------------------------------------------------------------
    const manifestsFile = addTemplate({ filename: 'nuxt-modular/manifests.mjs', getContents: () => manifestsTemplate(extensions) })
    const componentsFile = addTemplate({ filename: 'nuxt-modular/components.mjs', getContents: () => componentsTemplate(extensions) })
    addTemplate({ filename: 'nuxt-modular/manifests.d.ts', getContents: () => manifestsTypes, write: true })
    addTemplate({ filename: 'nuxt-modular/components.d.ts', getContents: () => componentsTypes, write: true })
    nuxt.options.alias['#nuxt-modular/manifests'] = manifestsFile.dst.replace(/\.mjs$/, '')
    nuxt.options.alias['#nuxt-modular/components'] = componentsFile.dst.replace(/\.mjs$/, '')

    nuxt.options.build.transpile.push(resolver.resolve('./runtime'))

    // -----------------------------------------------------------------------
    // 3. App side: composables, outlet component, extension components/pages/plugins.
    // -----------------------------------------------------------------------
    addImports([
      { name: 'useModuleRegistry', from: resolver.resolve('./runtime/composables/useModuleRegistry') },
      { name: 'useModularPermissions', from: resolver.resolve('./runtime/composables/useModularPermissions') },
      { name: 'useExtensionConfig', from: resolver.resolve('./runtime/composables/useExtensionConfig') },
    ])
    addComponent({ name: 'PluginOutlet', filePath: resolver.resolve('./runtime/components/PluginOutlet.vue') })

    for (const extension of extensions) {
      if (extension.componentsDir) addComponentsDir({ path: extension.componentsDir })
      // `composables/` and `utils/` of an extension are auto-imported in the app, like in the host.
      for (const folder of ['composables', 'utils']) {
        const path = join(extension.dir, folder)
        if (existsSync(path)) addImportsDir(path)
      }
      for (const plugin of extension.plugins) addPlugin(plugin)
    }

    extendPages((pages) => {
      for (const extension of extensions) {
        for (const page of extension.pages) {
          const clash = pages.find((existing) => existing.path === page.path)
          if (clash) {
            logger.warn(`Page ${page.path} of extension "${extension.manifest.id}" is shadowed by ${clash.file ? label(clash.file) : clash.name}`)
            continue
          }
          pages.push({ name: page.name, path: page.path, file: page.file, meta: { [EXTENSION_ROUTE_META]: extension.manifest.id } })
        }
      }
    })

    // Type-check extension sources together with the app and the server.
    nuxt.hook('prepare:types', ({ tsConfig }) => {
      tsConfig.include ||= []
      tsConfig.exclude ||= []
      for (const root of roots) {
        tsConfig.include.push(relative(nuxt.options.buildDir, join(root, '**/*')))
        tsConfig.exclude.push(relative(nuxt.options.buildDir, join(root, '*/server/**/*')))
      }
    })
    nuxt.hook('nitro:init', (nitro) => {
      nitro.hooks.hook('types:extend', (types) => {
        const tsConfig = types.tsConfig
        if (!tsConfig) return
        tsConfig.compilerOptions ||= {}
        tsConfig.compilerOptions.paths ||= {}
        tsConfig.compilerOptions.paths[CORE_ALIAS] = [relative(nuxt.options.buildDir, coreDir)]
        tsConfig.include ||= []
        // Nitro's tsconfig.server.json lives in buildDir.
        for (const root of roots) {
          tsConfig.include.push(relative(nuxt.options.buildDir, join(root, '*/server/**/*')))
          tsConfig.include.push(relative(nuxt.options.buildDir, join(root, '*/manifest.*')))
        }
      })
    })

    // -----------------------------------------------------------------------
    // 4. Server side: routes via scan dirs, hook bus plugin, hook handlers.
    // -----------------------------------------------------------------------
    const serverDirs = extensions.flatMap((extension) => (extension.serverDir ? [extension.serverDir] : []))
    if (serverDirs.length) addServerScanDir(serverDirs)

    addServerTemplate({ filename: '#nuxt-modular/server-hooks', getContents: () => serverHooksTemplate(extensions) })
    addTypeTemplate({ filename: 'types/nuxt-modular-server.d.ts', getContents: () => serverHooksTypes }, { nitro: true, nuxt: true })
    // Typed Nitro lifecycle hooks; h3 is resolved from this module so it works under pnpm's strict layout.
    const h3Dir = dirname(dirname(fileURLToPath(import.meta.resolve('h3'))))
    addTypeTemplate({ filename: 'types/nuxt-modular-hooks.d.ts', getContents: () => nitroHooksTypes(CORE_ALIAS, h3Dir) }, { nitro: true, nuxt: true })
    addServerTemplate({ filename: '#nuxt-modular/server-manifests', getContents: () => serverManifestsTemplate(extensions) })
    addServerTemplate({ filename: '#nuxt-modular/server-routes', getContents: () => serverRoutesTemplate(extensions) })
    addServerTemplate({ filename: '#nuxt-modular/migrations', getContents: () => migrationsTemplate(extensions) })
    addServerTemplate({ filename: '#nuxt-modular/seeders', getContents: () => seedersTemplate(extensions) })

    // Database (optional): the connector is imported at build time, so nothing is bundled when unused.
    let database: ReturnType<typeof resolveDatabaseInput>
    try {
      database = resolveDatabaseInput(options.database)
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error))
    }
    // db0 >= 0.4 loads drivers (pg, mysql2, …) from its own location, which pnpm cannot resolve for a package
    // installed in the app. For those versions resolve the driver here (app first, then this module) and hand it
    // over as `lib`; fail early with the fix. db0 0.3 finds its peers itself, so nothing is passed.
    const db0File = database?.connector ? fileURLToPath(import.meta.resolve('db0')) : undefined
    const db0Version = db0File ? readPackageVersion(resolve(dirname(db0File), '..', 'package.json')) : undefined
    const driver = database?.connector && db0Version && satisfies(db0Version, '>=0.4.0') ? CONNECTOR_DRIVERS[database.connector] : undefined
    let driverFile: string | undefined
    if (driver) {
      const resolved = await tryResolveModule(driver.import ?? driver.name, [nuxt.options.rootDir, import.meta.url])
      if (!resolved) {
        throw new Error(
          `[nuxt-modular] The "${database?.connector}" database connector needs the \`${driver.name}\` package. Install it: pnpm add ${driver.name}`,
        )
      }
      driverFile = resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved
    }
    const databaseModule = database && {
      connector: database.connector,
      dialect: database.dialect,
      ...(database.handler ? { handler: await resolvePath(database.handler) } : {}),
      ...(database.connector
        ? {
            connectorFile: fileURLToPath(import.meta.resolve(`db0/connectors/${connectorModule(database.connector)}`)),
            db0File,
            ...(driverFile ? { driverFile } : {}),
          }
        : {}),
    }
    addServerTemplate({ filename: '#nuxt-modular/database', getContents: () => databaseTemplate(databaseModule) })
    if (database) {
      addTypeTemplate({ filename: 'types/nuxt-modular-database.d.ts', getContents: () => databaseContextTypes(CORE_ALIAS) }, { nitro: true, nuxt: true })
    }
    addTypeTemplate({ filename: 'types/nuxt-modular-server-data.d.ts', getContents: () => serverDataTypes }, { nitro: true, nuxt: true })

    addServerPlugin(resolver.resolve('./runtime/server/plugin'))
    addDevtoolsTypes()
    addServerImports([
      { name: 'useModularServerHooks', from: resolver.resolve('./runtime/server/utils') },
      { name: 'useModularToggles', from: resolver.resolve('./runtime/server/toggles') },
      { name: 'useModularMigrations', from: resolver.resolve('./runtime/server/migrations') },
      { name: 'useModularSeeders', from: resolver.resolve('./runtime/server/seeders') },
      { name: 'useModularExtensionConfig', from: resolver.resolve('./runtime/server/extension-config') },
      { name: 'useModularDatabase', from: resolver.resolve('./runtime/server/database') },
    ])

    nuxt.options.runtimeConfig.modular = {
      storage: options.storage,
      toggles: { enabled: options.toggles.enabled, ttl: options.toggles.ttl },
      migrations: { auto: options.migrations.auto },
      database: {
        enabled: Boolean(database),
        // Empty unless written in nuxt.config; production should set NUXT_MODULAR_DATABASE_URL.
        url: database?.url ?? '',
        options: database?.options ?? {},
        prefix: database?.prefix ?? 'modular_',
      },
    }
    // Public so the browser sees the same settings as the server; env: NUXT_PUBLIC_MODULAR_CONFIG_...
    ;(nuxt.options.runtimeConfig.public as Record<string, unknown>).modular = { config: options.config }

    if (options.tasks) {
      const nitro = (nuxt.options.nitro ||= {})
      nitro.experimental = { ...nitro.experimental, tasks: true }
      nitro.tasks = {
        ...nitro.tasks,
        ...Object.fromEntries(
          TASKS.map((file) => [
            taskName(file),
            { handler: resolver.resolve(`./runtime/server/tasks/modular/${file}`), description: `nuxt-modular: ${taskName(file)}` },
          ]),
        ),
      }
    }

    if (options.toggles.enabled) {
      // 404 for API routes of extensions switched off by a persistent toggle.
      const routeCount = extensions.reduce((count, extension) => count + extension.serverRoutes.length, 0)
      if (routeCount) addServerHandler({ middleware: true, handler: resolver.resolve('./runtime/server/guard') })
      addPlugin({ src: resolver.resolve('./runtime/plugins/toggles.server'), mode: 'server' })
    }
    // 404 for pages of inactive extensions (session or persistent toggle, missing dependency).
    if (extensions.some((extension) => extension.pages.length)) {
      addRouteMiddleware({ name: 'nuxt-modular-extension-pages', path: resolver.resolve('./runtime/middleware/extension-pages'), global: true })
    }

    await warnRouteConflicts(extensions, nuxt.options.serverDir, (message) => logger.warn(message))

    // -----------------------------------------------------------------------
    // 5. Development experience.
    // -----------------------------------------------------------------------
    if (nuxt.options.dev) {
      // Manifests are evaluated once at build time: editing one, or adding or
      // removing an extension, restarts Nuxt.
      for (const root of roots) {
        for (const name of MANIFEST_FILENAMES) nuxt.options.watch.push(join(root, '*', name))
      }
      if (options.devtools) setupDevtools(nuxt, resolver, extensions)
    }
  },
})

/**
 * Warns when two extensions — or an extension and the host app — serve the
 * same API route and method: Nitro would silently keep only one of them.
 */
async function warnRouteConflicts(
  extensions: readonly ScannedExtension[],
  hostServerDir: string,
  warn: (message: string) => void,
): Promise<void> {
  const owners = new Map<string, string>()
  const key = (route: string, method: string | undefined) => `${(method ?? '*').toUpperCase()} ${route}`

  for (const [dir, prefix] of [['api', '/api'], ['routes', '']] as const) {
    const base = join(hostServerDir, dir)
    if (!existsSync(base)) continue
    for (const file of await glob(['**/*.{ts,js,mjs,mts}'], { cwd: base, ignore: ['**/*.d.ts'] })) {
      const { route, method } = serverRouteFromPath(file, prefix)
      owners.set(key(route, method), 'the host app')
    }
  }

  for (const extension of extensions) {
    for (const { route, method } of extension.serverRoutes) {
      const candidates = method ? [key(route, method), key(route, undefined)] : [key(route, undefined)]
      const clash = candidates.map((candidate) => owners.get(candidate)).find((owner) => owner !== undefined)
      if (clash && clash !== `extension "${extension.manifest.id}"`) {
        warn(`Route ${key(route, method)} of extension "${extension.manifest.id}" is also served by ${clash}; only one will respond`)
      }
      owners.set(key(route, method), `extension "${extension.manifest.id}"`)
    }
  }
}

declare module '@nuxt/schema' {
  interface NuxtHooks extends ModuleHooks {}
}
