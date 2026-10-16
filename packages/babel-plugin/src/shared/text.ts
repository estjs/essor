/**
 * Whole-text element handling (title, textarea, style, script).
 */
import * as t from '@babel/types'
import { startsWith } from '@estjs/shared'
import { TAG_NAMES, WHITESPACE } from '../constants'

/**
 * HTML elements that only accept text content, no child elements.
 */
const WHOLE_TEXT_TAGS = new Set(['title', 'textarea', TAG_NAMES.STYLE, TAG_NAMES.SCRIPT])

/**
 * Regex patterns to detect unsafe closing tags in raw-text elements.
 */
const STYLE_END_TAG = /<\/style(?=[\t\n\f\r />])/i
const SCRIPT_END_TAG = /<\/script(?=[\t\n\f\r />])/i

/**
 * Checks if a tag is a whole-text element that cannot have JSX children.
 */
export function isWholeTextTag(tag: string): boolean {
  return WHOLE_TEXT_TAGS.has(tag)
}

/**
 * Serializes static text content for a whole-text element.
 */
export function serializeStaticWholeText(tag: string, text: string): string {
  // Raw-text elements (style/script): preserve content literally
  if (tag === TAG_NAMES.STYLE || tag === TAG_NAMES.SCRIPT) return text

  // RCDATA elements (title/textarea): escape HTML entities
  const escaped = escapeWholeText(text)

  // Textarea leading newline duplication per HTML parsing rules
  if (tag === TAG_NAMES.TEXTAREA && startsWith(text, WHITESPACE.NEWLINE)) {
    return `${WHITESPACE.NEWLINE}${escaped}`
  }

  return escaped
}

/**
 * Escapes text for RCDATA elements (title, textarea).
 */
export function escapeWholeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/**
 * Detects unsafe end-tag tokens in static raw-text content.
 */
export function hasRawTextEndTag(tag: string, text: string): boolean {
  if (tag === TAG_NAMES.STYLE) return STYLE_END_TAG.test(text)
  if (tag === TAG_NAMES.SCRIPT) return SCRIPT_END_TAG.test(text)
  return false
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
