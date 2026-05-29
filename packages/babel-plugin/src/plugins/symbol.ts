/**
 * Signal symbol transformer.
 *
 * Variables prefixed with the configured signal prefix (default `$`) are
 * treated as reactive signals. This pass:
 *   - wraps initializers in `signal()` / `computed()`
 *   - rewrites reads as `.value`
 *   - rewrites assignments / update expressions to target `.value`
 */

import { types as t } from '@babel/core';
import { startsWith } from '@estjs/shared';
import { getCompileContext, useImport } from '../context';
import { isFunctionLikeExpression } from '../ast-utils';
import type { VariableDeclarator } from '@babel/types';
import type { NodePath } from '@babel/core';

/**
 * Returns true when a member expression accesses a named property,
 * covering both `.prop` and `['prop']` forms.
 */
export function isMemberAccessingProperty(node: t.MemberExpression, propertyName: string): boolean {
  if (!node.computed && t.isIdentifier(node.property) && node.property.name === propertyName) {
    return true;
  }
  if (node.computed && t.isStringLiteral(node.property) && node.property.value === propertyName) {
    return true;
  }
  return false;
}

/**
 * Checks whether a name should be treated as a signal based on the
 * configured prefix (default `$`).
 */
export function isSignal(name: string): boolean {
  const prefix = getCompileContext().options.signalPrefix ?? '$';
  return !!name && startsWith(name, prefix);
}

/**
 * Rewrites signal variable declarations to `signal()` or `computed()` calls.
 *
 * - plain value           → `signal(value)`
 * - const function init   → `computed(fn)`
 * - already wrapped       → unchanged
 * - uninitialized         → `signal()`
 */
export function replaceSymbol(path: NodePath<VariableDeclarator>): void {
  const { init, id } = path.node;
  if (!t.isIdentifier(id)) return;
  if (!isSignal(id.name)) return;
  if (isAlreadySignalCall(init)) return;

  const isComputed =
    isFunctionLikeExpression(init) && (path.parent as t.VariableDeclaration).kind === 'const';

  const importName = isComputed ? 'computed' : 'signal';
  const args = init ? [init] : [];
  path.node.init = t.callExpression(useImport(importName), args);
}

/**
 * Returns true when the initializer is already a `signal()` / `computed()`
 * call — either the literal source-level name or the unique import identifier
 * we registered for this file (e.g. `_signal$`).
 *
 * We deliberately do NOT match arbitrary `_signal`-like names: a user-defined
 * `_signal` factory in their own code must not be mistaken for an essor helper
 * and silently skipped from wrapping.
 */
function isAlreadySignalCall(init: t.Expression | null | undefined): boolean {
  if (!init || !t.isCallExpression(init) || !t.isIdentifier(init.callee)) return false;

  const calleeName = init.callee.name;
  if (calleeName === 'signal' || calleeName === 'computed') return true;

  const { importIdentifiers } = getCompileContext();
  return (
    calleeName === importIdentifiers.signal.name || calleeName === importIdentifiers.computed.name
  );
}

/**
 * Rewrites signal identifier reads to `.value` access.
 *
 * Declaration, import, member-key, and labeled-statement contexts are skipped.
 */
export function symbolIdentifier(path: NodePath<t.Identifier>): void {
  const name = path.node.name;
  if (!isSignal(name)) return;
  if (!shouldProcessIdentifier(path, path.parentPath)) return;
  if (isAlreadyValueAccess(path)) return;

  // Skip when this identifier is a property key of a member expression
  // (e.g. `obj.$foo`) — only the object position should be rewritten.
  const parent = path.parent;
  if (t.isMemberExpression(parent) && parent.property === path.node) return;

  path.replaceWith(t.memberExpression(t.identifier(name), t.identifier('value')));
  // The replacement contains a fresh `$name` identifier; skip it to avoid
  // re-entering and to cut visitor cost on large files.
  path.skip();
}

/**
 * Decides whether an identifier should be rewritten.
 *
 * Declarations, import specifiers, function parameter/id slots, class id,
 * object property keys, and label contexts are all skipped.
 */
