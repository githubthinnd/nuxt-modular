/**
 * Host endpoint exercising the server hook bus, so the filter/action pipeline
 * can be checked with a plain GET (and prerendered in CI).
 */
export default defineEventHandler(async () => {
  const hooks = useModularServerHooks()
  const rawScore = 80
  const score = await hooks.applyFilter('quiz:score', rawScore, { courseId: 'demo', answers: {} })
  await hooks.callHook('quiz:submitted', { courseId: 'demo', score })

  return {
    rawScore,
    filteredScore: score,
    subscriptions: hooks.listHooks(),
  }
})
