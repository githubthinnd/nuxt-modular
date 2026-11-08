import { defineSeeder } from '#modular'

/** Demo data for local development. Idempotent: the fixed ids are replaced, not duplicated. */
export default defineSeeder({
  async run({ db, log }) {
    const rows = [
      ['demo-1', 'nuxt-basics', 80],
      ['demo-2', 'nuxt-basics', 65],
    ] as const
    for (const [id, courseId, score] of rows) {
      await db.prepare('DELETE FROM quiz_attempts WHERE id = ?').run(id)
      await db.prepare('INSERT INTO quiz_attempts (id, course_id, score, created_at) VALUES (?, ?, ?, ?)').run(id, courseId, score, Date.now())
    }
    log(`stored ${rows.length} demo attempts`)
  },
})
