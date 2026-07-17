import {
  isArray,
  isDelegatedEvent,
  isSVGTag,
  isSelfClosingTag,
  isString,
  startsWith,
} from '@estjs/shared';
import { type NodePath, types as t } from '@babel/core';
import { type CompileContext, addDelegatedEvent, useImport } from '../context';
import {
  type DynamicAttr,
  getTagName,
  isComponentTag,
  isFunctionLikeExpressionPath,
  normalizeEventName,
  parseAttributes,
  textTrim,
} from '../ast-utils';
import { createBindingSetter, unwrapBindTuple } from './emitters';
import { hasRawTextEndTag, isWholeTextTag } from './text-content';
import type { RenderMode } from '../options';

// ─── IR Types ──────────────────────────────

export enum IRType {
  ELEMENT,
  COMPONENT,
  TEXT,
  EXPRESSION,
  FOR,
}

export function hasDynamicBoundary(children: IRNode[], index: number): boolean {
  const prev = children[index - 1];
  const next = children[index + 1];
  const isText = (n: IRNode | undefined) => n?.type === IRType.TEXT;
  const isDynamic = (n: IRNode | undefined) =>
    n?.type === IRType.EXPRESSION || n?.type === IRType.COMPONENT || n?.type === IRType.FOR;
  return isText(prev) || isText(next) || isDynamic(prev) || isDynamic(next);
}

export type DynamicAnchorKind = 'comment' | 'element' | 'tail';

export function getDynamicAnchorKind(
  children: IRNode[],
  index: number,
  mode: RenderMode,
): DynamicAnchorKind {
  if (!hasDynamicBoundary(children, index)) {
    const next = children[index + 1];
    if ((mode === 'hydrate' || mode === 'server') && next?.type === IRType.ELEMENT) {
      return 'element';
    }
    if (!next) {
      return 'tail';
    }
  }
  return 'comment';
}

export interface IRStaticAttr {
  name: string;
  value: string | boolean;
}

export interface IRDynamicAttr {
  name: string;
  value: t.Expression;
  kind: 'static' | 'dynamic';
  /** Source position among the element's attributes. */
  order: number;
}

export interface IREvent {
  name: string;
  handler: t.Expression;
  delegated: boolean;
  /** Source position among the element's attributes. */
  order: number;
  loc?: t.SourceLocation | null;
}

export interface IRSpread {
  value: t.Expression;
  kind: 'static' | 'dynamic';
  /** Source position among the element's attributes. */
  order: number;
}

export interface IRRef {
  value: t.Expression;
  /** Source position among the element's attributes. */
  order: number;
  loc?: t.SourceLocation | null;
}

export interface IRBind {
  name: string;
  value: t.Expression;
  /** Source position among the element's attributes. */
  order: number;
  loc?: t.SourceLocation | null;
}

// ─── Node Types ────────────────────────────

export interface IRElement {
  type: IRType.ELEMENT;
  tag: string;
  isSVG: boolean;
  staticAttrs: IRStaticAttr[];
  dynamicAttrs: IRDynamicAttr[];
  events: IREvent[];
  spreads: IRSpread[];
  ref?: IRRef;
  binds: IRBind[];
  children: IRNode[];
  wholeTextParts?: IRWholeTextPart[];
  selfClosing: boolean;
  loc?: t.SourceLocation | null;
}

export interface IRComponent {
  type: IRType.COMPONENT;
  tag: string;
  props: IRDynamicAttr[];
  spreads: IRSpread[];
  children: IRNode[];
  loc?: t.SourceLocation | null;
}

export interface IRText {
  type: IRType.TEXT;
  value: string;
  loc?: t.SourceLocation | null;
}

export interface IRExpression {
  type: IRType.EXPRESSION;
  value: t.Expression;
  loc?: t.SourceLocation | null;
}

export interface IRFor {
  type: IRType.FOR;
  each: t.Expression;
  itemParam: t.Identifier | t.Pattern;
  indexParam?: t.Identifier | t.Pattern | null;
  bodyPrelude: t.Statement[];
  body: IRNode;
  key?: t.Expression | null;
  loc?: t.SourceLocation | null;
}