function shouldProcessIdentifier(
  path: NodePath<t.Identifier>,
  parentPath: NodePath<t.Node> | null,
): boolean {
  if (!parentPath) return false;

  const parent = parentPath.node;
  const node = path.node;

  // Declaration contexts
  if (t.isVariableDeclarator(parent) || t.isArrayPattern(parent) || t.isObjectPattern(parent)) {
    return false;
  }

  // Import / export contexts
  if (
    t.isImportSpecifier(parent) ||
    t.isImportDefaultSpecifier(parent) ||
    t.isImportNamespaceSpecifier(parent)
  ) {
    return false;
  }

  // Function name / parameters (but NOT arrow body)
  if (t.isFunctionDeclaration(parent) || t.isFunctionExpression(parent)) {
    if (parent.id === node || (parent.params as t.Node[]).includes(node)) return false;
  }
  if (t.isArrowFunctionExpression(parent) && (parent.params as t.Node[]).includes(node)) {
    return false;
  }

  // Class name / method names
  if (t.isClassDeclaration(parent) && parent.id === node) return false;
  if (t.isObjectMethod(parent) || t.isClassMethod(parent)) return false;

  // Object property keys
  if (t.isObjectProperty(parent) && parent.key === node) return false;

  // Label contexts
  if (t.isLabeledStatement(parent) && parent.label === node) return false;
  if ((t.isBreakStatement(parent) || t.isContinueStatement(parent)) && parent.label === node) {
    return false;
  }

  return true;
}

/**
 * Returns true when the identifier is already accessing `.value`.
 * Handles `.value`, `['value']`, and parenthesized / typed wrappers.
 */
function isAlreadyValueAccess(path: NodePath<t.Identifier>): boolean {
  const parent = path.parent;

  if (t.isMemberExpression(parent) && parent.object === path.node) {
    return isMemberAccessingProperty(parent, 'value');
  }

  if (
    !t.isParenthesizedExpression(parent) &&
    !t.isTSAsExpression(parent) &&
    !t.isTSNonNullExpression(parent)
  ) {
    return false;
  }

  const ancestor = path.findParent((p) => {
    if (!p.isMemberExpression()) return false;
    const m = p.node as t.MemberExpression;
    return m.object === path.node && isMemberAccessingProperty(m, 'value');
  });
  return !!ancestor;
}

/**
 * Rewrites signal assignments so they target `.value`.
 */
export function symbolAssignment(path: NodePath<t.AssignmentExpression>): void {
  const { left } = path.node;
  if (!t.isIdentifier(left)) return;
  if (!isSignal(left.name)) return;
  if (isAlreadyValueAssignment(left)) return;
  path.node.left = t.memberExpression(t.identifier(left.name), t.identifier('value'));
}

function isAlreadyValueAssignment(left: t.LVal): boolean {
  return t.isMemberExpression(left) && isMemberAccessingProperty(left, 'value');
}

/**
 * Rewrites signal update expressions (`$x++`, `--$y`) to target `.value`.
 */
export function symbolUpdate(path: NodePath<t.UpdateExpression>): void {
  const { argument } = path.node;
  if (!t.isIdentifier(argument)) return;
  if (!isSignal(argument.name)) return;
  if (isAlreadyValueUpdate(argument)) return;
  path.node.argument = t.memberExpression(t.identifier(argument.name), t.identifier('value'));
}

function isAlreadyValueUpdate(argument: t.Expression): boolean {
  return t.isMemberExpression(argument) && isMemberAccessingProperty(argument, 'value');
}

/**
 * The visitor map for signal transforms. Use inside `withSignalPrefix` to
 * ensure the prefix cache is active for the duration of the traversal.
 */
export const symbolVisitors = {
  VariableDeclarator: replaceSymbol,
  Identifier: symbolIdentifier,
  AssignmentExpression: symbolAssignment,
  UpdateExpression: symbolUpdate,
} as const;

/**
 * Applies all signal transforms across the program.
 */
export function transformSymbol(path: NodePath<t.Program>): void {
  path.traverse(symbolVisitors);
}
