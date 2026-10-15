/**
 * AST Transform Pipeline
 *
 * All AST transformations run in this order:
 * 1. Signals - $ prefix → signal()/computed(), .value access
 * 2. Props - destructured component props → lazy __props accessors
 * 3. Map-to-For - array.map(fn) in JSX → <For each={array}>{fn}</For>
 * 4. HMR - component metadata + HMR boundary wrapping (when enabled)
 */

import { generate } from '@babel/generator';
import * as t from '@babel/types';
import { isNull, startsWith, warn } from '@estjs/shared';
import { DEFAULT_SIGNAL_PREFIX, TRANSFORM_PROPERTY_NAME } from './constants';
import {
  type MemberLike,
  createValueAccess,
  isFunctionLike,
  isMemberAccessingProperty,
  isMemberLike,
} from './utils/dom';
import { isAlreadyWrapped } from './utils/analysis';
import type { NodePath } from '@babel/core';
import type { Binding } from '@babel/traverse';
import type { CompileContext } from './context';

// ============================================================================
// SIGNALS TRANSFORM
// ============================================================================

export function isSignal(name: string, ctx: CompileContext): boolean {
  const prefix = ctx.options.signalPrefix ?? DEFAULT_SIGNAL_PREFIX;
  return !!name && name.length > prefix.length && name.startsWith(prefix);
}

function stripSignalPrefix(name: string, ctx: CompileContext): string {
  const prefix = ctx.options.signalPrefix ?? DEFAULT_SIGNAL_PREFIX;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

function isPlainBinding(path: NodePath<t.VariableDeclarator>): boolean {
  const declaration = path.parentPath;
  if (!declaration?.isVariableDeclaration()) return false;
  const parent = declaration.parentPath;
  return !!(parent?.isForStatement() && parent.node.init === declaration.node);
}

function isForInOrOfBinding(path: NodePath<t.VariableDeclarator>): boolean {
  const declaration = path.parentPath;
  const loop = declaration?.parentPath;
  return !!(
    declaration?.isVariableDeclaration() &&
    loop &&
    (loop.isForInStatement() || loop.isForOfStatement()) &&
    loop.node.left === declaration.node
  );
}

function shouldProcessIdentifier(path: NodePath<t.Identifier>): boolean {
  const parentPath = path.parentPath;
  if (!parentPath) return false;

  const parent = parentPath.node;
  const node = path.node;

  // Declaration / binding-pattern contexts
  if (
    t.isVariableDeclarator(parent) ||
    t.isArrayPattern(parent) ||
    t.isObjectPattern(parent) ||
    t.isRestElement(parent)
  ) {
    return false;
  }

  // Import / export specifier contexts
  if (
    t.isImportSpecifier(parent) ||
    t.isImportDefaultSpecifier(parent) ||
    t.isImportNamespaceSpecifier(parent) ||
    t.isExportSpecifier(parent)
  ) {
    return false;
  }

  // Function name / parameter definitions
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
  if (t.isObjectProperty(parent) && parent.key === node && !parent.computed) return false;

  // Label contexts
  if (t.isLabeledStatement(parent) && parent.label === node) return false;
  if ((t.isBreakStatement(parent) || t.isContinueStatement(parent)) && parent.label === node) {
    return false;
  }

  return true;
}

function isAlreadyValueAccess(path: NodePath<t.Identifier>): boolean {
  const parent = path.parent;

  if (isMemberLike(parent) && parent.object === path.node) {
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
    if (!isMemberLike(p.node)) return false;
    return isMemberAccessingProperty(p.node as MemberLike, 'value');
  });
  return !!ancestor;
}

export function transformSignals(programPath: NodePath<t.Program>, ctx: CompileContext): void {
  programPath.traverse({
    VariableDeclarator(path) {
      const { id, init } = path.node;

      if (isForInOrOfBinding(path)) {
        path.skip();
        return;
      }

      if (isPlainBinding(path)) {
        return;
      }

      if (t.isObjectPattern(id) || t.isArrayPattern(id)) {
        transformDestructuring(path, ctx);
        return;
      }

      if (t.isIdentifier(id) && isSignal(id.name, ctx)) {
        if (isAlreadyWrapped(init)) return;

        const isComputed =
          isFunctionLike(init) && (path.parent as t.VariableDeclaration).kind === 'const';
        const wrapper = isComputed ? 'computed' : 'signal';
        path.node.init = t.callExpression(ctx.imports.get(wrapper), init ? [init] : []);
      }
    },

    AssignmentExpression(path) {
      const { left } = path.node;
      if (!t.isIdentifier(left) || !isSignal(left.name, ctx)) return;
      path.node.left = createValueAccess(t.identifier(left.name));
    },

    UpdateExpression(path) {
      const { argument } = path.node;
      if (!t.isIdentifier(argument) || !isSignal(argument.name, ctx)) return;
      path.node.argument = createValueAccess(t.identifier(argument.name));
    },

    Identifier(path) {
      const { node, parent } = path;
      if (!isSignal(node.name, ctx)) return;

      if (!shouldProcessIdentifier(path)) return;
      if (isAlreadyValueAccess(path)) return;

      if (isMemberLike(parent) && parent.property === node && !parent.computed) {
        return;
      }

      path.replaceWith(createValueAccess(t.identifier(node.name)));
      path.skip();
    },
  });
}

