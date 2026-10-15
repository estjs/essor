/**
 * Signal symbol transformer.
 *
 * Variables prefixed with the configured signal prefix (default `$`) are
 * treated as reactive signals. This pass:
 *   - wraps initializers in `signal()` / `computed()`
 *   - rewrites reads as `.value`
 *   - rewrites assignments / update expressions to target `.value`
 *   - expands signal destructuring so reactivity is preserved
 */

import * as t from '@babel/types';
import { DEFAULT_SIGNAL_PREFIX } from '../constants';
import {
  type MemberLike,
  createValueAccess,
  isFunctionLike,
  isMemberAccessingProperty,
  isMemberLike,
} from '../utils/ast';
import { isAlreadyWrapped } from '../utils/static-analysis';
import type { NodePath } from '@babel/core';
import type { CompileContext } from '../core/types';

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

  // Function name / parameter definitions (the parameter definition itself is not .value)
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
    return bindTarget(target.left, applyDefault(access, target.right as t.Expression), ctx);
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

function applyDefault(access: t.Expression, def: t.Expression): t.Expression {
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
