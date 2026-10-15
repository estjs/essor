/**
 * Whole-text element handling (title, textarea, style, script).
 *
 * HTML defines "whole-text" elements that only accept text content, not child elements:
 * - RCDATA elements (title, textarea): text with limited entity escaping
 * - Raw text elements (style, script): text with no escaping at all
 *
 * These elements require special handling to:
 * 1. Validate that no JSX children are present (compile-time check)
 * 2. Serialize text correctly for the element type
 * 3. Detect unsafe end-tag tokens that could break out of the element
 */
import * as t from '@babel/types';
import { TAG_NAMES, WHITESPACE } from '../constants';

/**
 * HTML elements that only accept text content, no child elements.
 * See: https://html.spec.whatwg.org/multipage/syntax.html#elements-2
 */
const WHOLE_TEXT_TAGS = new Set(['title', 'textarea', TAG_NAMES.STYLE, TAG_NAMES.SCRIPT]);

/**
 * Regex patterns to detect unsafe closing tags in raw-text elements.
 * These must match exactly per HTML spec: </tag followed by whitespace, /, or >
 */
const STYLE_END_TAG = /<\/style(?=[\t\n\f\r />])/i;
const SCRIPT_END_TAG = /<\/script(?=[\t\n\f\r />])/i;

/**
 * Checks if a tag is a whole-text element that cannot have JSX children.
 *
 * @param tag - Element tag name
 * @returns true if the tag only accepts text content
 */
export function isWholeTextTag(tag: string): boolean {
  return WHOLE_TEXT_TAGS.has(tag);
}

/**
 * Serializes static text content for a whole-text element into a client template.
 *
 * Different element types require different text handling:
 * - Raw text (style, script): no escaping, content is literal
 * - RCDATA (title, textarea): escape <, >, & to prevent HTML injection
 * - Textarea: duplicate leading newline per HTML parsing rules
 *
 * @param tag - Element tag name
 * @param text - Static text content
 * @returns Serialized text suitable for the element
 */
export function serializeStaticWholeText(tag: string, text: string): string {
  // Raw-text elements (style/script): preserve content literally, no entity escaping
  if (tag === TAG_NAMES.STYLE || tag === TAG_NAMES.SCRIPT) return text;

  // RCDATA elements (title/textarea): escape HTML entities
  const escaped = escapeWholeText(text);

  // Textarea leading newline duplication:
  // The HTML parser strips exactly one leading LF after <textarea> opens,
  // so we emit it twice to preserve the user's original newline.
  if (tag === TAG_NAMES.TEXTAREA && text.startsWith(WHITESPACE.NEWLINE)) {
    return `${WHITESPACE.NEWLINE}${escaped}`;
  }

  return escaped;
}

/**
 * Escapes text for RCDATA elements (title, textarea).
 *
 * RCDATA allows character references but requires escaping of:
 * - & (ampersand): could start an entity reference
 * - < (less-than): could start a tag
 * - > (greater-than): could end a mis-parsed tag
 *
 * @param text - Raw text content
 * @returns Escaped text safe for RCDATA context
 */
export function escapeWholeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * Detects unsafe end-tag tokens in static raw-text content.
 *
 * Raw-text elements (style, script) don't escape entities, so a literal
 * </style> or </script> in the text would close the element prematurely,
 * potentially creating XSS vulnerabilities.
 *
 * Example vulnerability:
 * ```jsx
 * <style>{userContent}</style>
 * // If userContent = "body { color: red; }</style><script>alert('XSS')</script>"
 * // The style tag closes early and the script executes!
 * ```
 *
 * @param tag - Element tag name
 * @param text - Static text content to validate
 * @returns true if unsafe end-tag token found
 */
export function hasRawTextEndTag(tag: string, text: string): boolean {
  if (tag === TAG_NAMES.STYLE) return STYLE_END_TAG.test(text);
  if (tag === TAG_NAMES.SCRIPT) return SCRIPT_END_TAG.test(text);
  return false;
}

/**
 * Checks if an expression subtree contains any JSX elements or fragments.
 *
 * Used to validate whole-text element children at compile time:
 * ```jsx
 * <title>Hello {user.name}</title>  // ✅ OK: primitive expression
 * <title>Hello <span>world</span></title>  // ❌ Error: JSX element child
 * ```
 *
 * @param node - AST node to search
 * @returns true if JSX found in the subtree
 */
export function containsJSX(node: t.Node): boolean {
  let found = false;
  t.traverseFast(node, (descendant) => {
    if (t.isJSXElement(descendant) || t.isJSXFragment(descendant)) {
      found = true;
      return t.traverseFast.stop;
    }
  });
  return found;
}
