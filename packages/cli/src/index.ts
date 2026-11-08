import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import { listExtensions, validateExtensions } from './inspect'
import { CliError, type CommandIO, processIO } from './io'
import { makeApi, makeComponent, makeExtension, makeHook, makeMigration, makePage, makePlugin, makeSeeder } from './make'

export { CliError, processIO } from './io'
export type { CommandIO } from './io'
export { listExtensions, scanAll, validateExtensions } from './inspect'
export {
  makeApi,
  makeComponent,
  makeExtension,
  makeHook,
  makeMigration,
  makePage,
  makePlugin,
  makeSeeder,
  nextSequence,
  slugify,
} from './make'

const HELP = `nuxt-modular — scaffolding and diagnostics for extensions

Usage: nuxt-modular <command> [options]

Commands:
  list                                  List extensions and what they contribute
  validate                              Validate manifests, references, requirements and route conflicts
  make:extension <id>                   Create an extension       [--minimal]
  make:component <ext> <Name>           Create a component
  make:page <ext> <path>                Create a page (e.g. "quiz/[id]")
  make:api <ext> <route>                Create an API route       [--method get|post|…]
  make:hook <ext> <hook>                Create a hook handler     [--type action|filter] [--name file]
  make:plugin <ext> <name>              Create a Nuxt plugin      [--mode client|server]
  make:migration <ext> <name>           Create the next migration (NNN-name.ts)
  make:seeder <ext> <name>              Create the next seeder (NNN-name.ts)

Options:
  --dir <path>        Extensions directory (default: extensions)
  --force             Overwrite existing files
  --json              Machine-readable output (list, validate)
  --strict            Treat warnings as errors (validate)
  --host-version <v>  nuxt-modular version for requires.modular checks (validate)
  -v, --version       Print the version
  -h, --help          Print this help

Run migrations and seeders with Nitro tasks (set \`modular.tasks: true\`):
  nuxt task run modular:migrate | modular:migrate:status | modular:seed
`

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
        version: { type: 'boolean', short: 'v', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
    const [command, ...args] = positionals
    if (values.version) return io.out(version()), 0
    if (values.help || !command || command === 'help') return io.out(HELP), 0

    const make = { dir: values.dir, force: values.force }
    const need = (count: number, usage: string): void => {
      if (args.length !== count) throw new CliError(`Usage: nuxt-modular ${usage}`)
    }

    switch (command) {
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
        makeExtension(io, args[0] as string, { ...make, minimal: values.minimal })
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
        throw new CliError(`Unknown command "${command}". Run "nuxt-modular --help".`)
    }
  } catch (error) {
    io.err(`error: ${error instanceof Error ? error.message : String(error)}`)
    return error instanceof CliError || (error instanceof TypeError && 'code' in error) ? 2 : 1
  }
}
