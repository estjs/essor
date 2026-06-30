/**
 * Component-props preprocessor.
 *
 * Rewrites a JSX component's first object-pattern parameter into lazy,
 * reactive accessors rooted at a single `__props` object. Each destructured
 * binding is replaced *at every use site* with a member-expression that reads
 * from `__props` on demand — never snapshotted into a local — so the read
 * happens inside the reactive effect and stays live.
 *
 * Example:
 *   function C({ title, count = 0, user: { name }, ...rest }) {
 *     return <div a={title} b={count} c={name} {...rest} />;
 *   }
 * becomes:
 *   function C(__props) {
 *     const rest = omitProps(__props, ['title', 'count', 'user']);
 *     return (
 *       <div
 *         a={__props.title}
 *         b={__props.count === undefined ? 0 : __props.count}
 *         c={__props.user.name}
 *         {...rest}
 *       />
 *     );
 *   }
 *
 * Why accessors instead of `const`s: `__props` is a `shallowReactive` container
 * of getter descriptors (see `template/src/component.ts`). Materializing a
 * binding (`const name = __props.user.name`) would snapshot the getter once and
 * sever reactivity. Inlining the member access keeps every read lazy.
 *
 * Coverage: aliases, defaults (incl. nested intermediate defaults), nested
 * object patterns, array patterns, object/array rest, and computed keys.
 */

import { type NodePath, types as t } from '@babel/core';
import { isNull, startsWith, warn } from '@estjs/shared';
import { TRANSFORM_PROPERTY_NAME, importMap } from '../constants';
import { getCompileContext, useImport } from '../context';
import { checkHasJSXReturn } from '../ast-utils';
import type { ArrowFunctionExpression, FunctionDeclaration } from '@babel/types';

type FnPath = NodePath<FunctionDeclaration | ArrowFunctionExpression>;

/** A simple binding: identifier `name` resolves to the lazy `accessor` read. */
interface LeafBinding {
  name: string;
  /** Member-expression chain rooted at `__props` (with defaults applied). */
  accessor: t.Expression;
}

/** A rest binding hoisted as `const name = init` at the top of the body. */
interface RestBinding {
  name: string;
  init: t.Expression;
}

/** Deep-clones a node so generated/relocated AST never shares references. */
function clone<N extends t.Node>(node: N): N {
  return t.cloneNode(node, true);
}

/**
 * Wraps an accessor with its destructuring default as a conditional:
 * `access === undefined ? def : access`.
 *
 * Only `undefined` triggers the default — matching native destructuring
 * semantics (a passed `null`/`0`/`''`/`false` is kept), unlike `access ?? def`
 * which would also fire on `null`. The default sits in the `undefined` branch,
 * so it stays lazy: side-effecting / expensive defaults (`new Set()`,
 * `new Map()`, `compute()`) only evaluate when the prop is actually missing.
 *
 * The accessor is read twice; for the common `__props.x` shape that is two
 * cheap getter reads with no allocation — strictly faster in the reactive hot
 * path than a runtime helper that takes a `() => def` thunk.
 */
function applyDefault(access: t.Expression, def: t.Expression): t.Expression {
  return t.conditionalExpression(
    t.binaryExpression('===', clone(access), t.identifier('undefined')),
    def,
    clone(access),
  );
}

/**
 * Resolves an object-pattern property's key into the member-access form and the
 * expression used to exclude it from a sibling rest (`null` when it cannot be).
 *
 * - `{ foo }`        → `.foo`        (exclude "foo")
 * - `{ 'a-b': v }`   → `["a-b"]`     (exclude "a-b")
 * - `{ 0: v }`       → `[0]`         (exclude "0")
 * - `{ [k]: v }`     → `[k]`         (exclude by runtime value of `k`)
 */
function resolveKey(prop: t.ObjectProperty): {
  keyExpr: t.Expression;
  computed: boolean;
  excludeKey: t.Expression | null;
} {
  const key = prop.key;
  if (prop.computed) {
    // Computed key: exclude by its runtime value (omitProps accepts dynamic keys).
    return { keyExpr: key as t.Expression, computed: true, excludeKey: key as t.Expression };
  }
  if (t.isIdentifier(key)) {
    return {
      keyExpr: t.identifier(key.name),
      computed: false,
      excludeKey: t.stringLiteral(key.name),
    };
  }
  if (t.isStringLiteral(key)) {
    return {
      keyExpr: t.stringLiteral(key.value),
      computed: true,
      excludeKey: t.stringLiteral(key.value),
    };
  }
  if (t.isNumericLiteral(key)) {
    return {
      keyExpr: t.numericLiteral(key.value),
      computed: true,
      excludeKey: t.stringLiteral(String(key.value)),
    };
  }
  // Unexpected key shape — emit it as-is, non-excludable.
  return { keyExpr: key as t.Expression, computed: true, excludeKey: null };
}

