/*
 * Node-only build tooling: finds, loads and validates extension directories.
 * Shared by the Nuxt module and the CLI. Never import this from browser code.
 */

import { existsSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import type { ExtensionManifest, ServerHookType } from './manifest'
import { parseManifest } from './manifest'
import { createJiti } from 'jiti'
import { basename, extname, isAbsolute, join, normalize, relative, resolve } from 'pathe'
import { glob } from 'tinyglobby'

export const MANIFEST_FILENAMES = ['manifest.ts', 'manifest.mts', 'manifest.js', 'manifest.mjs'] as const
const COMPONENT_EXTENSIONS = ['.vue', '.tsx', '.ts', '.jsx', '.js'] as const
const SCRIPT_EXTENSIONS = ['.ts', '.mts', '.js', '.mjs'] as const

export interface ScannedServerHook {
  readonly hook: string
  readonly type: ServerHookType
  readonly order: number
  /** Absolute path of the handler module. */
  readonly file: string
}

export interface ScannedPage {
  readonly name: string
  readonly path: string
  readonly file: string
}

export interface ScannedServerRoute {
  /** Route pattern in Nitro syntax: `/api/quiz/:id`, `/api/docs/**`. */
  readonly route: string
  /** Lower-case HTTP method from a `.get.ts`-style suffix, or `undefined` for all methods. */
  readonly method: string | undefined
  readonly file: string
}

export interface ScannedMigration {
  /** File name without extension, e.g. `001-create-tables`. */
  readonly name: string
  readonly file: string
}

export interface ScannedSeeder {
  /** File name without extension, e.g. `001-demo-data`. */
  readonly name: string
  readonly file: string
}

export interface ScannedExtension {
  readonly manifest: ExtensionManifest
  /** Absolute extension directory. */
  readonly dir: string
  readonly manifestPath: string
  /** Manifest component reference → absolute component file. */
  readonly components: Readonly<Record<string, string>>
  readonly serverHooks: readonly ScannedServerHook[]
  readonly componentsDir: string | undefined
  readonly serverDir: string | undefined
  readonly pages: readonly ScannedPage[]
  readonly plugins: readonly string[]
  /** Routes served from `server/api` and `server/routes`. */
  readonly serverRoutes: readonly ScannedServerRoute[]
  /** `server/migrations/*`, sorted by name. */
  readonly migrations: readonly ScannedMigration[]
  /** `server/seeders/*`, sorted by name. */
  readonly seeders: readonly ScannedSeeder[]
}

export class ExtensionScanError extends Error {
  override readonly name = 'ExtensionScanError'
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory()
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile()
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/** Directories under `root` that contain a manifest; `_name` and `.name` are skipped. */
export async function findExtensionDirs(root: string): Promise<string[]> {
  if (!isDirectory(root)) return []
  const entries = await readdir(root, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.'))
    .map((entry) => join(root, entry.name))
    .filter((dir) => findManifestFile(dir) !== undefined)
    .sort()
}

export function findManifestFile(dir: string): string | undefined {
  return MANIFEST_FILENAMES.map((name) => join(dir, name)).find(isFile)
}

/** Splits `quiz-tab`, `quiz_tab`, `QuizTab` into words and joins them in PascalCase. */
export function pascalCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

/**
 * Nuxt-style component name for a file relative to `components/`:
 * `quiz/Tab.vue` → `QuizTab`, `quiz/QuizTab.vue` → `QuizTab`, `quiz/index.vue` → `Quiz`.
 */
export function componentNameFromPath(relativePath: string): string {
  const withoutExt = relativePath.slice(0, relativePath.length - extname(relativePath).length)
  const segments = withoutExt.split('/').filter(Boolean)
  const file = segments.pop() ?? ''
  const prefix = segments.map(pascalCase).join('')
  const fileName = file === 'index' ? '' : pascalCase(file)
  if (fileName && prefix && fileName.startsWith(prefix)) return fileName
  return prefix + fileName
}

function resolveFileReference(dir: string, reference: string, extensions: readonly string[]): string | undefined {
  const base = resolve(dir, reference)
  if (!isInside(dir, base)) return undefined
  if (isFile(base)) return base
  return extensions.map((ext) => `${base}${ext}`).find(isFile)
}

/** Maps every component in `componentsDir` to its Nuxt-style name. */
async function indexComponents(componentsDir: string | undefined): Promise<Map<string, string>> {
  const index = new Map<string, string>()
  if (!componentsDir) return index
  const files = await glob(COMPONENT_EXTENSIONS.map((ext) => `**/*${ext}`), {
    cwd: componentsDir,
    ignore: ['**/*.d.ts', '**/*.test.*', '**/*.spec.*'],
  })
  for (const file of files.sort()) {
    const name = componentNameFromPath(file)
    if (!index.has(name)) index.set(name, join(componentsDir, file))
  }
  return index
}

/** File path → route path, following Nuxt page conventions. */
export function routeFromPagePath(relativePath: string): string {
  const withoutExt = relativePath.slice(0, relativePath.length - extname(relativePath).length)
  const segments = withoutExt.split('/').filter(Boolean)
  if (segments.at(-1) === 'index') segments.pop()
  const converted = segments.map((segment) =>
    segment
      .replace(/^\[\.\.\.(\w+)\]$/, ':$1(.*)*')
      .replace(/^\[\[(\w+)\]\]$/, ':$1?')
      .replace(/\[(\w+)\]/g, ':$1'),
  )
  return `/${converted.join('/')}`
}

function routeName(extensionId: string, relativePath: string): string {
  const withoutExt = relativePath.slice(0, relativePath.length - extname(relativePath).length)
  const parts = withoutExt
    .split('/')
    .filter((part) => part && part !== 'index')
    .map((part) => part.replace(/[[\].]/g, ''))
  return ['ext', extensionId, ...parts].join('-')
}

async function scanPages(extensionId: string, dir: string): Promise<ScannedPage[]> {
  const pagesDir = join(dir, 'pages')
  if (!isDirectory(pagesDir)) return []
  const files = await glob(['**/*.vue'], { cwd: pagesDir })
  return files.sort().map((file) => ({
    name: routeName(extensionId, file),
    path: routeFromPagePath(file),
    file: join(pagesDir, file),
  }))
}

async function scanPlugins(dir: string): Promise<string[]> {
  const pluginsDir = join(dir, 'plugins')
  if (!isDirectory(pluginsDir)) return []
  const files = await glob(SCRIPT_EXTENSIONS.map((ext) => `*${ext}`), { cwd: pluginsDir, ignore: ['*.d.ts'] })
  return files.sort().map((file) => join(pluginsDir, file))
}

const HTTP_METHODS = new Set(['get', 'head', 'patch', 'post', 'put', 'delete', 'connect', 'options', 'trace'])

/**
 * Nitro route for a file under `server/api` (prefix `/api`) or `server/routes`
 * (prefix ``): `quiz/[id].get.ts` → `{ route: '/api/quiz/:id', method: 'get' }`.
 */
export function serverRouteFromPath(relativePath: string, prefix: '' | '/api'): { route: string; method: string | undefined } {
  let withoutExt = relativePath.slice(0, relativePath.length - extname(relativePath).length)
  let method: string | undefined
  const suffix = extname(withoutExt).slice(1).toLowerCase()
  if (HTTP_METHODS.has(suffix)) {
    method = suffix
    withoutExt = withoutExt.slice(0, withoutExt.length - suffix.length - 1)
  }
  const segments = withoutExt.split('/').filter(Boolean)
  if (segments.at(-1) === 'index') segments.pop()
  const converted = segments.map((segment) =>
    segment.replace(/^\[\.\.\.\w*\]$/, '**').replace(/\[(\w+)\]/g, ':$1'),
  )
  const route = `${prefix}/${converted.join('/')}`
  return { route: route.length > 1 && route.endsWith('/') ? route.slice(0, -1) : route, method }
}

async function scanServerRoutes(serverDir: string | undefined): Promise<ScannedServerRoute[]> {
  if (!serverDir) return []
  const routes: ScannedServerRoute[] = []
  for (const [dir, prefix] of [['api', '/api'], ['routes', '']] as const) {
    const base = join(serverDir, dir)
    if (!isDirectory(base)) continue
    const files = await glob(SCRIPT_EXTENSIONS.map((ext) => `**/*${ext}`), { cwd: base, ignore: ['**/*.d.ts'] })
    for (const file of files.sort()) routes.push({ ...serverRouteFromPath(file, prefix), file: join(base, file) })
  }
  return routes
}

async function scanNamedScripts(serverDir: string | undefined, folder: string): Promise<Array<{ name: string; file: string }>> {
  const dir = serverDir && join(serverDir, folder)
  if (!dir || !isDirectory(dir)) return []
  const files = await glob(SCRIPT_EXTENSIONS.map((ext) => `*${ext}`), { cwd: dir, ignore: ['*.d.ts'] })
  return files
    .map((file) => ({ name: file.slice(0, file.length - extname(file).length), file: join(dir, file) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

const scanMigrations = (serverDir: string | undefined): Promise<ScannedMigration[]> => scanNamedScripts(serverDir, 'migrations')
const scanSeeders = (serverDir: string | undefined): Promise<ScannedSeeder[]> => scanNamedScripts(serverDir, 'seeders')

export interface LoadOptions {
  /** Import aliases available to manifest files (e.g. `#modular`). */
  readonly alias: Readonly<Record<string, string>>
}

/** Imports and validates `manifest.*`, then resolves every reference it makes. */
export async function scanExtension(dir: string, options: LoadOptions): Promise<ScannedExtension> {
  const manifestPath = findManifestFile(dir)
  if (!manifestPath) throw new ExtensionScanError(`No manifest file found in ${dir}`)

  const jiti = createJiti(manifestPath, { moduleCache: false, alias: { ...options.alias } })
  let exported: unknown
  try {
    exported = await jiti.import(manifestPath, { default: true })
  } catch (error) {
    throw new ExtensionScanError(`Failed to load ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const manifest = parseManifest(exported, manifestPath)

  const componentsDir = isDirectory(join(dir, 'components')) ? join(dir, 'components') : undefined
  const componentIndex = await indexComponents(componentsDir)
  const problems: string[] = []

  const components: Record<string, string> = {}
  manifest.slots.forEach((slot, index) => {
    if (slot.component in components) return
    const isPath = slot.component.startsWith('./') || slot.component.startsWith('../')
    const file = isPath
      ? resolveFileReference(dir, slot.component, COMPONENT_EXTENSIONS)
      : componentIndex.get(slot.component)
    if (file) components[slot.component] = file
    else {
      problems.push(
        isPath
          ? `slots[${index}].component "${slot.component}" does not resolve to a file inside the extension`
          : `slots[${index}].component "${slot.component}" matches no component in ${componentsDir ?? `${dir}/components`}` +
            (componentIndex.size ? ` (available: ${[...componentIndex.keys()].join(', ')})` : ''),
      )
    }
  })

  const serverHooks: ScannedServerHook[] = []
  manifest.serverHooks.forEach((subscription, index) => {
    const file = resolveFileReference(dir, subscription.handler, SCRIPT_EXTENSIONS)
    if (file) serverHooks.push({ hook: subscription.hook, type: subscription.type, order: subscription.order, file })
    else problems.push(`serverHooks[${index}].handler "${subscription.handler}" does not resolve to a file inside the extension`)
  })

  if (problems.length) {
    throw new ExtensionScanError(
      `Invalid references in extension "${manifest.id}" (${manifestPath}):\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    )
  }

  const serverDir = isDirectory(join(dir, 'server')) ? join(dir, 'server') : undefined
  return {
    manifest,
    dir: normalize(dir),
    manifestPath,
    components,
    serverHooks,
    componentsDir,
    serverDir,
    pages: await scanPages(manifest.id, dir),
    plugins: await scanPlugins(dir),
    serverRoutes: await scanServerRoutes(serverDir),
    migrations: await scanMigrations(serverDir),
    seeders: await scanSeeders(serverDir),
  }
}

/** Short, stable label for logs: `extensions/quiz`. */
export function describeDir(rootDir: string, dir: string): string {
  const rel = relative(rootDir, dir)
  return rel.startsWith('..') ? basename(dir) : rel
}
