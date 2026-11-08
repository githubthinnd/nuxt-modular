// Typed hooks the quiz extension emits; visible to every server file.
declare module '#modular' {
  interface ModularActions {
    'quiz:submitted': [payload: { courseId: string; score: number }]
  }
  interface ModularFilters {
    'quiz:score': [score: number, context: { courseId: string; answers: Record<string, string> }]
  }
}

export {}