/** Returns the binding identifier name of a rest argument, or null if not plain. */
function restName(argument: t.RestElement['argument']): string | null {
  return t.isIdentifier(argument) ? argument.name : null;
}

/**
 * Builds the initializer for an object rest: `omitProps(base, [keys])`, or just
 * `base` when there is nothing to exclude. Keys are expressions so computed
 * keys (`{ [k]: v, ...rest }`) can be excluded by their runtime value.
 */
function buildObjectRestInit(base: t.Expression, excludeKeys: t.Expression[]): t.Expression {
  if (excludeKeys.length === 0) return clone(base);
  return t.callExpression(useImport(importMap.omitProps), [
    clone(base),
    t.arrayExpression(excludeKeys.map((key) => clone(key))),
  ]);
}

/**
 * Walks any binding target, accumulating leaf accessors and rest declarations.
 * `access` is the member-expression that reads this target's value from `__props`.
 */
function collectTarget(
  target: t.Node,
  access: t.Expression,
  leaves: LeafBinding[],
  rests: RestBinding[],
): void {
  if (t.isAssignmentPattern(target)) {
    collectTarget(target.left, applyDefault(access, target.right), leaves, rests);
    return;
  }
  if (t.isIdentifier(target)) {
    leaves.push({ name: target.name, accessor: access });
    return;
  }
  if (t.isObjectPattern(target)) {
    collectObjectPattern(target, access, leaves, rests);
    return;
  }
  if (t.isArrayPattern(target)) {
    collectArrayPattern(target, access, leaves, rests);
    return;
  }
  // Other LVal shapes (e.g. member expressions) never appear in a parameter
  // destructuring pattern — ignore defensively.
}

/** Collects bindings from an object pattern reading from `base`. */
function collectObjectPattern(
  pattern: t.ObjectPattern,
  base: t.Expression,
  leaves: LeafBinding[],
  rests: RestBinding[],
): void {
  const excludeKeys: t.Expression[] = [];

  for (const prop of pattern.properties) {
    if (t.isRestElement(prop)) {
      const name = restName(prop.argument);
      // Rest is syntactically last, so `excludeKeys` already holds every sibling.
      if (name) rests.push({ name, init: buildObjectRestInit(base, excludeKeys) });
      continue;
    }

    const { keyExpr, computed, excludeKey } = resolveKey(prop);
    if (!isNull(excludeKey)) excludeKeys.push(excludeKey);

    const access = t.memberExpression(clone(base), keyExpr, computed);
    collectTarget(prop.value, access, leaves, rests);
  }
}

/**
 * Materializes an iterable into an array: `[...base]`.
 *
 * Array destructuring follows the *iterator* protocol, not index access — so
 * `{ items: [a, b] }` must work when `items` is a Set, Map, generator, string,
 * or any custom iterable, not only a real Array (where `items[0]` would suffice).
 * Spreading also reproduces real destructuring semantics: it throws on a
 * non-iterable rather than silently yielding `undefined`. The spread is
 * re-evaluated at every use site, so reads stay lazy and reactive.
 */
function spreadOf(base: t.Expression): t.ArrayExpression {
  return t.arrayExpression([t.spreadElement(clone(base))]);
}

/** Collects bindings from an array pattern reading from `base`. */
function collectArrayPattern(
  pattern: t.ArrayPattern,
  base: t.Expression,
  leaves: LeafBinding[],
  rests: RestBinding[],
): void {
  pattern.elements.forEach((element, index) => {
    if (element == null) return; // hole, e.g. `[, second]`

    if (t.isRestElement(element)) {
      const name = restName(element.argument);
      if (name) {
        // `[...base].slice(i)` — `.slice` after materializing handles Sets/Maps
        // and other iterables, which have no `.slice` of their own.
        const init = t.callExpression(t.memberExpression(spreadOf(base), t.identifier('slice')), [
          t.numericLiteral(index),
        ]);
        rests.push({ name, init });
      }
      return;
    }

    const access = t.memberExpression(spreadOf(base), t.numericLiteral(index), true);
    collectTarget(element, access, leaves, rests);
  });
}

/**
 * Ensures the function has a block body, wrapping a concise arrow body in
 * `{ return <expr> }`. Returns the block so callers can prepend declarations.
 */
function ensureBlockBody(path: FnPath): t.BlockStatement {
  if (t.isBlockStatement(path.node.body)) return path.node.body;
  const block = t.blockStatement([t.returnStatement(path.node.body)]);
  path.node.body = block;
  return block;
}

/** True when `ref` lives inside the given parameter pattern node. */
function isInsidePattern(ref: NodePath, pattern: t.Node): boolean {
  return !!ref.findParent((p) => p.node === pattern);
}

/** Recollects the accessor for a single binding name from the live pattern. */
function accessorFor(
  pattern: t.ObjectPattern,
  base: t.Expression,
  name: string,
): t.Expression | undefined {
  const leaves: LeafBinding[] = [];
  collectObjectPattern(pattern, base, leaves, []);
  return leaves.find((leaf) => leaf.name === name)?.accessor;
}

