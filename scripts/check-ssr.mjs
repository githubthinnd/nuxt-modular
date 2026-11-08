#!/usr/bin/env node
/*
 * SSR verification for the playground, without opening a network port:
 * `nuxi generate` renders pages and GET routes in-process (Nitro prerender),
 * then this script asserts on the produced HTML, payloads and bundles.
 *
 *   cd playground && node ../scripts/check-ssr.mjs
 *
 * Run 1: every extension built → slots, order, permissions, error isolation, hooks, migrations.
 * Run 2: NUXT_MODULAR_DISABLED=analytics-banner,broken-widget → nothing of them remains.
 * Run 3: persistent toggle { quiz: false } in the SQL toggles table → quiz built but inactive everywhere.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join, resolve } from 'node:path'

const playground = resolve(process.cwd())
const publicDir = join(playground, '.output/public')
const dataDir = join(playground, '.data')
const sqliteFile = join(dataDir, 'modular.sqlite')

/** Writes straight into the SQL table the module stores toggles in (created by run 1). */
function setToggles(toggles) {
  const db = new DatabaseSync(sqliteFile)
  db.exec('DELETE FROM modular_toggles')
  for (const [id, active] of Object.entries(toggles)) {
    db.prepare('INSERT INTO modular_toggles (extension_id, active) VALUES (?, ?)').run(id, active ? 1 : 0)
  }
  db.close()
}
let failures = 0

// Start from empty storage: no toggles, no migration ledger, no app data.
rmSync(dataDir, { recursive: true, force: true })

function check(condition, message) {
  console.log(`${condition ? '  ✔' : '  ✘'} ${message}`)
  if (!condition) failures++
}

function generate(disabled, { allowErrors = false } = {}) {
  console.log(`\n▶ nuxi generate (disabled: ${disabled || 'none'})`)
  execFileSync('npx', ['nuxi', 'generate'], {
    cwd: playground,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      NUXT_MODULAR_DISABLED: disabled,
      NUXT_TELEMETRY_DISABLED: '1',
      PLAYGROUND_PRERENDER: '1',
      PRERENDER_ALLOW_ERRORS: allowErrors ? '1' : '',
    },
  })
}

function page(route) {
  const dir = join(publicDir, route)
  const html = readFileSync(join(dir, 'index.html'), 'utf8')
  const payloadFile = join(dir, '_payload.json')
  const payload = existsSync(payloadFile) ? readFileSync(payloadFile, 'utf8') : ''
  return { html, payload, state: html + payload }
}

function json(route) {
  for (const candidate of [route, `${route}.json`, join(route, 'index.json')]) {
    const file = join(publicDir, candidate)
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  }
  return undefined
}

function clientBundle() {
  const dir = join(publicDir, '_nuxt')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFileSync(join(dir, file), 'utf8'))
    .join('\n')
}

const before = (html, a, b) => html.indexOf(a) !== -1 && html.indexOf(b) !== -1 && html.indexOf(a) < html.indexOf(b)

// ---------------------------------------------------------------------------
// Run 1 — everything enabled
// ---------------------------------------------------------------------------
generate('')

console.log('\n● Dashboard (/), default role "student"')
{
  const { html, state } = page('')
  check(/<h1[^>]*>Dashboard<\/h1>/.test(html), 'host page rendered')
  check(html.includes('data-testid="analytics-banner"'), 'analytics banner injected into dashboard.header')
  check(html.includes('data-testid="quiz-metric"'), 'quiz metric injected into dashboard.metrics')
  check(!html.includes('data-testid="page-views-metric"'), 'analytics metric hidden without analytics.view')
  check(html.includes('data-slot="broken-widget/metric"'), 'broken widget slot rendered as an isolated wrapper')
  check(!html.includes('never rendered'), 'broken widget template never rendered')
  check(html.includes('data-extension-row="quiz"') && html.includes('Granted capabilities'), 'host content after the broken outlet still rendered')
  check(state.includes('nuxt-modular:failed-slots') && state.includes('broken-widget/metric'), 'failed slot recorded in the payload for hydration')
  check(before(html, 'data-testid="quiz-metric"', 'data-slot="broken-widget/metric"'), 'dashboard.metrics ordered by `order` (quiz 20 < broken 30)')
  check(html.includes('href="/quiz"'), 'sidebar shows extension navigation (quiz)')
  check(!html.includes('href="/quiz/manage"') && !html.includes('href="/analytics"'), 'navigation hidden without permission')
}

console.log('\n● Course page (/course/nuxt-basics)')
{
  const { html } = page('course/nuxt-basics')
  check(html.includes('data-testid="quiz-tab"'), 'quiz tab injected into course.tabs')
  check(html.includes('data-testid="quiz-start"'), 'quiz action injected into course.actions')
  check(html.includes('Your quiz progress') && /<code[^>]*>nuxt-basics<\/code>/.test(html), 'static props and outlet context passed to the widget')
  check(html.includes('<aside data-outlet="course.sidebar"') && html.includes('<section data-extension="quiz"'), 'wrapWith and itemTag applied')
  check(before(html, 'data-testid="quiz-progress"', 'data-slot="broken-widget/sidebar"'), 'course.sidebar ordered (quiz 10 < broken 99)')
}

