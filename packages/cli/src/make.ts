import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { componentNameFromPath, pascalCase, routeFromPagePath, serverRouteFromPath } from '@nuxt-modular/core/node'
import { HOOK_NAME_PATTERN, SLUG_PATTERN } from '@nuxt-modular/core'
import { dirname, isAbsolute, join, relative, resolve } from 'pathe'
import { CliError, type CommandIO } from './io'
import { detectDataSource } from './init/project'
import { type DataSource, standardLayout } from './layout'
import {
  apiStub,
  composableStub,
  hookStub,
  manifestStub,
  migrationStub,
  pageStub,
  pluginStub,
  readmeStub,
  repositoryStub,
  seederStub,
  serviceStub,
  titleCase,
  widgetStub,
} from './stubs'

export interface MakeOptions {
  /** Extensions directory relative to `cwd`. */
  readonly dir: string
  /** Overwrite files that already exist. */
  readonly force?: boolean
}

interface GeneratedFile {
  readonly path: string
  readonly content: string
}

const SAFE_NAME = /^[A-Za-z0-9[][A-Za-z0-9_\-./[\]]*$/
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const

function assertSafeName(name: string, what: string): void {
  if (!SAFE_NAME.test(name) || name.split('/').some((part) => part === '..' || part === '' || part === '.')) {
    throw new CliError(`Invalid ${what} "${name}": use letters, digits, "-", "_", "[param]" and "/" only`)
  }
}

function assertInside(parent: string, child: string): void {
  const rel = relative(parent, child)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) throw new CliError(`Refusing to write outside ${parent}`)
}

function write(io: CommandIO, files: readonly GeneratedFile[], force: boolean | undefined): string[] {
  const clashes = files.filter((file) => existsSync(file.path))
  if (clashes.length && !force) {
    throw new CliError(`Already exists (use --force to overwrite):\n${clashes.map((file) => `  ${relative(io.cwd, file.path)}`).join('\n')}`)
  }
  for (const file of files) {
    mkdirSync(dirname(file.path), { recursive: true })
    writeFileSync(file.path, file.content)
    io.out(`  created ${relative(io.cwd, file.path)}`)
  }
  return files.map((file) => file.path)
}

