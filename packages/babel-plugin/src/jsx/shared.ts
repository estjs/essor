import { types as t } from '@babel/core';
import { useImport } from '../context';
import { resolveComponentCallee } from '../ast-utils';
import { type IRFor, type IRNode, IRType } from './ir';
import { buildComponentPropsExpression } from './component-props';

/**
 * Builds the common For-loop props object (each getter, children callback,
 * optional key fn). Shared between client and server codegen.
 */
export function buildForProps(node: IRFor, bodyExpr: t.Expression): t.ObjectExpression {
  const childrenParams = [t.cloneNode(node.itemParam, true)];
  if (node.indexParam) childrenParams.push(t.cloneNode(node.indexParam, true));
  const childrenBody = buildForCallbackBody(node, bodyExpr);

  const props: t.ObjectMember[] = [
    t.objectMethod(
      'get',
      t.identifier('each'),
      [],
      t.blockStatement([t.returnStatement(t.cloneNode(node.each, true))]),
      false,
      false,
    ),
    t.objectProperty(
      t.identifier('children'),
      t.arrowFunctionExpression(childrenParams, childrenBody),
    ),
  ];

  if (node.key) {
    const keyParams = [t.cloneNode(node.itemParam, true)];
    if (node.indexParam) keyParams.push(t.cloneNode(node.indexParam, true));
    const keyBody = buildForCallbackBody(node, t.cloneNode(node.key, true));
    props.push(
      t.objectProperty(t.identifier('key'), t.arrowFunctionExpression(keyParams, keyBody)),
    );
  }

  return t.objectExpression(props);
}

function buildForCallbackBody(
  node: IRFor,
  returnValue: t.Expression,
): t.Expression | t.BlockStatement {
  return node.bodyPrelude.length
    ? t.blockStatement([
        ...node.bodyPrelude.map((statement) => t.cloneNode(statement, true)),
        t.returnStatement(returnValue),
      ])
    : returnValue;
}

/**
 * Builds the For component call expression. Shared between client and server.
 */
export function buildForCall(node: IRFor, bodyExpr: t.Expression): t.CallExpression {
  return t.callExpression(useImport('createComponent'), [
    useImport('For'),
    buildForProps(node, bodyExpr),
  ]);
}

/**
 * Renders a list of IR children, skipping nulls and optionally wrapping
 * Component / Element / For expressions in an arrow thunk (server codegen).
 */
export function renderChildExpressions(
  children: IRNode[],
  render: (child: IRNode) => t.Expression,
  options: { thunkWrapNonLeaf?: boolean } = {},
): t.Expression[] {
  const out: t.Expression[] = [];
  for (const child of children) {
    const expr = render(child);
    if (expr === undefined || t.isNullLiteral(expr)) continue;
    if (
      options.thunkWrapNonLeaf &&
      (child.type === IRType.COMPONENT ||
        child.type === IRType.ELEMENT ||
        child.type === IRType.FOR)
    ) {
      out.push(t.arrowFunctionExpression([], expr));
    } else {
      out.push(expr);
    }
  }
  return out;
}

export interface ComponentInvocationOptions {
  /** Wrap the call in `createComponent(...)` vs. a direct call. */
  wrap: boolean;
  dynamicPropsAsGetters: boolean;
  cloneValues?: boolean;
  forceStringLiteralKeys?: boolean;
  lazyChildren?: boolean;
  renderedChildren: t.Expression[];
}

/**
 * Builds a component invocation expression, unified across client/server
 * and plain/inline variants.
 */
export function buildComponentInvocation(
  tag: string,
  node: Parameters<typeof buildComponentPropsExpression>[0],
  options: ComponentInvocationOptions,
): t.CallExpression {
  // When wrapping, register the `createComponent` helper BEFORE resolving the
  // callee (which may itself register a built-in like Portal / Suspense). This
  // preserves the import declaration order emitted by older codegen paths.
  const createComponentId = options.wrap ? useImport('createComponent') : null;
  const callee = resolveComponentCallee(tag, buildComponentTagExpression(tag));
  const props = buildComponentPropsExpression(node, {
    dynamicPropsAsGetters: options.dynamicPropsAsGetters,
    cloneValues: options.cloneValues,
    forceStringLiteralKeys: options.forceStringLiteralKeys,
    lazyChildren: options.lazyChildren,
    renderedChildren: options.renderedChildren,
  });

  if (createComponentId) {
    return t.callExpression(createComponentId, [callee, props]);
  }
  return t.callExpression(callee, [props]);
}

function buildComponentTagExpression(tag: string): t.Expression {
  const [head, ...parts] = tag.split('.');
  return parts.reduce<t.Expression>(
    (expr, part) => t.memberExpression(expr, t.identifier(part)),
    t.identifier(head),
  );
}
