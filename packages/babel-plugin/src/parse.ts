/**
 * Parse - JSX to IR conversion
 *
 * Produces a flat, normalized IR:
 *  - fragments nested inside elements are flattened into their parent
 *  - adjacent text (including folded compile-time constants) is merged
 *  - `For` (and server-side builtins) are ordinary components that reference
 *    an imported runtime name, unless shadowed by a local binding
 */
import * as t from '@babel/types';
import {
  isArray,
  isBigint,
  isBoolean,
  isDelegatedEvent,
  isHTMLTag,
  isNull,
  isNumber,
  isObject,
  isOn,
  isPlainObject,
  isPrimitive,
  isSVGTag,
  isString,
  startsWith,
} from '@estjs/shared';
import { getJSXText } from './utils/text';
import { containsJSX, hasRawTextEndTag, isWholeTextTag } from './shared/text';
import {
  CANNOT_EVALUATE,
  SERVER_BUILTINS,
  UNIVERSAL_BUILTINS,
  evaluateConstant,
} from './constants';
import { styleToString } from './utils/style';
import { createBindingSetter, unwrapBindTuple } from './shared/bind';
import { CompileErrors } from './utils/errors';
import type {
  CompileContext,
  IRDynamicProp,
  IRElement,
  IRExpression,
  IRNode,
  IRProps,
  IRStaticProp,
} from './types';
import type { NodePath } from '@babel/traverse';

type JSXChild =
  t.JSXElement | t.JSXFragment | t.JSXText | t.JSXExpressionContainer | t.JSXSpreadChild;

interface ParseState {
  ctx: CompileContext;
  /** Path of the root JSX node; used for scope lookups and code frames. */
  path?: NodePath<t.JSXElement | t.JSXFragment>;
}

// ===== Helpers =====

function getJSXMemberName(node: t.JSXMemberExpression['object']): string {
  if (t.isJSXIdentifier(node)) return node.name;
  if (t.isJSXMemberExpression(node)) {
    return `${getJSXMemberName(node.object)}.${node.property.name}`;
  }
  return 'unknown';
}

function getTag(node: t.JSXElement): string {
  const name = node.openingElement.name;
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXMemberExpression(name)) {
    return `${getJSXMemberName(name.object)}.${name.property.name}`;
  }
  if (t.isJSXNamespacedName(name)) {
    return `${name.namespace.name}:${name.name.name}`;
  }
  return 'unknown';
}

function isComponentTag(tag: string): boolean {
  return /^[A-Z]/.test(tag) || tag.includes('.');
}

/**
 * Whether an element is created in the SVG namespace. Tags shared with HTML
 * (`title`, `a`, `style`, ...) are SVG only inside an SVG tree.
 */
function isSVG(tag: string, parentIsSVG: boolean): boolean {
  return parentIsSVG || (isSVGTag(tag) && !isHTMLTag(tag));
}

/**
 * Resolve the runtime import name for a builtin component, or undefined when
 * the tag is not a builtin in this mode or is shadowed by a local binding
 * (anything other than an import from `essor`).
 */
function resolveBuiltin(tag: string, state: ParseState): string | undefined {
  const isBuiltin =
    UNIVERSAL_BUILTINS.has(tag) || (state.ctx.mode === 'server' && SERVER_BUILTINS.has(tag));
  if (!isBuiltin) return undefined;

  const binding = state.path?.scope.getBinding(tag);
  if (!binding) return tag;
  if (binding.kind === 'module') {
    const parent = binding.path.parentPath?.node;
    if (
      parent &&
      t.isImportDeclaration(parent) &&
      (parent.source.value === 'essor' || parent.source.value === 'essor/server')
    ) {
      return tag;
    }
  }
  return undefined;
}

function getExpressionValue(
  value: t.JSXAttribute['value'],
): t.Expression | string | boolean | null {
  if (!value) return true; // Boolean attribute like <input disabled />
  if (t.isStringLiteral(value)) return value.value;
  if (t.isJSXExpressionContainer(value)) {
    if (t.isJSXEmptyExpression(value.expression)) return null;
    return value.expression;
  }
  // <div attr=<span/> /> style values: treat as an expression
  if (t.isJSXElement(value) || t.isJSXFragment(value)) return value;
  return null;
}

