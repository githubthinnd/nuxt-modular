import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'pathe'
import { CliError } from '../io'
import { hasModularBlock } from './config-patch'
import type { PackageManagerName, ProjectInfo } from './types'

const CONFIG_FILES = ['nuxt.config.ts', 'nuxt.config.mts', 'nuxt.config.js', 'nuxt.config.mjs'] as const

const read = (path: string): string | undefined => (existsSync(path) ? readFileSync(path, 'utf8') : undefined)

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(read(path) ?? '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

export function detectPackageManager(root: string, userAgent: string | undefined = process.env.npm_config_user_agent): PackageManagerName {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(root, 'bun.lock')) || existsSync(join(root, 'bun.lockb'))) return 'bun'
  if (existsSync(join(root, 'package-lock.json'))) return 'npm'
  const field = readJson(join(root, 'package.json')).packageManager
  const declared = typeof field === 'string' ? field.split('@')[0] : undefined
  if (declared === 'pnpm' || declared === 'yarn' || declared === 'bun' || declared === 'npm') return declared
  const agent = userAgent?.split('/')[0]
  return agent === 'pnpm' || agent === 'yarn' || agent === 'bun' ? agent : 'npm'
}

/** Major version of the Nuxt in the project: installed version first, then the declared range. Assumes 4. */
function nuxtMajor(root: string, pkg: Record<string, unknown>): number {
  const installed = readJson(join(root, 'node_modules/nuxt/package.json')).version
  const declared = { ...(pkg.dependencies as object | undefined), ...(pkg.devDependencies as object | undefined) } as Record<string, string>
  const text = typeof installed === 'string' ? installed : declared.nuxt
  const major = Number(/(\d+)/.exec(text ?? '')?.[1])
  return Number.isFinite(major) && major > 0 ? major : 4
}

const isDefaultAppVue = (source: string): boolean => /<NuxtWelcome\b/.test(source) && !/<NuxtPage\b|<NuxtLayout\b/.test(source)

export function detectProject(root: string, extensionsDir = 'extensions'): ProjectInfo {
  const configFile = CONFIG_FILES.find((file) => existsSync(join(root, file)))
  if (!configFile) {
    throw new CliError(
      `No nuxt.config found in ${root}.\nRun this inside a Nuxt project. To create one first: npx nuxi@latest init my-app`,
    )
  }
  const configSource = read(join(root, configFile)) as string
  const pkg = readJson(join(root, 'package.json'))

  const appDirHasFiles = existsSync(join(root, 'app')) && readdirSync(join(root, 'app')).length > 0
  const rootHasApp = existsSync(join(root, 'app.vue')) || existsSync(join(root, 'pages'))
  const srcDir: 'app' | '.' = appDirHasFiles ? 'app' : rootHasApp ? '.' : nuxtMajor(root, pkg) >= 4 ? 'app' : '.'
  const src = (path: string): string => (srcDir === '.' ? join(root, path) : join(root, 'app', path))

  const appVue = read(src('app.vue'))
  const extensionsRoot = join(root, extensionsDir)
  return {
    root,
    configFile,
    configSource,
    srcDir,
    packageManager: detectPackageManager(root),
    name: typeof pkg.name === 'string' && pkg.name ? pkg.name : 'App',
    hasAppVue: appVue !== undefined,
    appVueIsDefault: appVue !== undefined && isDefaultAppVue(appVue),
    hasIndexPage: ['index.vue', 'index.ts', 'index.tsx'].some((file) => existsSync(src(`pages/${file}`))),
    hasModularConfig: hasModularBlock(configSource),
    hasExtensions:
      existsSync(extensionsRoot) &&
      readdirSync(extensionsRoot, { withFileTypes: true }).some((entry) => entry.isDirectory()),
  }
}
