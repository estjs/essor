/**
 * JSX structure helpers & shared AST predicates.
 *
 * These utilities convert the more fragmented shapes from Babel's JSX AST into
 * representations that are easier for the compiler pipeline to consume, such as
 * tag-name strings, runtime call expressions, and normalized event names.
 */
import { type NodePath, types as t } from '@babel/core';
import {
  escapeHTML,
  isArray,
  isBigint,
  isBoolean,
  isBooleanAttr,
  isNull,
  isNumber,
  isPlainObject,
  isString,
  kebabCase,
  normalizeStyle,
  propsToAttrMap,
  startsWith,
} from '@estjs/shared';
import { BUILT_IN_COMPONENTS, FRAGMENT_NAME } from './constants';
import { useImport } from './context';

// ─── Shared function predicates ───────────

export type AnyFunction = t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression;

export function isAnyFunctionPath(path: NodePath): path is NodePath<AnyFunction> {
  return (
    path.isFunctionDeclaration() || path.isFunctionExpression() || path.isArrowFunctionExpression()
  );
}

export function isFunctionLikeExpressionPath(
  path: NodePath<t.Node | null>,
): path is NodePath<t.FunctionExpression | t.ArrowFunctionExpression> {
  return path.isFunctionExpression() || path.isArrowFunctionExpression();
}

export function isFunctionLikeExpression(
  node: t.Node | null | undefined,
): node is t.FunctionExpression | t.ArrowFunctionExpression {
  return t.isFunctionExpression(node) || t.isArrowFunctionExpression(node);
}

export type AttrValueKind = 'static' | 'dynamic';

export interface ClassifiedAttrValue {
  kind: AttrValueKind;
  expression: t.Expression;
}

/**
 * Extracts the tag name from a JSX element or fragment.
 */
export function getTagName(node: t.JSXElement | t.JSXFragment): string {
  if (t.isJSXFragment(node)) {
    return FRAGMENT_NAME;
  }
  const tag = node.openingElement.name;
  return getJSXName(tag);
}

/**
 * Converts a JSX name node into its string representation.
 */
export function getJSXName(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
): string {
  if (name.type === 'JSXIdentifier') {
    return name.name;
  }
  if (name.type === 'JSXNamespacedName') {
    return `${name.namespace.name}:${name.name.name}`;
  }
  return `${getJSXName(name.object)}.${getJSXName(name.property)}`;
}

/**
 * Checks whether a JSX tag should be compiled as a component.
 */
export function isComponentTag(tagName: string): boolean {
  return /^[A-Z]/.test(tagName) || tagName.includes('.');
}

type BuiltInComponent = (typeof BUILT_IN_COMPONENTS)[number];

/**
 * Checks whether a tag name maps to a built-in runtime component.
 */
export function isBuiltInComponent(tag: string): tag is BuiltInComponent {
  return BUILT_IN_COMPONENTS.includes(tag as BuiltInComponent);
}

/**
 * Normalizes `onClick`-style JSX attribute names into DOM event names.
 */
export function normalizeEventName(attrName: string): string | null {
  if (!/^on[A-Z]/.test(attrName)) {
    return null;
  }
  return attrName.slice(2).toLowerCase();
}

/**
 * Trim text content of JSXText node
 */
export function textTrim(node: t.JSXText): string {
  if (!node || !node.value) return '';
  const lines = node.value.split(/\r\n|\n|\r/);
  let lastNonEmptyLine = 0;
  for (const [i, line] of lines.entries()) {
    if (/[^ \t]/.test(line)) lastNonEmptyLine = i;
  }
  let str = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replaceAll('\t', ' ');
    if (i !== 0) line = line.replace(/^ +/, '');
    if (i !== lines.length - 1) line = line.replace(/ +$/, '');
    if (line) {
      if (i !== lastNonEmptyLine) line += ' ';
      str += line;
    }
  }
  return str;
}

/**
 * Serializes static JSX attributes into template HTML.
 *
 * Type-aware serialization:
 * - boolean attrs (`disabled`, `checked`, …): `true` → bare attr, `false` →
 *   OMITTED (`disabled="false"` would be truthy in HTML);
 * - `aria-*` / `data-*`: booleans serialize as the strings "true"/"false"
 *   (ARIA's tri-state contract needs the literal string);
 * - other attrs: `true` → bare attr, `false` → `="false"` (string form);
 * - duplicate static attrs: last write wins (matches JS object semantics).
 *
 * These rules must stay in sync with the runtime patcher `patchAttr` in
 * `packages/template/src/operations/attr.ts` (boolean attrs go through
 * `isBooleanAttr`/`includeBooleanAttr`; aria-/data- fall through to the
 * generic path which stringifies booleans) — drift between the two shows up
 * as hydration/update mismatches.
 */
