import { types as t } from '@babel/core';
import { type CompileContext, registerDeclaration, useImport } from '../context';
import { type IRComponent, type IRElement, type IRFor, type IRNode, IRType } from './ir';
import { serializeStaticAttrs } from './utils';
import { buildComponentInvocation, buildForCall, renderChildExpressions } from './shared';

const serverTextEscapeRE = /[&<>]/g;

/**
 * Escapes server template text.
 */
function escapeServerTemplateText(value: string): string {
  return value.replaceAll(serverTextEscapeRE, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      default:
        return char;
    }
  });
}

// ─── Server Node Generation ────────────────

/**
 * Generates server node.
 */
function generateServerNode(node: IRNode, ctx: CompileContext): t.Expression {
  switch (node.type) {
    case IRType.TEXT:
      return t.stringLiteral(node.value);
    case IRType.EXPRESSION:
      return t.callExpression(useImport('convertTextChildToString'), [
        t.cloneNode(node.value, true),
      ]);
    case IRType.COMPONENT:
      return generateServerComponent(node, ctx);
    case IRType.FOR:
      return generateServerFor(node, ctx);
    case IRType.ELEMENT:
      return generateServerElement(node, ctx);
  }
}

/**
 * Generates server component.
 *
 * Component / element / for children are wrapped in arrow thunks so they
 * render after the parent component's `getHydrationKey()` call, preserving
 * key ordering.
 */
function generateServerComponent(node: IRComponent, ctx: CompileContext): t.Expression {
  const renderedChildren = renderChildExpressions(
    node.children,
    (child) => generateServerNode(child, ctx),
    { thunkWrapNonLeaf: true },
  );
  return buildComponentInvocation(node.tag, node, {
    wrap: true,
    dynamicPropsAsGetters: false,
    cloneValues: true,
    forceStringLiteralKeys: true,
    renderedChildren,
  });
}

/**
 * Generates server for.
 */
function generateServerFor(node: IRFor, ctx: CompileContext): t.Expression {
  const bodyExpr = generateServerForBody(node.body, ctx);
  return buildForCall(node, bodyExpr);
}

/**
 * Generates server element.
 */
function generateServerElement(node: IRElement, ctx: CompileContext): t.Expression {
  const dynamicAttrExprs: t.Expression[] = [];
  for (const attr of node.dynamicAttrs) {
    let expr: t.Expression;
    if (attr.name === 'class') {
      expr = t.callExpression(useImport('ssrClass'), [t.cloneNode(attr.value, true)]);
    } else if (attr.name === 'style') {
      expr = t.callExpression(useImport('ssrStyle'), [t.cloneNode(attr.value, true)]);
    } else {
      expr = t.callExpression(useImport('ssrAttr'), [
        t.stringLiteral(attr.name),
        t.cloneNode(attr.value, true),
      ]);
    }
    dynamicAttrExprs.push(expr);
  }
  for (const spread of node.spreads) {
    dynamicAttrExprs.push(
      t.callExpression(useImport('ssrSpread'), [t.cloneNode(spread.value, true)]),
    );
  }

  const childExprs: t.Expression[] = [];
  for (const child of node.children) {
    if (
      child.type === IRType.EXPRESSION ||
      child.type === IRType.COMPONENT ||
      child.type === IRType.FOR
    ) {
      childExprs.push(generateServerNode(child, ctx));
    }
  }

  const templates: string[] = [];
  const expressions: t.Expression[] = [];
  const attrs = serializeStaticAttrs(node.staticAttrs);

  let currentStr = `<${node.tag}`;

  if (dynamicAttrExprs.length > 0) {
    for (const expr of dynamicAttrExprs) {
      templates.push(currentStr);
      currentStr = '';
      expressions.push(expr);
    }
  }

  currentStr += `${attrs}${node.selfClosing ? '/>' : '>'}`;

  if (!node.selfClosing) {
    let childExprIndex = 0;
    for (const child of node.children) {
      if (child.type === IRType.TEXT) {
        currentStr += escapeServerTemplateText(child.value);
      } else if (
        child.type === IRType.EXPRESSION ||
        child.type === IRType.COMPONENT ||
        child.type === IRType.FOR
      ) {
        templates.push(currentStr);
        currentStr = '';
        expressions.push(childExprs[childExprIndex++]);
      } else if (child.type === IRType.ELEMENT) {
        const staticHTML = buildStaticServerHTML(child);
        if (staticHTML !== null) {
          currentStr += staticHTML;
        } else {
          templates.push(currentStr);
          currentStr = '';
          expressions.push(generateServerElement(child, ctx));
        }
      }
    }
    currentStr += `</${node.tag}>`;
  }

  templates.push(currentStr);

  const templateId = registerDeclaration(
    t.arrayExpression(templates.map((s) => t.stringLiteral(s))),
    { uidBase: '_tmpl$' },
  );

  return t.callExpression(useImport('render'), [
    templateId,
    t.callExpression(useImport('getHydrationKey'), []),
    ...expressions,
  ]);
}

/**
 * Generates server for body.
 */
function generateServerForBody(node: IRNode, ctx: CompileContext): t.Expression {
  if (node.type === IRType.COMPONENT) {
    return generateServerInlineComponent(node, ctx);
  }
  return generateServerNode(node, ctx);
}

/**
 * Generates server inline component (used inside For callback bodies).
 */
function generateServerInlineComponent(node: IRComponent, ctx: CompileContext): t.Expression {
  const renderedChildren = renderChildExpressions(
    node.children,
    (child) => generateServerNode(child, ctx),
    { thunkWrapNonLeaf: true },
  );
  return buildComponentInvocation(node.tag, node, {
    wrap: false,
    dynamicPropsAsGetters: false,
    cloneValues: true,
    forceStringLiteralKeys: true,
    renderedChildren,
  });
}

/**
 * Serializes a fully static element subtree for server output.
 */
function buildStaticServerHTML(node: IRElement): string | null {
  if (node.dynamicAttrs.length > 0 || node.spreads.length > 0) {
    return null;
  }

  const attrs = serializeStaticAttrs(node.staticAttrs);
  if (node.selfClosing) {
    return `<${node.tag}${attrs}/>`;
  }

  let html = `<${node.tag}${attrs}>`;
  for (const child of node.children) {
    if (child.type === IRType.TEXT) {
      html += escapeServerTemplateText(child.value);
    } else if (child.type === IRType.ELEMENT) {
      const nested = buildStaticServerHTML(child);
      if (nested === null) return null;
      html += nested;
    } else {
      // EXPRESSION, COMPONENT, FOR — can't inline statically
      return null;
    }
  }
  html += `</${node.tag}>`;
  return html;
}

// ─── Entry Point ───────────────────────────

/**
 * Generates the server-side expression for an IR tree.
 */
export function generateServer(ir: IRNode, ctx: CompileContext): t.Expression {
  return generateServerNode(ir, ctx);
}
