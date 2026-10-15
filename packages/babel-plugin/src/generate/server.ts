/**
 * Server (SSR) code generation.
 *
 * Every native element tree is serialized into one string-template array and
 * rendered with `ssr(template, hydrationKey, ...values)`. Dynamic children are
 * bracketed by `<!--$-->…<!--/-->` so hydration can claim the same ranges.
 */
import * as t from '@babel/types';
import {
  HYDRATION_ANCHOR_ATTR,
  HYDRATION_RANGE_START_PREFIX,
  isSelfClosingTag,
} from '@estjs/shared';
import { unwrapBindTuple } from '../shared/bind';
import { escapeWholeText, isWholeTextTag, serializeStaticWholeText } from '../shared/text';
import { parseJSX } from '../parse';
import {
  TEXT_ONLY_TAGS,
  componentReference,
  propKey,
  serializeStaticAttrs,
  winningAttr,
} from './shared';
import type {
  CompileContext,
  IRBind,
  IRDynamicProp,
  IRElement,
  IRNode,
  IRSpread,
  IRStaticProp,
} from '../types';

const RAW_TEXT_TAGS = new Set(['script', 'style']);

/** Accumulates template string parts and interleaved runtime values. */
interface Buffer {
  parts: string[];
  values: t.Expression[];
  current: string;
}

/** Per-root state shared while serializing one element tree. */
interface RenderState {
  ctx: CompileContext;
  buffer: Buffer;
  /** Identifier holding the enclosing `<select bind:value>` value, if any. */
  selectValue: t.Expression | null;
  /** Set once a select binding needs the value captured in an IIFE. */
  captured: Array<{ id: t.Identifier; value: t.Expression }>;
  /** Index of the dynamic slot anchored to the next element sibling. */
  pendingAnchorIndex?: number;
}

export function generateServer(ir: IRNode, ctx: CompileContext): t.Expression {
  switch (ir.type) {
    case 'element':
      return ir.isComponent ? generateServerComponent(ir, ctx) : generateServerElement(ir, ctx);
    case 'fragment':
      if (ir.children.length === 1) return generateServer(ir.children[0], ctx);
      return t.arrayExpression(ir.children.map((child) => generateServer(child, ctx)));
    case 'text':
      return t.stringLiteral(ir.value);
    case 'expression':
      return ir.node;
  }
}

// ===== Elements =====

function generateServerElement(
  ir: IRElement,
  ctx: CompileContext,
  withHydrationKey = true,
  staticIndex?: number,
  options: { selectValue?: t.Identifier | t.Expression | null } = {},
): t.Expression {
  const state: RenderState = {
    ctx,
    buffer: { parts: [], values: [], current: '' },
    selectValue: options.selectValue ?? null,
    captured: [],
    pendingAnchorIndex: staticIndex,
  };
  appendElement(ir, state);
  state.buffer.parts.push(state.buffer.current);

  const templateId = t.identifier(ctx.templates.add(state.buffer.parts));
  const ssr = ctx.imports.get('ssr');
  const hydrationKey = withHydrationKey
    ? t.callExpression(ctx.imports.get('getHydrationKey'), [])
    : t.stringLiteral('');

  if (state.captured.length === 0) {
    return t.callExpression(ssr, [templateId, hydrationKey, ...state.buffer.values]);
  }

  // Values read more than once (select binding) are evaluated exactly once,
  // after the hydration key, preserving evaluation order.
  const keyId = ctx.uids.generate('hydrationKey');
  return t.callExpression(
    t.arrowFunctionExpression(
      [keyId, ...state.captured.map((c) => c.id)],
      t.callExpression(ssr, [templateId, t.cloneNode(keyId), ...state.buffer.values]),
    ),
    [hydrationKey, ...state.captured.map((c) => c.value)],
  );
}

function pushValue(buffer: Buffer, value: t.Expression): void {
  buffer.parts.push(buffer.current);
  buffer.current = '';
  buffer.values.push(value);
}

