/**
 * @file Client-side rendering transformation strategy
 */

import { isSVGTag, isSelfClosingTag } from '@estjs/shared';
import { type NodePath, types as t } from '@babel/core';
import { addImport, importObject } from '../import';
import { getChildren, hasObjectExpression, processJSXAttributes } from './attributes';
import { generateChildrenMaps, processChildren } from './children';
import {
  createPropsObjectExpression,
  getNodeText,
  hasSiblingElement,
  isTextChild,
  isValidChild,
  replaceSpace,
  setNodeText,
} from './utils';
import { BaseTransformStrategy } from './base';
import type { ClientResult, JSXChild, JSXElement } from './types';

/**
 * Client-side rendering transformation strategy
 */
export class ClientTransformStrategy extends BaseTransformStrategy {
  /**
   * Create client-side transformation result
   */
  createResult(): ClientResult {
    return {
      index: 1,
      isLastChild: false,
      parentIndex: 0,
      props: {},
      template: '',
    };
  }

  /**
   * Transform JSX element for client-side rendering
   * @param path JSX element path
   */
  transform(path: NodePath<JSXElement>): void {
    const previousResult = this.result;
    this.result = this.createResult();

    this.transformJSXElement(path, true);

    // Check if it's a root component and currently in client rendering mode
    const isRoot =
      path.parent && (t.isReturnStatement(path.parent) || t.isVariableDeclarator(path.parent));

    // Check if HMR functionality is enabled
    const isHmrEnabled = this.state.opts.hmr !== false;

    // Add Fragment import for JSX Fragment elements
    if (path.isJSXFragment()) {
      addImport(importObject.Fragment);
    }

    if (isHmrEnabled && path.isJSXElement()) {
      const { tagName, isComponent } = this.detectElementType(path);

      // For Fragments, add the Fragment import
      if (tagName === 'Fragment') {
        addImport(importObject.Fragment);
      }

      // Only apply HMR wrapping to component types
      if (isComponent) {
        // Check if it's a root-level component
        if (isRoot) {
          // Create HMR wrapper node
          const hmrWrapped = this.createHMRWrapper(path, tagName, this.result.props);
          path.replaceWith(hmrWrapped);
        } else {
          // Nested component processing
          path.replaceWith(this.createNestedComponentNode(path, tagName));
        }
      } else {
        path.replaceWith(this.createClientNode(path));
      }
    } else {
      path.replaceWith(this.createClientNode(path));
    }

    this.result = previousResult;
  }

  /**
   * Add content to the template string
   * @param content Content to add
   */
  private addTemplate(content: string): void {
    (this.result as ClientResult).template += content;
  }

  /**
   * Transform a JSX element
   * @param path JSX element path
   * @param isRoot Flag indicating if this is a root element
   */
  private transformJSXElement(path: NodePath<JSXElement>, isRoot = false): void {
    if (path.isJSXElement()) {
      const { tagName, isComponent } = this.detectElementType(path);
      const isSelfClosing = !isComponent && isSelfClosingTag(tagName);
      const isSvg = isSVGTag(tagName) && (this.result as ClientResult).index === 1;

      const { props } = processJSXAttributes(path, this.state, this.transform.bind(this));

      if (isComponent) {
        if (tagName === 'Fragment') {
          addImport(importObject.Fragment);
        }

        if (isRoot) {
          this.result.props = props;
          const children = getChildren(path, this.transform.bind(this));
          if (children.length > 0) {
            this.result.props.children = children;
          }
        } else {
          this.transform(path);
          this.replaceChild(path.node);
        }
      } else {
        if (isSvg) {
          this.addTemplate('<svg _svg_>');
        }

        this.addTemplate(`<${tagName}`);
        this.handleAttributes(props);
        this.addTemplate(isSelfClosing ? '/>' : '>');

        if (!isSelfClosing) {
          this.transformChildren(path);
          if (hasSiblingElement(path)) {
            this.addTemplate(`</${tagName}>`);
          }
        }
      }
    } else if (path.isJSXFragment()) {
      // Handle Fragments
      addImport(importObject.Fragment);
      (this.result as ClientResult).index--;
      this.transformChildren(path);
    } else {
      (this.result as ClientResult).index--;
      this.transformChildren(path);
    }
  }

