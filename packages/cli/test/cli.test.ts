import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type CommandIO, main } from '../src/index'
import { nextSequence, slugify } from '../src/make'

let cwd: string
let out: string[]
let err: string[]

const io = (): CommandIO => ({ cwd, out: (m) => void out.push(m), err: (m) => void err.push(m) })
const run = (...argv: string[]) => main(argv, io())
const read = (path: string) => readFileSync(join(cwd, path), 'utf8')

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'nuxt-modular-cli-'))
  out = []
  err = []
})
afterEach(() => rmSync(cwd, { recursive: true, force: true }))

describe('make:extension', () => {
  it('scaffolds a full extension that validates', async () => {
    expect(await run('make:extension', 'mod-quiz')).toBe(0)
    for (const file of ['manifest.ts', 'README.md', 'components/ModQuizWidget.vue', 'pages/mod-quiz/index.vue', 'server/api/mod-quiz/ping.get.ts']) {
      expect(existsSync(join(cwd, 'extensions/mod-quiz', file)), file).toBe(true)
    }
    expect(read('extensions/mod-quiz/manifest.ts')).toContain("id: 'mod-quiz'")
    out.length = 0
    expect(await run('validate')).toBe(0)
    expect(out.join('\n')).toContain('1 extension(s) valid')
  })

  it('supports --minimal, --dir and refuses to overwrite without --force', async () => {
    expect(await run('make:extension', 'tiny', '--minimal', '--dir', 'mods')).toBe(0)
    expect(existsSync(join(cwd, 'mods/tiny/components'))).toBe(false)
    expect(await run('make:extension', 'tiny', '--minimal', '--dir', 'mods')).toBe(2)
    expect(err.join('\n')).toContain('Already exists')
    expect(await run('make:extension', 'tiny', '--minimal', '--dir', 'mods', '--force')).toBe(0)
  })

  it('rejects invalid ids', async () => {
    expect(await run('make:extension', 'Not Valid')).toBe(2)
    expect(await run('make:extension', '../evil')).toBe(2)
    expect(existsSync(join(cwd, 'extensions'))).toBe(false)
  })
})

describe('make:* generators', () => {
  beforeEach(async () => {
    await run('make:extension', 'quiz', '--minimal')
    out.length = 0
  })

  it('creates components, pages and API routes', async () => {
    expect(await run('make:component', 'quiz', 'quiz/score-card')).toBe(0)
    expect(read('extensions/quiz/components/quiz/ScoreCard.vue')).toContain('QuizScoreCard')
    expect(await run('make:page', 'quiz', 'quiz/[id]')).toBe(0)
    expect(out.join('\n')).toContain('Route: /quiz/:id')
    expect(await run('make:api', 'quiz', 'quiz/[id]', '--method', 'post')).toBe(0)
    expect(existsSync(join(cwd, 'extensions/quiz/server/api/quiz/[id].post.ts'))).toBe(true)
    expect(out.join('\n')).toContain('POST /api/quiz/:id')
  })

  it('creates hook handlers and plugins', async () => {
    expect(await run('make:hook', 'quiz', 'quiz:score', '--type', 'filter')).toBe(0)
    expect(read('extensions/quiz/server/hooks/on-quiz-score.ts')).toContain('defineFilterHandler')
    expect(out.join('\n')).toContain("type: 'filter'")
    expect(await run('make:plugin', 'quiz', 'Track Views', '--mode', 'client')).toBe(0)
    expect(existsSync(join(cwd, 'extensions/quiz/plugins/track-views.client.ts'))).toBe(true)
  })

  it('numbers migrations and seeders sequentially', async () => {
    await run('make:migration', 'quiz', 'Create Tables')
    await run('make:migration', 'quiz', 'add scores')
    await run('make:seeder', 'quiz', 'demo data')
    expect(existsSync(join(cwd, 'extensions/quiz/server/migrations/001-create-tables.ts'))).toBe(true)
    expect(existsSync(join(cwd, 'extensions/quiz/server/migrations/002-add-scores.ts'))).toBe(true)
    expect(existsSync(join(cwd, 'extensions/quiz/server/seeders/001-demo-data.ts'))).toBe(true)
  })

  it('refuses unknown extensions, path traversal and bad flags', async () => {
    expect(await run('make:component', 'ghost', 'X')).toBe(2)
    expect(await run('make:component', 'quiz', '../../escape')).toBe(2)
    expect(await run('make:page', 'quiz', 'a/../../b')).toBe(2)
    expect(await run('make:api', 'quiz', 'x', '--method', 'fetch')).toBe(2)
    expect(await run('make:hook', 'quiz', 'nocolon')).toBe(2)
    expect(await run('make:hook', 'quiz', 'a:b', '--type', 'weird')).toBe(2)
    expect(existsSync(join(cwd, 'escape.vue'))).toBe(false)
  })
})