function appendElement(node: IRElement, state: RenderState): void {
  const { ctx, buffer } = state;
  const selectBind =
    node.tag === 'select' ? node.props.binds.find((b) => b.name === 'value') : undefined;
  const textareaBind =
    node.tag === 'textarea' ? node.props.binds.find((b) => b.name === 'value') : undefined;
  const boundNames = new Set(node.props.binds.map((b) => b.name));
  const inSelectedOption = node.tag === 'option' && state.selectValue !== null;

  // Cache unwrapped bind tuples to avoid redundant calls
  const selectBindTuple = selectBind ? unwrapBindTuple(selectBind.value, 'value') : null;
  const textareaBindTuple = textareaBind ? unwrapBindTuple(textareaBind.value, 'value') : null;

  buffer.current += `<${node.tag}`;

  const attrOperations: Array<
    | { kind: 'attr'; order: number; prop: IRDynamicProp }
    | { kind: 'spread'; order: number; spread: IRSpread }
    | { kind: 'bind'; order: number; bind: IRBind }
  > = [
    ...node.props.dynamic.map((p) => ({ kind: 'attr' as const, order: p.order, prop: p })),
    ...node.props.spreads.map((s) => ({ kind: 'spread' as const, order: s.order, spread: s })),
    ...node.props.binds.map((b) => ({ kind: 'bind' as const, order: b.order, bind: b })),
  ].sort((a, b) => a.order - b.order);

  for (const op of attrOperations) {
    if (op.kind === 'attr') {
      const prop = op.prop;
      if (prop.isOverridden) continue;
      if (prop.name === 'textContent') continue;
      if (node.tag === 'textarea' && prop.name === 'value') continue;
      if (inSelectedOption && prop.name === 'selected') continue;
      if (boundNames.has(prop.name) && (prop.name === 'value' || prop.name === 'checked')) continue;

      if (prop.name === 'class' || prop.name === 'className') {
        pushValue(buffer, t.callExpression(ctx.imports.get('ssrClass'), [prop.value]));
      } else if (prop.name === 'style') {
        pushValue(buffer, t.callExpression(ctx.imports.get('ssrStyle'), [prop.value]));
      } else {
        pushValue(
          buffer,
          t.callExpression(ctx.imports.get('ssrAttr'), [t.stringLiteral(prop.name), prop.value]),
        );
      }
    } else if (op.kind === 'spread') {
      pushValue(buffer, t.callExpression(ctx.imports.get('ssrSpread'), [op.spread.value]));
    } else {
      if (op.bind === selectBind || op.bind === textareaBind) continue;
      pushValue(buffer, serverBind(node, op.bind, ctx));
    }
  }

  if (inSelectedOption) {
    const optionValue = optionValueExpression(node);
    if (optionValue) {
      pushValue(
        buffer,
        t.callExpression(ctx.imports.get('ssrSelected'), [
          t.cloneNode(state.selectValue!),
          optionValue,
        ]),
      );
    }
  }

  buffer.current += serializeStaticAttrs(node.props.static, (name) => {
    if (name === 'textContent') return true;
    if (inSelectedOption && name === 'selected') return true;
    // A bind owns the rendered value/checked state.
    return boundNames.has(name) && (name === 'value' || name === 'checked');
  });

  if (state.pendingAnchorIndex !== undefined) {
    buffer.current += ` data-hk-idx="${state.pendingAnchorIndex}"`;
    state.pendingAnchorIndex = undefined;
  }

  const textContent = node.props.dynamic.find((p) => p.name === 'textContent' && !p.isOverridden);
  if (isSelfClosingTag(node.tag) && !textContent) {
    buffer.current += ' />';
    return;
  }
  buffer.current += '>';

  if (TEXT_ONLY_TAGS.has(node.tag) && node.children.some((c) => c.type === 'expression')) {
    const values = node.children.map((child) => {
      if (child.type === 'text') {
        return t.stringLiteral(child.value);
      } else if (child.type === 'expression') {
        return t.cloneNode(child.node, true);
      }
      return t.stringLiteral('');
    });
    pushValue(
      buffer,
      t.callExpression(ctx.imports.get('ssrTextContent'), [
        t.stringLiteral(node.tag),
        t.arrayExpression(values),
      ]),
    );
  } else if (textContent) {
    pushValue(
      buffer,
      t.callExpression(ctx.imports.get('ssrTextContentValue'), [textContent.value]),
    );
  } else if (
    textareaBind ||
    (node.tag === 'textarea' && node.props.dynamic.some((p) => p.name === 'value'))
  ) {
    const value = textareaBindTuple
      ? textareaBindTuple.value
      : node.props.dynamic.find((p) => p.name === 'value')!.value;
    pushValue(
      buffer,
      t.callExpression(ctx.imports.get('ssrTextValue'), [t.cloneNode(value, true)]),
    );
  } else if (selectBind) {
    const id = ctx.uids.generate('bindValue');
    state.captured.push({
      id,
      value: t.cloneNode(selectBindTuple!.value, true),
    });
    const outer = state.selectValue;
    state.selectValue = id;
    appendChildren(node, state);
    state.selectValue = outer;
  } else {
    appendChildren(node, state);
  }

  buffer.current += `</${node.tag}>`;
}