function isStaticValue(node: t.Expression | string | boolean | null): boolean {
  if (isString(node) || isBoolean(node) || !node) return true;
  return (
    t.isStringLiteral(node) ||
    t.isNumericLiteral(node) ||
    t.isBooleanLiteral(node) ||
    t.isNullLiteral(node) ||
    t.isIdentifier(node, { name: 'undefined' })
  );
}

function isSignalRef(node: t.Expression, ctx: CompileContext): boolean {
  const prefix = ctx.options.signalPrefix ?? '$';

  function check(n: t.Node): boolean {
    if (t.isIdentifier(n)) return startsWith(n.name, prefix);
    if (t.isMemberExpression(n)) return check(n.object);
    if (t.isCallExpression(n)) {
      return check(n.callee) || n.arguments.some((arg) => t.isExpression(arg) && check(arg));
    }
    if (t.isBinaryExpression(n) || t.isLogicalExpression(n)) {
      return (t.isExpression(n.left) && check(n.left)) || check(n.right);
    }
    if (t.isUnaryExpression(n)) return check(n.argument);
    if (t.isConditionalExpression(n)) {
      return check(n.test) || check(n.consequent) || check(n.alternate);
    }
    return false;
  }

  return check(node);
}

/**
 * Fold a compile-time constant child into text.
 *
 * Client mode only folds strings (other primitives keep their `<!>` slot so
 * the DOM shape matches the existing client runtime contract). Server and
 * hydrate fold every primitive, because both sides of the hydration contract
 * are produced by this compiler and must agree on the exact DOM shape.
 *
 * Returns the folded text ('' means "renders nothing"), or null when the
 * expression must stay dynamic.
 */
function foldConstantChild(expr: t.Expression, ctx?: CompileContext): string | null {
  const value = evaluateConstant(expr);
  if (value === CANNOT_EVALUATE) return null;
  if (isString(value)) return value;
  if (isNumber(value)) return String(value);
  if (ctx && ctx.mode !== 'client') {
    if (value === null || value === undefined || value === false) return '';
    if (value === true) return 'true';
    if (isBigint(value)) return String(value);
  }
  return null;
}

function hasDynamicProps(props: IRProps): boolean {
  return (
    props.dynamic.length > 0 ||
    props.events.length > 0 ||
    props.spreads.length > 0 ||
    props.binds.length > 0 ||
    props.ref !== null
  );
}

function hasAnyDynamicDescendant(children: IRNode[]): boolean {
  for (const child of children) {
    if (child.type === 'expression') return true;
    if (child.type === 'fragment' && hasAnyDynamicDescendant(child.children)) return true;
    if (child.type === 'element') {
      if (child.isComponent || hasDynamicProps(child.props)) return true;
      if (hasAnyDynamicDescendant(child.children)) return true;
    }
  }
  return false;
}

// ===== Entry =====

export function parseJSX(
  node: t.JSXElement | t.JSXFragment,
  ctx: CompileContext,
  parentIsSVG = false,
  path?: NodePath<t.JSXElement | t.JSXFragment>,
): IRNode {
  return parseNode(node, { ctx, path }, parentIsSVG);
}

function parseNode(
  node: t.JSXElement | t.JSXFragment,
  state: ParseState,
  parentIsSVG: boolean,
): IRNode {
  if (t.isJSXFragment(node)) {
    state.ctx.imports.get('Fragment');
    return {
      type: 'element',
      tag: 'Fragment',
      importName: 'Fragment',
      props: {
        static: [],
        dynamic: [],
        events: [],
        ref: null,
        spreads: [],
        binds: [],
      },
      children: parseChildren(node.children, state, parentIsSVG),
      isSVG: parentIsSVG,
      isComponent: true,
      isDynamic: true,
    } as IRElement;
  }
  return parseElement(node, state, parentIsSVG);
}

