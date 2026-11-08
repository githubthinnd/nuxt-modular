import { NUXT_DEVTOOLS_GROUP_ID, onDevtoolsReady } from '@nuxt/devtools-kit'
import { addServerHandler, addServerTemplate, addTypeTemplate, type Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { relative } from 'pathe'
import type { ScannedExtension } from './scan'

export const DEVTOOLS_ROUTE = '/__nuxt_modular'

/** Type declarations for the devtools data module; registered in every mode so type-checking works. */
export function addDevtoolsTypes(): void {
  addTypeTemplate(
    {
      filename: 'types/nuxt-modular-devtools.d.ts',
      getContents: () => `declare module '#nuxt-modular/devtools-data' {
  import type { ExtensionManifest } from '#modular'
  export interface DevtoolsExtension {
    manifest: ExtensionManifest
    dir: string
    components: Record<string, string>
    pages: string[]
    plugins: string[]
    serverDir: string | null
  }
  export const extensions: DevtoolsExtension[]
}
`,
    },
    { nitro: true, nuxt: true },
  )
}

/**
 * Development-only inspector: a server route rendering an HTML report of the
 * installed extensions, embedded as an "Extensions" tab in Nuxt DevTools.
 */
export function setupDevtools(nuxt: Nuxt, resolver: Resolver, extensions: readonly ScannedExtension[]): void {
  const rel = (path: string) => relative(nuxt.options.rootDir, path)

  addServerTemplate({
    filename: '#nuxt-modular/devtools-data',
    getContents: () =>
      `export const extensions = ${JSON.stringify(
        extensions.map((extension) => ({
          manifest: extension.manifest,
          dir: rel(extension.dir),
          components: Object.fromEntries(
            Object.entries(extension.components).map(([reference, file]) => [reference, rel(file)]),
          ),
          pages: extension.pages.map((page) => page.path),
          plugins: extension.plugins.map(rel),
          serverDir: extension.serverDir ? rel(extension.serverDir) : null,
        })),
      )}\n`,
  })

  addServerHandler({ route: DEVTOOLS_ROUTE, handler: resolver.resolve('./runtime/server/devtools') })

  onDevtoolsReady((ctx) => {
    ctx.docks.register({
      id: 'nuxt-modular',
      type: 'iframe',
      title: 'Extensions',
      icon: 'i-carbon-plug',
      url: DEVTOOLS_ROUTE,
      groupId: NUXT_DEVTOOLS_GROUP_ID,
    })
  }, nuxt)
}
