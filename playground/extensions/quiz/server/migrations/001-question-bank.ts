import { defineMigration } from '#modular'
import { QUESTIONS } from '../../questions'

/** Seeds the question bank into the host-provided storage. */
export default defineMigration({
  async up({ storage, log }) {
    await storage.setItem(
      'quiz:question-bank',
      QUESTIONS.map(({ id, text, options }) => ({ id, text, options })),
    )
    log(`seeded ${QUESTIONS.length} questions`)
  },
  async down({ storage }) {
    await storage.removeItem('quiz:question-bank')
  },
})