function hydrationRangeStart(kind: 'comment' | 'element' | 'tail', slotIndex: number): string {
  const boundaryCode = kind === 'comment' ? 'c' : kind === 'element' ? 'e' : 't';
  return `<!--${HYDRATION_RANGE_START_PREFIX}:${boundaryCode}:${slotIndex}-->`;
}

function hasDynamicBoundary(children: IRNode[], index: number): boolean {
  const prev = children[index - 1];
  const next = children[index + 1];
  const isText = (n: IRNode | undefined) => n?.type === 'text';
  const isDynamic = (n: IRNode | undefined) =>
    n?.type === 'expression' || (n?.type === 'element' && n.isComponent);
  return isText(prev) || isText(next) || isDynamic(prev) || isDynamic(next);
}

function getDynamicAnchorKind(
  children: IRNode[],
  index: number,
  mode: 'client' | 'hydrate' | 'server',
): 'comment' | 'element' | 'tail' {
  if (!hasDynamicBoundary(children, index)) {
    const next = children[index + 1];
    if (
      (mode === 'hydrate' || mode === 'server') &&
      next?.type === 'element' &&
      !next.isComponent
    ) {
      return 'element';
    }
    if (!next) {
      return 'tail';
    }
  }
  return 'comment';
}

function appendChildren(node: IRElement, state: RenderState): void {
  const { ctx, buffer } = state;
  const raw = RAW_TEXT_TAGS.has(node.tag);
  let markerIndex = 0;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === 'text') {
      buffer.current += isWholeTextTag(node.tag)
        ? serializeStaticWholeText(node.tag, child.value)
        : raw
          ? child.value
          : escapeWholeText(child.value);
    } else if (child.type === 'expression') {
      const anchorKind = getDynamicAnchorKind(node.children, i, 'server');
      const slotIndex = markerIndex++;
      buffer.current += hydrationRangeStart(anchorKind, slotIndex);
      if (anchorKind === 'element') {
        state.pendingAnchorIndex = slotIndex;
      }
      pushValue(buffer, serverExpression(child.node, ctx));
      buffer.current = anchorKind === 'comment' ? `<!--${slotIndex}-->` : '';
    } else if (child.type === 'element') {
      if (child.isComponent) {
        const anchorKind = getDynamicAnchorKind(node.children, i, 'server');
        const slotIndex = markerIndex++;
        buffer.current += hydrationRangeStart(anchorKind, slotIndex);
        if (anchorKind === 'element') {
          state.pendingAnchorIndex = slotIndex;
        }
        pushValue(buffer, generateServerComponent(child, ctx));
        buffer.current = anchorKind === 'comment' ? `<!--${slotIndex}-->` : '';
      } else {
        const anchorIndex = state.pendingAnchorIndex;
        state.pendingAnchorIndex = undefined;
        const staticHTML =
          state.selectValue !== null && child.tag === 'option'
            ? null
            : buildStaticServerHTML(child, anchorIndex);
        if (staticHTML !== null) {
          buffer.current += staticHTML;
        } else {
          pushValue(
            buffer,
            generateServerElement(child, ctx, false, anchorIndex, {
              selectValue: state.selectValue,
            }),
          );
        }
      }
    } else if (child.type === 'fragment') {
      for (const inner of child.children) appendChildren({ ...node, children: [inner] }, state);
    }
  }
}