  /**
   * Handle JSX attributes
   * @param props Properties object
   */
  private handleAttributes(props: Record<string, any>): void {
    let klass = '';
    let style = '';

    for (const [prop, value] of Object.entries(props)) {
      if (prop === 'class' && typeof value === 'string') {
        klass += ` ${value}`;
        delete props[prop];
      } else if (prop === 'style' && typeof value === 'string') {
        style += `${value}${value.at(-1) === ';' ? '' : ';'}`;
        delete props[prop];
      } else if (value === true) {
        this.addTemplate(` ${prop}`);
        delete props[prop];
      } else if (value === false) {
        delete props[prop];
      } else if (typeof value === 'string' || typeof value === 'number') {
        this.addTemplate(` ${prop}="${value}"`);
        delete props[prop];
      } else if (t.isConditionalExpression(value)) {
        addImport(importObject.computed);
        props[prop] = t.callExpression(this.state.imports.computed, [
          t.arrowFunctionExpression([], value),
        ]);
      } else if (t.isObjectExpression(value)) {
        const val = hasObjectExpression(
          prop,
          value,
          props,
          this.state,
          prop === 'class' || prop === 'style',
        );
        if (val) {
          if (prop === 'class') {
            klass += ` ${val}`;
          }
          if (prop === 'style') {
            style += `${val}${val.at(-1) === ';' ? '' : ';'}`;
          }
        }
      }
    }

    if (Object.keys(props).length > 0) {
      this.result.props[(this.result as ClientResult).index] = props;
    }

    if (klass.trim()) {
      this.addTemplate(` class="${klass.trim()}"`);
    }
    if (style.trim()) {
      this.addTemplate(` style="${style.trim()}"`);
    }
  }

  /**
   * Replace child node
   * @param node Expression node
   */
  private replaceChild(node: t.Expression): void {
    if (this.result.isLastChild) {
      (this.result as ClientResult).index--;
    } else {
      this.addTemplate('<!>');
    }
    this.result.props[this.result.parentIndex] ??= {};
    this.result.props[this.result.parentIndex].children ??= [];
    this.result.props[this.result.parentIndex].children.push({
      node,
      before: this.result.isLastChild ? null : String((this.result as ClientResult).index),
    });
  }

  /**
   * Transform children nodes
   * @param path JSX element path
   */
  private transformChildren(path: NodePath<JSXElement>): void {
    const parentIndex = (this.result as ClientResult).index;
    path
      .get('children')
      .reduce((pre, cur) => {
        if (isValidChild(cur)) {
          const lastChild = pre.at(-1);
          if (lastChild && isTextChild(cur) && isTextChild(lastChild)) {
            setNodeText(lastChild, getNodeText(lastChild) + getNodeText(cur));
          } else {
            pre.push(cur);
          }
        }
        return pre;
      }, [] as NodePath<JSXChild>[])
      .forEach((child, i, arr) => {
        this.result.parentIndex = parentIndex;
        this.result.isLastChild = i === arr.length - 1;
        this.transformChild(child);
      });
  }

  /**
   * Transform a single child node
   * @param child Child node path
   */
  private transformChild(child: NodePath<JSXChild>): void {
    if (child.isJSXElement() || child.isJSXFragment()) {
      (this.result as ClientResult).index++;
      this.transformJSXElement(child);
    } else if (child.isJSXExpressionContainer()) {
      const expression = child.get('expression');
      if (expression.isStringLiteral() || expression.isNumericLiteral()) {
        (this.result as ClientResult).index++;
        this.addTemplate(`${expression.node.value}`);
      } else if (expression.isExpression()) {
        (this.result as ClientResult).index++;
        this.replaceChild(expression.node);
      }
    } else if (child.isJSXText()) {
      (this.result as ClientResult).index++;
      this.addTemplate(replaceSpace(child.node));
    } else {
      throw new Error('Unsupported child type');
    }
  }