function patternHasSignalBinding(node: t.Node, ctx: CompileContext): boolean {
  if (t.isIdentifier(node)) return isSignal(node.name, ctx);
  if (t.isObjectPattern(node)) {
    return node.properties.some((p) =>
      t.isRestElement(p)
        ? patternHasSignalBinding(p.argument, ctx)
        : patternHasSignalBinding(p.value, ctx),
    );
  }
  if (t.isArrayPattern(node)) {
    return node.elements.some((el) => el != null && patternHasSignalBinding(el, ctx));
  }
  if (t.isAssignmentPattern(node)) return patternHasSignalBinding(node.left, ctx);
  if (t.isRestElement(node)) return patternHasSignalBinding(node.argument, ctx);
  return false;
}

function isSignalSource(init: t.Expression, ctx: CompileContext): boolean {
  if (t.isIdentifier(init)) return isSignal(init.name, ctx);
  if (isMemberLike(init) && t.isIdentifier(init.object) && isSignal(init.object.name, ctx)) {
    return isMemberAccessingProperty(init, 'value');
  }
  return false;
}

function signalSourceBase(init: t.Expression, ctx: CompileContext): t.Expression {
  if (t.isIdentifier(init) && isSignal(init.name, ctx)) {
    return createValueAccess(t.identifier(init.name));
  }
  return t.cloneNode(init, true);
}

function transformDestructuring(path: NodePath<t.VariableDeclarator>, ctx: CompileContext): void {
  const { init, id } = path.node;
  const pattern = id as t.ObjectPattern | t.ArrayPattern;

  if (!init) {
    if (patternHasSignalBinding(pattern, ctx)) path.skip();
    return;
  }

  if (!isSignalSource(init, ctx) && !patternHasSignalBinding(pattern, ctx)) return;

  const declPath = path.parentPath;
  if (!declPath || !declPath.isVariableDeclaration()) return;
  if (declPath.parentPath?.isForStatement()) {
    path.skip();
    return;
  }

  const base = signalSourceBase(init, ctx);
  const declarators = bindPattern(pattern, base, ctx);

  const declaration = declPath.node;
  const index = declaration.declarations.indexOf(path.node);
  declaration.declarations.splice(index, 1, ...declarators);
  path.skip();
}

function bindPattern(
  pattern: t.ObjectPattern | t.ArrayPattern,
  base: t.Expression,
  ctx: CompileContext,
): t.VariableDeclarator[] {
  return t.isObjectPattern(pattern)
    ? bindObjectPattern(pattern, base, ctx)
    : bindArrayPattern(pattern, base, ctx);
}

function bindObjectPattern(
  pattern: t.ObjectPattern,
  base: t.Expression,
  ctx: CompileContext,
): t.VariableDeclarator[] {
  const out: t.VariableDeclarator[] = [];
  const handledKeys: Array<{ key: t.Expression; computed: boolean }> = [];

  for (const prop of pattern.properties) {
    if (t.isRestElement(prop)) {
      out.push(buildObjectRest(prop, base, handledKeys, ctx));
      continue;
    }
    const { keyExpr, computed, target } = resolveObjectProp(prop, ctx);
    handledKeys.push({ key: t.cloneNode(keyExpr, true), computed });
    out.push(
      ...bindTarget(target, t.memberExpression(t.cloneNode(base, true), keyExpr, computed), ctx),
    );
  }
  return out;
}

