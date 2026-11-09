import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import { runDb } from './db'
import { commandHelp, overview } from './help'
import { runInit } from './init'
import { listExtensions, validateExtensions } from './inspect'
import { CliError, type CommandIO, processIO } from './io'
import {
  makeApi,
  makeComponent,
  makeComposable,
  makeExtension,
  makeHook,
  makeMigration,
  makePage,
  makePlugin,
  makeRepository,
  makeSeeder,
  makeService,
} from './make'

export { CliError, processIO } from './io'
export type { CommandIO } from './io'
export { listExtensions, scanAll, validateExtensions } from './inspect'
export * from './init'
export { runDb } from './db'
export type { DbOptions } from './db'
export { COMMANDS, commandHelp, overview } from './help'
export { standardLayout } from './layout'
export type { DataSource, LayoutFile, LayoutOptions } from './layout'
export {
  makeApi,
  makeComponent,
  makeComposable,
  makeExtension,
  makeHook,
  makeMigration,
  makePage,
  makePlugin,
  makeRepository,
  makeSeeder,
  makeService,
  nextSequence,
  slugify,
} from './make'

function version(): string {
  try {
    return (createRequire(import.meta.url)('../package.json') as { version: string }).version
  } catch {
    return 'unknown'
  }
}

/** Runs the CLI. Returns the process exit code instead of exiting, so it is easy to test. */
export async function main(argv: readonly string[], io: CommandIO = processIO()): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        dir: { type: 'string', default: 'extensions' },
        force: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        strict: { type: 'boolean', default: false },
        minimal: { type: 'boolean', default: false },
        method: { type: 'string' },
        type: { type: 'string' },
        name: { type: 'string' },
        mode: { type: 'string' },
        'host-version': { type: 'string' },
        yes: { type: 'boolean', short: 'y', default: false },
        database: { type: 'string' },
        roles: { type: 'string' },
        extension: { type: 'string' },
        'no-starter': { type: 'boolean', default: false },
        'no-shell': { type: 'boolean', default: false },
        'no-install': { type: 'boolean', default: false },
        'database-url': { type: 'string' },
        url: { type: 'string' },
        'env-file': { type: 'string' },
        version: { type: 'boolean', short: 'v', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
    const [command, ...args] = positionals
    if (values.version) return io.out(version()), 0
    if (command === 'help' && args[0]) {
      const text = commandHelp(args[0])
      if (!text) throw new CliError(`Unknown command "${args[0]}". Run "nuxt-modular help" for the list.`)
      return io.out(text), 0
    }
    if (values.help && command && command !== 'help') {
      const text = commandHelp(command)
      return io.out(text ?? overview()), 0
    }
    if (values.help || !command || command === 'help') return io.out(overview()), 0

    const make = { dir: values.dir, force: values.force }
    const envFile = values['env-file'] ? { envFile: values['env-file'] } : {}
    const need = (count: number, usage: string): void => {
      if (args.length !== count) throw new CliError(`Usage: nuxt-modular ${usage}`)
    }

    switch (command) {
      case 'init':
        need(0, 'init [--yes] [--database sqlite] [--roles admin,member] [--extension hello]')
        return await runInit(io, {
          yes: values.yes,
          ...(values.dir !== 'extensions' ? { dir: values.dir } : {}),
          ...(values.database ? { database: values.database } : {}),
          ...(values['database-url'] ? { databaseUrl: values['database-url'] } : {}),
          ...envFile,
          ...(values.roles ? { roles: values.roles } : {}),
          ...(values.extension ? { extension: values.extension } : {}),
          noStarter: values['no-starter'],
          noShell: values['no-shell'],
          noInstall: values['no-install'],
        })
      case 'db':
        need(0, 'db [--database sqlite] [--url <connection url>] [--yes]')
        return await runDb(io, {
          yes: values.yes,
          ...(values.database ? { database: values.database } : {}),
          ...(values.url ? { url: values.url } : {}),
          noInstall: values['no-install'],
          ...envFile,
        })
      case 'list':
        return await listExtensions(io, { dir: values.dir, json: values.json })
      case 'validate':
        return await validateExtensions(io, {
          dir: values.dir,
          json: values.json,
          strict: values.strict,
          ...(values['host-version'] ? { hostVersion: values['host-version'] } : {}),
        })
      case 'make:extension':
        need(1, 'make:extension <id>')
        makeExtension(io, args[0] as string, {
          ...make,
          minimal: values.minimal,
          ...(values.roles ? { roles: values.roles.split(',').map((role) => role.trim()).filter(Boolean) } : {}),
        })
        return 0
      case 'make:service':
        need(2, 'make:service <extension> <name>')
        makeService(io, args[0] as string, args[1] as string, make)
        return 0
      case 'make:repository':
        need(2, 'make:repository <extension> <name>')
        makeRepository(io, args[0] as string, args[1] as string, make)
        return 0
      case 'make:composable':
        need(2, 'make:composable <extension> <name>')
        makeComposable(io, args[0] as string, args[1] as string, make)
        return 0
      case 'make:component':
        need(2, 'make:component <extension> <Name>')
        makeComponent(io, args[0] as string, args[1] as string, make)
        return 0
      case 'make:page':
        need(2, 'make:page <extension> <path>')
        makePage(io, args[0] as string, args[1] as string, make)
        return 0
      case 'make:api':
        need(2, 'make:api <extension> <route> [--method get]')
        makeApi(io, args[0] as string, args[1] as string, { ...make, ...(values.method ? { method: values.method } : {}) })
        return 0
      case 'make:hook':
        need(2, 'make:hook <extension> <hook> [--type action|filter]')
        makeHook(io, args[0] as string, args[1] as string, {
          ...make,
          ...(values.type ? { type: values.type } : {}),
          ...(values.name ? { name: values.name } : {}),
        })
        return 0
      case 'make:plugin':
        need(2, 'make:plugin <extension> <name> [--mode client|server]')
        makePlugin(io, args[0] as string, args[1] as string, { ...make, ...(values.mode ? { mode: values.mode } : {}) })
        return 0
      case 'make:migration':
        need(2, 'make:migration <extension> <name>')
        makeMigration(io, args[0] as string, args[1] as string, make)
        return 0
      case 'make:seeder':
        need(2, 'make:seeder <extension> <name>')
        makeSeeder(io, args[0] as string, args[1] as string, make)
        return 0
      default:
        throw new CliError(`Unknown command "${command}". Run "nuxt-modular help" for the list of commands.`)
    }
  } catch (error) {
    io.err(`error: ${error instanceof Error ? error.message : String(error)}`)
    return error instanceof CliError || (error instanceof TypeError && 'code' in error) ? 2 : 1
  }
}