function parseElement(node: t.JSXElement, state: ParseState, parentIsSVG: boolean): IRElement {
  const tag = getTag(node);
  const isComp = isComponentTag(tag);
  const svg = !isComp && isSVG(tag, parentIsSVG);
  const props = parseProps(node.openingElement.attributes, state, isComp);
  const children = parseChildren(node.children, state, svg && tag !== 'foreignObject');

  if (!isComp && isWholeTextTag(tag)) {
    validateWholeTextElement(tag, children, props, node);
  }

  const element: IRElement = {
    type: 'element',
    tag,
    props,
    children,
    isSVG: svg,
    isComponent: isComp,
    isDynamic: isComp || hasDynamicProps(props) || hasAnyDynamicDescendant(children),
  };

  if (isComp) {
    const importName = resolveBuiltin(tag, state);
    if (importName) element.importName = importName;
  }

  return element;
}

// ===== Props =====

function resolveConstObjectStyle(id: t.Identifier, state: ParseState): string | undefined {
  const binding = state.path?.scope.getBinding(id.name);
  if (!binding || binding.kind !== 'const') return undefined;
  const declarator = binding.path;
  if (!declarator.isVariableDeclarator()) return undefined;
  const init = declarator.node.init;
  if (!init || !t.isObjectExpression(init)) return undefined;
  const value = evaluateConstant(init);
  if (value === CANNOT_EVALUATE) return undefined;
  return styleToString(value);
}

function isSerializableStaticValue(value: unknown): boolean {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (isPrimitive(current)) {
      continue;
    }
    if (isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }
    if (isPlainObject(current)) {
      for (const item of Object.values(current)) stack.push(item);
      continue;
    }
    return false;
  }
  return true;
}

function resolveStaticExpressionValue(
  attrName: string,
  expressionPath: NodePath<t.Expression>,
): string | boolean | undefined {
  if (attrName === 'ref' || startsWith(attrName, 'bind:') || isOn(attrName)) {
    return undefined;
  }

  const evaluated = expressionPath.evaluate();
  if (!evaluated.confident || !isSerializableStaticValue(evaluated.value)) {
    return undefined;
  }

  let value = evaluated.value;
  if (attrName === 'style') {
    const style = styleToString(value);
    if (style === undefined) return undefined;
    value = style;
  }

  if (isString(value) || isBoolean(value)) {
    return value;
  }

  if (isNumber(value)) {
    return String(value);
  }

  return undefined;
}

