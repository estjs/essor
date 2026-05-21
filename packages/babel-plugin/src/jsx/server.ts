import { types as t } from '@babel/core';
import { HYDRATION_ANCHOR_ATTR } from '@estjs/shared';
import { type CompileContext, getCompileContext, registerDeclaration, useImport } from '../context';
import {
  type IRComponent,
  type IRElement,
  type IRFor,
  type IRNode,
  IRType,
  hasDynamicBoundary,
} from './ir';
import { serializeStaticAttrs } from './utils';
import { buildComponentInvocation, buildForCall, renderChildExpressions } from './shared';

const serverTextEscapeRE = /[&<>]/g;

interface SSRBindElementContext {
  tag?: string;
  type?: t.Expression | null;
}

interface ServerBindExpression {
  value: t.Expression;
  modifiers: t.Expression | null;
}

interface ServerElementOptions {
  prependAttrExprs?: t.Expression[];
}

function markSafeHtmlCall(expression: t.Expression): t.Expression {
  return t.callExpression(useImport('markAsRawHtml'), [expression]);
}

function isGeneratedServerHtmlCall(expression: t.CallExpression): boolean {
  const { importIdentifiers } = getCompileContext();
  const renderId = importIdentifiers.render;
  const componentId = importIdentifiers.createComponent;
  return (
    t.isIdentifier(expression.callee) &&
    (expression.callee.name === renderId.name || expression.callee.name === componentId.name)
  );
}

function visitServerHtmlSubexpressions<T extends t.Node | null | undefined>(node: T): T {
  if (!node) return node;

  if (t.isJSXElement(node) || t.isJSXFragment(node)) {
    return markSafeHtmlCall(node as unknown as t.Expression) as T;
  }

  if (t.isCallExpression(node) && isGeneratedServerHtmlCall(node)) {
    return markSafeHtmlCall(node) as T;
  }

  const keys = t.VISITOR_KEYS[node.type] ?? [];
  for (const key of keys) {
    const record = node as unknown as Record<string, unknown>;
    const value = record[key];
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const child = value[i];
        if (child && typeof child === 'object' && 'type' in child) {
          value[i] = visitServerHtmlSubexpressions(child as t.Node) as never;
        }
      }
    } else if (value && typeof value === 'object' && 'type' in value) {
      record[key] = visitServerHtmlSubexpressions(value as t.Node);
    }
  }

  return node;
}

function markServerHtmlSubexpressions(expression: t.Expression): t.Expression {
  return visitServerHtmlSubexpressions(expression);
}

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

function unwrapServerBindValue(value: t.Expression): ServerBindExpression {
  if (
    t.isArrayExpression(value) &&
    value.elements.length === 2 &&
    value.elements[0] != null &&
    !t.isSpreadElement(value.elements[0])
  ) {
    return {
      value: value.elements[0] as t.Expression,
      modifiers: value.elements[1] as t.Expression,
    };
  }
  return { value, modifiers: null };
}

function findBind(node: IRElement, name: string): ServerBindExpression | null {
  const bind = node.binds.find((entry) => entry.name === name);
  return bind ? unwrapServerBindValue(bind.value) : null;
}

function getStaticStringAttr(node: IRElement, name: string): string | null {
  const attr = node.staticAttrs.find((entry) => entry.name === name);
  return attr && typeof attr.value === 'string' ? attr.value : null;
}

function getDynamicAttrExpression(node: IRElement, name: string): t.Expression | null {
  return node.dynamicAttrs.find((entry) => entry.name === name)?.value ?? null;
}

function getAttrExpression(node: IRElement, name: string): t.Expression | null {
  const dynamic = getDynamicAttrExpression(node, name);
  if (dynamic) return t.cloneNode(dynamic, true);
  const staticValue = getStaticStringAttr(node, name);
  return staticValue == null ? null : t.stringLiteral(staticValue);
}

