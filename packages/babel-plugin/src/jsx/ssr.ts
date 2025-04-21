/**
 * @file Server-Side Rendering (SSR) transformation strategy
 */

import { isSVGTag, isSelfClosingTag } from '@estjs/shared';
import { type NodePath, types as t } from '@babel/core';
import { addImport, importObject } from '../import';
import { getChildren, hasObjectExpression, processJSXAttributes } from './attributes';
import {
  createPropsObjectExpression,
  getNodeText,
  getTagName,
  hasSiblingElement,
  isComponentName,  
  isTextChild,
  isValidChild,
  replaceSpace,
  setNodeText,
} from './utils';
import { generateChildrenMaps, processChildren } from './children';
import { BaseTransformStrategy } from './base';
import type { JSXChild, JSXElement, SSRResult } from './types';
import type { State } from '../types';

/**
 * Server-Side Rendering (SSR) transformation strategy
 */
export class SSRTransformStrategy extends BaseTransformStrategy {
  /**
   * Create SSR transformation result
   */
  createResult(): SSRResult {
    return {
      index: 1,
      isLastChild: false,
      parentIndex: 0,
      props: {},
      template: '',
    };
  }

  /**
   * Transform JSX element for SSR
   * @param path JSX element path
   */
  transform(path: NodePath<JSXElement>): void {
    const previousResult = this.result;
    this.result = this.createResult();

    this.transformJSXElement(path, true);
    path.replaceWith(this.createSSRNode(path));

    this.result = previousResult;
  }

  /**
   * Add content to template string
   * @param content Content to add
   */
  private addTemplate(content: string): void {
    (this.result as SSRResult).template += content;
  }

