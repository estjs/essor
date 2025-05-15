/**
 * @file Static Site Generation (SSG) transformation strategy
 */

import { isPrimitive, isSelfClosingTag, isSymbol } from '@estjs/shared';
import { type NodePath, types as t } from '@babel/core';
import { addImport, importObject } from '../import';
import { getChildren, processJSXAttributes } from './attributes';
import { createPropsObjectExpression, isComponentName, isValidChild, replaceSpace } from './utils';
import { BaseTransformStrategy } from './base';
import type { JSXChild, JSXElement, SSGResult } from './types';

/**
 * Static Site Generation (SSG) transformation strategy
 */
export class SSGTransformStrategy extends BaseTransformStrategy {
  /**
   * Create SSG transformation result
   */
  createResult(): SSGResult {
    return {
      index: 1,
      isLastChild: false,
      parentIndex: 0,
      props: {},
      dynamics: [],
      template: [],
    };
  }

  /**
   * Transform JSX element for SSG
   * @param path JSX element path
   */
  transform(path: NodePath<JSXElement>): void {
    const previousResult = this.result;
    this.result = this.createResult();
    (this.result as SSGResult).isLastChild = false;
    (this.result as SSGResult).parentIndex = 0;

    this.transformJSXElement(path, true);
    path.replaceWith(this.createSSGNode(path));

    this.result = previousResult;
  }

  /**
   * Add content to template array
   * @param content Content to add
   * @param join Flag indicating whether to join with the previous content
   */
  private addTemplate(content: string, join = false): void {
    const result = this.result as SSGResult;
    if (result.template.length === 0) {
      result.template.push(content);
    } else {
      if (join) {
        result.template[result.template.length - 1] += content;
      } else {
        result.template.push(content);
      }
    }
  }

  /**
   * Create SSG node
   * @param path JSX element path
   * @returns SSG call expression
   */
  private createSSGNode(path: NodePath<JSXElement>): t.CallExpression {
    const result = this.result as SSGResult;
    const tmpl = path.scope.generateUidIdentifier('_tmpl$');
    const filteredHtml = result.template.filter(part => part !== '');
    const templateNode = t.arrayExpression(filteredHtml.map(t.stringLiteral));

    // Add template declaration to program
    this.state.templateDeclaration.declarations.push(t.variableDeclarator(tmpl, templateNode));

    // Import necessary SSG utility functions
    addImport(importObject.render);
    addImport(importObject.getHydrationKey);

    // Create parameters for render call
    const args = [tmpl, t.callExpression(this.state.imports.getHydrationKey, [])];

    // Add dynamic parameters in order
    result.dynamics.forEach(dynamic => {
      if (dynamic.type === 'attr') {
        addImport(importObject.setSSGAttr);
        addImport(importObject.escapeHTML);
        args.push(
          t.callExpression(this.state.imports.setSSGAttr, [
            t.stringLiteral(dynamic.attrName!),
            t.callExpression(this.state.imports.escapeHTML, [dynamic.node]),
            t.booleanLiteral(false),
          ]),
        );
      } else {
        // For components, add directly without escaping
        args.push(dynamic.node);
      }
    });

    return t.callExpression(this.state.imports.render, args);
  }

  /**
   * Transform JSX element
   * @param path JSX element path
   * @param isRoot Flag indicating if this is a root element
   */
  private transformJSXElement(path: NodePath<JSXElement>, isRoot = false): void {
    if (path.isJSXElement()) {
      const { tagName, isComponent } = this.detectElementType(path);
      const isSelfClosing = isSelfClosingTag(tagName);

      const { props } = processJSXAttributes(path, this.state, this.transform.bind(this), 'ssg');

      if (isComponent) {
        if (isRoot) {
          this.result.props = props;
          const children = getChildren(path, this.transform.bind(this));
          if (children.length > 0) {
            this.result.props.children = children;
          }
        } else {
          this.addTemplate(`<!--${(this.result as SSGResult).index}-->`, false);
          addImport(importObject.createSSGComponent);
          addImport(importObject.escapeHTML);

          // Get children
          const children = getChildren(path, this.transform.bind(this));
          if (children.length > 0) {
            props.children = children[0]; // Take only the first child as children
          }

          // Create component call
          (this.result as SSGResult).dynamics.push({
            type: 'text',
            node: t.callExpression(this.state.imports.createSSGComponent, [
              t.identifier(tagName),
              createPropsObjectExpression(props, true),
            ]),
          });
          (this.result as SSGResult).index++;
        }
      } else {
        this.addTemplate(`<${tagName} data-idx="${(this.result as SSGResult).index++}" `, true);
        this.handleAttributes(props);

        if (!isSelfClosing) {
          this.addTemplate('>', true);
          this.transformChildren(path);
          this.addTemplate(`</${tagName}>`, true);
        } else {
          this.addTemplate('/>', false);
        }
      }
    } else {
      this.transformChildren(path);
    }
  }