function buildStaticServerHTML(node: IRElement, staticIndex?: number): string | null {
  const { props, children } = node;

  if (
    props.binds.length > 0 ||
    props.dynamic.length > 0 ||
    props.spreads.length > 0 ||
    node.isComponent
  ) {
    return null;
  }

  const staticAttrs: IRStaticProp[] =
    staticIndex === undefined
      ? props.static
      : [
          ...props.static,
          {
            name: HYDRATION_ANCHOR_ATTR,
            value: t.stringLiteral(String(staticIndex)),
            order: 9999,
          },
        ];

  const attrs = serializeStaticAttrs(staticAttrs);
  if (isSelfClosingTag(node.tag)) {
    return `<${node.tag}${attrs} />`;
  }

  let html = `<${node.tag}${attrs}>`;
  if (isWholeTextTag(node.tag)) {
    if (children.some((c) => c.type !== 'text')) return null;
    const text = children.map((c) => (c.type === 'text' ? c.value : '')).join('');
    return `${html}${serializeStaticWholeText(node.tag, text)}</${node.tag}>`;
  }

  for (const child of children) {
    if (child.type === 'text') {
      html += escapeWholeText(child.value);
    } else if (child.type === 'element') {
      if (child.isComponent || child.props.binds.length > 0) return null;
      const nested = buildStaticServerHTML(child);
      if (nested === null) return null;
      html += nested;
    } else {
      return null;
    }
  }
  html += `</${node.tag}>`;
  return html;
}

function compileForCallback(callback: t.Expression, ctx: CompileContext): t.Expression {
  if (t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback)) {
    const body = callback.body;
    if (t.isJSXElement(body) || t.isJSXFragment(body)) {
      const innerIR = parseJSX(body, ctx, false);
      const inlined = generateServer(innerIR, ctx);
      return t.isArrowFunctionExpression(callback)
        ? t.arrowFunctionExpression(callback.params, inlined)
        : t.functionExpression(
            callback.id,
            callback.params,
            t.blockStatement([t.returnStatement(inlined)]),
            callback.generator,
            callback.async,
          );
    } else if (t.isBlockStatement(body)) {
      const prelude: t.Statement[] = [];
      let returnJSX: t.JSXElement | t.JSXFragment | null = null;
      for (const stmt of body.body) {
        if (
          t.isReturnStatement(stmt) &&
          stmt.argument &&
          (t.isJSXElement(stmt.argument) || t.isJSXFragment(stmt.argument))
        ) {
          returnJSX = stmt.argument as t.JSXElement | t.JSXFragment;
          break;
        } else {
          prelude.push(stmt);
        }
      }
      if (returnJSX) {
        const innerIR = parseJSX(returnJSX, ctx, false);
        const inlined = generateServer(innerIR, ctx);
        const blockBody = t.blockStatement([...prelude, t.returnStatement(inlined)]);
        return t.isArrowFunctionExpression(callback)
          ? t.arrowFunctionExpression(callback.params, blockBody)
          : t.functionExpression(
              callback.id,
              callback.params,
              blockBody,
              callback.generator,
              callback.async,
            );
      }
    }
  }
  return callback;
}

/**
 * Dynamic child values are escaped by `escape()` at runtime. `cond && <jsx/>`
 * is left as is: its right side is already a compiled SSR node and a falsy
 * left side renders nothing through the slot anyway.
 */
function serverExpression(expr: t.Expression, ctx: CompileContext): t.Expression {
  if (
    t.isLogicalExpression(expr) &&
    expr.operator === '&&' &&
    (t.isJSXElement(expr.right) || t.isJSXFragment(expr.right))
  ) {
    return expr;
  }
  return t.callExpression(ctx.imports.get('escape'), [expr]);
}

// ===== Binds =====

function bindContext(node: IRElement): t.ObjectExpression | null {
  if (node.tag !== 'input') return null;
  const props = [t.objectProperty(t.identifier('tag'), t.stringLiteral('input'))];
  const type = winningAttr(node, 'type');
  if (type) props.push(t.objectProperty(t.identifier('type'), type));
  return t.objectExpression(props);
}

