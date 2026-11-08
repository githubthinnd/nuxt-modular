import { fileURLToPath } from 'node:url'
import { join } from 'pathe'
import { describe, expect, it } from 'vitest'
import {
  componentNameFromPath,
  findExtensionDirs,
  pascalCase,
  routeFromPagePath,
  scanExtension,
} from '../src/scan'
import { componentsTemplate, manifestsTemplate, migrationsTemplate, seedersTemplate, serverHooksTemplate, serverRoutesTemplate } from '../src/templates'

const fixtures = fileURLToPath(new URL('./fixtures/extensions', import.meta.url))
const alias = { '#modular': fileURLToPath(import.meta.resolve('@nuxt-modular/core')) }

describe('naming helpers', () => {
  it('converts names to PascalCase', () => {
    expect(pascalCase('quiz-tab')).toBe('QuizTab')
    expect(pascalCase('quiz_tab')).toBe('QuizTab')
    expect(pascalCase('QuizTab')).toBe('QuizTab')
    expect(pascalCase('quizTab2')).toBe('QuizTab2')
  })

  it('derives Nuxt-style component names from paths', () => {
    expect(componentNameFromPath('QuizTab.vue')).toBe('QuizTab')
    expect(componentNameFromPath('quiz/Tab.vue')).toBe('QuizTab')
    expect(componentNameFromPath('quiz/QuizTab.vue')).toBe('QuizTab')
    expect(componentNameFromPath('quiz/index.vue')).toBe('Quiz')
    expect(componentNameFromPath('quiz/widgets/score-card.ts')).toBe('QuizWidgetsScoreCard')
  })

  it('maps page files to routes', () => {
    expect(routeFromPagePath('index.vue')).toBe('/')
    expect(routeFromPagePath('quiz/index.vue')).toBe('/quiz')
    expect(routeFromPagePath('quiz/[id].vue')).toBe('/quiz/:id')
    expect(routeFromPagePath('quiz/[[tab]].vue')).toBe('/quiz/:tab?')
    expect(routeFromPagePath('docs/[...slug].vue')).toBe('/docs/:slug(.*)*')
    expect(routeFromPagePath('quiz/item-[id].vue')).toBe('/quiz/item-:id')
  })
})

describe('findExtensionDirs', () => {
  it('lists directories with a manifest, skipping _private and dot dirs', async () => {
    const dirs = await findExtensionDirs(fixtures)
    expect(dirs.map((dir) => dir.slice(fixtures.length + 1))).toEqual(['broken-ref', 'escape', 'quiz'])
  })

  it('returns nothing for a missing directory', async () => {
    expect(await findExtensionDirs(join(fixtures, 'nope'))).toEqual([])
  })
})

describe('scanExtension', () => {
  it('loads the manifest through the #modular alias and resolves every reference', async () => {
    const dir = join(fixtures, 'quiz')
    const extension = await scanExtension(dir, { alias })

    expect(extension.manifest.id).toBe('quiz')
    expect(extension.components).toEqual({
      './components/quiz/QuizTab.vue': join(dir, 'components/quiz/QuizTab.vue'),
      './components/quiz/QuizTab': join(dir, 'components/quiz/QuizTab.vue'),
      QuizWidget: join(dir, 'components/quiz/Widget.vue'),
    })
    expect(extension.serverHooks).toEqual([
      { hook: 'quiz:submitted', type: 'action', order: 5, file: join(dir, 'server/hooks/on-submitted.ts') },
    ])
    expect(extension.pages).toEqual([
      { name: 'ext-quiz-quiz-id', path: '/quiz/:id', file: join(dir, 'pages/quiz/[id].vue') },
      { name: 'ext-quiz-quiz', path: '/quiz', file: join(dir, 'pages/quiz/index.vue') },
    ])
    expect(extension.plugins).toEqual([join(dir, 'plugins/track.client.ts')])
    expect(extension.serverRoutes).toEqual([
      { route: '/api/quiz/ping', method: 'get', file: join(dir, 'server/api/quiz/ping.get.ts') },
      { route: '/quiz-feed.xml', method: undefined, file: join(dir, 'server/routes/quiz-feed.xml.ts') },
    ])
    expect(extension.seeders).toEqual([{ name: '001-demo', file: join(dir, 'server/seeders/001-demo.ts') }])
    expect(extension.migrations).toEqual([
      { name: '001-init', file: join(dir, 'server/migrations/001-init.ts') },
      { name: '002-scores', file: join(dir, 'server/migrations/002-scores.ts') },
    ])
    expect(extension.componentsDir).toBe(join(dir, 'components'))
    expect(extension.serverDir).toBe(join(dir, 'server'))
  })

  it('reports every unresolved reference at once', async () => {
    await expect(scanExtension(join(fixtures, 'broken-ref'), { alias })).rejects.toThrow(
      /slots\[0\]\.component "DoesNotExist" matches no component[\s\S]*serverHooks\[0\]\.handler/,
    )
  })

  it('refuses references that leave the extension directory', async () => {
    await expect(scanExtension(join(fixtures, 'escape'), { alias })).rejects.toThrow(
      /does not resolve to a file inside the extension/,
    )
  })
})

describe('templates', () => {
  it('generates deterministic, importable code', async () => {
    const quiz = await scanExtension(join(fixtures, 'quiz'), { alias })

    expect(manifestsTemplate([quiz])).toMatch(/^export const manifests = \[/)

    const components = componentsTemplate([quiz])
    expect(components).toContain(`import { defineAsyncComponent } from 'vue'`)
    const keys = [...components.matchAll(/^ {2}"([^"]+)":/gm)].map((match) => match[1])
    expect(keys).toEqual(['quiz:./components/quiz/QuizTab', 'quiz:./components/quiz/QuizTab.vue', 'quiz:QuizWidget'])

    const hooks = serverHooksTemplate([quiz])
    expect(hooks).toContain(`import handler0 from ${JSON.stringify(join(fixtures, 'quiz/server/hooks/on-submitted.ts'))}`)
    expect(hooks).toContain(`{ extensionId: "quiz", hook: "quiz:submitted", type: "action", order: 5, handler: handler0 },`)
  })
})

describe('server templates', () => {
  it('lists owned routes and migration modules', async () => {
    const quiz = await scanExtension(join(fixtures, 'quiz'), { alias })
    expect(serverRoutesTemplate([quiz])).toContain('"route": "/api/quiz/ping"')
    const migrations = migrationsTemplate([quiz])
    expect(migrations).toContain(`import migration0 from ${JSON.stringify(join(fixtures, 'quiz/server/migrations/001-init.ts'))}`)
    expect(migrations).toContain(`{ extensionId: "quiz", name: "002-scores", migration: migration1 },`)
    expect(seedersTemplate([quiz])).toContain(`{ extensionId: "quiz", name: "001-demo", seeder: seeder0 },`)
  })
})