  /**
   * Create client-side rendering node
   * @param path JSX element path
   * @returns Transformed expression node
   */
  private createClientNode(path: NodePath<JSXElement>): t.CallExpression {
    const isJSXFragment = path.isJSXFragment();
    const { tagName, isComponent } = this.detectElementType(path);

    // For fragments, return a simple Fragment call with children if any
    if (isJSXFragment || (isComponent && tagName === 'Fragment')) {
      addImport(importObject.Fragment);

      // Extract children from props
      const props = this.result.props || {};
      const children = this.extractChildren(path);
      if (children.length > 0) {
        props.children = children;
      }

      return t.callExpression(this.state.imports.Fragment, [
        createPropsObjectExpression(props, true),
      ]);
    }

    const tmpl = isComponent ? t.identifier(tagName) : path.scope.generateUidIdentifier('_tmpl$');

    // Create the template node if not a component
    if (!isComponent) {
      const templateNode = t.callExpression(this.state.imports.template, [
        t.stringLiteral((this.result as ClientResult).template),
      ]);
      this.state.templateDeclaration.declarations.push(t.variableDeclarator(tmpl, templateNode));
      addImport(importObject.template);
    }

    const propsArg = this.createPropsObjectExpression(this.result.props, isComponent);
    const args = isComponent && tagName === 'Fragment' ? [propsArg] : [tmpl, propsArg];

    const fnName =
      isJSXFragment || (isComponent && tagName === 'Fragment') ? 'Fragment' : 'createComponent';

    addImport(importObject[fnName]);

    if (isComponent) {
      return t.callExpression(this.state.imports[fnName], args);
    }

    const { childrenIndexMap, idxs } = generateChildrenMaps(this.result.props);

    const body: t.Statement[] = [];
    const el = path.scope.generateUidIdentifier('el');
    const nodes = path.scope.generateUidIdentifier('nodes');

    body.push(
      t.variableDeclaration('const', [t.variableDeclarator(el, t.callExpression(tmpl, []))]),
    );

    if (childrenIndexMap?.length) {
      addImport(importObject.mapNodes);
      body.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            nodes,
            t.callExpression(this.state.imports.mapNodes, [
              el,
              t.arrayExpression(idxs.map(key => t.numericLiteral(+key))),
            ]),
          ),
        ]),
      );

      processChildren(childrenIndexMap, nodes, body, this.state);
    }

    body.push(t.returnStatement(el));

    return t.callExpression(t.arrowFunctionExpression([], t.blockStatement(body)), []);
  }

  /**
   * Extract children from JSX elements
   */
  private extractChildren(path: NodePath<JSXElement>): t.Expression[] {
    return path
      .get('children')
      .filter(child => isValidChild(child as NodePath<JSXChild>))
      .map(child => {
        if ((child as NodePath<any>).isJSXElement() || (child as NodePath<any>).isJSXFragment()) {
          this.transform(child as NodePath<JSXElement>);
          return (child as NodePath<any>).node;
        }
        if ((child as NodePath<any>).isJSXExpressionContainer()) {
          const expression = (child as any).get('expression');
          if (!expression.isJSXEmptyExpression()) {
            return expression.node as t.Expression;
          }
        } else if ((child as NodePath<any>).isJSXText()) {
          const text = replaceSpace((child as any).node);
          if (text) {
            return t.stringLiteral(text);
          }
        }
        return t.stringLiteral('');
      })
      .filter(node => !t.isStringLiteral(node) || node.value !== '');
  }

  /**
   * Create props object expression
   * @param props Properties object
   * @param isComponent Flag indicating if this is a component
   * @returns Object expression
   */
  private createPropsObjectExpression(
    props: Record<string, any>,
    isComponent = false,
  ): t.ObjectExpression {
    return createPropsObjectExpression(props, isComponent);
  }

  /**
   * Create HMR wrapper for component
   * @param path JSX element path
   * @param componentName Component name
   * @param props Component properties
   * @returns Wrapped expression node
   */
  private createHMRWrapper(
    path: NodePath<JSXElement>,
    componentName: string,
    props: Record<string, any>,
  ): t.Expression {
    // Add HMR related imports
    addImport(importObject.createHMR);
    addImport(importObject.acceptHMR);

    // Extract children if available
    const children = this.extractChildren(path);
    if (children.length > 0) {
      props.children = children;
    }

    // Get current filename and location info for module identification
    const filename = (path.hub as any).file?.opts?.filename || '';
    const location = path.node.loc
      ? `${path.node.loc.start.line}:${path.node.loc.start.column}`
      : '';

    // Create component props parameter
    const propsArg = this.createPropsObjectExpression(props, true);

    // Add HMR metadata to props
    if (t.isObjectExpression(propsArg)) {
      propsArg.properties.push(
        t.objectProperty(t.stringLiteral('__hmrRoot'), t.booleanLiteral(true)),
      );
    }

    // Create hot update wrapper
    return t.callExpression(this.state.imports.createHMR, [
      // Component identification info
      t.stringLiteral(`${componentName}${location ? `:${location}` : ''}`),
      // Component itself
      t.identifier(componentName),
      // Component properties
      propsArg,
      // File path
      t.stringLiteral(filename),
      // Hot update acceptance handler
      t.arrowFunctionExpression(
        [t.identifier('newModule')],
        t.blockStatement([
          t.expressionStatement(
            t.callExpression(this.state.imports.acceptHMR, [
              t.identifier('newModule'),
              t.identifier(componentName),
            ]),
          ),
        ]),
      ),
    ]);
  }

  /**
   * Create nested component rendering node
   * @param path JSX element path
   * @param componentName Component name
   * @returns Component expression node
   */
  private createNestedComponentNode(
    path: NodePath<JSXElement>,
    componentName: string,
  ): t.Expression {
    // Extract props and children
    const props = this.result.props || {};
    const children = this.extractChildren(path);
    if (children.length > 0) {
      props.children = children;
    }

    const propsArg = this.createPropsObjectExpression(props, true);

    // For Fragment component, use the Fragment import
    if (componentName === 'Fragment') {
      addImport(importObject.Fragment);
      return t.callExpression(this.state.imports.Fragment, [propsArg]);
    }

    // Add component metadata for tracking
    const metadataProperty = t.objectProperty(
      t.stringLiteral('__hmrComponent'),
      t.stringLiteral(componentName),
    );

    // Add to props object
    if (t.isObjectExpression(propsArg)) {
      propsArg.properties.push(metadataProperty);
    }

    // Create component node
    addImport(importObject.createComponent);
    return t.callExpression(this.state.imports.createComponent, [
      t.identifier(componentName),
      propsArg,
    ]);
  }
}
