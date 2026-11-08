/*
 * A small, dependency-free implementation of the parts of node-semver that
 * extension compatibility checks need: versions, comparison and ranges with
 * `||`, comparators, `^`, `~`, x-ranges and hyphen ranges. Pre-release rules
 * follow node-semver: a pre-release version only satisfies a range when one of
 * its comparators names the same `major.minor.patch` with a pre-release tag.
 */

export interface ParsedVersion {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease: readonly (string | number)[]
}

const VERSION_RE =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/

export function parseVersion(input: string): ParsedVersion | undefined {
  const match = VERSION_RE.exec(input.trim())
  if (!match) return undefined
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part)) : [],
  }
}

function comparePrerelease(a: readonly (string | number)[], b: readonly (string | number)[]): -1 | 0 | 1 {
  // A version without a pre-release tag is greater than one with it.
  if (!a.length && !b.length) return 0
  if (!a.length) return 1
  if (!b.length) return -1
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i]
    const y = b[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1
    if (typeof x === 'number') return -1
    if (typeof y === 'number') return 1
    return x < y ? -1 : 1
  }
  return 0
}

export function compareParsed(a: ParsedVersion, b: ParsedVersion): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  return comparePrerelease(a.prerelease, b.prerelease)
}

/** Compares two versions; `undefined` when either is not a valid semver string. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | undefined {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return undefined
  return compareParsed(left, right)
}

type Operator = '<' | '<=' | '>' | '>=' | '='
interface Comparator {
  readonly op: Operator
  readonly version: ParsedVersion
}

const ANY: Comparator = { op: '>=', version: { major: 0, minor: 0, patch: 0, prerelease: [] } }

const isWildcard = (part: string | undefined): boolean => part === undefined || part === '' || /^[xX*]$/.test(part)

interface Partial3 {
  major: number | undefined
  minor: number | undefined
  patch: number | undefined
  prerelease: readonly (string | number)[]
}

function parsePartial(input: string): Partial3 | undefined {
  const match = /^v?([0-9xX*]+)(?:\.([0-9xX*]+))?(?:\.([0-9xX*]+))?(?:-([0-9a-zA-Z.-]+))?(?:\+[0-9a-zA-Z.-]+)?$/.exec(input)
  if (!match) return undefined
  const [, a, b, c, pre] = match
  const num = (part: string | undefined): number | undefined | null =>
    isWildcard(part) ? undefined : /^(0|[1-9]\d*)$/.test(part ?? '') ? Number(part) : null
  const major = num(a)
  const minor = num(b)
  const patch = num(c)
  if (major === null || minor === null || patch === null) return undefined
  // A wildcard swallows everything to its right.
  const resolvedMinor = major === undefined ? undefined : minor
  const resolvedPatch = resolvedMinor === undefined ? undefined : patch
  return {
    major,
    minor: resolvedMinor,
    patch: resolvedPatch,
    prerelease: pre ? pre.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part)) : [],
  }
}

const v = (major: number, minor: number, patch: number, prerelease: readonly (string | number)[] = []): ParsedVersion => ({
  major,
  minor,
  patch,
  prerelease,
})

/** `1.2.x` → `>=1.2.0 <1.3.0`; `1` → `>=1.0.0 <2.0.0`; `*` → any. */
function xRange(p: Partial3): Comparator[] {
  if (p.major === undefined) return [ANY]
  if (p.minor === undefined) return [{ op: '>=', version: v(p.major, 0, 0) }, { op: '<', version: v(p.major + 1, 0, 0, [0]) }]
  if (p.patch === undefined) {
    return [{ op: '>=', version: v(p.major, p.minor, 0) }, { op: '<', version: v(p.major, p.minor + 1, 0, [0]) }]
  }
  return [{ op: '=', version: v(p.major, p.minor, p.patch, p.prerelease) }]
}

function caret(p: Partial3): Comparator[] {
  if (p.major === undefined) return [ANY]
  const lower = v(p.major, p.minor ?? 0, p.patch ?? 0, p.prerelease)
  let upper: ParsedVersion
  if (p.major > 0 || p.minor === undefined) upper = v(p.major + 1, 0, 0, [0])
  else if (p.minor > 0 || p.patch === undefined) upper = v(0, p.minor + 1, 0, [0])
  else upper = v(0, 0, p.patch + 1, [0])
  return [{ op: '>=', version: lower }, { op: '<', version: upper }]
}

