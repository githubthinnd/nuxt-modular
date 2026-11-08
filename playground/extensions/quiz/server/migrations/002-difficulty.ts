import { defineMigration } from '#modular'

interface StoredQuestion {
  id: string
  text: string
  options: string[]
  difficulty?: 'easy' | 'medium'
}

const isQuestionList = (value: unknown): value is StoredQuestion[] => Array.isArray(value)

/** Adds a difficulty to every stored question; `down` removes it again. */
export default defineMigration({
  async up({ storage }) {
    const bank = await storage.getItem('quiz:question-bank')
    if (!isQuestionList(bank)) return
    await storage.setItem(
      'quiz:question-bank',
      bank.map((question, index) => ({ ...question, difficulty: index === 0 ? 'easy' : 'medium' })),
    )
  },
  async down({ storage }) {
    const bank = await storage.getItem('quiz:question-bank')
    if (!isQuestionList(bank)) return
    await storage.setItem(
      'quiz:question-bank',
      bank.map(({ difficulty: _difficulty, ...question }) => question),
    )
  },
})
