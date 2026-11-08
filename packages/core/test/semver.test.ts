import { describe, expect, it } from 'vitest'
import { compareVersions, isValidRange, parseVersion, satisfies } from '../src/semver'

describe('parseVersion / compareVersions', () => {
  it('parses full versions and rejects partial ones', () => {
    expect(parseVersion('1.2.3-beta.1+build')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: ['beta', 1] })
    expect(parseVersion('1.2')).toBeUndefined()
    expect(parseVersion('01.2.3')).toBeUndefined()
  })

  it('orders versions per semver precedence', () => {
    const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.1.0', '2.0.0']
    for (let i = 1; i < ordered.length; i++) {
      expect(compareVersions(ordered[i - 1]!, ordered[i]!)).toBe(-1)
      expect(compareVersions(ordered[i]!, ordered[i - 1]!)).toBe(1)
    }
    expect(compareVersions('1.0.0+a', '1.0.0+b')).toBe(0)
    expect(compareVersions('x', '1.0.0')).toBeUndefined()
  })
})

describe('satisfies', () => {
  const cases: Array<[string, string, boolean]> = [
    ['1.2.3', '1.2.3', true],
    ['1.2.3', '=1.2.3', true],
    ['1.2.4', '1.2.3', false],
    ['1.2.3', '*', true],
    ['1.2.3', '', true],
    ['1.2.3', '>=1.2.0', true],
    ['1.2.3', '>1.2.3', false],
    ['1.2.3', '<=1.2.3', true],
    ['1.2.3', '<1.2.3', false],
    ['1.2.3', '>= 1.0.0 < 2.0.0', true],
    ['1.5.0', '^1.2.3', true],
    ['2.0.0', '^1.2.3', false],
    ['1.2.2', '^1.2.3', false],
    ['0.2.5', '^0.2.3', true],
    ['0.3.0', '^0.2.3', false],
    ['0.0.3', '^0.0.3', true],
    ['0.0.4', '^0.0.3', false],
    ['1.2.9', '~1.2.3', true],
    ['1.3.0', '~1.2.3', false],
    ['1.9.0', '~1', true],
    ['1.9.0', '1.x', true],
    ['2.0.0', '1.x', false],
    ['1.2.9', '1.2.*', true],
    ['1.3.0', '1.2.*', false],
    ['1.5.0', '1.2.3 - 2.3.4', true],
    ['2.3.5', '1.2.3 - 2.3.4', false],
    ['2.3.9', '1.2.3 - 2.3', true],
    ['3.1.0', '1.x || >=3', true],
    ['2.1.0', '1.x || >=3', false],
    ['1.2.3-beta.2', '^1.2.3-beta.1', true],
    ['1.2.3-beta.0', '^1.2.3-beta.1', false],
    ['1.3.0-beta.1', '^1.2.3-beta.1', false],
    ['1.2.4-beta.1', '^1.2.3', false],
    ['2.0.0-beta.1', '<2.0.0', false],
    ['1.0.0', '>0.9', true],
    ['1.0.0', '<=1', true],
    ['garbage', '*', false],
  ]
  it.each(cases)('%s satisfies %s → %s', (version, range, expected) => {
    expect(satisfies(version, range)).toBe(expected)
  })

  it('validates ranges', () => {
    expect(isValidRange('^1.2.3')).toBe(true)
    expect(isValidRange('>=1 <3 || 5.x')).toBe(true)
    expect(isValidRange('banana')).toBe(false)
    expect(isValidRange('^')).toBe(false)
    expect(isValidRange('>x')).toBe(false)
    expect(satisfies('1.0.0', 'banana')).toBe(false)
  })
})