function parseProps(
  attributes: Array<t.JSXAttribute | t.JSXSpreadAttribute>,
  state: ParseState,
  isComponent: boolean,
): IRProps {
  const { ctx } = state;
  const result: IRProps = {
    static: [],
    dynamic: [],
    events: [],
    ref: null,
    spreads: [],
    binds: [],
  };
  let order = 0;

  const attrPaths =
    state.path && state.path.isJSXElement()
      ? (state.path.get('openingElement.attributes') as Array<
          NodePath<t.JSXAttribute | t.JSXSpreadAttribute>
        >)
      : undefined;

  for (const [i, attr] of attributes.entries()) {
    const attrPath = attrPaths?.[i];

    if (t.isJSXSpreadAttribute(attr)) {
      result.spreads.push({ value: attr.argument, order: order++ });
      continue;
    }

    const name = t.isJSXNamespacedName(attr.name)
      ? `${attr.name.namespace.name}:${attr.name.name.name}`
      : attr.name.name;

    let value = getExpressionValue(attr.value);

    // ref
    if (!isComponent && name === 'ref' && isObject(value)) {
      result.ref = { value: value as t.Expression, order: order++ };
      continue;
    }

    // DOM events: onClick={handler}
    if (!isComponent && isOn(name) && isObject(value)) {
      const eventName = name.slice(2).toLowerCase();
      if (isDelegatedEvent(eventName)) ctx.delegatedEvents?.add(eventName);
      result.events.push({ name, handler: value as t.Expression, order: order++ });
      continue;
    }

    // Bindings
    if (startsWith(name, 'bind:')) {
      const propName = name.slice(5);
      if (isComponent) {
        // Component binds lower to a value prop plus a writable `update:x` callback.
        const { value: actualValue } = unwrapBindTuple(value as t.Expression, propName);
        result.dynamic.push({ name: propName, value: actualValue, order: order++ });
        result.dynamic.push({
          name: `update:${propName}`,
          value: createBindingSetter(
            actualValue,
            (hint: string) => ctx.uids.generate(hint),
            propName,
          ),
          order: order++,
        });
      } else {
        result.binds.push({ name: propName, value: value as t.Expression, order: order++ });
      }
      continue;
    }

    if (
      !isComponent &&
      attrPath &&
      attrPath.isJSXAttribute() &&
      attrPath.node.value &&
      t.isJSXExpressionContainer(attrPath.node.value)
    ) {
      const exprPath = attrPath.get('value.expression');
      if (!isArray(exprPath) && exprPath.isExpression()) {
        const staticVal = resolveStaticExpressionValue(name, exprPath as NodePath<t.Expression>);
        if (staticVal !== undefined) {
          result.static.push({
            name,
            value: isString(staticVal) ? t.stringLiteral(staticVal) : t.booleanLiteral(staticVal),
            order: order++,
          });
          continue;
        }
      }
    }

    // Constant style objects become static CSS strings.
    if (!isComponent && name === 'style' && isObject(value)) {
      let css: string | undefined;
      const constantValue = evaluateConstant(value as t.Expression);
      if (constantValue !== CANNOT_EVALUATE && isObject(constantValue)) {
        css = styleToString(constantValue);
      } else if (t.isIdentifier(value as t.Node)) {
        css = resolveConstObjectStyle(value as t.Identifier, state);
      }
      if (css) value = css;
    }

    if (isComponent) {
      if (isStaticValue(value)) {
        const staticValue = isString(value)
          ? t.stringLiteral(value)
          : isBoolean(value)
            ? t.booleanLiteral(value)
            : isNull(value)
              ? t.nullLiteral()
              : (value as IRStaticProp['value']);
        result.static.push({ name, value: staticValue, order: order++ });
      } else {
        result.dynamic.push({ name, value: value as t.Expression, order: order++ });
      }
    } else {
      if (isString(value)) {
        result.static.push({ name, value: t.stringLiteral(value), order: order++ });
      } else if (isBoolean(value)) {
        result.static.push({ name, value: t.booleanLiteral(value), order: order++ });
      } else if (
        t.isStringLiteral(value as t.Expression) ||
        t.isBooleanLiteral(value as t.Expression) ||
        t.isNumericLiteral(value as t.Expression)
      ) {
        result.static.push({ name, value: value as IRStaticProp['value'], order: order++ });
      } else {
        result.dynamic.push({ name, value: value as t.Expression, order: order++ });
      }
    }
  }

  // Last write wins by source order regardless of static/dynamic bucket.
  if (!isComponent && result.spreads.length === 0) {
    const ordered: Array<IRStaticProp | IRDynamicProp> = [...result.static, ...result.dynamic].sort(
      (a, b) => a.order - b.order,
    );
    const latestByName = new Map<string, IRStaticProp | IRDynamicProp>();
    for (const prop of ordered) {
      const previous = latestByName.get(prop.name);
      if (previous) previous.isOverridden = true;
      latestByName.set(prop.name, prop);
    }
  }

  return result;
}

// ===== Children =====

function optimizeJSXChildren(children: JSXChild[]): JSXChild[] {
  const result: JSXChild[] = [];
  for (const child of children) {
    const last = result[result.length - 1];
    if (last) {
      const isLastTextLike =
        t.isJSXText(last) ||
        (t.isJSXExpressionContainer(last) &&
          (t.isStringLiteral(last.expression) || t.isNumericLiteral(last.expression)));
      const isCurTextLike =
        t.isJSXText(child) ||
        (t.isJSXExpressionContainer(child) &&
          (t.isStringLiteral(child.expression) || t.isNumericLiteral(child.expression)));
      if (isLastTextLike && isCurTextLike) {
        const lastRaw = t.isJSXText(last) ? last.value : String((last.expression as any).value);
        const curRaw = t.isJSXText(child) ? child.value : String((child.expression as any).value);
        result[result.length - 1] = t.jsxText(lastRaw + curRaw);
        continue;
      }
    }
    result.push(child);
  }
  return result;
}

