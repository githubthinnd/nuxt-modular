/**
 * In-memory counters (per server process). A real extension would persist
 * them; the point here is that every write comes from hooks or its own API.
 */
export interface AnalyticsStats {
  requests: number
  pageViews: number
  quizSubmissions: number
  lastQuizScore: number | null
  topPaths: Array<{ path: string; views: number }>
}

const counters = { requests: 0, pageViews: 0, quizSubmissions: 0, lastQuizScore: null as number | null }
const views = new Map<string, number>()

export function countRequest(): void {
  counters.requests++
}

export function countPageView(path: string): void {
  counters.pageViews++
  views.set(path, (views.get(path) ?? 0) + 1)
}

export function countQuizSubmission(score: number): void {
  counters.quizSubmissions++
  counters.lastQuizScore = score
}

export function readStats(): AnalyticsStats {
  const topPaths = [...views.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 5)
    .map(([path, count]) => ({ path, views: count }))
  return { ...counters, topPaths }
}
