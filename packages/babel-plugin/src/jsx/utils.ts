/**
 * @file Core utilities for JSX transformation
 */

import { type NodePath, types as t } from '@babel/core';
import type { JSXChild, JSXElement } from './types';

/**
 * Checks if a path represents a valid child node (not empty)
 */
export function isValidChild(path: NodePath<JSXChild>): boolean {
  const regex = /^\s*$/;
  if (path.isStringLiteral() || path.isJSXText()) {
    return !regex.test(path.node.value);
  }
  return Object.keys(path.node).length > 0;
}

/**
 * Determines if the given path has a sibling element
 */
export function hasSiblingElement(path: NodePath): boolean {
  const siblings = path.getAllPrevSiblings().concat(path.getAllNextSiblings());
  return siblings.some(
    siblingPath => siblingPath.isJSXElement() || siblingPath.isJSXExpressionContainer(),
  );
}

/**
 * Gets the name of a JSX attribute
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
 * Gets the tag name of a JSX element
 */
export function getTagName(node: t.JSXElement): string {
  const tag = node.openingElement.name;
  return jsxElementNameToString(tag);
}

/**
 * Converts a JSX element name to a string representation
 */
export function jsxElementNameToString(
  node: t.JSXMemberExpression | t.JSXIdentifier | t.JSXNamespacedName,
): string {
  if (t.isJSXMemberExpression(node)) {
    return `${jsxElementNameToString(node.object)}.${jsxElementNameToString(node.property)}`;
  }

  if (t.isJSXIdentifier(node) || t.isIdentifier(node)) {
    return node.name;
  }

  return `${node.namespace.name}:${node.name.name}`;
}

/**
 * Determines if the given tagName is a component
 */
export function isComponentName(tagName: string): boolean {
  return (
    (tagName[0] && tagName[0].toLowerCase() !== tagName[0]) ||
    tagName.includes('.') ||
    /[^a-z]/i.test(tagName[0])
  );
}

/**
 * Determines if the given path represents a text child node
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
 * Sets the text content of a JSX node
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
 * Replaces multiple spaces/newlines with a single space
 */
export function replaceSpace(node: t.JSXText): string {
  return node.value.replaceAll(/\s+/g, ' ').trim();
}

/**
 * Gets the text content of a node
 */
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

/**
 * Creates a props object expression from a props record
 */
export function createPropsObjectExpression(
  props: Record<string, any>,
  isComponent = false,
): t.ObjectExpression {
  const result: Array<t.ObjectProperty | t.SpreadElement> = [];

  for (const prop in props) {
    let value = props[prop];

    // Skip children for non-components
    if (!isComponent && prop === 'children') {
      continue;
    }

    // Convert values to appropriate AST nodes
    if (Array.isArray(value)) {
      value = t.arrayExpression(value);
    } else if (typeof value === 'object' && value !== null && !t.isNode(value)) {
      value = createPropsObjectExpression(value);
    } else if (typeof value === 'string') {
      value = t.stringLiteral(value);
    } else if (typeof value === 'number') {
      value = t.numericLiteral(value);
    } else if (typeof value === 'boolean') {
      value = t.booleanLiteral(value);
    } else if (value === undefined) {
      value = t.tsUndefinedKeyword();
    } else if (value === null) {
      value = t.nullLiteral();
    }

    // Handle spread properties
    if (prop === '_$spread$') {
      result.push(t.spreadElement(value));
    } else {
      result.push(t.objectProperty(t.stringLiteral(prop), value));
    }
  }

  return t.objectExpression(result);
}

/**
 * Analyze JSX component for expression properties
 */
export function hasExpressionProps(path: NodePath<JSXElement>): boolean {
  let hasExpression = false;

  const element = path.get('openingElement') as NodePath<t.JSXOpeningElement>;
  if (element.isJSXOpeningElement()) {
    const attributes = element.get('attributes') as NodePath<
      t.JSXAttribute | t.JSXSpreadAttribute
    >[];

    for (const attribute of attributes) {
      if (attribute.isJSXAttribute()) {
        const value = attribute.get('value');
        if (value?.isJSXExpressionContainer()) {
          const expression = value.get('expression');
          if (
            expression?.isExpression() &&
            !expression.isStringLiteral() &&
            !expression.isNumericLiteral()
          ) {
            hasExpression = true;
            break;
          }
        }
      } else if (attribute.isJSXSpreadAttribute()) {
        hasExpression = true;
        break;
      }
    }
  }

  return hasExpression;
}

/**
 * Analyzes the complexity of JSX children
 */
export function analyzeChildrenComplexity(path: NodePath<JSXElement>): {
  hasComplexChildren: boolean;
  childCount: number;
  hasExpressionChildren: boolean;
} {
  let hasComplexChildren = false;
  let hasExpressionChildren = false;
  let childCount = 0;

  const children = path.get('children');
  if (Array.isArray(children)) {
    for (const child of children) {
      if (!isValidChild(child)) {
        continue;
      }

      childCount++;

      if (child.isJSXElement() || child.isJSXFragment()) {
        const nestedChildren = child.get('children');
        if (Array.isArray(nestedChildren) && nestedChildren.length > 0) {
          for (const nestedChild of nestedChildren) {
            if (isValidChild(nestedChild as NodePath<JSXChild>)) {
              hasComplexChildren = true;
              break;
            }
          }
        }
      } else if (child.isJSXExpressionContainer()) {
        const expression = child.get('expression');
        if (
          expression &&
          !expression.isStringLiteral() &&
          !expression.isNumericLiteral() &&
          !expression.isJSXEmptyExpression()
        ) {
          hasExpressionChildren = true;
          hasComplexChildren = true;
        }
      }
    }
  }

  return { hasComplexChildren, childCount, hasExpressionChildren };
}