export function slugify(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function extensionDir(io: CommandIO, options: MakeOptions, id: string): string {
  const dir = resolve(io.cwd, options.dir, id)
  if (!existsSync(dir)) throw new CliError(`Extension "${id}" not found in ${relative(io.cwd, dirname(dir)) || '.'} (create it with make:extension)`)
  return dir
}

/** Next `NNN-` prefix for ordered files such as migrations and seeders. */
export function nextSequence(dir: string): string {
  const numbers = existsSync(dir)
    ? readdirSync(dir).flatMap((file) => {
        const match = /^(\d+)-/.exec(file)
        return match ? [Number(match[1])] : []
      })
    : []
  return String(Math.max(0, ...numbers) + 1).padStart(3, '0')
}

export function makeExtension(
  io: CommandIO,
  id: string,
  options: MakeOptions & { minimal?: boolean; roles?: readonly string[]; data?: DataSource },
): string[] {
  if (!SLUG_PATTERN.test(id) || id.length > 64) {
    throw new CliError(`Invalid extension id "${id}": use a kebab-case slug such as "mod-quiz"`)
  }
  const root = resolve(io.cwd, options.dir)
  const dir = join(root, id)
  assertInside(root, dir)
  const minimal = options.minimal ?? false
  const data = options.data ?? detectDataSource(io.cwd)
  const files: GeneratedFile[] = minimal
    ? [
        { path: join(dir, 'manifest.ts'), content: manifestStub(id, { minimal }) },
        { path: join(dir, 'README.md'), content: readmeStub(id) },
      ]
    : standardLayout({ id, roles: options.roles ?? [], data }).map((file) => ({ path: join(dir, file.path), content: file.content }))
  io.out(`Creating extension "${id}"${minimal ? ' (minimal)' : ` (${data === 'sql' ? 'SQL' : 'storage'} data layer)`}`)
  const written = write(io, files, options.force)
  io.out(`\nNext: the extension is picked up from ${relative(io.cwd, root) || '.'}/${id} when the app starts.`)
  if (!minimal) {
    io.out(`- Read ${id}/README.md: it explains the layers (shared, server api/services/repositories, composables, components, pages).`)
    if (!options.roles?.length) io.out(`- Add the roles that may see it to \`defaultRoles\` in ${id}/manifest.ts (or re-run with --roles admin,member).`)
    io.out('- Its widget renders in <PluginOutlet name="dashboard.widgets" />; add that outlet to a page of the host.')
    if (data === 'storage') io.out('- Items are kept in Nitro storage (memory). Use a database instead with: npx nuxt-modular db')
  }
  return written
}

export function makeComponent(io: CommandIO, extension: string, name: string, options: MakeOptions): string[] {
  assertSafeName(name, 'component name')
  const dir = extensionDir(io, options, extension)
  const relativePath = `${name.split('/').map((part, i, all) => (i === all.length - 1 ? pascalCase(part) : part)).join('/')}.vue`
  const file = join(dir, 'components', relativePath)
  assertInside(dir, file)
  const componentName = componentNameFromPath(relativePath)
  const written = write(io, [{ path: file, content: widgetStub(componentName) }], options.force)
  io.out(`\nUse it in a slot: { target: '<outlet>', component: '${componentName}' } in ${extension}/manifest.ts`)
  return written
}

export function makePage(io: CommandIO, extension: string, name: string, options: MakeOptions): string[] {
  assertSafeName(name, 'page name')
  const dir = extensionDir(io, options, extension)
  const relativePath = `${name.replace(/\.vue$/, '')}.vue`
  const file = join(dir, 'pages', relativePath)
  assertInside(dir, file)
  const route = routeFromPagePath(relativePath)
  const written = write(io, [{ path: file, content: pageStub(titleCase(slugify(name.split('/').at(-1) === 'index' ? (name.split('/').at(-2) ?? extension) : (name.split('/').at(-1) ?? extension)) || extension)) }], options.force)
  io.out(`\nRoute: ${route}`)
  return written
}

export function makeApi(io: CommandIO, extension: string, name: string, options: MakeOptions & { method?: string }): string[] {
  assertSafeName(name, 'route name')
  const method = (options.method ?? 'get').toLowerCase()
  if (!(HTTP_METHODS as readonly string[]).includes(method)) {
    throw new CliError(`Invalid --method "${method}" (use ${HTTP_METHODS.join(', ')})`)
  }
  const dir = extensionDir(io, options, extension)
  const relativePath = `${name}.${method}.ts`
  const file = join(dir, 'server/api', relativePath)
  assertInside(dir, file)
  const { route } = serverRouteFromPath(relativePath, '/api')
  const written = write(io, [{ path: file, content: apiStub(extension, route, method) }], options.force)
  io.out(`\n${method.toUpperCase()} ${route}`)
  return written
}

export function makeHook(
  io: CommandIO,
  extension: string,
  hook: string,
  options: MakeOptions & { type?: string; name?: string },
): string[] {
  if (!HOOK_NAME_PATTERN.test(hook)) throw new CliError(`Invalid hook "${hook}": use a colon-namespaced name such as "quiz:submitted"`)
  const type = options.type ?? 'action'
  if (type !== 'action' && type !== 'filter') throw new CliError(`Invalid --type "${type}" (use action or filter)`)
  const dir = extensionDir(io, options, extension)
  const fileName = options.name ? slugify(options.name) : `on-${slugify(hook)}`
  if (!fileName) throw new CliError('Invalid --name')
  const written = write(io, [{ path: join(dir, 'server/hooks', `${fileName}.ts`), content: hookStub(type, hook) }], options.force)
  const typeLine = type === 'filter' ? ", type: 'filter'" : ''
  io.out(`\nSubscribe it in ${extension}/manifest.ts:\n  serverHooks: [{ hook: '${hook}', handler: './server/hooks/${fileName}.ts'${typeLine} }]`)
  return written
}

export function makePlugin(io: CommandIO, extension: string, name: string, options: MakeOptions & { mode?: string }): string[] {
  const slug = slugify(name)
  if (!slug) throw new CliError(`Invalid plugin name "${name}"`)
  if (options.mode && options.mode !== 'client' && options.mode !== 'server') throw new CliError('Invalid --mode (use client or server)')
  const dir = extensionDir(io, options, extension)
  const suffix = options.mode ? `.${options.mode}` : ''
  return write(io, [{ path: join(dir, 'plugins', `${slug}${suffix}.ts`), content: pluginStub() }], options.force)
}

function makeOrdered(io: CommandIO, kind: 'migrations' | 'seeders', extension: string, name: string, options: MakeOptions): string[] {
  const slug = slugify(name)
  if (!slug) throw new CliError(`Invalid name "${name}"`)
  const dir = extensionDir(io, options, extension)
  const folder = join(dir, 'server', kind)
  const file = join(folder, `${nextSequence(folder)}-${slug}.ts`)
  return write(io, [{ path: file, content: kind === 'migrations' ? migrationStub() : seederStub() }], options.force)
}

export const makeMigration = (io: CommandIO, extension: string, name: string, options: MakeOptions): string[] =>
  makeOrdered(io, 'migrations', extension, name, options)

export const makeSeeder = (io: CommandIO, extension: string, name: string, options: MakeOptions): string[] =>
  makeOrdered(io, 'seeders', extension, name, options)

function layerFile(io: CommandIO, extension: string, options: MakeOptions, folder: string, file: string, content: string): string[] {
  const dir = extensionDir(io, options, extension)
  const target = join(dir, folder, file)
  assertInside(dir, target)
  return write(io, [{ path: target, content }], options.force)
}

export function makeService(io: CommandIO, extension: string, name: string, options: MakeOptions): string[] {
  const slug = slugify(name)
  if (!slug) throw new CliError(`Invalid service name "${name}"`)
  const written = layerFile(io, extension, options, 'server/services', `${slug}.service.ts`, serviceStub(slug))
  io.out(`\nCall it from a controller in server/api; keep storage access in a repository (make:repository ${extension} ${slug}).`)
  return written
}

export function makeRepository(io: CommandIO, extension: string, name: string, options: MakeOptions & { data?: DataSource }): string[] {
  const slug = slugify(name)
  if (!slug) throw new CliError(`Invalid repository name "${name}"`)
  const data = options.data ?? detectDataSource(io.cwd)
  const written = layerFile(io, extension, options, 'server/repositories', `${slug}.repository.ts`, repositoryStub(slug, data))
  io.out(`\n${data === 'sql' ? 'SQL' : 'Storage'} repository. Only services import it.`)
  return written
}

export function makeComposable(io: CommandIO, extension: string, name: string, options: MakeOptions): string[] {
  const slug = slugify(name)
  if (!slug) throw new CliError(`Invalid composable name "${name}"`)
  const written = layerFile(io, extension, options, 'composables', `use${pascalCase(slug)}.ts`, composableStub(slug))
  io.out(`\nAuto-imported as use${pascalCase(slug)}() in this extension's pages and components.`)
  return written
}
