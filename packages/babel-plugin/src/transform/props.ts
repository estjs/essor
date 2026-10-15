/**
 * Component-props preprocessor.
 *
 * Rewrites a JSX component's first object-pattern parameter into lazy,
 * reactive accessors rooted at a single `__props` object. Each destructured
 * binding is replaced *at every use site* with a member-expression that reads
 * from `__props` on demand — never snapshotted into a local — so the read
 * happens inside the reactive effect and stays live.
 */

import { type NodePath, types as t } from '@babel/core';
import { isNull, startsWith, warn } from '@estjs/shared';
import { TRANSFORM_PROPERTY_NAME } from '../constants';
import type { ArrowFunctionExpression, FunctionDeclaration } from '@babel/types';
import type { CompileContext } from '../core/context';

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

function checkHasJSXReturn(
  path: NodePath<t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression>,
): boolean {
  if (path.isArrowFunctionExpression()) {
    const body = path.get('body');
    if (body.isJSXElement() || body.isJSXFragment()) {
      return true;
    }
  }

  let found = false;

  path.traverse({
    ReturnStatement(returnPath) {
      const argumentPath = returnPath.get('argument');
      if (argumentPath.isJSXElement() || argumentPath.isJSXFragment()) {
        found = true;
        returnPath.stop();
      }
    },
    Function(functionPath) {
      if (functionPath.node !== path.node) {
        functionPath.skip();
      }
    },
  });

  return found;
}

/**
 * Wraps an accessor with its destructuring default as a conditional:
 * `access === undefined ? def : access`.
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
 */