export type IRNode = IRElement | IRComponent | IRText | IRExpression | IRFor;
export type IRWholeTextPart = IRText | IRExpression;

export function getDynamicWholeTextParts(element: IRElement): IRWholeTextPart[] | undefined {
  const parts = element.wholeTextParts;
  return parts?.some((part) => part.type === IRType.EXPRESSION) ? parts : undefined;
}

/** Join the static text of a whole-text element's parts. */
export function getStaticWholeText(parts: IRWholeTextPart[]): string {
  let text = '';
  for (const part of parts) {
    if (part.type === IRType.TEXT) text += part.value;
  }
  return text;
}

// ─── JSX AST type aliases ──────────────────

export type JSXElement = t.JSXElement | t.JSXFragment;
export type JSXChild =
  | t.JSXElement
  | t.JSXFragment
  | t.JSXExpressionContainer
  | t.JSXSpreadChild
  | t.JSXText;

// ─── IR Construction ───────────────────────

/**
 * Builds the intermediate representation for a JSX subtree.
 */
export function buildIR(path: NodePath<t.JSXElement | t.JSXFragment>, ctx: CompileContext): IRNode {
  // Fragment handling — no runtime import needed; codegen emits a flat array.
  if (path.isJSXFragment()) {
    useImport('Fragment');
    return buildComponentIR('Fragment', path, ctx);
  }

  const tag = getTagName(path.node as t.JSXElement);

  if (isComponentTag(tag)) {
    return buildComponentIR(tag, path as NodePath<t.JSXElement>, ctx);
  }

  return buildElementIR(tag, path as NodePath<t.JSXElement>, ctx);
}

// ─── Element IR ────────────────────────────

/**
 * Builds element IR for a native JSX tag.
 */
function buildElementIR(tag: string, path: NodePath<t.JSXElement>, ctx: CompileContext): IRElement {
  const { staticAttrs, dynamicAttrs, spreadAttrs } = parseAttributes(path);

  const node: IRElement = {
    type: IRType.ELEMENT,
    tag,
    isSVG: isSVGTag(tag),
    staticAttrs,
    dynamicAttrs: [],
    events: [],
    spreads: spreadAttrs.map((s) => ({
      value: s.value,
      kind: s.effectKind,
      order: s.order,
    })),
    binds: [],
    children: [],
    selfClosing: isSelfClosingTag(tag),
    loc: path.node.loc,
  };

  // Process dynamic attributes
  for (const attr of dynamicAttrs) {
    applyDynamicAttr(node, attr, ctx);
  }

  // Process children
  if (!node.selfClosing) {
    node.children = buildChildren(path, ctx);
  }

  validateWholeTextElement(path, node);

  return node;
}

function validateWholeTextElement(path: NodePath<t.JSXElement>, node: IRElement): void {
  if (!isWholeTextTag(node.tag)) return;

  const parts: IRWholeTextPart[] = [];
  for (const child of node.children) {
    if (child.type !== IRType.TEXT && child.type !== IRType.EXPRESSION) {
      throw path.buildCodeFrameError(
        `Only text and primitive expressions are supported inside <${node.tag}>.`,
      );
    }
    parts.push(child);
  }

  const hasNestedJSX = parts.some((part) => {
    if (part.type !== IRType.EXPRESSION) return false;
    let found = false;
    t.traverseFast(part.value, (descendant) => {
      if (t.isJSXElement(descendant) || t.isJSXFragment(descendant)) {
        found = true;
        return t.traverseFast.stop;
      }
    });
    return found;
  });
  if (hasNestedJSX) {
    throw path.buildCodeFrameError(
      `Only text and primitive expressions are supported inside <${node.tag}>.`,
    );
  }

  node.wholeTextParts = parts;

  const staticText = parts
    .filter((part): part is IRText => part.type === IRType.TEXT)
    .map((part) => part.value)
    .join('');
  if (hasRawTextEndTag(node.tag, staticText)) {
    throw path.buildCodeFrameError(`Unsafe </${node.tag}> token in static <${node.tag}> text.`);
  }

  if (
    node.tag === 'textarea' &&
    parts.length > 0 &&
    node.binds.some((bind) => bind.name === 'value')
  ) {
    throw path.buildCodeFrameError(
      '<textarea> cannot combine bind:value with children because both write its text value.',
    );
  }

  if (node.tag === 'script' && parts.some((part) => part.type === IRType.EXPRESSION)) {
    throw path.buildCodeFrameError(
      'Dynamic <script> children are not supported because server execution and client template cloning cannot share a safe execution contract.',
    );
  }
}

