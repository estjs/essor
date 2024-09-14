import { type NodePath, types as t } from '@babel/core';
import { startsWith } from '@estjs/shared';
import type { State } from './types';

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
export function isComponent(tagName: string): boolean {
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

/**
 *  get the symbol start with
 */
export function isSymbolStart(path: NodePath<any>, name: string) {
  const state: State = path.state;
  const { symbol } = state?.opts || '$';

  return startsWith(name, symbol);
}
