import { isDelegatedEvent, isSVGTag, isSelfClosingTag, isString, startsWith } from '@estjs/shared';
import { type NodePath, types as t } from '@babel/core';
import { TRANSFORM_PROPERTY_NAME } from '../constants';
import { type CompileContext, addDelegatedEvent, useImport } from '../context';
import { createBindingSetter } from './emitters';
import {
  type DynamicAttr,
  getTagName,
  isComponentTag,
  normalizeEventName,
  parseAttributes,
  textTrim,
} from './utils';

// ─── Constants ─────────────────────────────

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

export interface IRStaticAttr {
  name: string;
  value: string | boolean;
}

export interface IRDynamicAttr {
  name: string;
  value: t.Expression;
  kind: 'static' | 'dynamic';
}

export interface IREvent {
  name: string;
  handler: t.Expression;
  delegated: boolean;
  loc?: t.SourceLocation | null;
}

export interface IRSpread {
  value: t.Expression;
  kind: 'static' | 'dynamic';
}

export interface IRRef {
  value: t.Expression;
  loc?: t.SourceLocation | null;
}

export interface IRBind {
  name: string;
  value: t.Expression;
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
  asRawChildren?: boolean;
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
    spreads: spreadAttrs.map((s) => ({ value: s.value, kind: s.effectKind })),
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

  return node;
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
  const { staticAttrs, dynamicAttrs, spreadAttrs } = parseAttributes(
    path as NodePath<t.JSXElement>,
  );

  const props: IRDynamicAttr[] = [];

  // Static attrs become static props
  for (const attr of staticAttrs) {
    props.push({
      name: attr.name,
      value: isString(attr.value) ? t.stringLiteral(attr.value) : t.booleanLiteral(attr.value),
      kind: 'static',
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
      });
    } else if (startsWith(attr.name, 'bind:')) {
      const binding = attr.name.slice('bind:'.length);
      // Two-way binding sugar on components: `bind:x={$v}` → two normal props,
      // `x={$v}` (the current value) + `update:x={(_v$) => $v = _v$}` (the
      // setter callback). Modifiers on the tuple form are dropped at the
      // component boundary — they belong to the DOM leaf, not the component
      // contract.
      let valueExpr = attr.value;
      if (
        t.isArrayExpression(attr.value) &&
        attr.value.elements.length === 2 &&
        attr.value.elements[0] != null &&
        !t.isSpreadElement(attr.value.elements[0])
      ) {
        valueExpr = attr.value.elements[0] as t.Expression;
      }
      props.push({
        name: binding,
        value: t.cloneNode(valueExpr),
        kind: attr.effectKind,
      });
      // The setter is a static arrow function — it captures the assignment
      // target by reference and never reads reactive state itself. Marking
      // it `static` keeps a single function identity across renders instead
      // of allocating a fresh closure on every prop access via a getter.
      props.push({
        name: `update:${binding}`,
        value: createBindingSetter(valueExpr),
        kind: 'static',
      });
    } else {
      props.push({
        name: attr.name,
        value: attr.value,
        kind: attr.effectKind,
      });
    }
  }

  return {
    type: IRType.COMPONENT,
    tag,
    props,
    spreads: spreadAttrs.map((s) => ({ value: s.value, kind: s.effectKind })),
    children: buildChildren(path as NodePath<t.JSXElement>, ctx),
    loc: path.node.loc,
  };
}

// ─── Attribute Processing (Element only) ───

/**
 * Routes a dynamic attribute into the correct IR bucket for an element.
 */
