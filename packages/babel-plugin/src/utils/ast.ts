/**
 * TypeScript AST utilities - unwrapping and type narrowing helpers.
 */
import * as t from '@babel/types';

/**
 * Union type for member access expressions.
 */
export type MemberLike = t.MemberExpression | t.OptionalMemberExpression;

/**
 * Unwraps TypeScript-specific wrapper nodes to find the underlying expression.
 *
 * This is essential for analyzing the actual value when TypeScript annotations
 * or assertions are present, e.g.:
 * - `value as string` → `value`
 * - `value!` → `value`
 * - `value satisfies Type` → `value`
 *
 * @param expr - Expression to unwrap
 * @returns The innermost non-TS expression
 */
export function unwrapTSWrappers(expr: t.Expression): t.Expression {
  let current: t.Expression = expr;

  while (
    t.isTSAsExpression(current) ||
    t.isTSNonNullExpression(current) ||
    t.isTSSatisfiesExpression(current) ||
    t.isTSTypeAssertion(current) ||
    t.isParenthesizedExpression(current)
  ) {
    current = current.expression as t.Expression;
  }

  return current;
}

/**
 * Check if a node is a member expression (regular or optional).
 */
export function isMemberLike(
  node: t.Node | null | undefined,
): node is t.MemberExpression | t.OptionalMemberExpression {
  return t.isMemberExpression(node) || t.isOptionalMemberExpression(node);
}

/**
 * Check if a member expression accesses a specific property name.
 *
 * Handles both computed and non-computed access:
 * - `obj.value` → true for propertyName="value"
 * - `obj["value"]` → true for propertyName="value"
 * - `obj[key]` → false (dynamic)
 *
 * @param node - Member expression to check
 * @param propertyName - Property name to match
 * @returns true if the member accesses the specified property
 */
export function isMemberAccessingProperty(
  node: t.MemberExpression | t.OptionalMemberExpression,
  propertyName: string,
): boolean {
  if (node.computed) {
    return t.isStringLiteral(node.property) && node.property.value === propertyName;
  }
  return t.isIdentifier(node.property) && node.property.name === propertyName;
}

/**
 * Check if a node is a function-like expression.
 */
export function isFunctionLike(node: t.Node | null | undefined): boolean {
  return (
    t.isFunctionExpression(node) ||
    t.isArrowFunctionExpression(node) ||
    t.isFunctionDeclaration(node)
  );
}

/**
 * Check if an expression is a static value (compile-time constant).
 *
 * Static values include:
 * - String/numeric/boolean/null literals
 * - `undefined` identifier
 *
 * @param node - Expression or literal value to check
 * @returns true if the value is statically known
 */
export function isStaticValue(node: t.Expression | string | boolean | null): boolean {
  if (typeof node === 'string' || typeof node === 'boolean' || node === null) {
    return true;
  }

  return (
    t.isStringLiteral(node) ||
    t.isNumericLiteral(node) ||
    t.isBooleanLiteral(node) ||
    t.isNullLiteral(node) ||
    t.isIdentifier(node, { name: 'undefined' })
  );
}

/**
 * Collect all identifiers used in an expression tree.
 *
 * @param node - AST node to traverse
 * @param identifiers - Set to accumulate identifier names
 */
export function collectIdentifiers(node: t.Node, identifiers: Set<string>): void {
  if (t.isIdentifier(node)) {
    identifiers.add(node.name);
    return;
  }

  // Traverse all child nodes
  for (const key of Object.keys(node)) {
    const value = (node as any)[key];
    if (!value || typeof value !== 'object') continue;

    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') {
          collectIdentifiers(child, identifiers);
        }
      }
    } else if (typeof value.type === 'string') {
      collectIdentifiers(value, identifiers);
    }
  }
}

/**
 * Create a `.value` member access for signal reading.
 *
 * @param object - Signal identifier
 * @returns MemberExpression for `object.value`
 */
export function createValueAccess(object: t.Expression): t.MemberExpression {
  return t.memberExpression(object, t.identifier('value'));
}

/**
 * Check if an identifier is already accessing `.value` property.
 * Handles cases like `signal.value`, `(signal).value`, etc.
 *
 * @param path - Identifier path to check
 * @returns true if already wrapped in a .value access
 */
export function isAlreadyValueAccess(path: any): boolean {
  const parent = path.parent;

  if (isMemberLike(parent) && parent.object === path.node) {
    return isMemberAccessingProperty(parent, 'value');
  }

  // Check through parentheses and TS wrappers
  if (
    !t.isParenthesizedExpression(parent) &&
    !t.isTSAsExpression(parent) &&
    !t.isTSNonNullExpression(parent)
  ) {
    return false;
  }

  // Walk up to find if any ancestor is a .value access
  const ancestor = path.findParent((p: any) => {
    if (!isMemberLike(p.node)) return false;
    return isMemberAccessingProperty(p.node, 'value');
  });

  return !!ancestor;
}