function resolveKey(prop: t.ObjectProperty): {
  keyExpr: t.Expression;
  computed: boolean;
  excludeKey: t.Expression | null;
} {
  const key = prop.key;
  if (prop.computed) {
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
  return { keyExpr: key as t.Expression, computed: true, excludeKey: null };
}

/** Returns the binding identifier name of a rest argument, or null if not plain. */
function restName(argument: t.RestElement['argument']): string | null {
  return t.isIdentifier(argument) ? argument.name : null;
}

/**
 * Builds the initializer for an object rest: `omitProps(base, [keys])`, or just
 * `base` when there is nothing to exclude.
 */
function buildObjectRestInit(
  base: t.Expression,
  excludeKeys: t.Expression[],
  ctx: CompileContext,
): t.Expression {
  if (excludeKeys.length === 0) return clone(base);
  return t.callExpression(ctx.imports.get('omitProps'), [
    clone(base),
    t.arrayExpression(excludeKeys.map((key) => clone(key))),
  ]);
}

/**
 * Walks any binding target, accumulating leaf accessors and rest declarations.
 */
function collectTarget(
  target: t.Node,
  access: t.Expression,
  leaves: LeafBinding[],
  rests: RestBinding[],
  ctx: CompileContext,
): void {
  if (t.isAssignmentPattern(target)) {
    collectTarget(target.left, applyDefault(access, target.right), leaves, rests, ctx);
    return;
  }
  if (t.isIdentifier(target)) {
    leaves.push({ name: target.name, accessor: access });
    return;
  }
  if (t.isObjectPattern(target)) {
    collectObjectPattern(target, access, leaves, rests, ctx);
    return;
  }
  if (t.isArrayPattern(target)) {
    collectArrayPattern(target, access, leaves, rests, ctx);
    return;
  }
}

/** Collects bindings from an object pattern reading from `base`. */
function collectObjectPattern(
  pattern: t.ObjectPattern,
  base: t.Expression,
  leaves: LeafBinding[],
  rests: RestBinding[],
  ctx: CompileContext,
): void {
  const excludeKeys: t.Expression[] = [];

  for (const prop of pattern.properties) {
    if (t.isRestElement(prop)) {
      const name = restName(prop.argument);
      if (name) rests.push({ name, init: buildObjectRestInit(base, excludeKeys, ctx) });
      continue;
    }

    const { keyExpr, computed, excludeKey } = resolveKey(prop);
    if (!isNull(excludeKey)) excludeKeys.push(excludeKey);

    const access = t.memberExpression(clone(base), keyExpr, computed);
    collectTarget(prop.value, access, leaves, rests, ctx);
  }
}

function spreadOf(base: t.Expression): t.ArrayExpression {
  return t.arrayExpression([t.spreadElement(clone(base))]);
}

/** Collects bindings from an array pattern reading from `base`. */
function collectArrayPattern(
  pattern: t.ArrayPattern,
  base: t.Expression,
  leaves: LeafBinding[],
  rests: RestBinding[],
  ctx: CompileContext,
): void {
  pattern.elements.forEach((element, index) => {
    if (element == null) return;

    if (t.isRestElement(element)) {
      const name = restName(element.argument);
      if (name) {
        const init = t.callExpression(t.memberExpression(spreadOf(base), t.identifier('slice')), [
          t.numericLiteral(index),
        ]);
        rests.push({ name, init });
      }
      return;
    }

    const access = t.memberExpression(spreadOf(base), t.numericLiteral(index), true);
    collectTarget(element, access, leaves, rests, ctx);
  });
}

function ensureBlockBody(path: FnPath): t.BlockStatement {
  if (t.isBlockStatement(path.node.body)) return path.node.body;
  const block = t.blockStatement([t.returnStatement(path.node.body)]);
  path.node.body = block;
  return block;
}

function isInsidePattern(ref: NodePath, pattern: t.Node): boolean {
  return !!ref.findParent((p) => p.node === pattern);
}

function accessorFor(
  pattern: t.ObjectPattern,
  base: t.Expression,
  name: string,
  ctx: CompileContext,
): t.Expression | undefined {
  const leaves: LeafBinding[] = [];
  collectObjectPattern(pattern, base, leaves, [], ctx);
  return leaves.find((leaf) => leaf.name === name)?.accessor;
}

export function transformFnProps(path: FnPath, ctx: CompileContext): void {
  const firstParam = path.node.params[0];
  if (!firstParam || !t.isObjectPattern(firstParam) || !checkHasJSXReturn(path)) return;

  const signalPrefix = ctx.options.signalPrefix || '$';
  const base = t.identifier(TRANSFORM_PROPERTY_NAME);

  const initLeaves: LeafBinding[] = [];
  const initRests: RestBinding[] = [];
  collectObjectPattern(firstParam, base, initLeaves, initRests, ctx);

  const conflicts = [...initLeaves, ...initRests]
    .map((b) => b.name)
    .filter((name) => startsWith(name, signalPrefix));
  if (conflicts.length > 0) {
    warn('transformProps', 'Property names cannot start with signal prefix', conflicts);
  }

  if (
    initLeaves.length === 0 &&
    initRests.length === 1 &&
    firstParam.properties.length === 1 &&
    t.isRestElement(firstParam.properties[0])
  ) {
    path.node.params[0] = t.identifier(initRests[0].name);
    return;
  }

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

  for (const leaf of initLeaves) {
    const refs = inPatternRefs.get(leaf.name);
    if (!refs) continue;
    const accessor = accessorFor(firstParam, base, leaf.name, ctx);
    if (!accessor) continue;
    for (const ref of refs) ref.replaceWith(clone(accessor));
  }

  const leaves: LeafBinding[] = [];
  const rests: RestBinding[] = [];
  collectObjectPattern(firstParam, base, leaves, rests, ctx);
  const accessorByName = new Map(leaves.map((leaf) => [leaf.name, leaf.accessor]));

  path.node.params[0] = t.identifier(TRANSFORM_PROPERTY_NAME);

  for (const [name, refs] of bodyRefs) {
    const accessor = accessorByName.get(name);
    if (!accessor) continue;
    for (const ref of refs) ref.replaceWith(clone(accessor));
  }

  if (rests.length > 0) {
    const body = ensureBlockBody(path);
    const declarations = rests.map((rest) =>
      t.variableDeclaration('const', [t.variableDeclarator(t.identifier(rest.name), rest.init)]),
    );
    body.body.unshift(...declarations);
  }
}

export function transformProps(programPath: NodePath<t.Program>, ctx: CompileContext): void {
  programPath.traverse({
    FunctionDeclaration(path) {
      transformFnProps(path, ctx);
    },
    ArrowFunctionExpression(path) {
      transformFnProps(path, ctx);
    },
  });
}
