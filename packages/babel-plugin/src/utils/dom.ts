/**
 * DOM-related utilities: AST manipulation, style serialization, and text processing.
 *
 * This module consolidates all utilities that deal with DOM elements, attributes,
 * and content manipulation in the compilation pipeline.
 */
import * as t from '@babel/types'
import { isArray, isBoolean, isNull, isNumber, isObject, isString, normalizeStyle, startsWith } from '@estjs/shared'

// ============================================================================
// AST Type Utilities
// ============================================================================

/**
 * Union type for member access expressions.
 */
export type MemberLike = t.MemberExpression | t.OptionalMemberExpression

/**
 * Unwraps TypeScript-specific wrapper nodes to find the underlying expression.
 *
 * This is essential for analyzing the actual value when TypeScript annotations
 * or assertions are present, e.g.:
 * - `value as string` → `value`
 * - `value!` → `value`
 * - `value satisfies Type` → `value`
 */
export function unwrapTSWrappers(expr: t.Expression): t.Expression {
  let current: t.Expression = expr

  while (
    t.isTSAsExpression(current) ||
    t.isTSNonNullExpression(current) ||
    t.isTSSatisfiesExpression(current) ||
    t.isTSTypeAssertion(current) ||
    t.isParenthesizedExpression(current)
  ) {
    current = current.expression as t.Expression
  }

  return current
}

/**
 * Check if a node is a member expression (regular or optional).
 */
export function isMemberLike(
  node: t.Node | null | undefined
): node is t.MemberExpression | t.OptionalMemberExpression {
  return t.isMemberExpression(node) || t.isOptionalMemberExpression(node)
}

/**
 * Check if a member expression accesses a specific property name.
 *
 * Handles both computed and non-computed access:
 * - `obj.value` → true for propertyName="value"
 * - `obj["value"]` → true for propertyName="value"
 * - `obj[key]` → false (dynamic)
 */
export function isMemberAccessingProperty(
  node: t.MemberExpression | t.OptionalMemberExpression,
  propertyName: string
): boolean {
  if (node.computed) {
    return t.isStringLiteral(node.property) && node.property.value === propertyName
  }
  return t.isIdentifier(node.property) && node.property.name === propertyName
}

/**
 * Check if a node is a function-like expression.
 */
export function isFunctionLike(node: t.Node | null | undefined): boolean {
  return (
    t.isFunctionExpression(node) ||
    t.isArrowFunctionExpression(node) ||
    t.isFunctionDeclaration(node)
  )
}

/**
 * Check if an expression is a static value (compile-time constant).
 *
 * Static values include:
 * - String/numeric/boolean/null literals
 * - `undefined` identifier
 */
export function isStaticValue(node: t.Expression | string | boolean | null): boolean {
  if (isString(node) || isBoolean(node) || isNull(node)) {
    return true
  }

  return (
    t.isStringLiteral(node) ||
    t.isNumericLiteral(node) ||
    t.isBooleanLiteral(node) ||
    t.isNullLiteral(node) ||
    t.isIdentifier(node, { name: 'undefined' })
  )
}

/**
 * Collect all identifiers used in an expression tree.
 */
export function collectIdentifiers(node: t.Node, identifiers: Set<string>): void {
  if (t.isIdentifier(node)) {
    identifiers.add(node.name)
    return
  }

  // Traverse all child nodes
  for (const key of Object.keys(node)) {
    const value = (node as any)[key]
    if (!isObject(value)) continue

    if (isArray(value)) {
      for (const child of value) {
        if (child && isString(child.type)) {
          collectIdentifiers(child as t.Node, identifiers)
        }
      }
    } else if (isString(value.type)) {
      collectIdentifiers(value as unknown as t.Node, identifiers)
    }
  }
}

/**
 * Create a `.value` member access for signal reading.
 */
export function createValueAccess(object: t.Expression): t.MemberExpression {
  return t.memberExpression(object, t.identifier('value'))
}

/**
 * Check if an identifier is already accessing `.value` property.
 * Handles cases like `signal.value`, `(signal).value`, etc.
 */
export function isAlreadyValueAccess(path: any): boolean {
  const parent = path.parent

  if (isMemberLike(parent) && parent.object === path.node) {
    return isMemberAccessingProperty(parent, 'value')
  }

  // Check through parentheses and TS wrappers
  if (
    !t.isParenthesizedExpression(parent) &&
    !t.isTSAsExpression(parent) &&
    !t.isTSNonNullExpression(parent)
  ) {
    return false
  }

  // Walk up to find if any ancestor is a .value access
  const ancestor = path.findParent((p: any) => {
    if (!isMemberLike(p.node)) return false
    return isMemberAccessingProperty(p.node, 'value')
  })

  return !!ancestor
}

// ============================================================================
// Style Serialization
// ============================================================================

/**
 * camelCase -> kebab-case. A leading capital gets a leading dash, so vendor
 * prefixes serialize correctly (`WebkitTransition` -> `-webkit-transition`).
 * Custom properties (`--x`) and already-kebab keys pass through unchanged.
 */
function toCSSProperty(key: string): string {
  return startsWith(key, '--') ? key : key.replaceAll(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

/**
 * Serialize a style object/array/string into compact CSS text.
 * { color: 'red', fontSize: '16px' } -> "color:red;font-size:16px"
 */
export function styleToString(style: unknown): string | undefined {
  const normalized = normalizeStyle(style)
  if (!normalized) return undefined
  if (isString(normalized)) return normalized

  const parts: string[] = []
  for (const key in normalized) {
    const value = normalized[key]
    if (isString(value) || isNumber(value)) {
      parts.push(`${toCSSProperty(key)}:${value}`)
    }
  }
  return parts.join(';')
}

// ============================================================================
// Text Processing
// ============================================================================

/**
 * Check if text contains dynamic interpolations (JSX expressions).
 */
export function hasDynamicSegments(text: string): boolean {
  return text.includes('{')
}

/**
 * Check if text is purely whitespace.
 */
export function isWhitespace(text: string): boolean {
  return /^\s*$/.test(text)
}

/**
 * Normalize JSX text: collapse whitespace and trim ends.
 * Preserves significant whitespace between words.
 */
export function normalizeJSXText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // collapse
    .replace(/^\s+/, '') // trim start
    .replace(/\s+$/, '') // trim end
}
