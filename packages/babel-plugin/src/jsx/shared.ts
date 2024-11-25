import { type NodePath, types as t } from '@babel/core';
import { imports } from '../program';
import type { State } from '../types';
import type { Identifier, StringLiteral } from '@babel/types';

interface Result {
  index: number;
  isLastChild: boolean;
  parentIndex: number;
  props: Record<string, any>;
}

export interface ClientResult extends Result {
  template: string;
}
export interface ServerResult extends Result {
  template: string[];
}

export function createClientResult(): ClientResult {
  return {
    index: 1,
    isLastChild: false,
    parentIndex: 0,
    props: {},
    template: '',
  };
}

export function createServerResult(): ServerResult {
  return {
    index: 1,
    isLastChild: false,
    parentIndex: 0,
    props: {},
    template: [],
  };
}

export type JSXElement = t.JSXElement | t.JSXFragment;

export type JSXChild =
  | t.JSXElement
  | t.JSXFragment
  | t.JSXExpressionContainer
  | t.JSXSpreadChild
  | t.JSXText;

/**
 * Checks if the given Babel path has a sibling element.
 *
 * @param {NodePath} path - The Babel path to check.
 * @return {boolean} True if the path has a sibling element, false otherwise.
 */
export function hasSiblingElement(path) {
  // Get all siblings (both previous and next)
  const siblings = path.getAllPrevSiblings().concat(path.getAllNextSiblings());

  // Check for non-self-closing sibling elements or JSXExpressionContainer
  const hasSibling = siblings.some(
    siblingPath => siblingPath.isJSXElement() || siblingPath.isJSXExpressionContainer(),
  );

  return hasSibling;
}
/**
 * Retrieves the name of a JSX attribute.
 *
 * @param {t.JSXAttribute} attribute - The JSX attribute to retrieve the name from.
 * @return {string} The name of the attribute.
 * @throws {Error} If the attribute type is unsupported.
 */
export function getAttrName(attribute: t.JSXAttribute): string {
  if (t.isJSXIdentifier(attribute.name)) {
    return attribute.name.name;
  }
  if (t.isJSXNamespacedName(attribute.name)) {
    return `${attribute.name.namespace.name}:${attribute.name.name.name}`;
  }
  throw new Error('Unsupported attribute type');
}

/**
 * Retrieves the tag name of a JSX element.
 *
 * @param {t.JSXElement} node - The JSX element.
 * @return {string} The tag name of the JSX element.
 */
export function getTagName(node: t.JSXElement): string {
  const tag = node.openingElement.name;
  return jsxElementNameToString(tag);
}

/**
 * Converts a JSX element name to a string representation.
 *
 * case1: <MyComponent />
 * case2: <SomeLibrary.SomeComponent />;
 * case3: <namespace:ComponentName />;
 * case4: <SomeLibrary.Nested.ComponentName />;
 *
 * @param {t.JSXMemberExpression | t.JSXIdentifier | t.JSXNamespacedName} node The JSX element name to convert.
 * @returns {string} The string representation of the JSX element name.
 */
export function jsxElementNameToString(
  node: t.JSXMemberExpression | t.JSXIdentifier | t.JSXNamespacedName,
) {
  if (t.isJSXMemberExpression(node)) {
    return `${jsxElementNameToString(node.object)}.${jsxElementNameToString(node.property)}`;
  }

  if (t.isJSXIdentifier(node) || t.isIdentifier(node)) {
    return node.name;
  }

  return `${node.namespace.name}:${node.name.name}`;
}

/**
 * Determines if the given tagName is a component.
 *
 *  case1: <MyComponent />
 *  case2: <SomeLibrary.SomeComponent />;
 *  case3: <_component />;
 *
 * @param {string} tagName - The name of the tag to check.
 * @return {boolean} True if the tagName is a component, false otherwise.
 */
export function isComponentName(tagName: string): boolean {
  return (
    (tagName[0] && tagName[0].toLowerCase() !== tagName[0]) ||
    tagName.includes('.') ||
    /[^a-z]/i.test(tagName[0])
  );
}

/**
 * Determines if the given path represents a text child node in a JSX expression.
 *
 * @param {NodePath<JSXChild>} path - The path to the potential text child node.
 * @return {boolean} True if the path represents a text child node, false otherwise.
 */
export function isTextChild(path: NodePath<JSXChild>): boolean {
  if (path.isJSXExpressionContainer()) {
    const expression = path.get('expression');
    if (expression.isJSXText() || expression.isStringLiteral() || expression.isNumericLiteral()) {
      return true;
    }
  }
  if (path.isJSXText() || path.isStringLiteral() || path.isNullLiteral()) {
    return true;
  }
  return false;
}

/**
 * Sets the text content of a JSX node.
 *
 * @param {NodePath<JSXChild>} path - The path to the JSX node.
 * @param {string} text - The text to set.
 * @return {void}
 */
export function setNodeText(path: NodePath<JSXChild>, text: string): void {
  if (path.isJSXText()) {
    path.node.value = text;
  }
  if (path.isJSXExpressionContainer()) {
    const expression = path.get('expression');
    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      expression.replaceWith(t.stringLiteral(text));
    }
  }
}
// Trim and replace multiple spaces/newlines with a single space
export function replaceSpace(node: t.JSXText): string {
  return node.value.replaceAll(/\s+/g, ' ').trim();
}
export function isValidChild(path: NodePath<JSXChild>): boolean {
  const regex = /^\s*$/;
  if (path.isStringLiteral() || path.isJSXText()) {
    return !regex.test(path.node.value);
  }
  return Object.keys(path.node).length > 0;
}
export function hasObjectExpression(
  prop: string,
  value: t.ObjectExpression,
  props: Record<string, any>,
  state: State,
  isCt = false,
): string {
  let ct = '';
  const hasConditional = value.properties.some(
    property => t.isObjectProperty(property) && t.isConditionalExpression(property.value),
  );

  if (hasConditional) {
    imports.add('useComputed');
    props[prop] = t.callExpression(state.useComputed, [t.arrowFunctionExpression([], value)]);
  } else if (isCt) {
    value.properties.forEach(property => {
      if (t.isObjectProperty(property)) {
        ct += `${(property.key as Identifier).name || (property.key as StringLiteral).value}:${(property.value as StringLiteral).value};`;
      }
    });

    delete props[prop];
  }
  return ct;
}
export function getNodeText(path: NodePath<JSXChild>): string {
  if (path.isJSXText()) {
    return replaceSpace(path.node);
  }
  if (path.isJSXExpressionContainer()) {
    const expression = path.get('expression');
    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      return String(expression.node.value);
    }
  }
  return '';
}
