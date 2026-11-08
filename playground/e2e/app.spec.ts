import { expect, getJson, hydrationIssues, test, waitForHydration } from './fixtures'

test.describe('SSR and hydration', () => {
  for (const path of ['/', '/course/nuxt-basics', '/quiz']) {
    test(`${path} hydrates without warnings`, async ({ page, consoleLog }) => {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await waitForHydration(page)
      expect(hydrationIssues(consoleLog)).toEqual([])
    })
  }

  test('a crashing extension shows its fallback and leaves the page interactive', async ({ page, consoleLog }) => {
    await page.goto('/')
    await waitForHydration(page)
    await expect(page.getByRole('alert').filter({ hasText: 'broken-widget' })).toBeVisible()
    await expect(page.getByTestId('quiz-metric')).toBeVisible()
    // The page is still interactive after the failure.
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByTestId('analytics-banner')).toBeHidden()
    expect(consoleLog.filter((line) => line.startsWith('[pageerror]'))).toEqual([])
  })
})

test.describe('extensions in the host', () => {
  test('course outlets render extension slots in order with context', async ({ page }) => {
    await page.goto('/course/nuxt-basics')
    await waitForHydration(page)
    await expect(page.getByTestId('quiz-tab')).toBeVisible()
    await expect(page.getByTestId('quiz-start')).toBeVisible()
    const sidebar = page.locator('[data-outlet="course.sidebar"] > [data-extension]')
    await expect(sidebar).toHaveCount(2)
    await expect(sidebar.first()).toHaveAttribute('data-extension', 'quiz')
    await expect(page.getByTestId('quiz-progress')).toContainText('nuxt-basics')
  })

  test('submitting the quiz goes through the filter hook', async ({ page }) => {
    await page.goto('/course/nuxt-basics')
    await waitForHydration(page)
    await page.getByRole('radio', { name: 'routes' }).check()
    await page.getByRole('radio', { name: 'useState' }).check()
    await page.getByRole('button', { name: 'Submit' }).click()
    // 50 for one correct answer, +5 from the quiz:score filter.
    await expect(page.getByTestId('quiz-score')).toContainText('55')
  })

  test('client-side navigation is tracked by the extension plugin', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    const tracked = page.waitForRequest((request) => request.url().endsWith('/api/analytics/track') && request.method() === 'POST')
    await page.getByRole('link', { name: 'Nuxt basics', exact: true }).click()
    expect((await tracked).postDataJSON()).toEqual({ path: '/course/nuxt-basics' })
  })
})

test.describe('permissions from manifest default roles', () => {
  test('student sees quiz navigation but no analytics', async ({ page, useRole }) => {
    await useRole('student')
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Quizzes/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Analytics/ })).toHaveCount(0)
    await expect(page.getByTestId('page-views-metric')).toHaveCount(0)
  })

  test('teacher gets quiz.manage from the quiz manifest', async ({ page, useRole }) => {
    await useRole('teacher')
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Manage quizzes' })).toBeVisible()
  })

  test('guest sees no extension navigation and no permission-gated slots', async ({ page, useRole }) => {
    await useRole('guest')
    await page.goto('/course/nuxt-basics')
    await expect(page.getByText('No extension menu items for this role.')).toBeVisible()
    await expect(page.getByTestId('quiz-tab')).toHaveCount(0)
  })

  test('admin sees analytics and the persistent toggle panel', async ({ page, useRole }) => {
    await useRole('admin')
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Analytics/ })).toBeVisible()
    await expect(page.getByTestId('page-views-metric')).toBeVisible()
    await expect(page.getByTestId('admin-toggles')).toBeVisible()
  })
})

test.describe('activation', () => {
  test('a session toggle hides the extension UI in this tab only', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    await page.getByRole('checkbox', { name: 'Toggle quiz' }).uncheck()
    await expect(page.getByTestId('quiz-metric')).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Quizzes/ })).toHaveCount(0)

    // A second tab in the same context (same baseURL and cookies) starts a fresh app.
    const other = await page.context().newPage()
    await other.goto('/')
    await expect(other.getByTestId('quiz-metric')).toBeVisible()
    await other.close()
  })

  test('a persistent toggle removes pages, API routes, hooks and UI for everyone', async ({ page, request, setToggle }) => {
    await setToggle('quiz', false)

    expect((await page.goto('/quiz'))?.status()).toBe(404)
    expect((await getJson(request, '/api/quiz/questions')).status).toBe(404)
    const hooks = await getJson<{ filteredScore: number }>(request, '/api/demo/hooks')
    expect(hooks.body?.filteredScore).toBe(80)

    await page.goto('/')
    await waitForHydration(page)
    await expect(page.getByTestId('quiz-metric')).toHaveCount(0)
    await expect(page.locator('[data-extension-row="quiz"]')).toContainText('inactive')

    await setToggle('quiz', null)
    expect((await page.goto('/quiz'))?.status()).toBe(200)
    expect((await getJson(request, '/api/quiz/questions')).status).toBe(200)
  })

  test('the admin API refuses non-admins', async ({ request }) => {
    const response = await request.put('/api/admin/extensions/quiz', { data: { active: false } })
    expect(response.status()).toBe(403)
  })
})

test.describe('migrations', () => {
  test('ran at startup and seeded data through the host context', async ({ request }) => {
    const { status, body } = await getJson<{ questions: Array<{ id: string; difficulty?: string }> }>(request, '/api/quiz/questions')
    expect(status).toBe(200)
    expect(body?.questions.map((question) => [question.id, question.difficulty])).toEqual([
      ['q1', 'easy'],
      ['q2', 'medium'],
    ])
  })
})

test.describe('host chrome', () => {
  test('X-ray frames every extension contribution and the theme can be switched', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('quiz-metric')).toBeVisible()
    await page.getByTestId('xray-toggle').click()
    await expect(page.locator('[data-xray="quiz"]')).toBeVisible()
    await expect(page.locator('[data-xray="broken-widget"]')).toBeVisible()
    await page.getByTestId('xray-toggle').click()
    await expect(page.locator('[data-xray]')).toHaveCount(0)

    await page.getByTestId('theme-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/)
  })
})