/**
 * Transforms a JSX component function's first object-pattern parameter into a
 * reactive `__props` accessor, hoisting rest properties and inlining defaults.
 *
 * Preconditions: the function must return JSX and its first parameter must be
 * an object pattern. Otherwise this is a no-op.
 */
export function transformFnProps(path: FnPath): void {
  const firstParam = path.node.params[0];
  if (!firstParam || !t.isObjectPattern(firstParam) || !checkHasJSXReturn(path)) return;

  const ctx = getCompileContext();
  const signalPrefix = ctx.options.signalPrefix || '$';
  const base = t.identifier(TRANSFORM_PROPERTY_NAME);

  // Initial pass: binding names/order, rest list, and pure-rest detection.
  const initLeaves: LeafBinding[] = [];
  const initRests: RestBinding[] = [];
  collectObjectPattern(firstParam, base, initLeaves, initRests);

  // Binding names cannot collide with the signal prefix — a `$`-prefixed prop
  // would be mistaken for a signal by the symbol pass. (Names are phase-stable.)
  const conflicts = [...initLeaves, ...initRests]
    .map((b) => b.name)
    .filter((name) => startsWith(name, signalPrefix));
  if (conflicts.length > 0) {
    warn('transformProps', 'Property names cannot start with signal prefix', conflicts);
  }

  // Pure `{ ...rest }`: rename the parameter directly, nothing else to do.
  if (
    initLeaves.length === 0 &&
    initRests.length === 1 &&
    firstParam.properties.length === 1 &&
    t.isRestElement(firstParam.properties[0])
  ) {
    path.node.params[0] = t.identifier(initRests[0].name);
    return;
  }

  // Partition each binding's references into those inside the pattern itself
  // (sibling-referencing defaults like `{ id, key = id }`) versus the body.
  // Captured BEFORE any mutation, since replacing the parameter invalidates the
  // destructured bindings in scope.
  const inPatternRefs = new Map<string, NodePath[]>();
  const bodyRefs = new Map<string, NodePath[]>();
  for (const leaf of initLeaves) {
    const inside: NodePath[] = [];
    const outside: NodePath[] = [];
    for (const ref of path.scope.getBinding(leaf.name)?.referencePaths ?? []) {
      (isInsidePattern(ref, firstParam) ? inside : outside).push(ref);
    }
    if (inside.length > 0) inPatternRefs.set(leaf.name, inside);
    bodyRefs.set(leaf.name, outside);
  }

  // Phase 1: rewrite sibling references inside default expressions, in source
  // order, against the live pattern. Defaults may only reference earlier
  // bindings (TDZ), so processing in order keeps chains (`{ a = 1, b = a }`)
  // correct — each binding's accessor is recollected from the already-updated
  // tree. Names that resolve to a hoisted rest `const` are left untouched.
  for (const leaf of initLeaves) {
    const refs = inPatternRefs.get(leaf.name);
    if (!refs) continue;
    const accessor = accessorFor(firstParam, base, leaf.name);
    if (!accessor) continue;
    for (const ref of refs) ref.replaceWith(clone(accessor));
  }

  // Phase 2: collect final accessors + rests from the (now-resolved) pattern.
  const leaves: LeafBinding[] = [];
  const rests: RestBinding[] = [];
  collectObjectPattern(firstParam, base, leaves, rests);
  const accessorByName = new Map(leaves.map((leaf) => [leaf.name, leaf.accessor]));

  // Phase 3: swap the destructuring parameter for a plain `__props`.
  path.node.params[0] = t.identifier(TRANSFORM_PROPERTY_NAME);

  // Phase 4: replace each body reference with a fresh clone of its accessor.
  for (const [name, refs] of bodyRefs) {
    const accessor = accessorByName.get(name);
    if (!accessor) continue;
    for (const ref of refs) ref.replaceWith(clone(accessor));
  }

  // Phase 5: hoist rest declarations (`const rest = omitProps(...)` /
  // `[...base].slice(i)`). References to these names resolve to the new `const`.
  if (rests.length > 0) {
    const body = ensureBlockBody(path);
    const declarations = rests.map((rest) =>
      t.variableDeclaration('const', [t.variableDeclarator(t.identifier(rest.name), rest.init)]),
    );
    body.body.unshift(...declarations);
  }
}

/**
 * Visitor map for props transforms. Reference directly in merged traversals
 * instead of through `transformProps` to avoid an extra `path.traverse` call.
 */
export const propsVisitors = {
  FunctionDeclaration: transformFnProps,
  ArrowFunctionExpression: transformFnProps,
} as const;

/**
 * Applies props-parameter rewriting across the current program.
 */
export function transformProps(path: NodePath<t.Program>): void {
  path.traverse(propsVisitors);
}
