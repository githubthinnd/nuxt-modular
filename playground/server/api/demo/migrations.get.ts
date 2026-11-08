/**
 * Demo endpoint: applies pending migrations (idempotent) and reports their
 * status, so the migration pipeline can be checked with a plain GET (and
 * prerendered in CI). A real host would expose this to admins only, if at all.
 */
export default defineEventHandler(async () => {
  const migrations = useModularMigrations()
  const report = await migrations.up()
  const bank = await useStorage('app-data').getItem('quiz:question-bank')
  return {
    executed: report.executed,
    failed: report.failed ? { ...report.failed, error: String(report.failed.error) } : null,
    status: await migrations.status(),
    questionBankSize: Array.isArray(bank) ? bank.length : 0,
  }
})
