export type DatabaseChoice = 'none' | 'sqlite' | 'postgresql' | 'mysql'
export type PackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun'

/** Everything the setup questions decide. */
export interface InitAnswers {
  /** Extensions directory relative to the project root. */
  readonly extensionsDir: string
  readonly database: DatabaseChoice
  /** Connection URL for PostgreSQL or MySQL, written to the env file; empty to fill in later. */
  readonly databaseUrl: string
  /** Roles of the application; they become `defaultRoles` of the starter extension. */
  readonly roles: readonly string[]
  /** Role granted to the current visitor by the generated permissions plugin. */
  readonly defaultRole: string
  /** Id of the starter extension, or `false` to skip it. */
  readonly starter: string | false
  /** Generate a host shell (`app.vue` with a menu) and a home page with an outlet. */
  readonly hostShell: boolean
  /** Register the Nitro tasks (`modular:migrate`, `modular:seed`, ...). */
  readonly tasks: boolean
  /** Run pending migrations when the server starts. */
  readonly autoMigrate: boolean
  /** Install the database driver (`pg`, `mysql2`) with the project's package manager. */
  readonly installDriver: boolean
}

/** What the setup learns about the Nuxt project it runs in. */
export interface ProjectInfo {
  readonly root: string
  /** File name of the Nuxt config, e.g. `nuxt.config.ts`. */
  readonly configFile: string
  readonly configSource: string
  /** Nuxt source directory relative to the root: `app` (Nuxt 4 layout) or `.` (Nuxt 3 layout). */
  readonly srcDir: 'app' | '.'
  readonly packageManager: PackageManagerName
  /** Name from package.json, used for the generated host shell. */
  readonly name: string
  readonly hasAppVue: boolean
  /** `app.vue` is still the unmodified `<NuxtWelcome />` scaffold. */
  readonly appVueIsDefault: boolean
  readonly hasIndexPage: boolean
  /** The Nuxt config already has a `modular` block. */
  readonly hasModularConfig: boolean
  /** The extensions directory already holds at least one extension. */
  readonly hasExtensions: boolean
}

export interface PlannedFile {
  /** Path relative to the project root. */
  readonly path: string
  readonly content: string
  /** Replace the file when it exists (only used for the untouched default `app.vue`). */
  readonly overwrite?: boolean
}

export interface InitPlan {
  readonly files: readonly PlannedFile[]
  /** Block to add to the Nuxt config (`modular: { ... },`), when any option differs from the defaults. */
  readonly configBlock: string | undefined
  readonly scripts: Readonly<Record<string, string>>
  /** Lines to add to `.env.example` (key to line). */
  readonly env: Readonly<Record<string, string>>
  /** Connection URL to write to the env file, when given. */
  readonly envUrl: string | undefined
  /** Entries to add to `.gitignore`. */
  readonly gitignore: readonly string[]
  /** Packages to install as dependencies. */
  readonly install: readonly string[]
  /** Follow-up instructions printed at the end. */
  readonly notes: readonly string[]
}
