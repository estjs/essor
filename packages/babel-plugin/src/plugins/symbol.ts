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
import { genUid, getCompileContext, useImport } from '../context';
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
 * Removes the configured signal prefix from a name (e.g. `$a` → `a`).
 * Used to map a shorthand signal target back to its source property key:
 * `const { $a } = $obj` reads `$obj.value.a` and binds `$a`.
 */
function stripSignalPrefix(name: string): string {
  const prefix = getCompileContext().options.signalPrefix ?? '$';
  return startsWith(name, prefix) ? name.slice(prefix.length) : name;
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

  // Destructuring a signal source: rewrite to reactivity-preserving bindings
  // so `const { $a } = $obj` keeps `$a` reactive instead of taking a snapshot.
  if (t.isObjectPattern(id) || t.isArrayPattern(id)) {
    transformDestructuring(path);
    return;
  }

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
 * Rewrites a destructuring declaration whose source is a signal so reactivity
 * is preserved according to the `$` convention (mirrors the manual workaround
 * documented in `docs/zh/api/reactive.md`):
 *
 *   const { $a, b } = $obj   →   const $a = computed(() => $obj.value.a);
 *                                const b  = $obj.value.b;
 *   const [$x, y]  = $items  →   const $x = computed(() => $items.value[0]);
 *                                const y  = $items.value[1];
 *
 * - `$`-prefixed targets become `computed` getters and stay reactive.
 * - plain targets read once from `.value` (a snapshot — matching ordinary
 *   destructuring semantics, and fixing the previous bug where the signal
 *   wrapper itself was destructured).
 */
function transformDestructuring(path: NodePath<VariableDeclarator>): void {
  const { init, id } = path.node;
  const pattern = id as t.ObjectPattern | t.ArrayPattern;

  // `for-in` / `for-of` heads (and any pattern without an initializer) have no
  // source expression to read from. Skip the subtree so the signal visitors
  // don't mangle a `$` target into the invalid `{ $a: $a.value }` form.
  if (!init) {
    if (patternHasSignalBinding(pattern)) path.skip();
    return;
  }

  // Only engage when the source is a signal, or the pattern opts into
  // reactivity via `$`-prefixed targets. Otherwise leave plain destructuring
  // untouched — it needs no rewriting.
  if (!isSignalSource(init) && !patternHasSignalBinding(pattern)) return;

  // A C-style for-loop head (`for (let {$a} = src; …)`) cannot expand to
  // multiple declarators; skip to keep the output valid. (for-in/for-of heads
  // have no initializer and were already handled above.)
  const declPath = path.parentPath;
  if (!declPath || !declPath.isVariableDeclaration()) return;
  if (declPath.parentPath?.isForStatement()) {
    path.skip();
    return;
  }

  const base = signalSourceBase(init);
  const declarators = bindPattern(pattern, base);

  const declaration = declPath.node;
  const index = declaration.declarations.indexOf(path.node);
  declaration.declarations.splice(index, 1, ...declarators);
  // Generated nodes already carry `.value` / `computed(...)` and are idempotent
  // under the signal visitors, but skipping avoids redundant re-traversal.
  path.skip();
}

/** Deep-clones a node so generated AST never shares references. */
function clone<N extends t.Node>(node: N): N {
  return t.cloneNode(node, true);
}

/** True when the initializer is a signal identifier or a `$obj.value` read. */
function isSignalSource(init: t.Expression): boolean {
  if (t.isIdentifier(init)) return isSignal(init.name);
  if (t.isMemberExpression(init) && t.isIdentifier(init.object) && isSignal(init.object.name)) {
    return isMemberAccessingProperty(init, 'value');
  }
  return false;
}

/** Builds the base accessor to read destructured properties from. */
function signalSourceBase(init: t.Expression): t.Expression {
  if (t.isIdentifier(init) && isSignal(init.name)) {
    return t.memberExpression(t.identifier(init.name), t.identifier('value'));
  }
  return clone(init);
}

/** True when any binding target inside the pattern is `$`-prefixed. */
function patternHasSignalBinding(node: t.Node): boolean {
  if (t.isIdentifier(node)) return isSignal(node.name);
  if (t.isObjectPattern(node)) {
    return node.properties.some((p) =>
      t.isRestElement(p) ? patternHasSignalBinding(p.argument) : patternHasSignalBinding(p.value),
    );
  }
  if (t.isArrayPattern(node)) {
    return node.elements.some((el) => el != null && patternHasSignalBinding(el));
  }
  if (t.isAssignmentPattern(node)) return patternHasSignalBinding(node.left);
  if (t.isRestElement(node)) return patternHasSignalBinding(node.argument);
  return false;
}

/** Dispatches to the object/array pattern binder. */
function bindPattern(
  pattern: t.ObjectPattern | t.ArrayPattern,
  base: t.Expression,
): t.VariableDeclarator[] {
  return t.isObjectPattern(pattern)
    ? bindObjectPattern(pattern, base)
    : bindArrayPattern(pattern, base);
}

function bindObjectPattern(pattern: t.ObjectPattern, base: t.Expression): t.VariableDeclarator[] {
  const out: t.VariableDeclarator[] = [];
  const handledKeys: Array<{ key: t.Expression; computed: boolean }> = [];

  for (const prop of pattern.properties) {
    if (t.isRestElement(prop)) {
      out.push(buildObjectRest(prop, base, handledKeys));
      continue;
    }
    const { keyExpr, computed, target } = resolveObjectProp(prop);
    // Stash a clone for a possible rest residual; the original feeds `access`.
    handledKeys.push({ key: clone(keyExpr), computed });
    const access = t.memberExpression(clone(base), keyExpr, computed);
    out.push(...bindTarget(target, access));
  }
  return out;
}

/**
 * Resolves an object-pattern property into the source key to read and the
 * binding target. Shorthand `$`-targets strip the prefix to find the key
 * (`{ $a }` → read `a`); explicit keys are used as written (`{ a: $a }`).
 */
function resolveObjectProp(prop: t.ObjectProperty): {
  keyExpr: t.Expression;
  computed: boolean;
  target: t.LVal;
} {
  const target = prop.value as t.LVal;
  // Shorthand `{ $a }` (and `{ $a = d }`) binds the identifier directly, so the
  // source key is the name with its prefix stripped.
  const shorthandId = t.isAssignmentPattern(target) ? target.left : target;
  if (prop.shorthand && t.isIdentifier(shorthandId) && isSignal(shorthandId.name)) {
    return { keyExpr: t.identifier(stripSignalPrefix(shorthandId.name)), computed: false, target };
  }
  if (prop.computed) {
    return { keyExpr: prop.key as t.Expression, computed: true, target };
  }
  // Non-computed key: identifier accessed via `.key`, literal via `["key"]`.
  return { keyExpr: prop.key as t.Expression, computed: !t.isIdentifier(prop.key), target };
}

function bindArrayPattern(pattern: t.ArrayPattern, base: t.Expression): t.VariableDeclarator[] {
  const out: t.VariableDeclarator[] = [];
  pattern.elements.forEach((el, i) => {
    if (el == null) return; // hole, e.g. `[, $b]`
    if (t.isRestElement(el)) {
      const slice = t.callExpression(t.memberExpression(clone(base), t.identifier('slice')), [
        t.numericLiteral(i),
      ]);
      out.push(...bindTarget(el.argument, slice));
      return;
    }
    const access = t.memberExpression(clone(base), t.numericLiteral(i), true);
    out.push(...bindTarget(el as t.LVal, access));
  });
  return out;
}

/** Emits declarator(s) for a single binding target reading from `access`. */
function bindTarget(target: t.LVal, access: t.Expression): t.VariableDeclarator[] {
  if (t.isAssignmentPattern(target)) {
    return bindTarget(target.left, applyDefault(access, target.right));
  }
  if (t.isIdentifier(target)) {
    const value = isSignal(target.name) ? makeComputed(access) : access;
    return [t.variableDeclarator(t.identifier(target.name), value)];
  }
  if (t.isObjectPattern(target)) return bindObjectPattern(target, access);
  if (t.isArrayPattern(target)) return bindArrayPattern(target, access);
  // Unexpected target shape — fall back to a plain snapshot declarator.
  return [t.variableDeclarator(target, access)];
}

/** Wraps an accessor (or getter body) in `computed(() => <access>)`. */
function makeComputed(access: t.Expression | t.BlockStatement): t.CallExpression {
  return t.callExpression(useImport('computed'), [t.arrowFunctionExpression([], access)]);
}

/** Builds `<access> === undefined ? <def> : <access>` for default values. */
function applyDefault(access: t.Expression, def: t.Expression): t.Expression {
  return t.conditionalExpression(
    t.binaryExpression('===', clone(access), t.identifier('undefined')),
    def,
    clone(access),
  );
}

/**
 * Builds the residual declarator for an object rest element, omitting the
 * already-handled keys via throwaway bindings.
 *
 * - plain target: `const { a: _omit$, ...rest } = base` (snapshot).
 * - `$`-prefixed target: a `computed` that re-derives the rest object on each
 *   read, so `$rest.value` resolves and stays reactive:
 *   `const $rest = computed(() => { const { a: _omit$, ..._rest$ } = base; return _rest$; })`.
 */
function buildObjectRest(
  rest: t.RestElement,
  base: t.Expression,
  handledKeys: Array<{ key: t.Expression; computed: boolean }>,
): t.VariableDeclarator {
  const omits = (target: t.RestElement['argument']) =>
    t.objectPattern([
      ...handledKeys.map(({ key, computed }) => t.objectProperty(key, genUid('_omit$'), computed)),
      t.restElement(target),
    ]);

  const arg = rest.argument;
  if (t.isIdentifier(arg) && isSignal(arg.name)) {
    const inner = genUid('_rest$');
    const body = t.blockStatement([
      t.variableDeclaration('const', [t.variableDeclarator(omits(inner), clone(base))]),
      t.returnStatement(clone(inner)),
    ]);
    return t.variableDeclarator(t.identifier(arg.name), makeComputed(body));
  }
  return t.variableDeclarator(omits(arg), clone(base));
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
