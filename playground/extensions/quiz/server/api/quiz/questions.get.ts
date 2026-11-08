/** Questions from the bank seeded by the quiz migrations (empty until they ran). */
export default defineEventHandler(async () => {
  const bank = await useStorage('app-data').getItem('quiz:question-bank')
  return { questions: Array.isArray(bank) ? bank : [] }
})