function resolveObjectProp(
  prop: t.ObjectProperty,
  ctx: CompileContext,
): {
  keyExpr: t.Expression;
  computed: boolean;
  target: t.Node;
} {
  const target: t.Node = prop.value;
  const shorthandId = t.isAssignmentPattern(target) ? target.left : target;
  if (prop.shorthand && t.isIdentifier(shorthandId) && isSignal(shorthandId.name, ctx)) {
    return {
      keyExpr: t.identifier(stripSignalPrefix(shorthandId.name, ctx)),
      computed: false,
      target,
    };
  }
  if (prop.computed) {
    return { keyExpr: prop.key as t.Expression, computed: true, target };
  }
  return { keyExpr: prop.key as t.Expression, computed: !t.isIdentifier(prop.key), target };
}

function bindArrayPattern(
  pattern: t.ArrayPattern,
  base: t.Expression,
  ctx: CompileContext,
): t.VariableDeclarator[] {
  const out: t.VariableDeclarator[] = [];
  pattern.elements.forEach((el, i) => {
    if (el == null) return;
    if (t.isRestElement(el)) {
      const slice = t.callExpression(
        t.memberExpression(t.cloneNode(base, true), t.identifier('slice')),
        [t.numericLiteral(i)],
      );
      out.push(...bindTarget(el.argument, slice, ctx));
      return;
    }
    out.push(
      ...bindTarget(
        el,
        t.memberExpression(t.cloneNode(base, true), t.numericLiteral(i), true),
        ctx,
      ),
    );
  });
  return out;
}

function bindTarget(
  target: t.Node,
  access: t.Expression,
  ctx: CompileContext,
): t.VariableDeclarator[] {
  if (t.isAssignmentPattern(target)) {
    return bindTarget(target.left, applyDefaultValue(access, target.right as t.Expression), ctx);
  }
  if (t.isIdentifier(target)) {
    const value = isSignal(target.name, ctx)
      ? t.callExpression(ctx.imports.get('computed'), [t.arrowFunctionExpression([], access)])
      : access;
    return [t.variableDeclarator(t.identifier(target.name), value)];
  }
  if (t.isObjectPattern(target)) return bindObjectPattern(target, access, ctx);
  if (t.isArrayPattern(target)) return bindArrayPattern(target, access, ctx);
  return [t.variableDeclarator(target as any, access)];
}

function applyDefaultValue(access: t.Expression, def: t.Expression): t.Expression {
  return t.conditionalExpression(
    t.binaryExpression('===', t.cloneNode(access, true), t.identifier('undefined')),
    def,
    t.cloneNode(access, true),
  );
}

function buildObjectRest(
  rest: t.RestElement,
  base: t.Expression,
  handledKeys: Array<{ key: t.Expression; computed: boolean }>,
  ctx: CompileContext,
): t.VariableDeclarator {
  const omits = (target: t.RestElement['argument']): t.ObjectPattern =>
    t.objectPattern([
      ...handledKeys.map(({ key, computed }) =>
        t.objectProperty(key, ctx.uids.generate('_omit$'), computed),
      ),
      t.restElement(target),
    ]);

  const arg = rest.argument;
  if (t.isIdentifier(arg) && isSignal(arg.name, ctx)) {
    const inner = ctx.uids.generate('_rest');
    const body = t.blockStatement([
      t.variableDeclaration('const', [t.variableDeclarator(omits(inner), t.cloneNode(base, true))]),
      t.returnStatement(t.cloneNode(inner, true)),
    ]);
    return t.variableDeclarator(
      t.identifier(arg.name),
      t.callExpression(ctx.imports.get('computed'), [t.arrowFunctionExpression([], body)]),
    );
  }
  return t.variableDeclarator(omits(arg), t.cloneNode(base, true));
}

// ============================================================================
// PROPS TRANSFORM
// ============================================================================

type FnPath = NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression>;

interface LeafBinding {
  name: string;
  accessor: t.Expression;
}

interface RestBinding {
  name: string;
  init: t.Expression;
}

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

function applyDefault(access: t.Expression, def: t.Expression): t.Expression {
  return t.conditionalExpression(
    t.binaryExpression('===', clone(access), t.identifier('undefined')),
    def,
    clone(access),
  );
}

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

function restName(argument: t.RestElement['argument']): string | null {
  return t.isIdentifier(argument) ? argument.name : null;
}

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

