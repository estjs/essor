import { types as t } from '@babel/core';
import { startsWith } from '@estjs/shared';
import type { IRComponent, IRDynamicAttr, IRSpread } from './ir';

export interface BuildComponentPropsOptions {
  dynamicPropsAsGetters: boolean;
  cloneValues?: boolean;
  forceStringLiteralKeys?: boolean;
  lazyChildren?: boolean;
  renderedChildren?: t.Expression[];
}

type ComponentPropNode = t.ObjectMethod | t.ObjectProperty;
type OrderedPart =
  | { type: 'prop'; order: number; sequence: number; prop: IRDynamicAttr }
  | { type: 'spread'; order: number; sequence: number; spread: IRSpread };

/**
 * Creates the object key used for a component prop.
 */
function createComponentPropKey(
  name: string,
  forceStringLiteralKeys = false,
): t.Identifier | t.StringLiteral {
  return forceStringLiteralKeys || !t.isValidIdentifier(name)
    ? t.stringLiteral(name)
    : t.identifier(name);
}

/**
 * Clones an expression when the caller requires defensive copies.
 */
function cloneValue(value: t.Expression, clone = false): t.Expression {
  return clone ? t.cloneNode(value, true) : value;
}

/**
 * Builds an object property or getter for a component prop.
 */
function createPropNode(
  name: string,
  value: t.Expression,
  kind: 'static' | 'dynamic',
  options: Pick<
    BuildComponentPropsOptions,
    'cloneValues' | 'dynamicPropsAsGetters' | 'forceStringLiteralKeys'
  >,
): ComponentPropNode {
  const key = createComponentPropKey(name, options.forceStringLiteralKeys);
  const val = cloneValue(value, options.cloneValues);

  if (options.dynamicPropsAsGetters && kind === 'dynamic' && !startsWith(name, 'on')) {
    return t.objectMethod('get', key, [], t.blockStatement([t.returnStatement(val)]), false, false);
  }

  return t.objectProperty(key, val);
}

/**
 * Builds the final props object expression, including spread sources.
 */
function composePropsExpression(
  props: IRDynamicAttr[],
  spreads: IRSpread[],
  options: Pick<
    BuildComponentPropsOptions,
    'cloneValues' | 'dynamicPropsAsGetters' | 'forceStringLiteralKeys'
  >,
): t.Expression {
  // If no spreads, simple object
  if (spreads.length === 0) {
    if (props.length === 0) return t.objectExpression([]);
    return t.objectExpression(props.map((p) => createPropNode(p.name, p.value, p.kind, options)));
  }

  const ordered: OrderedPart[] = [
    ...props.map((prop, sequence) => ({
      type: 'prop' as const,
      order: prop.order,
      sequence,
      prop,
    })),
    ...spreads.map((spread, sequence) => ({
      type: 'spread' as const,
      order: spread.order,
      sequence,
      spread,
    })),
  ].sort((a, b) => a.order - b.order || a.sequence - b.sequence);

  const parts: t.Expression[] = [];
  let propNodes: ComponentPropNode[] = [];

  const flushProps = (): void => {
    if (propNodes.length === 0) return;
    parts.push(t.objectExpression(propNodes));
    propNodes = [];
  };

  for (const entry of ordered) {
    if (entry.type === 'prop') {
      propNodes.push(createPropNode(entry.prop.name, entry.prop.value, entry.prop.kind, options));
      continue;
    }
    flushProps();
    parts.push(cloneValue(entry.spread.value, options.cloneValues));
  }
  flushProps();

  return composeAssignParts(parts);
}

function composeAssignParts(parts: t.Expression[]): t.Expression {
  if (parts.length === 0) return t.objectExpression([]);
  if (parts.length === 1) return parts[0];

  return t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('assign')), [
    t.objectExpression([]),
    ...parts,
  ]);
}

/**
 * Checks whether an expression is an `Object.assign(...)` call.
 */
function isObjectAssignCall(expression: t.Expression): expression is t.CallExpression {
  return (
    t.isCallExpression(expression) &&
    t.isMemberExpression(expression.callee) &&
    t.isIdentifier(expression.callee.object, { name: 'Object' }) &&
    t.isIdentifier(expression.callee.property, { name: 'assign' })
  );
}

/**
 * Builds the runtime props expression for a component IR node.
 */
export function buildComponentPropsExpression(
  node: IRComponent,
  options: BuildComponentPropsOptions,
): t.Expression {
  const renderedChildren = options.renderedChildren ?? [];
  const hasChildren = node.children.length > 0 || renderedChildren.length > 0;

  const baseProps = composePropsExpression(node.props, node.spreads, options);

  if (!hasChildren) {
    return baseProps;
  }

  // Add children prop — lazy getter when lazyChildren so children are
  // created in the component's own scope (needed for provide/inject nesting).
  const childrenKey = createComponentPropKey('children', options.forceStringLiteralKeys);
  const childrenArray = t.arrayExpression(renderedChildren);
  const childrenNode: t.ObjectMethod | t.ObjectProperty = options.lazyChildren
    ? t.objectMethod(
        'get',
        childrenKey,
        [],
        t.blockStatement([t.returnStatement(childrenArray)]),
        false,
        false,
      )
    : t.objectProperty(childrenKey, childrenArray);

  if (t.isObjectExpression(baseProps)) {
    return t.objectExpression([...baseProps.properties, childrenNode]);
  }

  if (isObjectAssignCall(baseProps)) {
    return t.callExpression(t.cloneNode(baseProps.callee, true), [
      ...baseProps.arguments.map(
        (argument) => t.cloneNode(argument, true) as t.Expression | t.SpreadElement,
      ),
      t.objectExpression([childrenNode]),
    ]);
  }

  return t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('assign')), [
    t.objectExpression([]),
    baseProps,
    t.objectExpression([childrenNode]),
  ]);
}
