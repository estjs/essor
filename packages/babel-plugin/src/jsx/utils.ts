/**
 * JSX structure helpers.
 *
 * These utilities convert the more fragmented shapes from Babel's JSX AST into
 * representations that are easier for the compiler pipeline to consume, such as
 * tag-name strings, runtime call expressions, and normalized event names.
 */
import {
  escapeHTML,
  isArray,
  isBigint,
  isBoolean,
  isNull,
  isNumber,
  isPlainObject,
  isString,
  propsToAttrMap,
} from '@estjs/shared';
import { type NodePath, types as t } from '@babel/core';
import { BUILT_IN_COMPONENTS, FRAGMENT_NAME } from '../constants';
import { useImport } from '../context';

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
 */
export function serializeStaticAttrs(
  attrs: Array<{ name: string; value: string | boolean }>,
): string {
  // Merge className + class into a single class attribute
  const merged: Array<{ name: string; value: string | boolean }> = [];
  let classValue: string | undefined;
  for (const attr of attrs) {
    const name = propsToAttrMap[attr.name] ?? attr.name;
    if (name === 'class') {
      classValue = classValue ? `${classValue} ${attr.value}` : String(attr.value);
    } else {
      merged.push({ name, value: attr.value });
    }
  }
  if (classValue) merged.unshift({ name: 'class', value: classValue });

  return merged
    .map((attr) => {
      if (attr.value === true) return ` ${attr.name}`;
      return ` ${attr.name}="${escapeHTML(attr.value as string)}"`;
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
}

export interface ParsedAttributes {
  staticAttrs: Array<{ name: string; value: string | boolean }>;
  dynamicAttrs: DynamicAttr[];
  spreadAttrs: Array<{ value: t.Expression; effectKind: 'static' | 'dynamic' }>;
}

/**
 * Checks whether a value can be safely inlined as a static attribute.
 */
function isSerializableStaticValue(
  value: unknown,
): value is
  | null
  | undefined
  | boolean
  | number
  | string
  | bigint
  | unknown[]
  | Record<string, unknown> {
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
function styleToString(style: Record<string, string | number>): string {
  return Object.entries(style)
    .map(([key, value]) => {
      const kebabKey = key.replaceAll(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      return `${kebabKey}:${value}`;
    })
    .join(';');
}

/**
 * Checks whether an evaluated collection attribute can be serialized statically.
 */
function shouldResolveStaticCollection(attrName: string): boolean {
  return attrName !== 'ref' && !attrName.startsWith('bind:') && !normalizeEventName(attrName);
}

/**
 * Splits JSX attributes into static, dynamic, and spread buckets.
 */
export function parseAttributes(path: NodePath<t.JSXElement>): ParsedAttributes {
  const staticAttrs: ParsedAttributes['staticAttrs'] = [];
  const dynamicAttrs: DynamicAttr[] = [];
  const spreadAttrs: ParsedAttributes['spreadAttrs'] = [];

  if (!path.isJSXElement()) {
    return { staticAttrs, dynamicAttrs, spreadAttrs };
  }

  const attributes = path.get('openingElement.attributes');

  for (const attrPath of attributes) {
    if (attrPath.isJSXSpreadAttribute()) {
      spreadAttrs.push({
        value: attrPath.node.argument,
        effectKind: classifyAttrValue(attrPath.node.argument).kind,
      });
      continue;
    }

    const attr = attrPath.node as t.JSXAttribute;
    const attrName = getJSXName(attr.name);

    if (!attr.value) {
      staticAttrs.push({ name: attrName, value: true });
      continue;
    }

    if (t.isStringLiteral(attr.value)) {
      staticAttrs.push({ name: attrName, value: attr.value.value });
      continue;
    }

    if (t.isJSXExpressionContainer(attr.value)) {
      const expression = attr.value.expression;
      if (t.isJSXEmptyExpression(expression)) {
        continue;
      }

      const expressionPath = (attrPath as NodePath<t.JSXAttribute>).get(
        'value.expression',
      ) as NodePath<t.Expression>;

      // Try to evaluate the expression
      const evaluated = expressionPath.evaluate();

      if (evaluated.confident && isSerializableStaticValue(evaluated.value)) {
        if (shouldResolveStaticCollection(attrName)) {
          let value = evaluated.value;
          if (attrName === 'style' && isPlainObject(value)) {
            value = styleToString(value as Record<string, string | number>);
          }
          if (isString(value) || isBoolean(value) || isNumber(value)) {
            staticAttrs.push({
              name: attrName,
              value: isBoolean(value) ? value : String(value),
            });
            continue;
          }
        }
      }

      const value = expression;
      const classified = classifyAttrValue(value);

      dynamicAttrs.push({
        path: attrPath as NodePath<t.JSXAttribute>,
        name: attrName,
        value: classified.expression,
        effectKind: classified.kind,
      });
    }
  }

  return { staticAttrs, dynamicAttrs, spreadAttrs };
}
