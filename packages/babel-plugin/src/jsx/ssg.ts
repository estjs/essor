import { isPrimitive, isSelfClosingTag, isSymbol } from '@estjs/shared';
import { types as t } from '@babel/core';
import { addImport, importObject } from '../import';
import {
  type JSXElement,
  type SSGResult,
  createPropsObjectExpression,
  createSSGResult,
  getChildren,
  getTagName,
  isComponentName,
  isValidChild,
  processJSXAttributes,
  replaceSpace,
} from './common';
import type { State } from '../types';
import type { NodePath } from '@babel/core';

// Current transformation state
let currentResult: SSGResult;

/**
 * Add content to template
 */
function addTemplate(content: string, join = false): void {
  if (currentResult.template.length === 0) {
    currentResult.template.push(content);
  } else {
    if (join) {
      currentResult.template[currentResult.template.length - 1] += content;
    } else {
      currentResult.template.push(content);
    }
  }
}

export function transformJSX(path: NodePath<JSXElement>): void {
  const preResult = currentResult;
  currentResult = createSSGResult();
  currentResult.isLastChild = false;
  currentResult.parentIndex = 0;

  transformJSXElement(path, true);
  path.replaceWith(createSSGNode(path));

  currentResult = preResult;
}

function createSSGNode(path: NodePath<JSXElement>): t.CallExpression {
  const state = path.state as State;
  const tmpl = path.scope.generateUidIdentifier('_tmpl$');
  const filteredHtml = currentResult.template.filter(part => part !== '');
  const templateNode = t.arrayExpression(filteredHtml.map(t.stringLiteral));
  path.state.templateDeclaration.declarations.push(t.variableDeclarator(tmpl, templateNode));

  // Import necessary SSG utility functions
  addImport(importObject.renderSSG);
  addImport(importObject.escapeHTML);
  addImport(importObject.setSSGAttr);
  addImport(importObject.getHydrationKey);

  // Create parameters for renderSSG call
  const args = [tmpl, t.callExpression(state.imports.getHydrationKey, [])];

  // Add dynamic parameters in order
  currentResult.dynamics.forEach(dynamic => {
    if (dynamic.type === 'attr') {
      args.push(
        t.callExpression(state.imports.setSSGAttr, [
          t.stringLiteral(dynamic.attrName!),
          t.callExpression(state.imports.escapeHTML, [dynamic.node]),
          t.booleanLiteral(false),
        ]),
      );
    } else {
      args.push(t.callExpression(state.imports.escapeHTML, [dynamic.node]));
    }
  });

  return t.callExpression(state.imports.renderSSG, args);
}

/**
 * Transform JSX element
 */
function transformJSXElement(path: NodePath<JSXElement>, isRoot = false): void {
  const state = path.state as State;
  if (path.isJSXElement()) {
    const tagName = getTagName(path.node);
    const isComponent = isComponentName(tagName);
    const isSelfClosing = isSelfClosingTag(tagName);

    const { props } = processJSXAttributes(path, state, transformJSX);

    if (isComponent) {
      if (isRoot) {
        currentResult.props = props;
        const children = getChildren(path, transformJSX);
        if (children.length > 0) {
          currentResult.props.children = children;
        }
      } else {
        addTemplate(`<!--${currentResult.index}-->`, false);
        addImport(importObject.createSSGComponent);
        addImport(importObject.escapeHTML);

        // Get children
        const children = getChildren(path, transformJSX);
        if (children.length > 0) {
          props.children = children[0]; // Take only the first child as children
        }

        // Create component call
        currentResult.dynamics.push({
          type: 'text',
          node: t.callExpression(state.imports.escapeHTML, [
            t.callExpression(state.imports.createSSGComponent, [
              t.identifier(tagName),
              createPropsObjectExpression(props, true),
            ]),
          ]),
        });
        currentResult.index++;
      }
    } else {
      addTemplate(`<${tagName} data-idx="${currentResult.index++}" `, true);
      handleAttributes(props);

      if (!isSelfClosing) {
        addTemplate('>', true);
        transformChildren(path);
        addTemplate(`</${tagName}>`, true);
      } else {
        addTemplate(`/>`, false);
      }
    }
  } else {
    transformChildren(path);
  }
}

function handleAttributes(props: Record<string, any>): void {
  const propsArray = Object.entries(props);
  for (const [prop, value] of propsArray) {
    if (isPrimitive(value) && !isSymbol(value)) {
      addTemplate(` ${prop}="${value}"`, true);
      delete props[prop];
    } else if (prop !== 'children' && !prop.startsWith('on') && !prop.startsWith('update')) {
      // Add an empty attribute, break
      addTemplate('', false);
      currentResult.dynamics.push({
        type: 'attr',
        node: value,
        attrName: prop,
      });
    }
  }
}

/**
 * Transform children
 */
function transformChildren(path: NodePath<JSXElement>): void {
  const children = path.get('children').filter(isValidChild);
  children.forEach((child, i) => {
    currentResult.isLastChild = i === children.length - 1;
    transformChild(child);
  });
}

/**
 * Transform a single child node
 */
function transformChild(child: NodePath<any>): void {
  if (child.isJSXElement() || child.isJSXFragment()) {
    transformJSXElement(child);
  } else if (child.isJSXExpressionContainer()) {
    const expression = child.get('expression');
    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      addTemplate(`${expression.node.value}`, true);
    } else if (expression.isExpression() && !expression.isJSXEmptyExpression()) {
      addTemplate(`<!--${currentResult.index}-->`, false);

      // Process map function call
      if (expression.isCallExpression() && expression.get('callee').isMemberExpression()) {
        const mapCallback = expression.node.arguments[0];
        if (t.isArrowFunctionExpression(mapCallback) || t.isFunctionExpression(mapCallback)) {
          const callbackBody = t.isBlockStatement(mapCallback.body)
            ? mapCallback.body.body[0]
            : mapCallback.body;

          let jsxElement: t.JSXElement | null = null;
          if (t.isJSXElement(callbackBody)) {
            jsxElement = callbackBody;
          } else if (
            t.isParenthesizedExpression(callbackBody) &&
            t.isJSXElement(callbackBody.expression)
          ) {
            jsxElement = callbackBody.expression;
          }

          if (jsxElement && isComponentName(getTagName(jsxElement))) {
            addImport(importObject.createSSGComponent);
            // Get component props
            const { props } = processJSXAttributes(
              child.get('expression').get('arguments')[0].get('body'),
              child.state,
              transformJSX,
            );

            // Create new callback function, return createSSGComponent call
            expression.node.arguments[0] = t.arrowFunctionExpression(
              mapCallback.params,
              t.callExpression(child.state.createSSGComponent, [
                t.identifier(getTagName(jsxElement)),
                createPropsObjectExpression(props, true),
              ]),
            );

            currentResult.dynamics.push({
              type: 'text',
              node: expression.node,
            });
            currentResult.index++;
            return;
          }
        }
      }

      // Handle other expressions
      currentResult.dynamics.push({
        type: 'text',
        node: expression.node as t.Expression,
      });
      currentResult.index++;
    }
  } else if (child.isJSXText()) {
    const text = replaceSpace(child.node);
    if (text) {
      addTemplate(text, true);
    }
  }
}