function transformFnProps(path: FnPath, ctx: CompileContext): void {
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

// ============================================================================
// MAP-TO-FOR TRANSFORM
// ============================================================================

function isRuntimeFor(path: NodePath): boolean {
  const binding = path.scope.getBinding('For');
  if (!binding) return true;
  const decl = binding.path.parentPath?.node;
  return (
    binding.kind === 'module' &&
    t.isImportDeclaration(decl) &&
    (decl.source.value === 'essor' || decl.source.value === 'essor/server')
  );
}

function getReturnedElement(node: t.Node): t.JSXElement | t.JSXFragment | null {
  if (t.isJSXElement(node) || t.isJSXFragment(node)) return node;
  if (t.isParenthesizedExpression && t.isParenthesizedExpression(node)) {
    return getReturnedElement(node.expression);
  }
  if (t.isBlockStatement(node)) {
    for (const stmt of node.body) {
      if (t.isReturnStatement(stmt) && stmt.argument) {
        return getReturnedElement(stmt.argument);
      }
    }
  }
  return null;
}

function extractKeyFromElement(element: t.JSXElement): t.Expression | null {
  const attrs = element.openingElement.attributes;
  const keyIdx = attrs.findIndex((attr) => t.isJSXAttribute(attr) && attr.name.name === 'key');
  if (keyIdx === -1) return null;

  const keyAttr = attrs[keyIdx] as t.JSXAttribute;
  attrs.splice(keyIdx, 1);

  if (t.isJSXExpressionContainer(keyAttr.value)) {
    if (t.isJSXEmptyExpression(keyAttr.value.expression)) return null;
    return keyAttr.value.expression;
  } else if (t.isStringLiteral(keyAttr.value)) {
    return keyAttr.value;
  } else if (!keyAttr.value) {
    return t.booleanLiteral(true);
  }
  return null;
}

function extractKeyFromCallback(
  callback: t.ArrowFunctionExpression | t.FunctionExpression,
): t.Expression | null {
  const targetElement = getReturnedElement(callback.body);
  if (!targetElement) return null;

  if (t.isJSXElement(targetElement)) {
    return extractKeyFromElement(targetElement);
  }

  if (t.isJSXFragment(targetElement)) {
    const validChildren = targetElement.children.filter(
      (c) => t.isJSXElement(c) || (t.isJSXText(c) && c.value.trim() !== ''),
    );
    if (validChildren.length === 1 && t.isJSXElement(validChildren[0])) {
      return extractKeyFromElement(validChildren[0]);
    }
  }

  return null;
}

export function transformMapToFor(programPath: NodePath<t.Program>): void {
  programPath.traverse({
    JSXExpressionContainer(path) {
      // Children only: an attribute value cannot hold a <For> element.
      if (!path.parentPath.isJSXElement() && !path.parentPath.isJSXFragment()) return;

      const expr = path.node.expression;
      if (!t.isCallExpression(expr) || expr.arguments.length !== 1) return;

      const { callee } = expr;
      if (
        !t.isMemberExpression(callee) ||
        callee.computed ||
        !t.isIdentifier(callee.property, { name: 'map' }) ||
        !t.isExpression(callee.object)
      ) {
        return;
      }

      // For renders rows synchronously with (item, index) only.
      const callback = expr.arguments[0];
      if (!t.isArrowFunctionExpression(callback) && !t.isFunctionExpression(callback)) return;
      if (callback.async || callback.generator || callback.params.length > 2) return;
      if (!isRuntimeFor(path)) return;

      const keyExpr = extractKeyFromCallback(callback);

      const forAttrs: (t.JSXAttribute | t.JSXSpreadAttribute)[] = [
        t.jsxAttribute(t.jsxIdentifier('each'), t.jsxExpressionContainer(callee.object)),
      ];

      if (keyExpr) {
        const prelude: t.Statement[] = [];
        if (t.isBlockStatement(callback.body)) {
          for (const stmt of callback.body.body) {
            if (t.isReturnStatement(stmt)) break;
            prelude.push(t.cloneNode(stmt, true));
          }
        }
        const keyBody =
          prelude.length > 0
            ? t.blockStatement([...prelude, t.returnStatement(t.cloneNode(keyExpr, true))])
            : t.cloneNode(keyExpr, true);

        forAttrs.push(
          t.jsxAttribute(
            t.jsxIdentifier('key'),
            t.jsxExpressionContainer(
              t.arrowFunctionExpression(
                callback.params.map((p) => t.cloneNode(p, true)),
                keyBody,
              ),
            ),
          ),
        );
      }

      path.replaceWith(
        t.jsxElement(
          t.jsxOpeningElement(t.jsxIdentifier('For'), forAttrs),
          t.jsxClosingElement(t.jsxIdentifier('For')),
          [t.jsxExpressionContainer(callback)],
        ),
      );
    },
  });
}

// ============================================================================
// HMR TRANSFORM
// ============================================================================

const HMR_COMPONENT_NAME = '__$createHMRComponent$__';
const HMR_REGISTRY_NAME = '__$registry$__';
const ESSOR_IMPORT = 'essor';
const HMR_IMPORTS = new Set(['createApp', 'hydrate', 'createComponent']);
const WHITESPACE_REGEX = /\s+/g;
const PATH_SEPARATOR_REGEX = /[/\\]/;

type AnyFunction = t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression;

type HmrBindings = {
  createComponent: Map<string, Binding>;
  mount: Map<string, Binding>;
};

type HmrState = {
  components: Set<string>;
  signatures: Map<string, string>;
};

const stateByContext = new WeakMap<object, HmrState>();

function getHmrState(
  ctx: CompileContext,
  components?: Set<string>,
  signatures?: Map<string, string>,
): HmrState {
  const context = ctx as unknown as object;
  const attached = ctx as CompileContext & {
    hmrComponents?: Set<string>;
    hmrSignatures?: Map<string, string>;
  };
  let state = stateByContext.get(context);

  if (!state) {
    state = {
      components: components ?? attached.hmrComponents ?? new Set<string>(),
      signatures: signatures ?? attached.hmrSignatures ?? new Map<string, string>(),
    };
    stateByContext.set(context, state);
  } else {
    if (components && state.components !== components) state.components = components;
    if (signatures && state.signatures !== signatures) state.signatures = signatures;
  }

  attached.hmrComponents = state.components;
  attached.hmrSignatures = state.signatures;
  return state;
}

function isHmrEnabled(ctx: CompileContext): boolean {
  const options = ctx.options as CompileContext['options'] & {
    bundler?: string;
  };
  return options.hmr === true && !!options.bundler;
}

function getFileBasename(ctx: CompileContext): string {
  const options = ctx.options as CompileContext['options'] & {
    filename?: string;
  };
  const filename = ctx.filename || options.filename || 'unknown.tsx';
  const segments = filename.split(PATH_SEPARATOR_REGEX);
  return segments[segments.length - 1] || filename;
}

function simpleHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function componentSignature(code: string): string {
  return simpleHash(code.replaceAll(WHITESPACE_REGEX, ' ').trim());
}

function functionBodyCode(path: NodePath<AnyFunction>): string {
  return generate(path.node.body).code;
}

function isFunctionLikeExpressionPath(
  path: NodePath<t.Node | null>,
): path is NodePath<t.FunctionExpression | t.ArrowFunctionExpression> {
  return path.isFunctionExpression() || path.isArrowFunctionExpression();
}

function returnsJSXValue(node: t.Node | null | undefined): boolean {
  if (!node) return false;
  if (t.isJSXElement(node) || t.isJSXFragment(node)) return true;
  if (t.isConditionalExpression(node)) {
    return returnsJSXValue(node.consequent) || returnsJSXValue(node.alternate);
  }
  if (t.isLogicalExpression(node)) {
    return returnsJSXValue(node.left) || returnsJSXValue(node.right);
  }
  if (t.isSequenceExpression(node)) {
    const last = node.expressions[node.expressions.length - 1];
    return returnsJSXValue(last);
  }
  if (t.isArrayExpression(node)) {
    return node.elements.some((element) =>
      element && t.isExpression(element) ? returnsJSXValue(element) : false,
    );
  }
  if (t.isAssignmentExpression(node)) return returnsJSXValue(node.right);
  if (t.isAwaitExpression(node)) return returnsJSXValue(node.argument);
  if (
    t.isParenthesizedExpression(node) ||
    t.isTSAsExpression(node) ||
    t.isTSSatisfiesExpression(node) ||
    t.isTSTypeAssertion(node) ||
    t.isTSNonNullExpression(node)
  ) {
    return returnsJSXValue(node.expression);
  }
  return false;
}

function checkHasJSXReturnHMR(path: NodePath<AnyFunction>): boolean {
  if (path.isArrowFunctionExpression() && !t.isBlockStatement(path.node.body)) {
    return returnsJSXValue(path.node.body);
  }

  let found = false;
  path.traverse({
    ReturnStatement(returnPath) {
      if (returnsJSXValue(returnPath.node.argument)) {
        found = true;
        returnPath.stop();
      }
    },
    Function(functionPath) {
      if (functionPath.node !== path.node) functionPath.skip();
    },
  });
  return found;
}

function unwrapTopLevelDeclaration(
  statementPath: NodePath<t.Statement | t.ModuleDeclaration>,
): NodePath<t.FunctionDeclaration | t.VariableDeclaration> | null {
  if (statementPath.isFunctionDeclaration() || statementPath.isVariableDeclaration()) {
    return statementPath as NodePath<t.FunctionDeclaration | t.VariableDeclaration>;
  }

  if (statementPath.isExportNamedDeclaration() || statementPath.isExportDefaultDeclaration()) {
    const declarationPath = statementPath.get('declaration');
    if (
      declarationPath &&
      !Array.isArray(declarationPath) &&
      (declarationPath.isFunctionDeclaration() || declarationPath.isVariableDeclaration())
    ) {
      return declarationPath as NodePath<t.FunctionDeclaration | t.VariableDeclaration>;
    }
  }
  return null;
}

function collectFromStatement(
  statementPath: NodePath<t.Statement | t.ModuleDeclaration>,
  ctx: CompileContext,
  components: Set<string>,
  signatures: Map<string, string>,
): void {
  const declarationPath = unwrapTopLevelDeclaration(statementPath);
  if (!declarationPath) return;

  if (declarationPath.isFunctionDeclaration()) {
    const id = declarationPath.node.id;
    if (id && checkHasJSXReturnHMR(declarationPath)) {
      components.add(id.name);
      signatures.set(
        id.name,
        componentSignature(functionBodyCode(declarationPath) + getFileBasename(ctx)),
      );
    }
    return;
  }

  for (const variablePath of declarationPath.get('declarations')) {
    const idPath = variablePath.get('id');
    const initPath = variablePath.get('init');
    if (!idPath.isIdentifier() || !isFunctionLikeExpressionPath(initPath)) continue;
    if (!checkHasJSXReturnHMR(initPath)) continue;

    const name = idPath.node.name;
    components.add(name);
    signatures.set(name, componentSignature(functionBodyCode(initPath) + getFileBasename(ctx)));
  }
}

function isComponentDeclarationExport(
  statementPath: NodePath<t.Statement | t.ModuleDeclaration>,
): boolean {
  const declarationPath = unwrapTopLevelDeclaration(statementPath);
  if (!declarationPath) return false;

  if (declarationPath.isFunctionDeclaration()) return checkHasJSXReturnHMR(declarationPath);
  if (!declarationPath.isVariableDeclaration()) return false;

  const declarations = declarationPath.get('declarations');
  return (
    declarations.length > 0 &&
    declarations.every((variablePath) => {
      const initPath = variablePath.get('init');
      return isFunctionLikeExpressionPath(initPath) && checkHasJSXReturnHMR(initPath);
    })
  );
}

function isTypeOnlyExport(statementPath: NodePath<t.Statement | t.ModuleDeclaration>): boolean {
  if (!statementPath.isExportNamedDeclaration()) return false;
  const { declaration, exportKind, specifiers } = statementPath.node;
  if (exportKind === 'type') return true;
  if (t.isTSTypeAliasDeclaration(declaration) || t.isTSInterfaceDeclaration(declaration)) {
    return true;
  }
  return (
    specifiers.length > 0 &&
    specifiers.every((specifier) => 'exportKind' in specifier && specifier.exportKind === 'type')
  );
}

function hasOnlyComponentSpecifiers(
  statementPath: NodePath<t.ExportNamedDeclaration>,
  components: Set<string>,
): boolean {
  const { node } = statementPath;
  if (node.declaration || node.source || node.specifiers.length === 0) return false;
  return node.specifiers.every(
    (specifier) =>
      t.isExportSpecifier(specifier) &&
      t.isIdentifier(specifier.local) &&
      components.has(specifier.local.name),
  );
}

function hasNonComponentExport(programPath: NodePath<t.Program>, components: Set<string>): boolean {
  for (const statementPath of programPath.get('body')) {
    if (!statementPath.isExportNamedDeclaration() && !statementPath.isExportDefaultDeclaration()) {
      continue;
    }
    if (isTypeOnlyExport(statementPath)) continue;
    if (
      statementPath.isExportNamedDeclaration() &&
      hasOnlyComponentSpecifiers(statementPath, components)
    ) {
      continue;
    }
    if (!isComponentDeclarationExport(statementPath)) return true;
  }
  return false;
}

function getMetadataTargets(
  statementPath: NodePath<t.Statement | t.ModuleDeclaration>,
  components: Set<string>,
): Array<{ name: string; functionPath: NodePath<AnyFunction> }> {
  const declarationPath = unwrapTopLevelDeclaration(statementPath);
  if (!declarationPath) return [];

  if (declarationPath.isFunctionDeclaration()) {
    const id = declarationPath.node.id;
    return id && components.has(id.name) ? [{ name: id.name, functionPath: declarationPath }] : [];
  }

  const targets: Array<{ name: string; functionPath: NodePath<AnyFunction> }> = [];
  for (const variablePath of declarationPath.get('declarations')) {
    const idPath = variablePath.get('id');
    const initPath = variablePath.get('init');
    if (
      idPath.isIdentifier() &&
      components.has(idPath.node.name) &&
      isFunctionLikeExpressionPath(initPath)
    ) {
      targets.push({ name: idPath.node.name, functionPath: initPath });
    }
  }
  return targets;
}

function createMetadataStatements(
  name: string,
  functionPath: NodePath<AnyFunction>,
  ctx: CompileContext,
  signatures: Map<string, string>,
): t.Statement[] {
  const fileName = getFileBasename(ctx);
  const signature =
    signatures.get(name) ?? componentSignature(functionBodyCode(functionPath) + fileName);
  const hmrId = `${simpleHash(fileName)}:${name}`;

  return [
    t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.memberExpression(t.identifier(name), t.identifier('__signature')),
        t.stringLiteral(signature),
      ),
    ),
    t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.memberExpression(t.identifier(name), t.identifier('__hmrId')),
        t.stringLiteral(hmrId),
      ),
    ),
  ];
}