// ─── Component IR ──────────────────────────

/**
 * Builds component IR for a component tag or fragment.
 */
function buildComponentIR(
  tag: string,
  path: NodePath<t.JSXElement | t.JSXFragment>,
  ctx: CompileContext,
): IRComponent {
  // Component props keep their ORIGINAL value type: `value={42}`
  // must reach the component as the number 42, not the attr string "42".
  const { staticAttrs, dynamicAttrs, spreadAttrs } = parseAttributes(
    path as NodePath<t.JSXElement>,
    { preserveValueTypes: true },
  );

  const props: IRDynamicAttr[] = [];

  // Static attrs become static props
  for (const attr of staticAttrs) {
    props.push({
      name: attr.name,
      value: isString(attr.value) ? t.stringLiteral(attr.value) : t.booleanLiteral(attr.value),
      kind: 'static',
      order: attr.order,
    });
  }

  // Dynamic attrs become props (events on components are just props)
  for (const attr of dynamicAttrs) {
    const eventName = normalizeEventName(attr.name);
    if (eventName) {
      // onXxx on component → prop
      props.push({
        name: attr.name,
        value: attr.value,
        kind: attr.effectKind,
        order: attr.order,
      });
    } else if (startsWith(attr.name, 'bind:')) {
      const binding = attr.name.slice('bind:'.length);
      // Two-way binding sugar on components: `bind:x={$v}` → two normal props,
      // `x={$v}` (the current value) + `update:x={(_v$) => $v = _v$}` (the
      // setter callback). Modifiers on the tuple form are dropped at the
      // component boundary — they belong to the DOM leaf, not the component
      // contract. The shared unwrap still validates modifier keys.
      const { value: valueExpr } = unwrapBindTuple(attr.value, binding);
      props.push({
        name: binding,
        value: t.cloneNode(valueExpr),
        kind: attr.effectKind,
        order: attr.order,
      });
      // The setter is a static arrow function — it captures the assignment
      // target by reference and never reads reactive state itself. Marking
      // it `static` keeps a single function identity across renders instead
      // of allocating a fresh closure on every prop access via a getter.
      props.push({
        name: `update:${binding}`,
        value: createBindingSetter(valueExpr, binding),
        kind: 'static',
        order: attr.order,
      });
    } else {
      props.push({
        name: attr.name,
        value: attr.value,
        kind: attr.effectKind,
        order: attr.order,
      });
    }
  }

  return {
    type: IRType.COMPONENT,
    tag,
    props,
    spreads: spreadAttrs.map((s) => ({
      value: s.value,
      kind: s.effectKind,
      order: s.order,
    })),
    children: buildChildren(path as NodePath<t.JSXElement>, ctx),
    loc: path.node.loc,
  };
}

// ─── Attribute Processing (Element only) ───

/**
 * Routes a dynamic attribute into the correct IR bucket for an element.
 */
function applyDynamicAttr(node: IRElement, attr: DynamicAttr, ctx: CompileContext): void {
  const { name, value, effectKind, path, order } = attr;

  // Event: onXxx
  const eventName = normalizeEventName(name);
  if (eventName) {
    const delegated = !!(ctx.options.delegateEvents && isDelegatedEvent(eventName));
    node.events.push({
      name: eventName,
      handler: value,
      delegated,
      order,
      loc: path.node.loc,
    });
    if (delegated) {
      addDelegatedEvent(eventName);
    }
    return;
  }

  // ref
  if (name === 'ref') {
    node.ref = { value, order, loc: path.node.loc };
    return;
  }

  // bind:xxx
  if (startsWith(name, 'bind:')) {
    node.binds.push({
      name: name.slice('bind:'.length),
      value,
      order,
      loc: path.node.loc,
    });
    return;
  }

  // Regular dynamic attribute (class, style, or generic). Keep the source
  // order so codegen can emit operations in author order.
  node.dynamicAttrs.push({ name, value, kind: effectKind, order });
}

