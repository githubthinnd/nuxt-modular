/** Attempts recorded by `POST /api/quiz/submit`, read back from the configured database. */
export default defineEventHandler(async () => {
  const database = await useModularDatabase()
  if (!database) return { dialect: null, attempts: [] }
  const attempts = await database.db.prepare('SELECT id, course_id, score FROM quiz_attempts ORDER BY created_at DESC, id').all()
  return { dialect: database.dialect, attempts }
})