function parseChildren(children: JSXChild[], state: ParseState, parentIsSVG: boolean): IRNode[] {
  const result: IRNode[] = [];
  const optimizedChildren = optimizeJSXChildren(children);

  const pushText = (text: string) => {
    if (text.length === 0) return;
    const last = result[result.length - 1];
    if (last && last.type === 'text') {
      last.value += text;
    } else {
      result.push({ type: 'text', value: text, isStatic: true });
    }
  };

  const pushNode = (node: IRNode) => {
    if (node.type === 'text') pushText(node.value);
    else result.push(node);
  };

  const childPaths =
    state.path && (state.path.isJSXElement() || state.path.isJSXFragment())
      ? (state.path.get('children') as Array<NodePath<JSXChild>>)
      : undefined;

  for (const child of optimizedChildren) {
    if (t.isJSXText(child)) {
      pushText(getJSXText(child.value));
      continue;
    }

    if (t.isJSXExpressionContainer(child)) {
      const expr = child.expression;
      if (t.isJSXEmptyExpression(expr)) continue;

      // A directly nested JSX expression is just JSX.
      if (t.isJSXElement(expr) || t.isJSXFragment(expr)) {
        const containerPath = childPaths?.find((p) => p.node === child);
        const exprPath =
          containerPath && containerPath.isJSXExpressionContainer()
            ? (containerPath.get('expression') as NodePath<t.JSXElement | t.JSXFragment>)
            : undefined;
        pushParsed(parseNode(expr, { ctx: state.ctx, path: exprPath }, parentIsSVG));
        continue;
      }

      const folded = foldConstantChild(expr, state.ctx);
      if (folded !== null) {
        pushText(folded);
        continue;
      }

      result.push({
        type: 'expression',
        node: expr,
        isSignal: isSignalRef(expr, state.ctx),
      } as IRExpression);
      continue;
    }

    if (t.isJSXElement(child) || t.isJSXFragment(child)) {
      const childPath = childPaths?.find((p) => p.node === child) as
        NodePath<t.JSXElement | t.JSXFragment> | undefined;
      pushParsed(parseNode(child, { ctx: state.ctx, path: childPath }, parentIsSVG));
      continue;
    }

    if (t.isJSXSpreadChild(child)) {
      result.push({
        type: 'expression',
        node: child.expression,
        isSignal: isSignalRef(child.expression, state.ctx),
      } as IRExpression);
    }
  }

  function pushParsed(node: IRNode) {
    pushNode(node);
  }

  return result;
}

// ===== Validation =====

// Whole-text elements (title, textarea, style, script)
function validateWholeTextElement(
  tag: string,
  children: IRNode[],
  props: IRProps,
  node: t.JSXElement,
): void {
  for (const child of children) {
    if (child.type !== 'text' && child.type !== 'expression') {
      CompileErrors.wholeTextInvalidChildren(tag, node);
    }
    if (child.type === 'expression' && containsJSX(child.node)) {
      CompileErrors.wholeTextInvalidChildren(tag, node);
    }
  }

  if (tag === 'style' || tag === 'script') {
    for (const child of children) {
      if (child.type === 'text' && hasRawTextEndTag(tag, child.value)) {
        CompileErrors.unsafeRawTextToken(tag, node);
      }
    }
  }

  if (tag === 'textarea' && children.length > 0 && props.binds.some((b) => b.name === 'value')) {
    CompileErrors.textareaBindWithChildren(node);
  }

  if (tag === 'script' && children.some((c) => c.type === 'expression')) {
    CompileErrors.dynamicScriptChildren(node);
  }
}