function injectComponentMetadata(
  programPath: NodePath<t.Program>,
  ctx: CompileContext,
  components: Set<string>,
  signatures: Map<string, string>,
): void {
  if (components.size === 0) return;

  const nextBody: t.Statement[] = [];
  for (const statementPath of programPath.get('body')) {
    const statement = statementPath.node;
    nextBody.push(statement);
    for (const target of getMetadataTargets(statementPath, components)) {
      nextBody.push(...createMetadataStatements(target.name, target.functionPath, ctx, signatures));
    }
  }
  programPath.node.body = nextBody;
}

function isHmrComponentCall(value: t.Node | null | undefined): value is t.CallExpression {
  return (
    t.isCallExpression(value) &&
    t.isIdentifier(value.callee) &&
    value.callee.name === HMR_COMPONENT_NAME
  );
}

function canWrapArgument(value: t.CallExpression['arguments'][number] | undefined): boolean {
  return !!value && !t.isSpreadElement(value) && !t.isArgumentPlaceholder(value);
}

function getEssorHmrBindings(programPath: NodePath<t.Program>): HmrBindings {
  const bindings: HmrBindings = {
    createComponent: new Map(),
    mount: new Map(),
  };

  for (const statementPath of programPath.get('body')) {
    if (!statementPath.isImportDeclaration() || statementPath.node.source.value !== ESSOR_IMPORT) {
      continue;
    }
    for (const specifier of statementPath.node.specifiers) {
      if (!t.isImportSpecifier(specifier)) continue;
      const imported = specifier.imported;
      const importedName = t.isIdentifier(imported) ? imported.name : imported.value;
      if (!HMR_IMPORTS.has(importedName)) continue;

      const binding = statementPath.scope.getBinding(specifier.local.name);
      if (!binding) continue;
      const bucket = importedName === 'createComponent' ? bindings.createComponent : bindings.mount;
      bucket.set(specifier.local.name, binding);
    }
  }
  return bindings;
}

