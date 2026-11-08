import { createRequire } from 'node:module'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { checkRequirements, type RequirementIssue } from '@nuxt-modular/core'
import { findExtensionDirs, findManifestFile, scanExtension, type ScannedExtension } from '@nuxt-modular/core/node'
import { join, relative, resolve } from 'pathe'
import type { CommandIO } from './io'

export interface InspectOptions {
  readonly dir: string
  readonly json?: boolean
}

export interface ScanOutcome {
  readonly extensions: ScannedExtension[]
  readonly errors: Array<{ dir: string; message: string }>
  readonly warnings: string[]
}

/** The `#modular` alias target for manifests, resolved from the installed core. */
function corePath(): string {
  return createRequire(import.meta.url).resolve('@nuxt-modular/core')
}

/** Scans every extension under `dir`, collecting problems instead of stopping at the first. */
export async function scanAll(io: CommandIO, dir: string): Promise<ScanOutcome> {
  const root = resolve(io.cwd, dir)
  const extensions: ScannedExtension[] = []
  const errors: ScanOutcome['errors'] = []
  const warnings: string[] = []
  const alias = { '#modular': corePath() }

  if (!existsSync(root)) {
    warnings.push(`Extensions directory ${relative(io.cwd, root) || '.'} does not exist`)
    return { extensions, errors, warnings }
  }

  const known = new Set(await findExtensionDirs(root))
  for (const name of readdirSync(root).sort()) {
    const path = join(root, name)
    if (name.startsWith('_') || name.startsWith('.') || !statSync(path).isDirectory()) continue
    if (!known.has(path) && !findManifestFile(path)) warnings.push(`${relative(io.cwd, path)} has no manifest and is ignored`)
  }

  const seen = new Map<string, string>()
  for (const path of known) {
    try {
      const extension = await scanExtension(path, { alias })
      const id = extension.manifest.id
      const first = seen.get(id)
      if (first) {
        errors.push({ dir: path, message: `Duplicate extension id "${id}" (also in ${relative(io.cwd, first)})` })
        continue
      }
      seen.set(id, path)
      extensions.push(extension)
    } catch (error) {
      errors.push({ dir: path, message: error instanceof Error ? error.message : String(error) })
    }
  }

  const owners = new Map<string, string>()
  for (const extension of extensions) {
    for (const { route, method } of extension.serverRoutes) {
      const key = `${(method ?? '*').toUpperCase()} ${route}`
      const owner = owners.get(key)
      if (owner && owner !== extension.manifest.id) warnings.push(`Route ${key} is served by both "${owner}" and "${extension.manifest.id}"`)
      owners.set(key, extension.manifest.id)
    }
    for (const page of extension.pages) {
      const key = `PAGE ${page.path}`
      const owner = owners.get(key)
      if (owner && owner !== extension.manifest.id) warnings.push(`Page ${page.path} is declared by both "${owner}" and "${extension.manifest.id}"`)
      owners.set(key, extension.manifest.id)
    }
  }
  return { extensions, errors, warnings }
}

function pad(cells: string[][]): string[] {
  const widths = cells[0]?.map((_, column) => Math.max(...cells.map((row) => (row[column] ?? '').length))) ?? []
  return cells.map((row) => row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  ').trimEnd())
}

export async function listExtensions(io: CommandIO, options: InspectOptions): Promise<number> {
  const { extensions, errors, warnings } = await scanAll(io, options.dir)
  if (options.json) {
    io.out(
      JSON.stringify(
        extensions.map((e) => ({
          id: e.manifest.id,
          name: e.manifest.name,
          version: e.manifest.version,
          enabled: e.manifest.enabled,
          dependsOn: e.manifest.dependsOn,
          dir: relative(io.cwd, e.dir),
          slots: e.manifest.slots.length,
          navigation: e.manifest.navigation.length,
          pages: e.pages.map((page) => page.path),
          routes: e.serverRoutes.map((route) => `${(route.method ?? '*').toUpperCase()} ${route.route}`),
          migrations: e.migrations.map((migration) => migration.name),
          seeders: e.seeders.map((seeder) => seeder.name),
        })),
        null,
        2,
      ),
    )
  } else if (!extensions.length) {
    io.out(`No extensions found in ${options.dir}`)
  } else {
    const rows = [
      ['ID', 'VERSION', 'ENABLED', 'DEPENDS ON', 'SLOTS', 'PAGES', 'ROUTES', 'MIGRATIONS', 'SEEDERS'],
      ...extensions.map((e) => [
        e.manifest.id,
        e.manifest.version,
        e.manifest.enabled ? 'yes' : 'no',
        e.manifest.dependsOn.join(',') || '-',
        String(e.manifest.slots.length),
        String(e.pages.length),
        String(e.serverRoutes.length),
        String(e.migrations.length),
        String(e.seeders.length),
      ]),
    ]
    for (const line of pad(rows)) io.out(line)
  }
  for (const { dir, message } of errors) io.err(`error: ${relative(io.cwd, dir)}: ${message}`)
  for (const warning of warnings) io.err(`warning: ${warning}`)
  return errors.length ? 1 : 0
}

export interface ValidateOptions extends InspectOptions {
  /** Fail on warnings too. */
  readonly strict?: boolean
  /** Version of nuxt-modular to check `requires.modular` against. */
  readonly hostVersion?: string
}

export async function validateExtensions(io: CommandIO, options: ValidateOptions): Promise<number> {
  const { extensions, errors, warnings } = await scanAll(io, options.dir)
  const issues: RequirementIssue[] = checkRequirements(
    extensions.map((extension) => extension.manifest),
    options.hostVersion ? { hostVersion: options.hostVersion } : {},
  )
  const problems = [
    ...errors.map(({ dir, message }) => `${relative(io.cwd, dir)}: ${message}`),
    ...issues.filter((issue) => issue.code !== 'missing-dependency').map((issue) => issue.message),
  ]
  const alerts = [...warnings, ...issues.filter((issue) => issue.code === 'missing-dependency').map((issue) => issue.message)]
  const failed = problems.length > 0 || (options.strict === true && alerts.length > 0)

  if (options.json) {
    io.out(JSON.stringify({ ok: !failed, extensions: extensions.length, errors: problems, warnings: alerts }, null, 2))
  } else {
    for (const message of problems) io.err(`error: ${message}`)
    for (const message of alerts) io.err(`warning: ${message}`)
    io.out(
      failed
        ? `✖ ${problems.length} error(s), ${alerts.length} warning(s) in ${extensions.length + errors.length} extension(s)`
        : `✔ ${extensions.length} extension(s) valid${alerts.length ? ` (${alerts.length} warning(s))` : ''}`,
    )
  }
  return failed ? 1 : 0
}
