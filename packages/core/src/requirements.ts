import { satisfies } from './semver'

/*
 * Build-time compatibility diagnostics: host version, dependency versions,
 * missing dependencies and dependency cycles. Pure functions over manifests so
 * the Nuxt module and the CLI report exactly the same problems.
 */

export interface RequirementSubject {
  readonly id: string
  readonly version: string
  readonly dependsOn: readonly string[]
  readonly requires: {
    readonly modular?: string | undefined
    readonly extensions: Readonly<Record<string, string>>
  }
}

export type RequirementIssueCode = 'host-version' | 'missing-dependency' | 'dependency-version' | 'dependency-cycle'

export interface RequirementIssue {
  readonly code: RequirementIssueCode
  readonly extensionId: string
  readonly message: string
}

export interface CheckRequirementsOptions {
  /** Version of the nuxt-modular host; skip the host check when omitted. */
  readonly hostVersion?: string
  /** Ids intentionally left out of the build, to word "missing" accurately. */
  readonly disabled?: ReadonlySet<string>
}

/**
 * Members of every dependency cycle, one sorted array per cycle (strongly
 * connected components with more than one node, or a self-loop).
 */
export function findDependencyCycles(extensions: ReadonlyArray<Pick<RequirementSubject, 'id' | 'dependsOn'>>): string[][] {
  const graph = new Map(extensions.map((extension) => [extension.id, extension.dependsOn.filter((id) => extensions.some((e) => e.id === id))]))
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const cycles: string[][] = []
  let counter = 0

  const connect = (node: string): void => {
    index.set(node, counter)
    low.set(node, counter)
    counter++
    stack.push(node)
    onStack.add(node)
    for (const next of graph.get(node) ?? []) {
      if (!index.has(next)) {
        connect(next)
        low.set(node, Math.min(low.get(node) ?? 0, low.get(next) ?? 0))
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) ?? 0, index.get(next) ?? 0))
      }
    }
    if (low.get(node) !== index.get(node)) return
    const component: string[] = []
    let member: string | undefined
    do {
      member = stack.pop()
      if (member === undefined) break
      onStack.delete(member)
      component.push(member)
    } while (member !== node)
    if (component.length > 1 || (graph.get(node) ?? []).includes(node)) cycles.push(component.sort())
  }

  for (const id of [...graph.keys()].sort()) if (!index.has(id)) connect(id)
  return cycles.sort((a, b) => (a[0] ?? '') < (b[0] ?? '') ? -1 : 1)
}

/** Every compatibility problem among `extensions`, in a stable order. */
export function checkRequirements(
  extensions: readonly RequirementSubject[],
  options: CheckRequirementsOptions = {},
): RequirementIssue[] {
  const issues: RequirementIssue[] = []
  const byId = new Map(extensions.map((extension) => [extension.id, extension]))

  for (const extension of [...extensions].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const { id, requires } = extension
    if (options.hostVersion && requires.modular && !satisfies(options.hostVersion, requires.modular)) {
      issues.push({
        code: 'host-version',
        extensionId: id,
        message: `Extension "${id}" requires nuxt-modular ${requires.modular}, but ${options.hostVersion} is installed`,
      })
    }
    for (const dependency of extension.dependsOn) {
      const target = byId.get(dependency)
      if (!target) {
        const reason = options.disabled?.has(dependency) ? 'disabled' : 'not found'
        issues.push({
          code: 'missing-dependency',
          extensionId: id,
          message: `Extension "${id}" depends on "${dependency}" (${reason})`,
        })
        continue
      }
      const range = requires.extensions[dependency]
      if (range && !satisfies(target.version, range)) {
        issues.push({
          code: 'dependency-version',
          extensionId: id,
          message: `Extension "${id}" requires "${dependency}" ${range}, but ${target.version} is installed`,
        })
      }
    }
  }

  for (const cycle of findDependencyCycles(extensions)) {
    issues.push({
      code: 'dependency-cycle',
      extensionId: cycle[0] ?? '',
      message: `Dependency cycle between ${cycle.map((id) => `"${id}"`).join(', ')}; none of them can become active`,
    })
  }
  return issues
}
