import { describe, expect, it } from 'vitest'
import { checkRequirements, findDependencyCycles, type RequirementSubject } from '../src/requirements'

const ext = (id: string, dependsOn: string[] = [], requires: RequirementSubject['requires'] = { extensions: {} }, version = '1.0.0'): RequirementSubject => ({
  id,
  version,
  dependsOn,
  requires,
})

describe('findDependencyCycles', () => {
  it('finds none in an acyclic graph', () => {
    expect(findDependencyCycles([ext('a', ['b']), ext('b', ['c']), ext('c')])).toEqual([])
  })

  it('reports each cycle once, sorted, plus self loops', () => {
    const cycles = findDependencyCycles([ext('a', ['b']), ext('b', ['c']), ext('c', ['a']), ext('x', ['x']), ext('ok', ['a'])])
    expect(cycles).toEqual([['a', 'b', 'c'], ['x']])
  })

  it('ignores dependencies on unknown extensions', () => {
    expect(findDependencyCycles([ext('a', ['ghost'])])).toEqual([])
  })
})

describe('checkRequirements', () => {
  it('passes a healthy set', () => {
    const issues = checkRequirements([ext('quiz', ['core'], { modular: '^1.0.0', extensions: { core: '^2.0.0' } }), ext('core', [], { extensions: {} }, '2.3.0')], {
      hostVersion: '1.4.0',
    })
    expect(issues).toEqual([])
  })

  it('reports host version, missing dependency, dependency version and cycles', () => {
    const issues = checkRequirements(
      [
        ext('quiz', ['core', 'ghost', 'off'], { modular: '^2.0.0', extensions: { core: '^2.0.0' } }),
        ext('core', ['loop'], { extensions: {} }, '1.0.0'),
        ext('loop', ['core']),
      ],
      { hostVersion: '1.4.0', disabled: new Set(['off']) },
    )
    expect(issues.map((issue) => issue.code)).toEqual(['host-version', 'dependency-version', 'missing-dependency', 'missing-dependency', 'dependency-cycle'])
    expect(issues[2]?.message).toContain('not found')
    expect(issues[3]?.message).toContain('disabled')
    expect(issues[4]?.message).toContain('"core", "loop"')
  })

  it('skips the host check without a host version', () => {
    expect(checkRequirements([ext('a', [], { modular: '^9.0.0', extensions: {} })])).toEqual([])
  })
})