function serverBind(node: IRElement, bind: IRBind, ctx: CompileContext): t.Expression {
  const { value, modifiers } = unwrapBindTuple(bind.value, bind.name);
  const args: t.Expression[] = [t.stringLiteral(bind.name), t.cloneNode(value, true)];
  const ownValue = bind.name === 'checked' ? winningAttr(node, 'value') : null;
  const context = bindContext(node);

  if (modifiers || ownValue || context) {
    args.push(modifiers ? t.cloneNode(modifiers, true) : t.identifier('undefined'));
  }
  if (ownValue || context) args.push(ownValue ?? t.identifier('undefined'));
  if (context) args.push(context);
  return t.callExpression(ctx.imports.get('ssrBind'), args);
}

/** `<option value>` or, lacking one, its static text content. */
function optionValueExpression(node: IRElement): t.Expression | null {
  const attr = winningAttr(node, 'value');
  if (attr) return attr;
  if (node.children.every((child) => child.type === 'text')) {
    return t.stringLiteral(
      node.children.map((child) => (child.type === 'text' ? child.value : '')).join(''),
    );
  }
  return null;
}

function componentChildren(ir: IRElement, ctx: CompileContext): t.Expression | null {
  if (ir.children.length === 0) return null;
  const isFor = ir.importName === 'For' || ir.tag === 'For';

  if (isFor) {
    const values = ir.children.map((child) => {
      if (child.type === 'expression') {
        return compileForCallback(child.node, ctx);
      }
      return generateServer(child, ctx);
    });
    return values.length === 1 ? values[0] : t.arrayExpression(values);
  }

  const rendered = ir.children.map((child) => {
    const expr = generateServer(child, ctx);
    if (child.type === 'element' || child.type === 'fragment') {
      return t.arrowFunctionExpression([], expr);
    }
    return expr;
  });
  return t.arrayExpression(rendered);
}

function generateServerComponent(ir: IRElement, ctx: CompileContext): t.Expression {
  const segments: t.Expression[] = [];
  let current: (t.ObjectProperty | t.ObjectMethod)[] = [];

  // For components need key extracted separately
  const isFor = ir.importName === 'For' || ir.tag === 'For';
  let keyProp: { spread: false; prop: IRStaticProp | IRDynamicProp } | undefined;

  const items = [
    ...ir.props.static.map((prop) => ({ spread: false as const, prop })),
    ...ir.props.dynamic.map((prop) => ({ spread: false as const, prop })),
    ...ir.props.spreads.map((prop) => ({ spread: true as const, prop })),
  ].sort((a, b) => a.prop.order - b.prop.order);

  for (const item of items) {
    if (item.spread) {
      if (current.length > 0) segments.push(t.objectExpression(current));
      current = [];
      segments.push(item.prop.value);
    } else {
      if (isFor && item.prop.name === 'key') {
        keyProp = item;
      } else if (isFor && item.prop.name === 'each') {
        current.push(
          t.objectMethod(
            'get',
            t.identifier('each'),
            [],
            t.blockStatement([t.returnStatement(item.prop.value)]),
          ),
        );
      } else {
        const key = isFor ? propKey(item.prop.name) : t.stringLiteral(item.prop.name);
        current.push(t.objectProperty(key, item.prop.value));
      }
    }
  }

  const children = componentChildren(ir, ctx);
  if (children) {
    const childrenKey = isFor ? t.identifier('children') : t.stringLiteral('children');
    current.push(t.objectProperty(childrenKey, children));
  }

  // Add key after children for For components
  if (keyProp) {
    current.push(t.objectProperty(t.identifier('key'), keyProp.prop.value));
  }

  if (current.length > 0 || segments.length === 0) segments.push(t.objectExpression(current));

  const props =
    segments.length === 1 && t.isObjectExpression(segments[0])
      ? segments[0]
      : t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('assign')), [
          t.objectExpression([]),
          ...segments,
        ]);

  const ssrComponent = ctx.imports.get('ssrComponent');
  const component = componentReference(ir, ctx);
  return t.callExpression(ssrComponent, [component, props]);
}