// ─── Children Processing ───────────────────

/**
 * Builds IR children for a JSX element or fragment.
 */
function buildChildren(path: NodePath<JSXElement>, ctx: CompileContext): IRNode[] {
  const children = path.node.children as JSXChild[];
  if (!children.length) return [];

  const optimized = optimizeChildNodes(path.get('children'));
  const result: IRNode[] = [];

  for (const child of optimized) {
    const ir = processChild(child, ctx);
    if (ir) result.push(ir);
  }

  return result;
}

/**
 * Converts a single JSX child node into IR.
 */
function processChild(child: NodePath<JSXChild>, ctx: CompileContext): IRNode | null {
  const node = child.node;

  if (t.isJSXElement(node) || t.isJSXFragment(node)) {
    return buildIR(child as NodePath<JSXElement>, ctx);
  }

  if (t.isJSXExpressionContainer(node)) {
    const expression = child.get('expression') as NodePath<t.Expression>;

    if (expression.isJSXEmptyExpression()) return null;

    const forIR = buildForIR(expression, ctx);
    if (forIR) return forIR;

    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      return {
        type: IRType.TEXT,
        value: String(expression.node.value),
        loc: node.loc,
      };
    }

    if (expression.isJSXElement() || expression.isJSXFragment()) {
      return buildIR(expression as unknown as NodePath<JSXElement>, ctx);
    }

    if (!expression.isExpression()) return null;

    return {
      type: IRType.EXPRESSION,
      value: expression.node,
      loc: node.loc,
    };
  }

  if (t.isJSXText(node)) {
    const text = textTrim(node);
    if (!text) return null;
    return { type: IRType.TEXT, value: text, loc: node.loc };
  }

  if (t.isJSXSpreadChild(node)) {
    return {
      type: IRType.EXPRESSION,
      value: node.expression,
      loc: node.loc,
    };
  }

  return null;
}

/**
 * Detects `.map()` expressions and lowers them into `IRFor`.
 */
function buildForIR(expression: NodePath<t.Expression>, ctx: CompileContext): IRFor | null {
  if (!expression.isCallExpression()) {
    return null;
  }

  const callee = expression.get('callee');
  if (!callee.isMemberExpression()) return null;

  const property = callee.get('property');
  if (!property.isIdentifier({ name: 'map' })) return null;

  const args = expression.get('arguments');
  if (args.length !== 1) return null;

  const callback = args[0];
  if (!isFunctionLikeExpressionPath(callback)) {
    return null;
  }

  const itemParam = callback.node.params[0];
  if (!itemParam || (!t.isIdentifier(itemParam) && !t.isPattern(itemParam))) {
    return null;
  }

  const indexParam = callback.node.params[1];
  if (indexParam && !t.isIdentifier(indexParam) && !t.isPattern(indexParam)) {
    return null;
  }

  const callbackBody = getForCallbackBody(
    callback as NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  );
  if (!callbackBody) return null;

  const key = extractKeyExpression(callbackBody.path);

  return {
    type: IRType.FOR,
    each: callee.node.object as t.Expression,
    itemParam,
    indexParam: indexParam ?? null,
    bodyPrelude: callbackBody.prelude,
    body: buildIR(callbackBody.path, ctx),
    key,
    loc: expression.node.loc,
  };
}

/**
 * Extracts key expression.
 */
function extractKeyExpression(path: NodePath<JSXElement>): t.Expression | null {
  if (path.isJSXFragment()) return extractFragmentKeyExpression(path);
  if (!path.isJSXElement()) return null;

  for (const attrPath of path.get('openingElement.attributes')) {
    if (!attrPath.isJSXAttribute()) continue;
    if (!t.isJSXIdentifier(attrPath.node.name, { name: 'key' })) continue;

    const value = attrPath.node.value;

    if (!value) {
      attrPath.remove();
      return t.booleanLiteral(true);
    }
    if (t.isStringLiteral(value)) {
      attrPath.remove();
      return t.stringLiteral(value.value);
    }
    const valuePath = attrPath.get('value');
    if (!isArray(valuePath) && valuePath.isJSXExpressionContainer()) {
      const expressionPath = valuePath.get('expression');
      attrPath.remove();
      if (expressionPath.isJSXEmptyExpression()) return null;
      return expressionPath.node as t.Expression;
    }
    attrPath.remove();
    return null;
  }

  return null;
}

