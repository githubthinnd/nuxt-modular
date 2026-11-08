import { defineFilterHandler } from '#modular'

/** Adds a participation bonus (`config.bonusPoints`, see the manifest), capped at 100. */
export default defineFilterHandler<'quiz:score'>((score) =>
  Math.min(100, score + useModularExtensionConfig('quiz').get('bonusPoints', 5)),
)