  /**
   * Create SSR node
   * @param path JSX element path
   * @returns SSR call expression
   */
  private createSSRNode(path: NodePath<JSXElement>): t.CallExpression {
    const state = path.state as State;
    const isJSXFragment = path.isJSXFragment();
    const { tagName, isComponent } = this.detectElementType(path);

    // Always add Fragment import when handling fragments
    if (isJSXFragment || (isComponent && tagName === 'Fragment')) {
      addImport(importObject.Fragment);
    }

    // 特殊处理 Fragment
    if (isJSXFragment || (isComponent && tagName === 'Fragment')) {
      // Fragment 应该将它的模板内容传递出去，而不是返回空的 Fragment 调用
      if ((this.result as SSRResult).template) {
        addImport(importObject.getNextElement);
        const tmpl = path.scope.generateUidIdentifier('_tmpl$');
        const templateNode = t.callExpression(state.imports.getNextElement, [
          t.stringLiteral((this.result as SSRResult).template),
        ]);
        this.state.templateDeclaration.declarations.push(t.variableDeclarator(tmpl, templateNode));

        const el = path.scope.generateUidIdentifier('el');
        const body: t.Statement[] = [];

        body.push(
          t.variableDeclaration('const', [t.variableDeclarator(el, t.callExpression(tmpl, []))]),
        );
        body.push(t.returnStatement(el));

        return t.callExpression(t.arrowFunctionExpression([], t.blockStatement(body)), []);
      }

      // 如果没有内容但确实是 Fragment，则返回 Fragment 调用
      // 获取 props 和 children
      const props = this.result.props || {};
      const children = this.processChildrenForFragment(path);
      if (children.length > 0) {
        props.children = children;
      }

      return t.callExpression(state.imports.Fragment, [createPropsObjectExpression(props, true)]);
    }

    const tmpl = isComponent ? t.identifier(tagName) : path.scope.generateUidIdentifier('_tmpl$');

    // 与原始版本保持一致，使用 getNextElement 而非 template
    if (!isComponent) {
      const templateNode = t.callExpression(state.imports.getNextElement, [
        t.stringLiteral((this.result as SSRResult).template),
      ]);
      this.state.templateDeclaration.declarations.push(t.variableDeclarator(tmpl, templateNode));
      addImport(importObject.getNextElement);
    }

    const propsArg = createPropsObjectExpression(this.result.props, isComponent);
    const args = isComponent && tagName === 'Fragment' ? [propsArg] : [tmpl, propsArg];

    const fnName =
      isJSXFragment || (isComponent && tagName === 'Fragment') ? 'Fragment' : 'createComponent';

    addImport(importObject[fnName]);

    if (isComponent) {
      return t.callExpression(state.imports[fnName], args);
    }

    const { childrenIndexMap, idxs } = generateChildrenMaps(this.result.props);

    const body: t.Statement[] = [];
    const el = path.scope.generateUidIdentifier('el');
    const nodes = path.scope.generateUidIdentifier('nodes');

    body.push(
      t.variableDeclaration('const', [t.variableDeclarator(el, t.callExpression(tmpl, []))]),
    );

    if (childrenIndexMap?.length) {
      addImport(importObject.mapSSRNodes);
      body.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            nodes,
            t.callExpression(state.imports.mapSSRNodes, [
              el,
              t.arrayExpression(idxs.map(key => t.numericLiteral(+key))),
            ]),
          ),
        ]),
      );

      processChildren(childrenIndexMap, nodes, body, state);
    }

    body.push(t.returnStatement(el));

    return t.callExpression(t.arrowFunctionExpression([], t.blockStatement(body)), []);
  }

  /**
   * 处理 Fragment 的子元素
   */
  private processChildrenForFragment(path: NodePath<JSXElement>): t.Expression[] {
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
   * Transform JSX element
   * @param path JSX element path
   * @param isRoot Flag indicating if this is a root element
   */
  private transformJSXElement(path: NodePath<JSXElement>, isRoot = false): void {
    if (path.isJSXElement()) {
      const { tagName, isComponent } = this.detectElementType(path);
      const isSelfClosing = !isComponent && isSelfClosingTag(tagName);
      const isSvg = isSVGTag(tagName) && (this.result as SSRResult).index === 1;

      const { props } = processJSXAttributes(path, this.state, this.transform.bind(this));

      if (isComponent) {
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
      // 特殊处理 Fragment，确保添加Fragment导入
      addImport(importObject.Fragment);
      (this.result as SSRResult).index--;
      this.transformChildren(path);
    } else {
      (this.result as SSRResult).index--;
      this.transformChildren(path);
    }
  }

  /**
   * Handle attributes for SSR
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
      this.result.props[(this.result as SSRResult).index] = props;
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
      (this.result as SSRResult).index--;
    } else {
      this.addTemplate('<!>');
    }
    this.result.props[this.result.parentIndex] ??= {};
    this.result.props[this.result.parentIndex].children ??= [];

    // 特殊处理 JSX 元素组件
    if (t.isJSXElement(node)) {
      const tagName = getTagName(node);
      if (isComponentName(tagName)) {
        // 获取组件 props
        const props = this.extractComponentProps(node);

        // Create component call
        addImport(importObject.createComponent);
        this.result.props[this.result.parentIndex].children.push({
          node: t.callExpression(this.state.imports.createComponent, [
            t.identifier(tagName),
            createPropsObjectExpression(props, true),
          ]),
          before: this.result.isLastChild ? null : String((this.result as SSRResult).index),
        });
        return;
      }
    }

    this.result.props[this.result.parentIndex].children.push({
      node,
      before: this.result.isLastChild ? null : String((this.result as SSRResult).index),
    });
  }

  /**
   * Extract props from a JSX element
   */
  private extractComponentProps(node: t.JSXElement): Record<string, any> {
    const props: Record<string, any> = {};
    
    // Extract attributes
    node.openingElement.attributes.forEach(attr => {
      if (t.isJSXAttribute(attr)) {
        const name = t.isJSXIdentifier(attr.name) 
          ? attr.name.name 
          : `${attr.name.namespace.name}:${attr.name.name.name}`;
          
        if (!attr.value) {
          props[name] = true;
        } else if (t.isStringLiteral(attr.value)) {
          props[name] = attr.value.value;
        } else if (t.isJSXExpressionContainer(attr.value) && !t.isJSXEmptyExpression(attr.value.expression)) {
          props[name] = attr.value.expression;
        }
      } else if (t.isJSXSpreadAttribute(attr)) {
        props._$spread$ = attr.argument;
      }
    });
    
    // Extract children
    const children: t.Expression[] = [];
    node.children.forEach(child => {
      if (t.isJSXText(child)) {
        const text = child.value.trim();
        if (text) {
          children.push(t.stringLiteral(text));
        }
      } else if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
        children.push(child.expression);
      } else if (t.isJSXElement(child) || t.isJSXFragment(child)) {
        // For nested JSX elements, create a temporary path and transform it
        const childProps = this.extractComponentProps(child as t.JSXElement);
        const childTagName = t.isJSXElement(child) ? getTagName(child) : 'Fragment';
        
        if (childTagName === 'Fragment') {
          addImport(importObject.Fragment);
        } else {
          addImport(importObject.createComponent);
        }
        
        const importName = childTagName === 'Fragment' ? 'Fragment' : 'createComponent';
        const args = childTagName === 'Fragment' 
          ? [createPropsObjectExpression(childProps, true)]
          : [t.identifier(childTagName), createPropsObjectExpression(childProps, true)];
          
        children.push(t.callExpression(this.state.imports[importName], args));
      }
    });
    
    if (children.length > 0) {
      props.children = children;
    }
    
    return props;
  }

  /**
   * Create a temporary NodePath for transformation
   * @param node JSX element to transform
   * @returns NodePath for the node
   */
  private createTempPath(node: t.JSXElement | t.JSXFragment): NodePath<JSXElement> {
    // Since we don't have access to the original path's context,
    // we'll create a simulated NodePath with the methods we need
    return {
      node: node as any,
      isJSXElement: () => t.isJSXElement(node),
      isJSXFragment: () => t.isJSXFragment(node),
      get: key => {
        if (key === 'children') {
          return (node as any).children.map((child: any) => ({
            node: child,
            isJSXElement: () => t.isJSXElement(child),
            isJSXFragment: () => t.isJSXFragment(child),
            isJSXExpressionContainer: () => t.isJSXExpressionContainer(child),
            isJSXText: () => t.isJSXText(child),
            get: (k: string) => (k === 'expression' ? { node: (child as any).expression } : null),
          }));
        }
        return null;
      },
      // Add transformer method to support transformation context
      transform: (transformer: any) =>
        transformer({
          node,
          isJSXElement: () => t.isJSXElement(node),
          isJSXFragment: () => t.isJSXFragment(node),
        }),
      // Add state reference for transformation
      state: this.state,
    } as any as NodePath<JSXElement>;
  }

  /**
   * Transform children nodes
   * @param path JSX element path
   */
  private transformChildren(path: NodePath<JSXElement>): void {
    const parentIndex = (this.result as SSRResult).index;
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
    (this.result as SSRResult).index++;
    if (child.isJSXElement() || child.isJSXFragment()) {
      this.transformJSXElement(child);
    } else if (child.isJSXExpressionContainer()) {
      const expression = child.get('expression');
      if (expression.isStringLiteral() || expression.isNumericLiteral()) {
        this.addTemplate(`${expression.node.value}`);
      } else if (expression.isExpression() && !expression.isJSXEmptyExpression()) {
        this.replaceChild(expression.node);
      }
    } else if (child.isJSXText()) {
      this.addTemplate(replaceSpace(child.node));
    } else {
      throw new Error('Unsupported child type');
    }
  }

  /**
   * Create nested props object
   */
  private createNestedProps(props: Record<string, any>, isComponent = true): t.ObjectExpression {
    const result: (t.ObjectProperty | t.SpreadElement)[] = [];
    for (const prop in props) {
      let value = props[prop];
      if (!isComponent && prop === 'children') {
        continue;
      }
      if (Array.isArray(value)) {
        value = t.arrayExpression(value);
      }
      if (typeof value === 'object' && value !== null && !t.isNode(value)) {
        value = this.createNestedProps(value);
      }
      if (typeof value === 'string') {
        value = t.stringLiteral(value);
      }
      if (typeof value === 'number') {
        value = t.numericLiteral(value);
      }
      if (typeof value === 'boolean') {
        value = t.booleanLiteral(value);
      }
      if (value === undefined) {
        value = t.tsUndefinedKeyword();
      }
      if (value === null) {
        value = t.nullLiteral();
      }
      if (prop === '_$spread$') {
        result.push(t.spreadElement(value));
      } else {
        result.push(t.objectProperty(t.stringLiteral(prop), value));
      }
    }
    return t.objectExpression(result);
  }
}
