/*
 * Minimal, dependency-free edits of a `nuxt.config.{ts,js,mjs}`: register the
 * module and add a `modular` block. Anything the patcher cannot place with
 * confidence is returned as a snippet for the user instead of being guessed.
 */

export interface PatchResult {
  readonly source: string
  readonly changed: boolean
  /** Snippets the user has to apply by hand. */
  readonly manual: readonly string[]
}

const OPEN = /defineNuxtConfig\s*\(\s*\{/

/** Index just after the string, template literal or comment starting at `i`, or `undefined` when none starts there. */
function skipLiteral(source: string, i: number): number | undefined {
  const char = source[i]
  const next = source[i + 1]
  if (char === '/' && next === '/') {
    const end = source.indexOf('\n', i)
    return end === -1 ? source.length : end
  }
  if (char === '/' && next === '*') {
    const end = source.indexOf('*/', i + 2)
    return end === -1 ? source.length : end + 2
  }
  if (char === "'" || char === '"' || char === '`') {
    let j = i + 1
    for (; j < source.length && source[j] !== char; j++) if (source[j] === '\\') j += 1
    return j + 1
  }
  return undefined
}

/**
 * Index of the bracket that closes the one at `openIndex`, skipping strings,
 * template literals and comments. `-1` when unbalanced.
 */
export function findClosing(source: string, openIndex: number): number {
  const open = source[openIndex] as string
  const close = open === '[' ? ']' : open === '(' ? ')' : '}'
  let depth = 0
  for (let i = openIndex; i < source.length; i++) {
    const skipped = skipLiteral(source, i)
    if (skipped !== undefined) {
      i = skipped - 1
      continue
    }
    if (source[i] === open) depth += 1
    else if (source[i] === close && --depth === 0) return i
  }
  return -1
}

/**
 * Index of the first character of the value of `key` among the direct
 * properties of the object opened at `objectOpen`, or `-1`. Nested objects,
 * strings and comments are skipped, so `// modules: [` never matches.
 */
function findProperty(source: string, objectOpen: number, key: string): number {
  const objectClose = findClosing(source, objectOpen)
  const end = objectClose === -1 ? source.length : objectClose
  let depth = 0
  let expectKey = true
  for (let i = objectOpen; i < end; i++) {
    const skipped = skipLiteral(source, i)
    if (skipped !== undefined) {
      const text = source.slice(i, skipped)
      const quoted = text.length > 2 && /^['"`]/.test(text) ? text.slice(1, -1) : undefined
      if (depth === 1 && expectKey && quoted === key) {
        const colon = /^\s*:\s*/.exec(source.slice(skipped))
        if (colon) return skipped + colon[0].length
      }
      i = skipped - 1
      if (!/^\/[/*]/.test(text)) expectKey = false
      continue
    }
    const char = source[i] as string
    if (char === '{' || char === '[' || char === '(') {
      depth += 1
      if (depth > 1) expectKey = false
    } else if (char === '}' || char === ']' || char === ')') {
      depth -= 1
    } else if (depth === 1 && char === ',') {
      expectKey = true
    } else if (depth === 1 && expectKey && /[A-Za-z_$]/.test(char)) {
      const word = /^[A-Za-z_$][\w$]*/.exec(source.slice(i))?.[0] as string
      const colon = /^\s*:\s*/.exec(source.slice(i + word.length))
      if (word === key && colon) return i + word.length + colon[0].length
      i += word.length - 1
      expectKey = false
    } else if (depth === 1 && !/\s/.test(char)) {
      expectKey = false
    }
  }
  return -1
}

const indentOf = (line: string): string => /^[ \t]*/.exec(line)?.[0] ?? ''

function addModule(source: string, objectOpen: number): { source: string; changed: boolean; manual?: string } {
  const manual = "modules: ['nuxt-modular']"
  if (findClosing(source, objectOpen) === -1) return { source, changed: false, manual }

  const value = findProperty(source, objectOpen, 'modules')
  if (value === -1) {
    const insertAt = objectOpen + 1
    const rest = source.slice(insertAt)
    const closesNow = /^\s*\}/.test(rest)
    return {
      source: `${source.slice(0, insertAt)}\n  modules: ['nuxt-modular'],${closesNow ? '\n' : ''}${rest}`,
      changed: true,
    }
  }
  if (source[value] !== '[') return { source, changed: false, manual }

  const arrayClose = findClosing(source, value)
  if (arrayClose === -1) return { source, changed: false, manual }
  const content = source.slice(value + 1, arrayClose)
  if (/['"`]nuxt-modular['"`]/.test(content)) return { source, changed: false }

  if (content.trim() === '') {
    return { source: `${source.slice(0, value + 1)}'nuxt-modular'${source.slice(arrayClose)}`, changed: true }
  }
  if (/^[ \t]*\r?\n/.test(content)) {
    const firstLine = content.split('\n').find((line) => line.trim() !== '') ?? ''
    return {
      source: `${source.slice(0, value + 1)}\n${indentOf(firstLine)}'nuxt-modular',${source.slice(value + 1)}`,
      changed: true,
    }
  }
  return { source: `${source.slice(0, value + 1)}'nuxt-modular', ${source.slice(value + 1)}`, changed: true }
}

const objectStart = (source: string): number => {
  const open = OPEN.exec(source)
  return open ? open.index + open[0].length - 1 : -1
}

/** Registers `nuxt-modular` in `modules` and appends `block` (a `modular: { ... },` entry) to the config object. */
export function patchNuxtConfig(source: string, block: string | undefined): PatchResult {
  const manual: string[] = []
  if (objectStart(source) === -1) {
    return { source, changed: false, manual: ["modules: ['nuxt-modular'],", ...(block ? [block] : [])] }
  }
  let out = source
  let changed = false

  const withModule = addModule(out, objectStart(out))
  out = withModule.source
  changed ||= withModule.changed
  if (withModule.manual) manual.push(withModule.manual)

  if (block) {
    const objectOpen = objectStart(out)
    const objectClose = findClosing(out, objectOpen)
    if (objectClose === -1 || findProperty(out, objectOpen, 'modular') !== -1) {
      manual.push(block)
    } else {
      const before = out.slice(0, objectClose).replace(/\s+$/, '')
      const comma = before.endsWith(',') || before.endsWith('{') ? '' : ','
      out = `${before}${comma}\n${block}\n${out.slice(objectClose)}`
      changed = true
    }
  }
  return { source: out, changed, manual }
}

/** True when the config object already has a direct `modular` property. */
export function hasModularBlock(source: string): boolean {
  const open = objectStart(source)
  return open !== -1 && findProperty(source, open, 'modular') !== -1
}

/** End (exclusive) of the property value that starts at `start`: a top-level comma or `limit`, trailing blanks trimmed. */
function valueEnd(source: string, start: number, limit: number): number {
  let depth = 0
  let end = limit
  for (let i = start; i < limit; i++) {
    const skipped = skipLiteral(source, i)
    if (skipped !== undefined) {
      i = skipped - 1
      continue
    }
    const char = source[i] as string
    if (char === '{' || char === '[' || char === '(') depth += 1
    else if (char === '}' || char === ']' || char === ')') depth -= 1
    else if (char === ',' && depth === 0) {
      end = i
      break
    }
  }
  while (end > start && /\s/.test(source[end - 1] as string)) end -= 1
  return end
}

/** Source range of the value at `path` (for example `['modular', 'database']`) in the config object, if present. */
export function findConfigValue(source: string, path: readonly string[]): { readonly start: number; readonly end: number } | undefined {
  let open = objectStart(source)
  if (open === -1) return undefined
  for (const [index, key] of path.entries()) {
    const start = findProperty(source, open, key)
    if (start === -1) return undefined
    const close = findClosing(source, open)
    const end = valueEnd(source, start, close === -1 ? source.length : close)
    if (index === path.length - 1) return { start, end }
    if (source[start] !== '{') return undefined
    open = start
  }
  return undefined
}

/** The configured `modular.database` expression as written in the config, or `undefined` when not set. */
export function readModularDatabase(source: string): string | undefined {
  const range = findConfigValue(source, ['modular', 'database'])
  return range ? source.slice(range.start, range.end).trim() : undefined
}

const GENERATED_MARK = 'Switch it any time with: npx nuxt-modular db'

/**
 * Rewrites the comment block that `init` or `db` put above `database`, so it describes the new value. A block the
 * user wrote (without the generated first line) is left alone.
 */
function refreshGeneratedComment(source: string, valueStart: number, comment: readonly string[]): string {
  if (!comment.length) return source
  const keyAt = source.lastIndexOf('database', valueStart)
  if (keyAt === -1) return source
  const lineStart = source.lastIndexOf('\n', keyAt) + 1
  const indent = /^[ \t]*/.exec(source.slice(lineStart))?.[0] ?? ''
  const lines = source.slice(0, lineStart).split('\n')
  lines.pop() // text after the last newline is empty: lineStart is a line start
  let first = lines.length
  while (first > 0 && /^\s*\/\//.test(lines[first - 1] as string)) first -= 1
  const block = lines.slice(first)
  if (!block.some((line) => line.includes(GENERATED_MARK))) return source
  const fresh = comment.map((line) => `${indent}// ${line}`)
  if (block.join('\n') === fresh.join('\n')) return source
  return `${[...lines.slice(0, first), ...fresh].join('\n')}\n${source.slice(lineStart)}`
}

/**
 * Sets `modular.database` to `expression` (source text such as `'sqlite:./a.db'` or `{ connector: 'postgresql' }`),
 * keeping the rest of the file as it is. `comment` is written above the property when it is created.
 */
export function setModularDatabase(source: string, expression: string, comment: readonly string[] = []): PatchResult {
  const existing = findConfigValue(source, ['modular', 'database'])
  if (existing) {
    const current = source.slice(existing.start, existing.end)
    let next = current.trim() === expression ? source : `${source.slice(0, existing.start)}${expression}${source.slice(existing.end)}`
    next = refreshGeneratedComment(next, existing.start, comment)
    return { source: next, changed: next !== source, manual: [] }
  }
  const lines = [...comment.map((line) => `    // ${line}`), `    database: ${expression},`]
  const modular = findConfigValue(source, ['modular'])
  if (!modular) return patchNuxtConfig(source, `  modular: {\n${lines.join('\n')}\n  },`)
  if (source[modular.start] !== '{') return { source, changed: false, manual: [`modular: { database: ${expression} }`] }
  const at = modular.start + 1
  return { source: `${source.slice(0, at)}\n${lines.join('\n')}${source.slice(at)}`, changed: true, manual: [] }
}