  /**
   * Handle attributes for SSG
   * @param props Properties object
   */
  private handleAttributes(props: Record<string, any>): void {
    const propsArray = Object.entries(props);
    for (const [prop, value] of propsArray) {
      if (isPrimitive(value) && !isSymbol(value)) {
        this.addTemplate(` ${prop}="${value}"`, true);
        delete props[prop];
      } else if (prop !== 'children' && !prop.startsWith('on') && !prop.startsWith('update')) {
        // Add an empty attribute, break
        this.addTemplate('', false);
        (this.result as SSGResult).dynamics.push({
          type: 'attr',
          node: value as t.Expression,
          attrName: prop,
        });
      }
    }
  }

  /**
   * Transform children
   * @param path JSX element path
   */
  private transformChildren(path: NodePath<JSXElement>): void {
    const children = path.get('children').filter(isValidChild);
    children.forEach((child, i) => {
      this.result.isLastChild = i === children.length - 1;
      this.transformChild(child as NodePath<JSXChild>);
    });
  }

  /**
   * Transform a single child node
   * @param child Child node path
   */
  private transformChild(child: NodePath<JSXChild>): void {
    if (child.isJSXElement() || child.isJSXFragment()) {
      this.transformJSXElement(child as NodePath<JSXElement>);
    } else if (child.isJSXExpressionContainer()) {
      const expression = child.get('expression');
      if (expression.isStringLiteral() || expression.isNumericLiteral()) {
        this.addTemplate(`${expression.node.value}`, true);
      } else if (expression.isExpression() && !expression.isJSXEmptyExpression()) {
        this.addTemplate('', false);

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

            if (jsxElement && isComponentName(this.getTagName(jsxElement))) {
              addImport(importObject.createSSGComponent);

              this.addTemplate(`<!--${(this.result as SSGResult).index}-->`, true);
              (this.result as SSGResult).index++;

              // Get component props by handling the callback body path carefully
              // This is a bit complex because we need to extract props from the JSX element inside the callback
              let bodyPath: NodePath;
              if (t.isBlockStatement(mapCallback.body)) {
                // For block statements, we need to drill down to the expression
                bodyPath = child.get('expression').get('arguments')[0].get('body').get('body')[0];
                if (t.isReturnStatement(bodyPath.node)) {
                  bodyPath = bodyPath.get('argument');
                }
              } else {
                // For expression bodies, we can access directly
                bodyPath = child.get('expression').get('arguments')[0].get('body');
              }

              // Only proceed if we have a valid JSX element
              const { props } = processJSXAttributes(
                bodyPath.isJSXElement() ? (bodyPath as NodePath<t.JSXElement>) : path,
                this.state,
                this.transform.bind(this),
              );

              // Create new callback function, return createSSGComponent call
              expression.node.arguments[0] = t.arrowFunctionExpression(
                mapCallback.params,
                t.callExpression(this.state.imports.createSSGComponent, [
                  t.identifier(this.getTagName(jsxElement)),
                  createPropsObjectExpression(props, true),
                ]),
              );

              (this.result as SSGResult).dynamics.push({
                type: 'text',
                node: expression.node,
              });
              return;
            }
          }
        }

        // Handle other expressions
        (this.result as SSGResult).dynamics.push({
          type: 'text',
          node: expression.node as t.Expression,
        });
      }
    } else if (child.isJSXText()) {
      const text = replaceSpace(child.node);
      if (text) {
        this.addTemplate(text, true);
      }
    }
  }

  /**
   * Get tag name from JSX element
   * @param node JSX element
   * @returns Tag name
   */
  private getTagName(node: t.JSXElement): string {
    const tag = node.openingElement.name;

    if (t.isJSXMemberExpression(tag)) {
      return this.jsxMemberExpressionToString(tag);
    }

    if (t.isJSXIdentifier(tag)) {
      return tag.name;
    }

    return `${tag.namespace.name}:${tag.name.name}`;
  }

  /**
   * Convert JSX member expression to string
   * @param node JSX member expression
   * @returns String representation
   */
  private jsxMemberExpressionToString(node: t.JSXMemberExpression): string {
    if (t.isJSXMemberExpression(node.object)) {
      return `${this.jsxMemberExpressionToString(node.object)}.${(node.property as t.JSXIdentifier).name}`;
    }
    return `${(node.object as t.JSXIdentifier).name}.${(node.property as t.JSXIdentifier).name}`;
  }
}
