import { componentKey } from '@nuxt-modular/core'
import type { ScannedExtension } from './scan'

/*
 * Code generators for the build-time artifacts. Output must be deterministic
 * (sorted keys) so rebuilds do not churn and SSR/client bundles agree.
 */

const byId = (a: ScannedExtension, b: ScannedExtension): number =>
  a.manifest.id < b.manifest.id ? -1 : a.manifest.id > b.manifest.id ? 1 : 0

/** `#nuxt-modular/manifests` — validated manifests as static data. */
export function manifestsTemplate(extensions: readonly ScannedExtension[]): string {
  const manifests = [...extensions].sort(byId).map((extension) => extension.manifest)
  return `export const manifests = ${JSON.stringify(manifests, null, 2)}\n`
}

export const manifestsTypes = `import type { ExtensionManifest } from '#modular'
export declare const manifests: readonly ExtensionManifest[]
`

/** `#nuxt-modular/components` — lazy loaders keyed by `<extensionId>:<reference>`. */
export function componentsTemplate(extensions: readonly ScannedExtension[]): string {
  const entries = [...extensions]
    .sort(byId)
    .flatMap((extension) =>
      Object.entries(extension.components)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([reference, file]) => [componentKey(extension.manifest.id, reference), file] as const),
    )
  const lines = entries.map(
    ([key, file]) =>
      `  ${JSON.stringify(key)}: defineAsyncComponent(() => import(${JSON.stringify(file)}).then((m) => m.default ?? m)),`,
  )
  return [
    `import { defineAsyncComponent } from 'vue'`,
    ``,
    `export const slotComponents = {`,
    ...lines,
    `}`,
    ``,
  ].join('\n')
}

export const componentsTypes = `import type { Component } from 'vue'
export declare const slotComponents: Readonly<Record<string, Component>>
`

/** Nitro virtual `#nuxt-modular/server-hooks` — handler imports plus subscription metadata. */
export function serverHooksTemplate(extensions: readonly ScannedExtension[]): string {
  const imports: string[] = []
  const subscriptions: string[] = []
  let index = 0
  for (const extension of [...extensions].sort(byId)) {
    for (const hook of extension.serverHooks) {
      const name = `handler${index++}`
      imports.push(`import ${name} from ${JSON.stringify(hook.file)}`)
      subscriptions.push(
        `  { extensionId: ${JSON.stringify(extension.manifest.id)}, hook: ${JSON.stringify(hook.hook)}, ` +
          `type: ${JSON.stringify(hook.type)}, order: ${hook.order}, handler: ${name} },`,
      )
    }
  }
  return [...imports, ``, `export const subscriptions = [`, ...subscriptions, `]`, ``].join('\n')
}

/** Augments the hook maps with the Nitro lifecycle hooks the server plugin forwards. */
export function nitroHooksTypes(coreAlias: string, h3Dir: string): string {
  return `import type { H3Event } from ${JSON.stringify(h3Dir)}

declare module ${JSON.stringify(coreAlias)} {
  interface ModularActions {
    'nitro:request': [event: H3Event]
    'nitro:after-response': [event: H3Event]
    'nitro:error': [error: Error, event: H3Event | undefined]
    /** An extension was switched on/off (\`null\` = back to its default) with \`useModularToggles().set()\`. */
    'modular:extension-toggled': [extensionId: string, active: boolean | null]
  }
  interface ModularFilters {
    /** Extend the context handed to extension migrations (database client, …). */
    'modular:migration-context': [context: import(${JSON.stringify(coreAlias)}).MigrationContext]
    /** Extend the context handed to extension seeders (database client, …). */
    'modular:seeder-context': [context: import(${JSON.stringify(coreAlias)}).SeederContext]
  }
}

export {}
`
}

export const serverHooksTypes = `declare module '#nuxt-modular/server-hooks' {
  import type { ServerHookType } from '#modular'
  export interface ServerHookEntry {
    readonly extensionId: string
    readonly hook: string
    readonly type: ServerHookType
    readonly order: number
    readonly handler: unknown
  }
  export const subscriptions: readonly ServerHookEntry[]
}
`

/** Nitro virtual `#nuxt-modular/server-manifests` — manifests for server-side toggles and migrations. */
export function serverManifestsTemplate(extensions: readonly ScannedExtension[]): string {
  return manifestsTemplate(extensions)
}

/** Nitro virtual `#nuxt-modular/server-routes` — API routes and the extension owning each. */
export function serverRoutesTemplate(extensions: readonly ScannedExtension[]): string {
  const routes = [...extensions]
    .sort(byId)
    .flatMap((extension) => extension.serverRoutes.map((route) => ({ extensionId: extension.manifest.id, route: route.route })))
  const unique = routes.filter(
    (entry, index) => routes.findIndex((other) => other.extensionId === entry.extensionId && other.route === entry.route) === index,
  )
  return `export const routes = ${JSON.stringify(unique, null, 2)}\n`
}

/** Nitro virtual `#nuxt-modular/migrations` — migration modules with their owner and name. */
export function migrationsTemplate(extensions: readonly ScannedExtension[]): string {
  const imports: string[] = []
  const entries: string[] = []
  let index = 0
  for (const extension of [...extensions].sort(byId)) {
    for (const migration of extension.migrations) {
      const name = `migration${index++}`
      imports.push(`import ${name} from ${JSON.stringify(migration.file)}`)
      entries.push(
        `  { extensionId: ${JSON.stringify(extension.manifest.id)}, name: ${JSON.stringify(migration.name)}, migration: ${name} },`,
      )
    }
  }
  return [...imports, ``, `export const migrations = [`, ...entries, `]`, ``].join('\n')
}

/** Nitro virtual `#nuxt-modular/seeders` — seeder modules with their owner and name. */
export function seedersTemplate(extensions: readonly ScannedExtension[]): string {
  const imports: string[] = []
  const entries: string[] = []
  let index = 0
  for (const extension of [...extensions].sort(byId)) {
    for (const seeder of extension.seeders) {
      const name = `seeder${index++}`
      imports.push(`import ${name} from ${JSON.stringify(seeder.file)}`)
      entries.push(
        `  { extensionId: ${JSON.stringify(extension.manifest.id)}, name: ${JSON.stringify(seeder.name)}, seeder: ${name} },`,
      )
    }
  }
  return [...imports, ``, `export const seeders = [`, ...entries, `]`, ``].join('\n')
}

export const serverDataTypes = `declare module '#nuxt-modular/server-manifests' {
  import type { ExtensionManifest } from '#modular'
  export const manifests: readonly ExtensionManifest[]
}
declare module '#nuxt-modular/server-routes' {
  export const routes: ReadonlyArray<{ readonly extensionId: string; readonly route: string }>
}
declare module '#nuxt-modular/migrations' {
  import type { MigrationEntry } from '#modular'
  export const migrations: readonly MigrationEntry[]
}
declare module '#nuxt-modular/seeders' {
  import type { SeederEntry } from '#modular'
  export const seeders: readonly SeederEntry[]
}
`
