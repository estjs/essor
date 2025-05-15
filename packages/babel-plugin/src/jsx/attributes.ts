/**
 * @file JSX attribute processing utilities
 */

import { capitalize } from '@estjs/shared';
import { type NodePath, types as t } from '@babel/core';
import { addImport, importObject } from '../import';
import { getAttrName } from './utils';
import type { JSXElement, State } from '../types';

/**
 * Process JSX attributes and return props object
 * @param path JSX element path
 * @param state Babel state
 * @param transformJSX JSX transformation function
 * @param type Optional rendering mode type
 * @returns Object containing props and expression flag
 */
export function processJSXAttributes(
  path: NodePath<t.JSXElement>,
  state: State,
  transformJSX: (path: NodePath<JSXElement>) => void,
  type?: string,
): { props: Record<string, any>; hasExpression: boolean } {
  const props: Record<string, any> = {};
  let hasExpression = false;

  path
    .get('openingElement')
    .get('attributes')
    .forEach(attribute => {
      if (attribute.isJSXAttribute()) {
        const name = getAttrName(attribute.node);
        const value = attribute.get('value');

        if (!value.node) {
          props[name] = true;
        } else if (value.isStringLiteral()) {
          props[name] = value.node.value;
        } else if (value.isJSXExpressionContainer()) {
          const expression = value.get('expression');
          processJSXAttributeExpression(expression, name, props, path, state, transformJSX, type);
          hasExpression = true;
        } else if (value.isJSXElement() || value.isJSXFragment()) {
          transformJSX(value);
          props[name] = value.node;
        }
      } else if (attribute.isJSXSpreadAttribute()) {
        props._$spread$ = attribute.get('argument').node;
        hasExpression = true;
      }
    });

  return { props, hasExpression };
}

/**
 * Process JSX attribute expression
 * @param expression Expression node path
 * @param name Attribute name
 * @param props Properties object
 * @param path JSX element path
 * @param state Babel state
 * @param transformJSX JSX transformation function
 * @param type Optional rendering mode type
 */
function processJSXAttributeExpression(
  expression: NodePath,
  name: string,
  props: Record<string, any>,
  path: NodePath<t.JSXElement>,
  state: State,
  transformJSX: (path: NodePath<JSXElement>) => void,
  type?: string,
): void {
  if (expression.isStringLiteral()) {
    props[name] = expression.node.value;
  } else if (expression.isNumericLiteral()) {
    props[name] = expression.node.value;
  } else if (expression.isJSXElement() || expression.isJSXFragment()) {
    transformJSX(expression);
    props[name] = expression.node;
  } else if (expression.isExpression()) {
    if (/^key|ref|on.+$/.test(name)) {
      props[name] = expression.node;
    } else if (/^bind:.+/.test(name)) {
      processBind(name, expression, props, path);
    } else if (expression.isConditionalExpression() && type !== 'ssg') {
      addImport(importObject.computed);
      props[name] = t.callExpression(state.imports.computed, [
        t.arrowFunctionExpression([], expression.node),
      ]);
    } else {
      props[name] = expression.node;
    }
  }
}

/**
 * Process bind attribute
 * @param name Attribute name
 * @param expression Expression node path
 * @param props Properties object
 * @param path JSX element path
 */
function processBind(
  name: string,
  expression: NodePath,
  props: Record<string, any>,
  path: NodePath<t.JSXElement>,
): void {
  const value = path.scope.generateUidIdentifier('value');
  const bindName = name.slice(5).toLowerCase();
  props[bindName] = expression.node;
  props[`update${capitalize(bindName)}`] = t.arrowFunctionExpression(
    [value],
    t.assignmentExpression('=', expression.node as t.OptionalMemberExpression, value),
  );
}

/**
 * Checks if an object expression has conditional properties and processes them
 * @param prop Property name
 * @param value Object expression
 * @param props Properties object
 * @param state Babel state
 * @param isCt Flag indicating if this is a class or style attribute
 * @returns CSS string for inline styles/classes
 */
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
    addImport(importObject.computed);
    props[prop] = t.callExpression(state.imports.computed, [t.arrowFunctionExpression([], value)]);
  } else if (isCt) {
    value.properties.forEach(property => {
      if (t.isObjectProperty(property)) {
        ct += `${(property.key as t.Identifier).name || (property.key as t.StringLiteral).value}:${(property.value as t.StringLiteral).value};`;
      }
    });

    delete props[prop];
  }
  return ct;
}

/**
 * Get child elements from a JSX element
 * @param path JSX element path
 * @param transformJSX JSX transformation function
 * @returns Array of transformed expression nodes
 */
export function getChildren(
  path: NodePath<JSXElement>,
  transformJSX: (path: NodePath<JSXElement>) => void,
): t.Expression[] {
  return path
    .get('children')
    .filter(child => {
      // Use type assertion since we know these paths are JSXChild types
      return (
        (child as NodePath<any>).isJSXElement() ||
        (child as NodePath<any>).isJSXFragment() ||
        ((child as NodePath<any>).isJSXExpressionContainer() &&
          !(child as any).get('expression').isJSXEmptyExpression())
      );
    })
    .map(child => {
      if ((child as NodePath<any>).isJSXElement() || (child as NodePath<any>).isJSXFragment()) {
        transformJSX(child as NodePath<JSXElement>);
        return (child as NodePath<any>).node;
      }
      if ((child as NodePath<any>).isJSXExpressionContainer()) {
        const expression = (child as any).get('expression');
        if (!expression.isJSXEmptyExpression()) {
          return expression.node as t.Expression;
        }
      } else if ((child as NodePath<any>).isJSXText()) {
        const text = (child as any).node.value.replaceAll(/\s+/g, ' ').trim();
        if (text) {
          return t.stringLiteral(text);
        }
      }
      return null;
    })
    .filter(Boolean) as t.Expression[];
}

/**
 * Process component element common to all strategies
 * @param path Node path
 * @param state Babel state
 * @param transformJSX JSX transformation function
 * @param tagName Tag name
 * @param props Properties object
 */
export function handleComponentElement(
  path: any,
  state: State,
  transformJSX: Function,
  tagName: string,
  props: Record<string, any>,
): void {
  addImport(importObject.createComponent);

  // Get child elements
  const children = path
    .get('children')
    .filter(
      (child: any) =>
        child.isJSXElement() ||
        child.isJSXFragment() ||
        (child.isJSXExpressionContainer() && !child.get('expression').isJSXEmptyExpression()),
    )
    .map((child: any) => {
      if (child.isJSXElement() || child.isJSXFragment()) {
        transformJSX(child);
        return child.node;
      }
      if (child.isJSXExpressionContainer()) {
        return child.get('expression').node;
      }
      return null;
    })
    .filter(Boolean);

  if (children.length > 0) {
    props.children = children;
  }
}
