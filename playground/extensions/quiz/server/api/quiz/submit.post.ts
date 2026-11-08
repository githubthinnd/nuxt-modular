import { QUESTIONS, scoreAnswers } from '../../../questions'

interface SubmitBody {
  courseId: string
  answers: Record<string, string>
}

function parseBody(body: unknown): SubmitBody {
  if (typeof body !== 'object' || body === null) throw createError({ statusCode: 400, statusMessage: 'Body must be an object' })
  const { courseId, answers } = body as Record<string, unknown>
  if (typeof courseId !== 'string' || !courseId) throw createError({ statusCode: 400, statusMessage: 'courseId is required' })
  if (typeof answers !== 'object' || answers === null) throw createError({ statusCode: 400, statusMessage: 'answers must be an object' })
  const known = new Set(QUESTIONS.map((question) => question.id))
  const clean: Record<string, string> = {}
  for (const [id, value] of Object.entries(answers)) {
    if (known.has(id) && typeof value === 'string') clean[id] = value
  }
  return { courseId, answers: clean }
}

export default defineEventHandler(async (event) => {
  const { courseId, answers } = parseBody(await readBody(event))
  const hooks = useModularServerHooks()

  const score = await hooks.applyFilter('quiz:score', scoreAnswers(answers), { courseId, answers })
  await hooks.callHook('quiz:submitted', { courseId, score })

  return { score }
})