function getOptionValueExpression(node: IRElement): t.Expression | null {
  const attrValue = getAttrExpression(node, 'value');
  if (attrValue) return attrValue;
  const text = node.children.every((child) => child.type === IRType.TEXT)
    ? node.children.map((child) => (child.type === IRType.TEXT ? child.value : '')).join('')
    : '';
  return text ? t.stringLiteral(text) : null;
}

function createServerBindContextExpression(
  context: SSRBindElementContext,
): t.ObjectExpression | null {
  const props: t.ObjectProperty[] = [];
  if (context.tag) {
    props.push(t.objectProperty(t.identifier('tag'), t.stringLiteral(context.tag)));
  }
  if (context.type) {
    props.push(t.objectProperty(t.identifier('type'), context.type));
  }
  return props.length > 0 ? t.objectExpression(props) : null;
}

function getBindElementContext(node: IRElement): SSRBindElementContext {
  if (node.tag === 'input') {
    return {
      tag: 'input',
      type: getAttrExpression(node, 'type'),
    };
  }
  if (node.tag === 'select') return { tag: 'select' };
  if (node.tag === 'textarea') return { tag: 'textarea' };
  return {};
}

function createSSRBindExpression(
  node: IRElement,
  name: string,
  value: t.Expression,
  modifiers: t.Expression | null,
): t.Expression | null {
  if (name === 'value' && (node.tag === 'select' || node.tag === 'textarea')) {
    return null;
  }

  const ownValue = name === 'checked' ? getAttrExpression(node, 'value') : null;
  const context = createServerBindContextExpression(getBindElementContext(node));
  const args: t.Expression[] = [t.stringLiteral(name), t.cloneNode(value, true)];

  if (modifiers || ownValue || context) {
    args.push(modifiers ? t.cloneNode(modifiers, true) : t.identifier('undefined'));
  }
  if (ownValue || context) {
    args.push(ownValue ? t.cloneNode(ownValue, true) : t.identifier('undefined'));
  }
  if (context) {
    args.push(context);
  }

  return t.callExpression(useImport('ssrBind'), args);
}

function createSSRSelectedExpression(
  selectValue: t.Expression,
  optionValue: t.Expression,
): t.Expression {
  return t.callExpression(useImport('ssrSelected'), [
    t.cloneNode(selectValue, true),
    t.cloneNode(optionValue, true),
  ]);
}

// ─── Server Node Generation ────────────────

/**
 * Generates server node.
 */
