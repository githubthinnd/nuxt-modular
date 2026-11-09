#!/usr/bin/env node
/*
 * Verifies the monorepo in an environment where `pnpm install` cannot run
 * (e.g. a restricted sandbox, which blocks the pnpm store lock and local
 * ports). It mirrors the repo into a temp directory, rewrites pnpm-only
 * protocols (`catalog:`, `workspace:*`) into plain versions, installs with
 * npm workspaces and runs every check that needs no network port.
 *
 *   node scripts/sandbox-verify.mjs [--skip-install] [--only core|nuxt|playground]
 *
 * Env: VERIFY_DIR (default: $TMPDIR/nuxt-modular-verify)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dest = process.env.VERIFY_DIR ?? join(tmpdir(), 'nuxt-modular-verify')
const args = process.argv.slice(2)
const skipInstall = args.includes('--skip-install')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined

const env = { ...process.env, npm_config_cache: join(tmpdir(), 'npm-cache'), NUXT_TELEMETRY_DISABLED: '1' }

function run(cmd, cmdArgs, cwd = dest, extraEnv = {}) {
  console.log(`\n$ ${cmd} ${cmdArgs.join(' ')}  (${cwd.replace(dest, '<verify>')})`)
  execFileSync(cmd, cmdArgs, { cwd, stdio: 'inherit', env: { ...env, ...extraEnv } })
}

// 1. Mirror sources (keep node_modules in dest between runs).
run('rsync', [
  '-a', '--delete',
  '--exclude', 'node_modules', '--exclude', '.git', '--exclude', 'dist', '--exclude', '.nuxt',
  '--exclude', '.output', '--exclude', '.data', '--exclude', 'pnpm-lock.yaml', '--exclude', 'package-lock.json',
  `${root}/`, `${dest}/`,
], root)

// 2. Rewrite pnpm protocols for npm.
const catalog = {}
let inCatalog = false
for (const line of readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8').split('\n')) {
  if (/^catalog:\s*$/.test(line)) { inCatalog = true; continue }
  if (inCatalog && /^\S/.test(line)) inCatalog = false
  const match = inCatalog && line.match(/^\s+"?([^":#]+)"?:\s*([^#\s]+)/)
  if (match) catalog[match[1].trim()] = match[2].trim()
}

const manifests = ['package.json', 'packages/core/package.json', 'packages/nuxt/package.json', 'playground/package.json']
for (const file of manifests) {
  const path = join(dest, file)
  if (!existsSync(path)) continue
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
      if (spec === 'catalog:') pkg[field][name] = catalog[name] ?? (() => { throw new Error(`No catalog entry for ${name}`) })()
      else if (spec.startsWith('workspace:')) pkg[field][name] = '*'
    }
  }
  if (file === 'package.json') {
    pkg.name = 'nuxt-modular-workspace-root' // avoid clashing with packages/nuxt
    pkg.workspaces = ['packages/core', 'packages/nuxt', 'playground']
    delete pkg.packageManager
  }
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`)
}

// 3. Install.
if (!skipInstall) run('npm', ['install', '--no-audit', '--no-fund', '--legacy-peer-deps', '--userconfig=/dev/null'])

// 4. Checks.
const want = (name) => !only || only === name
if (want('core') || want('nuxt') || want('playground')) {
  const core = join(dest, 'packages/core')
  if (want('core')) {
    run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], core)
    run('npx', ['vitest', 'run'], core)
  }
  run('npx', ['unbuild'], core)
}
if (want('nuxt') || want('playground')) {
  const nuxt = join(dest, 'packages/nuxt')
  run('npx', ['nuxt-module-build', 'prepare'], nuxt)
  if (want('nuxt')) {
    run('npx', ['vue-tsc', '-b', '--noEmit'], nuxt)
    run('npx', ['vitest', 'run'], nuxt)
  }
  run('npx', ['nuxt-module-build', 'build'], nuxt)
}
if (want('playground')) {
  const playground = join(dest, 'playground')
  run('npx', ['nuxi', 'prepare'], playground)
  run('npx', ['vue-tsc', '-b', '--noEmit'], playground)
  run('npx', ['tsc', '-p', 'e2e', '--noEmit'], playground)
  run('node', [join(dest, 'scripts/check-ssr.mjs')], playground)
}

console.log('\n✔ sandbox verification passed')
