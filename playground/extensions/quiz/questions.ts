export interface QuizQuestion {
  readonly id: string
  readonly text: string
  readonly options: readonly string[]
  readonly answer: string
}

/** Shared by the quiz tab (client) and the submit API (server). */
export const QUESTIONS: readonly QuizQuestion[] = [
  { id: 'q1', text: 'Which directory holds Nuxt pages?', options: ['pages', 'routes', 'views'], answer: 'pages' },
  { id: 'q2', text: 'Which composable shares state between SSR and client?', options: ['ref', 'useState', 'reactive'], answer: 'useState' },
]

export function scoreAnswers(answers: Readonly<Record<string, string>>): number {
  const correct = QUESTIONS.filter((question) => answers[question.id] === question.answer).length
  return Math.round((correct / QUESTIONS.length) * 100)
}