export function serializeStaticAttrs(
  attrs: Array<{ name: string; value: string | boolean }>,
): string {
  // Merge className + class into a single class attribute
  const merged: Array<{ name: string; value: string | boolean }> = [];
  // Maps attr name → its merged slot (first occurrence); later duplicates
  // overwrite that slot in place.
  const mergedIndexByName = new Map<string, number>();
  let classValue: string | undefined;
  for (const attr of attrs) {
    const name = propsToAttrMap[attr.name] ?? attr.name;
    if (name === 'class') {
      classValue = classValue ? `${classValue} ${attr.value}` : String(attr.value);
      continue;
    }
    // All-static duplicate: later value replaces the earlier one.
    const existing = mergedIndexByName.get(name);
    if (existing !== undefined) {
      merged[existing] = { name, value: attr.value };
    } else {
      mergedIndexByName.set(name, merged.length);
      merged.push({ name, value: attr.value });
    }
  }
  if (classValue) merged.unshift({ name: 'class', value: classValue });

  return merged
    .map((attr) => {
      const { name, value } = attr;
      if (isBoolean(value)) {
        const isAriaOrData = startsWith(name, 'aria-') || startsWith(name, 'data-');
        if (isAriaOrData) {
          return ` ${name}="${value}"`;
        }
        if (isBooleanAttr(name)) {
          return value ? ` ${name}` : '';
        }
        return value ? ` ${name}` : ` ${name}="false"`;
      }
      return ` ${name}="${escapeHTML(value)}"`;
    })
    .join('');
}

/**
 * Resolves component callee.
 */
export function resolveComponentCallee(tag: string, fallback: t.Expression): t.Expression {
  if (isBuiltInComponent(tag)) {
    return useImport(tag);
  }
  return fallback;
}

/**
 * Classify an attribute value into static vs dynamic.
 */
export function classifyAttrValue(expression: t.Expression): ClassifiedAttrValue {
  if (
    t.isStringLiteral(expression) ||
    t.isNumericLiteral(expression) ||
    t.isBooleanLiteral(expression) ||
    t.isNullLiteral(expression) ||
    t.isIdentifier(expression, { name: 'undefined' })
  ) {
    return { kind: 'static', expression };
  }
  return { kind: 'dynamic', expression };
}

export interface DynamicAttr {
  path: NodePath<t.JSXAttribute>;
  name: string;
  value: t.Expression;
  effectKind: 'static' | 'dynamic';
  order: number;
}

export interface StaticAttr {
  name: string;
  value: string | boolean;
  order: number;
}

export interface SpreadAttr {
  value: t.Expression;
  effectKind: 'static' | 'dynamic';
  order: number;
}

export interface ParsedAttributes {
  staticAttrs: StaticAttr[];
  dynamicAttrs: DynamicAttr[];
  spreadAttrs: SpreadAttr[];
}

interface OrderedAttribute<T> {
  attr: T;
  order: number;
  templateName: string;
}

/**
 * Checks whether a value can be safely inlined as a static attribute.
 */
function isSerializableStaticValue(
  value: unknown,
): value is null | boolean | number | string | bigint | unknown[] | Record<string, unknown> {
  const stack: unknown[] = [value];

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (
      isNull(current) ||
      isBoolean(current) ||
      isNumber(current) ||
      isString(current) ||
      isBigint(current)
    ) {
      continue;
    }

    if (isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }

    if (!isPlainObject(current)) {
      return false;
    }

    const values = Object.values(current as Record<string, unknown>);
    for (const item of values) {
      stack.push(item);
    }
  }

  return true;
}

/**
 * Serializes a static JSX style object into an inline CSS string.
 */
function styleToString(style: unknown): string | undefined {
  const normalized = normalizeStyle(style);
  if (!normalized) return undefined;
  if (isString(normalized)) return normalized;

  const parts: string[] = [];
  for (const key in normalized) {
    const value = normalized[key];
    if (isString(value) || isNumber(value)) {
      const prop = startsWith(key, '--') ? key : kebabCase(key);
      parts.push(`${prop}:${value}`);
    }
  }
  return parts.join(';');
}

/**
 * Checks whether an evaluated collection attribute can be serialized statically.
 */
function shouldResolveStaticCollection(attrName: string): boolean {
  return attrName !== 'ref' && !startsWith(attrName, 'bind:') && !normalizeEventName(attrName);
}

function normalizeTemplateAttrName(attrName: string): string {
  return propsToAttrMap[attrName] ?? attrName;
}

function createStaticAttr(
  attrName: string,
  value: string | boolean,
  order: number,
): OrderedAttribute<StaticAttr> {
  return {
    attr: { name: attrName, value, order },
    order,
    templateName: normalizeTemplateAttrName(attrName),
  };
}

function createDynamicAttr(
  attrPath: NodePath<t.JSXAttribute>,
  attrName: string,
  value: t.Expression,
  effectKind: AttrValueKind,
  order: number,
): OrderedAttribute<DynamicAttr> {
  return {
    attr: {
      path: attrPath,
      name: attrName,
      value,
      effectKind,
      order,
    },
    order,
    templateName: normalizeTemplateAttrName(attrName),
  };
}

