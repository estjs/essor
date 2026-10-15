/**
 * JSX text processing utilities
 */
import * as t from '@babel/types'

/**
 * Get text from JSX text node, preserving necessary whitespace
 */
export function getJSXText(value: string): string {
  if (!value) return ''

  const lines = value.split(/\r\n|\n|\r/)
  let lastNonEmptyLine = 0

  // Find last line with non-whitespace content
  for (const [i, line] of lines.entries()) {
    if (/[^ \t]/.test(line)) {
      lastNonEmptyLine = i
    }
  }

  let str = ''
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replaceAll('\t', ' ')

    // Remove leading spaces from continuation lines
    if (i !== 0) {
      line = line.replace(/^ +/, '')
    }

    // Remove trailing spaces from all but last line
    if (i !== lines.length - 1) {
      line = line.replace(/ +$/, '')
    }

    if (line) {
      // Add space after non-empty lines (except the last one with content)
      if (i !== lastNonEmptyLine) {
        line += ' '
      }
      str += line
    }
  }

  return str
}

/**
 * Checks if an expression subtree contains any JSX elements or fragments.
 */
export function containsJSX(node: t.Node): boolean {
  let found = false
  t.traverseFast(node, (descendant) => {
    if (t.isJSXElement(descendant) || t.isJSXFragment(descendant)) {
      found = true
      return t.traverseFast.stop
    }
  })
  return found
}