function hasImportBinding(path: NodePath, name: string, bindings: Map<string, Binding>): boolean {
  return bindings.has(name) && path.scope.getBinding(name) === bindings.get(name);
}

function generatedImportName(ctx: CompileContext, name: string): string | undefined {
  return ctx.imports.has(name) ? ctx.imports.get(name).name : undefined;
}

function isMountCallee(
  callPath: NodePath<t.CallExpression>,
  ctx: CompileContext,
  bindings: HmrBindings,
): boolean {
  const callee = callPath.node.callee;
  if (!t.isIdentifier(callee)) return false;
  if (hasImportBinding(callPath, callee.name, bindings.mount)) return true;
  return (
    callee.name === generatedImportName(ctx, 'createApp') ||
    callee.name === generatedImportName(ctx, 'hydrate')
  );
}

function isCreateComponentCallee(
  callPath: NodePath<t.CallExpression>,
  ctx: CompileContext,
  bindings: HmrBindings,
): boolean {
  const callee = callPath.node.callee;
  if (!t.isIdentifier(callee)) return false;
  return (
    hasImportBinding(callPath, callee.name, bindings.createComponent) ||
    callee.name === generatedImportName(ctx, 'createComponent')
  );
}

function createImportMetaHot(): t.MemberExpression {
  return t.memberExpression(
    t.metaProperty(t.identifier('import'), t.identifier('meta')),
    t.identifier('hot'),
  );
}