function extractFragmentKeyExpression(path: NodePath<t.JSXFragment>): t.Expression | null {
  const children = (path.get('children') as NodePath<JSXChild>[]).filter(isValidChild);
  if (children.length !== 1) return null;

  const child = children[0];
  if (!child.isJSXElement() && !child.isJSXFragment()) return null;
  return extractKeyExpression(child as NodePath<JSXElement>);
}

/**
 * Resolves the JSX body returned by a `.map()` callback.
 *
 * Prelude statements are kept as live AST node references — `buildForCallbackBody`
 * clones them at emit time, so an extra clone here would be wasted.
 */
function getForCallbackBody(callback: NodePath<t.ArrowFunctionExpression | t.FunctionExpression>): {
  path: NodePath<JSXElement>;
  prelude: t.Statement[];
} | null {
  const bodyPath = callback.get('body');
  if (isArray(bodyPath)) return null;

  if (bodyPath.isJSXElement() || bodyPath.isJSXFragment()) {
    return {
      path: bodyPath as NodePath<JSXElement>,
      prelude: [],
    };
  }

  if (!bodyPath.isBlockStatement()) {
    return null;
  }

  const prelude: t.Statement[] = [];
  for (const statement of bodyPath.get('body')) {
    if (!statement.isReturnStatement()) {
      prelude.push(statement.node);
      continue;
    }

    const argument = statement.get('argument');
    if (isArray(argument) || !argument.node) {
      prelude.push(statement.node);
      continue;
    }

    if (argument.isJSXElement() || argument.isJSXFragment()) {
      return { path: argument as NodePath<JSXElement>, prelude };
    }

    prelude.push(statement.node);
  }

  return null;
}

// ─── Child Optimization ────────────────────

/**
 * Merges adjacent static children before IR generation.
 */
export function optimizeChildNodes(children: NodePath<JSXChild>[]): NodePath<JSXChild>[] {
  const result: NodePath<JSXChild>[] = [];

  for (const child of children) {
    if (!isValidChild(child)) continue;

    const last = result[result.length - 1];

    if (last && (last.isJSXText() || isStaticExpression(last))) {
      if (child.isJSXText() || isStaticExpression(child)) {
        const lastText = getRawNodeText(last);
        const curText = getRawNodeText(child);
        setNodeText(last, lastText + curText);
        continue;
      }
    }

    result.push(child);
  }

  return result;
}

/**
 * Checks whether a JSX child is a static text-like expression.
 */
function isStaticExpression(path: NodePath<JSXChild>): boolean {
  if (!path.isJSXExpressionContainer()) return false;
  const expr = path.get('expression');
  return expr.isStringLiteral() || expr.isNumericLiteral();
}

/**
 * Checks whether a JSX child should produce output.
 */
export function isValidChild(path: NodePath<JSXChild>): boolean {
  if (t.isJSXText(path.node)) {
    return textTrim(path.node) !== '';
  }
  return true;
}

/**
 * Returns the raw text content represented by a JSX child.
 */
export function getRawNodeText(path: NodePath<JSXChild>): string {
  if (path.isJSXText()) return path.node.value || '';
  if (path.isJSXExpressionContainer()) {
    const expression = path.get('expression');
    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      return String(expression.node.value);
    }
  }
  return '';
}

/**
 * Rewrites the text content stored in a JSX child node.
 */
export function setNodeText(path: NodePath<JSXChild>, text: string): void {
  if (path.isJSXText()) {
    path.node.value = text;
  } else if (path.isJSXExpressionContainer()) {
    const expression = path.get('expression');
    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      expression.replaceWith(t.stringLiteral(text));
    }
  }
}
