export interface CommandDoc {
  readonly name: string
  readonly group: 'Set up' | 'Generate (inside an extension)' | 'Inspect'
  readonly usage: string
  readonly summary: string
  readonly options?: ReadonlyArray<readonly [flag: string, text: string]>
  readonly examples?: readonly string[]
}

const GENERATE = 'Generate (inside an extension)' as const

export const COMMANDS: readonly CommandDoc[] = [
  {
    name: 'init',
    group: 'Set up',
    usage: 'init [options]',
    summary: 'Guided setup of a Nuxt project: config, permissions, host shell, database and a starter extension',
    options: [
      ['-y, --yes', 'Accept the defaults instead of asking (needed without a terminal)'],
      ['--database <name>', 'none | sqlite | postgresql | mysql'],
      ['--database-url <url>', 'Connection URL for PostgreSQL or MySQL, written to the env file'],
      ['--roles <a,b>', 'Roles of the app (default admin,member)'],
      ['--extension <id>', 'Id of the starter extension (default hello)'],
      ['--no-starter', 'Do not create a starter extension'],
      ['--no-shell', 'Do not generate app.vue and a home page'],
      ['--no-install', 'Do not install the database driver'],
      ['--env-file <name>', 'Env file for the connection URL (default .env)'],
    ],
    examples: ['nuxt-modular init', 'nuxt-modular init --yes --database postgresql --roles admin,editor --extension blog'],
  },
  {
    name: 'db',
    group: 'Set up',
    usage: 'db [options]',
    summary: 'Choose or switch the database: driver, connection URL, nuxt.config and .env in one step',
    options: [
      ['--database <name>', 'none | sqlite | postgresql | mysql (asked when omitted)'],
      ['--url <url>', 'Connection URL for PostgreSQL or MySQL; written to the env file, never to nuxt.config'],
      ['-y, --yes', 'Do not ask; use the flags'],
      ['--no-install', 'Do not install the driver (pg, mysql2)'],
      ['--env-file <name>', 'Env file for the connection URL (default .env)'],
    ],
    examples: ['nuxt-modular db', 'nuxt-modular db --database postgresql --url postgresql://user:pass@localhost:5432/app', 'nuxt-modular db --database sqlite --yes'],
  },
  {
    name: 'make:extension',
    group: GENERATE,
    usage: 'make:extension <id> [options]',
    summary: 'A complete extension in the standard layout: shared types, API, service, repository, composable, components, page',
    options: [
      ['--minimal', 'Only manifest.ts and README.md'],
      ['--roles <a,b>', 'Roles that may see it (defaultRoles)'],
      ['--force', 'Overwrite existing files'],
    ],
    examples: ['nuxt-modular make:extension blog --roles admin,editor'],
  },
  { name: 'make:service', group: GENERATE, usage: 'make:service <ext> <name>', summary: 'server/services/<name>.service.ts: business rules', examples: ['nuxt-modular make:service blog posts'] },
  { name: 'make:repository', group: GENERATE, usage: 'make:repository <ext> <name>', summary: 'server/repositories/<name>.repository.ts: data access (SQL or storage, detected)' },
  { name: 'make:composable', group: GENERATE, usage: 'make:composable <ext> <name>', summary: 'composables/use<Name>.ts: the app-side data layer, auto-imported' },
  { name: 'make:component', group: GENERATE, usage: 'make:component <ext> <Name>', summary: 'components/<Name>.vue and the slot reference to use' },
  { name: 'make:page', group: GENERATE, usage: 'make:page <ext> <path>', summary: 'pages/<path>.vue, e.g. "quiz/[id]"' },
  {
    name: 'make:api',
    group: GENERATE,
    usage: 'make:api <ext> <route> [--method get]',
    summary: 'server/api/<route>.<method>.ts: a controller',
    options: [['--method <verb>', 'get | post | put | patch | delete | head | options']],
  },
  {
    name: 'make:hook',
    group: GENERATE,
    usage: 'make:hook <ext> <hook> [options]',
    summary: 'server/hooks/on-<hook>.ts and the manifest line to add',
    options: [
      ['--type <type>', 'action | filter'],
      ['--name <file>', 'File name'],
    ],
  },
  {
    name: 'make:plugin',
    group: GENERATE,
    usage: 'make:plugin <ext> <name> [--mode client|server]',
    summary: 'plugins/<name>.ts: a Nuxt plugin that exists while the extension is built',
  },
  { name: 'make:migration', group: GENERATE, usage: 'make:migration <ext> <name>', summary: 'The next server/migrations/NNN-name.ts' },
  { name: 'make:seeder', group: GENERATE, usage: 'make:seeder <ext> <name>', summary: 'The next server/seeders/NNN-name.ts' },
  {
    name: 'list',
    group: 'Inspect',
    usage: 'list [--json]',
    summary: 'Table of extensions and what they contribute',
  },
  {
    name: 'validate',
    group: 'Inspect',
    usage: 'validate [options]',
    summary: 'Manifest and reference errors, requires and dependency cycles, route and page conflicts',
    options: [
      ['--strict', 'Warnings fail the command too'],
      ['--json', 'Machine-readable output'],
      ['--host-version <v>', 'Check requires.modular against this nuxt-modular version'],
    ],
    examples: ['nuxt-modular validate --strict'],
  },
]

const pad = (text: string, width: number): string => text.padEnd(width, ' ')

function groups(): string {
  const names = [...new Set(COMMANDS.map((command) => command.group))]
  const width = Math.max(...COMMANDS.map((command) => command.usage.length)) + 2
  return names
    .map((group) => {
      const rows = COMMANDS.filter((command) => command.group === group).map((command) => `  ${pad(command.usage, width)}${command.summary}`)
      return `${group}\n${rows.join('\n')}`
    })
    .join('\n\n')
}

/** `nuxt-modular` / `nuxt-modular --help`: every command, grouped, with where to go next. */
export function overview(): string {
  return `nuxt-modular: set up Nuxt projects, scaffold extensions and check them

Usage: nuxt-modular <command> [options]
       nuxt-modular help <command>        options and examples of one command

${groups()}

Global options
  --dir <path>        Extensions directory (default: extensions)
  -v, --version       Print the version
  -h, --help          Print this help (also: <command> --help)

Start here
  nuxt-modular init                     in a Nuxt project: ask a few questions and build a working app
  nuxt-modular make:extension blog      add a complete extension
  nuxt-modular db                       choose or change the database
`
}

/** Short cheat sheet printed at the end of `init`. */
export function cheatSheet(run: string): string {
  return `Commands (run "${run}" for the full list):
  ${run} make:extension <id>      add a complete extension
  ${run} db                       choose or change the database
  ${run} validate                 check extensions
  ${run} help <command>           options and examples`
}

/** `nuxt-modular help <command>` / `<command> --help`; `undefined` for an unknown command. */
export function commandHelp(name: string): string | undefined {
  const command = COMMANDS.find((entry) => entry.name === name)
  if (!command) return undefined
  const lines = [`nuxt-modular ${command.usage}`, '', command.summary]
  if (command.options?.length) {
    const width = Math.max(...command.options.map(([flag]) => flag.length)) + 2
    lines.push('', 'Options', ...command.options.map(([flag, text]) => `  ${pad(flag, width)}${text}`))
  }
  if (command.examples?.length) lines.push('', 'Examples', ...command.examples.map((example) => `  ${example}`))
  return `${lines.join('\n')}\n`
}