describe('list / validate', () => {
  it('lists extensions as a table and as JSON', async () => {
    await run('make:extension', 'alpha')
    await run('make:extension', 'beta', '--minimal')
    out.length = 0
    expect(await run('list')).toBe(0)
    expect(out[0]).toMatch(/^ID\s+VERSION/)
    expect(out.join('\n')).toMatch(/alpha\s+0\.1\.0/)
    out.length = 0
    await run('list', '--json')
    const parsed = JSON.parse(out.join('\n')) as Array<{ id: string; routes: string[] }>
    expect(parsed.map((e) => e.id)).toEqual(['alpha', 'beta'])
    expect(parsed[0]?.routes).toEqual(['GET /api/alpha/ping'])
  })

  it('reports invalid manifests, version conflicts and cycles', async () => {
    mkdirSync(join(cwd, 'extensions/broken'), { recursive: true })
    writeFileSync(join(cwd, 'extensions/broken/manifest.ts'), "export default { id: 'Bad', name: 'x', version: 'nope' }\n")
    mkdirSync(join(cwd, 'extensions/a'), { recursive: true })
    writeFileSync(
      join(cwd, 'extensions/a/manifest.ts'),
      "export default { id: 'a', name: 'A', version: '1.0.0', dependsOn: ['b'], requires: { modular: '^9.0.0', extensions: { b: '^2.0.0' } } }\n",
    )
    mkdirSync(join(cwd, 'extensions/b'), { recursive: true })
    writeFileSync(join(cwd, 'extensions/b/manifest.ts'), "export default { id: 'b', name: 'B', version: '1.0.0', dependsOn: ['a'] }\n")
    mkdirSync(join(cwd, 'extensions/orphan'), { recursive: true })

    expect(await run('validate', '--host-version', '1.0.0')).toBe(1)
    const text = err.join('\n')
    expect(text).toContain('Invalid manifest for extension "Bad"')
    expect(text).toContain('requires nuxt-modular ^9.0.0')
    expect(text).toContain('requires "b" ^2.0.0')
    expect(text).toContain('Dependency cycle')
    expect(text).toContain('extensions/orphan has no manifest')
  })

  it('warns about route conflicts and --strict makes warnings fail', async () => {
    await run('make:extension', 'one')
    await run('make:extension', 'two', '--minimal')
    await run('make:api', 'two', 'one/ping')
    err.length = 0
    expect(await run('validate')).toBe(0)
    expect(err.join('\n')).toContain('warning: Route GET /api/one/ping is served by both')
    expect(await run('validate', '--strict')).toBe(1)
    out.length = 0
    await run('validate', '--json')
    expect(JSON.parse(out.join('\n'))).toMatchObject({ ok: true, extensions: 2 })
  })
})

describe('main', () => {
  it('prints help, version and rejects unknown commands/usage', async () => {
    expect(await run()).toBe(0)
    expect(out.join('\n')).toContain('Usage: nuxt-modular')
    out.length = 0
    expect(await run('--version')).toBe(0)
    expect(out[0]).toMatch(/\d/)
    expect(await run('nope')).toBe(2)
    expect(await run('make:component', 'only-one')).toBe(2)
    expect(await run('--bogus')).toBe(2)
  })
})

describe('helpers', () => {
  it('slugifies names', () => {
    expect(slugify('Create Quiz_Tables')).toBe('create-quiz-tables')
    expect(slugify('addScores')).toBe('add-scores')
  })
  it('starts sequences at 001', () => {
    expect(nextSequence(join(cwd, 'missing'))).toBe('001')
  })
})
