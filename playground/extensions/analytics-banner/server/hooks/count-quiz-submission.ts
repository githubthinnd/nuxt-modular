import { defineActionHandler } from '#modular'
import { countQuizSubmission } from '../store'

/** Listens to an action emitted by another extension (quiz) without importing it. */
export default defineActionHandler<'quiz:submitted'>(({ score }) => {
  countQuizSubmission(score)
})