function generateServerNode(
  node: IRNode,
  ctx: CompileContext,
  withHydrationKey = true,
): t.Expression {
  switch (node.type) {
    case IRType.TEXT:
      return t.stringLiteral(node.value);
    case IRType.EXPRESSION: {
      const expression = node.asRawChildren
        ? t.cloneNode(node.value, true)
        : markServerHtmlSubexpressions(t.cloneNode(node.value, true));
      const converter = node.asRawChildren ? 'toRawHtmlString' : 'toEscapedHtmlString';
      return t.callExpression(useImport(converter), [expression]);
    }
    case IRType.COMPONENT:
      return generateServerComponent(node, ctx);
    case IRType.FOR:
      return generateServerFor(node, ctx);
    case IRType.ELEMENT:
      return generateServerElement(node, ctx, withHydrationKey);
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
function generateServerElement(
  node: IRElement,
  ctx: CompileContext,
  withHydrationKey = true,
  staticIndex?: number,
  options: ServerElementOptions = {},
): t.Expression {
  const dynamicAttrExprs: t.Expression[] = [...(options.prependAttrExprs ?? [])];
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

  // bind:* — render initial value into HTML so the markup matches what the
  // client will eventually show after hydration. Unwraps the tuple form
  // `[signal, modifiers]` so modifiers like { trim } are honoured server-side.
  for (const bind of node.binds) {
    const { value, modifiers } = unwrapServerBindValue(bind.value);
    const expr = createSSRBindExpression(node, bind.name, value, modifiers);
    if (expr) dynamicAttrExprs.push(expr);
  }

  const templates: string[] = [];
  const expressions: t.Expression[] = [];
  const staticAttrs =
    staticIndex === undefined
      ? node.staticAttrs
      : [...node.staticAttrs, { name: HYDRATION_ANCHOR_ATTR, value: String(staticIndex) }];
  const attrs = serializeStaticAttrs(staticAttrs);
  const textareaValueBind = node.tag === 'textarea' ? findBind(node, 'value') : null;

  let currentStr = `<${node.tag}`;

  if (dynamicAttrExprs.length > 0) {
    for (const expr of dynamicAttrExprs) {
      templates.push(currentStr);
      currentStr = '';
      expressions.push(expr);
    }
  }

  const isSelfClosing = node.selfClosing && !textareaValueBind;
  currentStr += `${attrs}${isSelfClosing ? ' />' : '>'}`;

  if (!isSelfClosing) {
    if (textareaValueBind) {
      templates.push(currentStr);
      currentStr = '';
      const args: t.Expression[] = [t.cloneNode(textareaValueBind.value, true)];
      if (textareaValueBind.modifiers) {
        args.push(t.cloneNode(textareaValueBind.modifiers, true));
      }
      expressions.push(t.callExpression(useImport('ssrTextValue'), args));
    } else {
      let markerIndex = 0;
      let pendingAnchorIndex: number | undefined;
      const selectValueBind = node.tag === 'select' ? findBind(node, 'value') : null;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === IRType.TEXT) {
          currentStr += escapeServerTemplateText(child.value);
        } else if (
          child.type === IRType.EXPRESSION ||
          child.type === IRType.COMPONENT ||
          child.type === IRType.FOR
        ) {
          const marker = hasDynamicBoundary(node.children, i);
          const slotIndex = markerIndex++;
          templates.push(currentStr);
          currentStr = marker ? `<!--${slotIndex}-->` : '';
          if (!marker && node.children[i + 1]?.type === IRType.ELEMENT) {
            pendingAnchorIndex = slotIndex;
          }
          expressions.push(generateServerNode(child, ctx));
        } else if (child.type === IRType.ELEMENT) {
          const anchorIndex = pendingAnchorIndex;
          pendingAnchorIndex = undefined;
          if (selectValueBind && child.tag === 'option') {
            const optionValue = getOptionValueExpression(child);
            if (optionValue) {
              templates.push(currentStr);
              currentStr = '';
              expressions.push(
                generateServerElement(child, ctx, false, anchorIndex, {
                  prependAttrExprs: [
                    createSSRSelectedExpression(selectValueBind.value, optionValue),
                  ],
                }),
              );
              continue;
            }
          }
          const staticHTML = buildStaticServerHTML(child, anchorIndex);
          if (staticHTML !== null) {
            currentStr += staticHTML;
          } else {
            templates.push(currentStr);
            currentStr = '';
            expressions.push(generateServerElement(child, ctx, false, anchorIndex));
          }
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

  const renderImport = useImport('render');
  const hydrationKey = withHydrationKey
    ? t.callExpression(useImport('getHydrationKey'), [])
    : t.stringLiteral('');
  return t.callExpression(renderImport, [templateId, hydrationKey, ...expressions]);
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
function buildStaticServerHTML(node: IRElement, staticIndex?: number): string | null {
  if (node.binds.length > 0 || node.dynamicAttrs.length > 0 || node.spreads.length > 0) {
    return null;
  }

  const staticAttrs =
    staticIndex === undefined
      ? node.staticAttrs
      : [...node.staticAttrs, { name: HYDRATION_ANCHOR_ATTR, value: String(staticIndex) }];
  const attrs = serializeStaticAttrs(staticAttrs);
  if (node.selfClosing) {
    return `<${node.tag}${attrs} />`;
  }

  let html = `<${node.tag}${attrs}>`;
  for (const child of node.children) {
    if (child.type === IRType.TEXT) {
      html += escapeServerTemplateText(child.value);
    } else if (child.type === IRType.ELEMENT) {
      if (child.binds.length > 0) return null;
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