function tilde(p: Partial3): Comparator[] {
  if (p.major === undefined) return [ANY]
  const lower = v(p.major, p.minor ?? 0, p.patch ?? 0, p.prerelease)
  const upper = p.minor === undefined ? v(p.major + 1, 0, 0, [0]) : v(p.major, p.minor + 1, 0, [0])
  return [{ op: '>=', version: lower }, { op: '<', version: upper }]
}

function primitive(op: Operator, p: Partial3): Comparator[] | undefined {
  if (p.major === undefined) return op === '<' || op === '>' ? undefined : [ANY]
  const low = v(p.major, p.minor ?? 0, p.patch ?? 0, p.prerelease)
  switch (op) {
    case '=':
      return xRange(p)
    case '>=':
      return [{ op: '>=', version: low }]
    case '<=':
      if (p.minor === undefined) return [{ op: '<', version: v(p.major + 1, 0, 0, [0]) }]
      if (p.patch === undefined) return [{ op: '<', version: v(p.major, p.minor + 1, 0, [0]) }]
      return [{ op: '<=', version: low }]
    case '>':
      if (p.minor === undefined) return [{ op: '>=', version: v(p.major + 1, 0, 0) }]
      if (p.patch === undefined) return [{ op: '>=', version: v(p.major, p.minor + 1, 0) }]
      return [{ op: '>', version: low }]
    case '<':
      return [{ op: '<', version: p.prerelease.length ? low : v(low.major, low.minor, low.patch, [0]) }]
  }
}

function parseComparatorSet(input: string): Comparator[] | undefined {
  let text = input.trim()
  const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(text)
  if (hyphen) {
    const from = parsePartial(hyphen[1] ?? '')
    const to = parsePartial(hyphen[2] ?? '')
    if (!from || !to) return undefined
    const lower = primitive('>=', from)
    const upper = primitive('<=', to)
    return lower && upper ? [...lower, ...upper] : undefined
  }
  // Allow `>= 1.2.3` (space after operator).
  text = text.replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1')
  const result: Comparator[] = []
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const match = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(token)
    const partial = match?.[2] ? parsePartial(match[2]) : undefined
    if (!match || !partial) return undefined
    const operator = match[1]
    const comparators =
      operator === '^' ? caret(partial) : operator === '~' ? tilde(partial) : primitive((operator as Operator | undefined) ?? '=', partial)
    if (!comparators) return undefined
    result.push(...comparators)
  }
  return result.length ? result : [ANY]
}

/** Parses a range into OR-ed sets of AND-ed comparators; `undefined` when invalid. */
function parseRange(range: string): Comparator[][] | undefined {
  const text = range.trim()
  if (text === '') return [[ANY]]
  const sets: Comparator[][] = []
  for (const part of text.split('||')) {
    const set = parseComparatorSet(part)
    if (!set) return undefined
    sets.push(set)
  }
  return sets
}

export function isValidRange(range: string): boolean {
  return parseRange(range) !== undefined
}

function test(comparator: Comparator, version: ParsedVersion): boolean {
  const order = compareParsed(version, comparator.version)
  switch (comparator.op) {
    case '=':
      return order === 0
    case '>':
      return order > 0
    case '>=':
      return order >= 0
    case '<':
      return order < 0
    case '<=':
      return order <= 0
  }
}

/** Whether `version` satisfies `range`. Invalid input never satisfies. */
export function satisfies(version: string, range: string): boolean {
  const parsed = parseVersion(version)
  const sets = parseRange(range)
  if (!parsed || !sets) return false
  return sets.some((set) => {
    if (!set.every((comparator) => test(comparator, parsed))) return false
    if (!parsed.prerelease.length) return true
    return set.some(
      ({ version: bound }) =>
        bound.prerelease.length > 0 && bound.major === parsed.major && bound.minor === parsed.minor && bound.patch === parsed.patch,
    )
  })
}