console.log('\n● Extension page (/quiz)')
check(existsSync(join(publicDir, 'quiz/index.html')) && page('quiz').html.includes('contributed by the'), 'extension page registered and rendered')

console.log('\n● Server hook bus (/api/demo/hooks)')
{
  const result = json('api/demo/hooks')
  check(result !== undefined, 'hook demo route prerendered')
  check(result?.filteredScore === 85, `quiz:score filter applied by the quiz extension (80 → ${result?.filteredScore})`)
  const has = (hook, owner, type) => result?.subscriptions?.some((s) => s.hook === hook && s.owner === owner && s.type === type)
  check(has('quiz:score', 'quiz', 'filter'), 'quiz filter subscribed')
  check(has('quiz:submitted', 'analytics-banner', 'action'), 'analytics subscribed to a quiz action')
  check(has('nitro:request', 'analytics-banner', 'action'), 'analytics subscribed to the bridged nitro:request hook')
}
check(json('api/analytics/stats') !== undefined, 'analytics API route served from the extension server dir')

console.log('\n● Migrations (/api/demo/migrations)')
{
  const result = json('api/demo/migrations')
  check(result?.failed === null, 'no migration failed')
  const quiz = result?.status?.find((entry) => entry.extensionId === 'quiz')
  check(JSON.stringify(quiz?.applied) === JSON.stringify(['001-question-bank', '002-difficulty', '003-attempts-table']), `quiz migrations applied in order (${quiz?.applied})`)
  check(quiz?.pending?.length === 0, 'nothing pending')
  check(result?.questionBankSize === 2, 'migration seeded data through the host migration context')
  check(json('api/quiz/questions') !== undefined, 'quiz API route generated while the extension is active')
}
check(clientBundle().includes('/api/analytics/track'), 'analytics client plugin bundled')

// ---------------------------------------------------------------------------
// Run 2 — analytics-banner and broken-widget removed at build time
// ---------------------------------------------------------------------------
generate('analytics-banner,broken-widget')

console.log('\n● Disabled at build time')
{
  const { html, state } = page('')
  check(html.includes('data-testid="quiz-metric"'), 'remaining extension still rendered')
  check(!html.includes('analytics-banner') && !html.includes('broken-widget'), 'no trace of disabled extensions in the HTML')
  check(!state.includes('broken-widget'), 'no failed slots in the payload')
  const result = json('api/demo/hooks')
  check(result?.filteredScore === 85, 'quiz filter still applied')
  check(!result?.subscriptions?.some((s) => s.owner === 'analytics-banner'), 'analytics server hooks unregistered')
  check(json('api/analytics/stats') === undefined, 'analytics API route not generated')
  const bundle = clientBundle()
  check(!bundle.includes('/api/analytics/track') && !bundle.includes('Analytics is active'), 'analytics plugin and components absent from the client bundle')
  check(!bundle.includes('BrokenWidget always fails'), 'broken widget absent from the client bundle')
}

// ---------------------------------------------------------------------------
// Run 3 — everything built, quiz switched off by a persistent toggle
// ---------------------------------------------------------------------------
setToggles({ quiz: false })
// The quiz pages answer 404 now, which prerendering would otherwise treat as fatal.
generate('', { allowErrors: true })

console.log('\n● Persistent toggle { quiz: false }')
{
  const { html, state } = page('')
  check(!html.includes('data-testid="quiz-metric"'), 'quiz slot hidden on the dashboard')
  check(!html.includes('href="/quiz"'), 'quiz navigation hidden')
  check(html.includes('data-testid="analytics-banner"'), 'other extensions unaffected')
  check(state.includes('nuxt-modular:persisted'), 'persistent toggles shipped in the payload for hydration')
  const course = page('course/nuxt-basics').html
  check(!course.includes('data-testid="quiz-tab"') && course.includes('No extension adds a tab'), 'course.tabs falls back to #empty')
  const hooks = json('api/demo/hooks')
  check(hooks?.filteredScore === 80, `quiz filter skipped while inactive (80 → ${hooks?.filteredScore})`)
  check(json('api/quiz/questions') === undefined, 'quiz API route answers 404 (not generated)')
  check(!existsSync(join(publicDir, 'quiz/index.html')), 'quiz page answers 404 (not generated)')
  const migrations = json('api/demo/migrations')
  check(migrations?.executed?.length === 0, 'no migration re-executed')
  check(clientBundle().includes('Quiz questions'), 'quiz is still part of the build (runtime toggle, not build-time removal)')
}
setToggles({})

console.log(failures ? `\n✘ ${failures} SSR check(s) failed` : '\n✔ all SSR checks passed')
process.exit(failures ? 1 : 0)
