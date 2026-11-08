import { defineSeeder } from '#modular'

/** Demo data for local development. Idempotent: running it twice leaves the same state. */
export default defineSeeder({
  async run({ storage, log }) {
    await storage.setItem('quiz:demo-attempts', [
      { user: 'student-1', score: 80 },
      { user: 'student-2', score: 65 },
    ])
    log('stored 2 demo attempts')
  },
})