function resolveStaticExpressionValue(
  attrName: string,
  expressionPath: NodePath<t.Expression>,
): string | boolean | undefined {
  if (!shouldResolveStaticCollection(attrName)) {
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

function parseExpressionAttribute(
  attrPath: NodePath<t.JSXAttribute>,
  attrName: string,
  expression: t.Expression,
  order: number,
  staticAttrs: Array<OrderedAttribute<StaticAttr>>,
  dynamicAttrs: Array<OrderedAttribute<DynamicAttr>>,
  preserveValueTypes: boolean,
): void {
  // Component props must keep their ORIGINAL value type: folding
  // `count={3}` into the HTML-attr string "3" changes what the component
  // receives. Only native elements serialize to template HTML strings.
  if (!preserveValueTypes) {
    const expressionPath = attrPath.get('value.expression') as NodePath<t.Expression>;
    const staticValue = resolveStaticExpressionValue(attrName, expressionPath);

    if (staticValue !== undefined) {
      staticAttrs.push(createStaticAttr(attrName, staticValue, order));
      return;
    }
  }

  const classified = classifyAttrValue(expression);
  dynamicAttrs.push(
    createDynamicAttr(attrPath, attrName, classified.expression, classified.kind, order),
  );
}

function finalizeParsedAttributes(
  staticAttrs: Array<OrderedAttribute<StaticAttr>>,
  dynamicAttrs: Array<OrderedAttribute<DynamicAttr>>,
  spreadAttrs: SpreadAttr[],
): ParsedAttributes {
  if (dynamicAttrs.length === 0) {
    return {
      staticAttrs: staticAttrs.map((entry) => entry.attr),
      dynamicAttrs: [],
      spreadAttrs,
    };
  }

  const dynamicNames = new Set(dynamicAttrs.map((entry) => entry.templateName));
  const lastExplicitOrder = new Map<string, number>();

  for (const entry of [...staticAttrs, ...dynamicAttrs]) {
    if (!dynamicNames.has(entry.templateName)) continue;

    const current = lastExplicitOrder.get(entry.templateName);
    if (current == null || entry.order > current) {
      lastExplicitOrder.set(entry.templateName, entry.order);
    }
  }

  const keepsWinningExplicitAttr = <T>(entry: OrderedAttribute<T>): boolean =>
    !dynamicNames.has(entry.templateName) ||
    entry.order === lastExplicitOrder.get(entry.templateName);

  return {
    staticAttrs: staticAttrs.filter(keepsWinningExplicitAttr).map((entry) => entry.attr),
    dynamicAttrs: dynamicAttrs.filter(keepsWinningExplicitAttr).map((entry) => entry.attr),
    spreadAttrs,
  };
}

/**
 * Splits JSX attributes into static, dynamic, and spread buckets.
 */
export function parseAttributes(
  path: NodePath<t.JSXElement>,
  options: { preserveValueTypes?: boolean } = {},
): ParsedAttributes {
  const preserveValueTypes = options.preserveValueTypes === true;
  const staticAttrs: Array<OrderedAttribute<StaticAttr>> = [];
  const dynamicAttrs: Array<OrderedAttribute<DynamicAttr>> = [];
  const spreadAttrs: SpreadAttr[] = [];

  if (!path.isJSXElement()) {
    return { staticAttrs: [], dynamicAttrs: [], spreadAttrs };
  }

  const attributes = path.get('openingElement.attributes');

  for (const [order, attrPath] of attributes.entries()) {
    if (attrPath.isJSXSpreadAttribute()) {
      spreadAttrs.push({
        value: attrPath.node.argument,
        effectKind: classifyAttrValue(attrPath.node.argument).kind,
        order,
      });
      continue;
    }

    if (!attrPath.isJSXAttribute()) {
      continue;
    }

    const attr = attrPath.node as t.JSXAttribute;
    const attrName = getJSXName(attr.name);

    if (!attr.value) {
      staticAttrs.push(createStaticAttr(attrName, true, order));
      continue;
    }

    if (t.isStringLiteral(attr.value)) {
      staticAttrs.push(createStaticAttr(attrName, attr.value.value, order));
      continue;
    }

    if (t.isJSXExpressionContainer(attr.value)) {
      const expression = attr.value.expression;
      if (t.isJSXEmptyExpression(expression)) {
        continue;
      }

      parseExpressionAttribute(
        attrPath,
        attrName,
        expression,
        order,
        staticAttrs,
        dynamicAttrs,
        preserveValueTypes,
      );
    }
  }

  return finalizeParsedAttributes(staticAttrs, dynamicAttrs, spreadAttrs);
}

/**
 * Checks whether a function body returns JSX.
 */
export function checkHasJSXReturn(
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
    /**
     * Stops once a JSX-returning branch is found.
     */
    ReturnStatement(returnPath) {
      const argumentPath = returnPath.get('argument');
      if (argumentPath.isJSXElement() || argumentPath.isJSXFragment()) {
        found = true;
        returnPath.stop();
      }
    },
    /**
     * Skips nested functions so only the current function body is inspected.
     */
    Function(functionPath) {
      if (functionPath.node !== path.node) {
        functionPath.skip();
      }
    },
  });

  return found;
}