function applyDynamicAttr(node: IRElement, attr: DynamicAttr, ctx: CompileContext): void {
  const { name, value, effectKind, path } = attr;

  // Event: onXxx
  const eventName = normalizeEventName(name);
  if (eventName) {
    const delegated = !!(ctx.options.delegateEvents && isDelegatedEvent(eventName));
    node.events.push({
      name: eventName,
      handler: value,
      delegated,
      loc: path.node.loc,
    });
    if (delegated) {
      addDelegatedEvent(eventName);
    }
    return;
  }

  // ref
  if (name === 'ref') {
    node.ref = { value, loc: path.node.loc };
    return;
  }

  // bind:xxx
  if (startsWith(name, 'bind:')) {
    node.binds.push({
      name: name.slice('bind:'.length),
      value,
      loc: path.node.loc,
    });
    return;
  }

  // Regular dynamic attribute (class, style, or generic)
  node.dynamicAttrs.push({ name, value, kind: effectKind });
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

    // Static string/number → text node
    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      return {
        type: IRType.TEXT,
        value: String(expression.node.value),
        loc: node.loc,
      };
    }

    // Nested JSX
    if (expression.isJSXElement() || expression.isJSXFragment()) {
      return buildIR(expression as unknown as NodePath<JSXElement>, ctx);
    }

    const asRawChildren = isPropsChildrenExpression(expression);

    // Dynamic expression
    if (expression.isExpression()) {
      return {
        type: IRType.EXPRESSION,
        value: expression.node,
        asRawChildren,
        loc: node.loc,
      };
    }
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

function isPropsChildrenExpression(expression: NodePath<t.Expression>): boolean {
  const node = expression.node;
  // `props` transform currently uses scope.rename(name, "__props.children")`.
  // Babel stores that intermediate value as an Identifier and prints it as a
  // member expression later, so SSR raw-children detection must accept it here.
  if (t.isIdentifier(node) && node.name === `${TRANSFORM_PROPERTY_NAME}.children`) return true;

  if (!t.isMemberExpression(node) || !isChildrenProperty(node)) return false;
  if (!t.isIdentifier(node.object)) return false;
  if (node.object.name === TRANSFORM_PROPERTY_NAME) return true;

  const binding = expression.scope.getBinding(node.object.name);
  const bindingPath = binding?.path;
  if (!bindingPath?.isIdentifier()) return false;

  const owner = bindingPath.findParent(
    (candidate) =>
      candidate.isFunctionDeclaration() ||
      candidate.isFunctionExpression() ||
      candidate.isArrowFunctionExpression(),
  );

  if (!owner) return false;

  if (owner.isFunctionDeclaration() || owner.isFunctionExpression() || owner.isArrowFunctionExpression()) {
    const fn = owner.node;
    const parent = owner.parentPath;
    const componentName =
      t.isFunctionDeclaration(fn) && fn.id
        ? fn.id.name
        : parent?.isVariableDeclarator() && t.isIdentifier(parent.node.id)
          ? parent.node.id.name
          : parent?.isAssignmentExpression() && t.isIdentifier(parent.node.left)
            ? parent.node.left.name
            : '';

    return fn.params[0] === bindingPath.node && /^[A-Z]/.test(componentName);
  }

  return false;
}

function isChildrenProperty(expression: t.MemberExpression): boolean {
  return expression.computed
    ? t.isStringLiteral(expression.property, { value: 'children' })
    : t.isIdentifier(expression.property, { name: 'children' });
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
  if (!callback.isArrowFunctionExpression() && !callback.isFunctionExpression()) {
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
    if (!Array.isArray(valuePath) && valuePath.isJSXExpressionContainer()) {
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

/**
 * Resolves the JSX body returned by a `.map()` callback.
 */
function getForCallbackBody(
  callback: NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
): {
  path: NodePath<JSXElement>;
  prelude: t.Statement[];
} | null {
  const bodyPath = callback.get('body');
  if (Array.isArray(bodyPath)) return null;

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
      prelude.push(t.cloneNode(statement.node, true));
      continue;
    }

    const argument = statement.get('argument');
    if (Array.isArray(argument) || !argument.node) {
      prelude.push(t.cloneNode(statement.node, true));
      continue;
    }

    if (argument.isJSXElement() || argument.isJSXFragment()) {
      return { path: argument as NodePath<JSXElement>, prelude };
    }

    prelude.push(t.cloneNode(statement.node, true));
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