function createDisposeStatement(appId: t.Identifier): t.ExpressionStatement {
  const dispose = t.optionalMemberExpression(
    createImportMetaHot(),
    t.identifier('dispose'),
    false,
    true,
  );
  const unmount = t.optionalCallExpression(
    t.optionalMemberExpression(appId, t.identifier('unmount'), false, true),
    [],
    true,
  );
  return t.expressionStatement(
    t.optionalCallExpression(dispose, [t.arrowFunctionExpression([], unmount)], false),
  );
}

function wrapTopLevelMountDisposals(
  programPath: NodePath<t.Program>,
  ctx: CompileContext,
  bindings: HmrBindings,
): void {
  const nextBody: t.Statement[] = [];
  for (const statementPath of programPath.get('body')) {
    const expressionPath = statementPath.isExpressionStatement()
      ? statementPath.get('expression')
      : null;
    if (expressionPath?.isCallExpression() && isMountCallee(expressionPath, ctx, bindings)) {
      const appId = programPath.scope.generateUidIdentifier('app');
      nextBody.push(
        t.variableDeclaration('const', [t.variableDeclarator(appId, expressionPath.node)]),
      );
      nextBody.push(createDisposeStatement(appId));
    } else {
      nextBody.push(statementPath.node);
    }
  }
  programPath.node.body = nextBody;
}

function wrapComponentCreationCalls(
  programPath: NodePath<t.Program>,
  ctx: CompileContext,
  bindings: HmrBindings,
): void {
  programPath.traverse({
    CallExpression(callPath) {
      if (isCreateComponentCallee(callPath, ctx, bindings)) {
        const firstArg = callPath.node.arguments[0];
        if (canWrapArgument(firstArg)) callPath.node.callee = t.identifier(HMR_COMPONENT_NAME);
        return;
      }

      if (!isMountCallee(callPath, ctx, bindings)) return;
      const firstArg = callPath.node.arguments[0];
      if (!canWrapArgument(firstArg) || isHmrComponentCall(firstArg)) return;
      callPath.node.arguments[0] = t.callExpression(t.identifier(HMR_COMPONENT_NAME), [firstArg]);
    },
  });
}

export function collectTopLevelHmrComponents(
  programPath: NodePath<t.Program>,
  ctx: CompileContext,
  hmrComponents?: Set<string>,
  hmrSignatures?: Map<string, string>,
): void {
  if (!isHmrEnabled(ctx)) return;
  const state = getHmrState(ctx, hmrComponents, hmrSignatures);

  for (const statementPath of programPath.get('body')) {
    collectFromStatement(
      statementPath as NodePath<t.Statement | t.ModuleDeclaration>,
      ctx,
      state.components,
      state.signatures,
    );
  }

  if (hasNonComponentExport(programPath, state.components)) {
    state.components.clear();
    state.signatures.clear();
  }
}

export function applyHmr(
  programPath: NodePath<t.Program>,
  ctx: CompileContext,
  hmrComponents?: Set<string>,
  hmrSignatures?: Map<string, string>,
): void {
  if (!isHmrEnabled(ctx)) return;
  const state = getHmrState(ctx, hmrComponents, hmrSignatures);

  if (state.components.size > 0) {
    injectComponentMetadata(programPath, ctx, state.components, state.signatures);
  }

  const bindings = getEssorHmrBindings(programPath);
  wrapComponentCreationCalls(programPath, ctx, bindings);
  if (state.components.size === 0) return;

  wrapTopLevelMountDisposals(programPath, ctx, bindings);
  programPath.node.body.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(HMR_REGISTRY_NAME),
        t.arrayExpression([...state.components].map((name) => t.identifier(name))),
      ),
    ]),
  );
}

export function transformHMR(programPath: NodePath<t.Program>, ctx: CompileContext): void {
  if (!isHmrEnabled(ctx)) return;
  const state = getHmrState(ctx);
  collectTopLevelHmrComponents(programPath, ctx, state.components, state.signatures);
  applyHmr(programPath, ctx, state.components, state.signatures);
}
