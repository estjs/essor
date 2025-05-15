/**
 * @file Base strategy for JSX transformations
 */

import { type NodePath, types as t } from '@babel/core';
import { addImport, importObject } from '../import';
import { getChildren, processJSXAttributes } from './attributes';
import { createPropsObjectExpression, getTagName, isComponentName } from './utils';
import type { ClientResult, JSXElement, SSGResult, SSRResult, TransformStrategy } from './types';
import type { State } from '../types';

/**
 * Abstract base strategy class for JSX transformations
 */
export abstract class BaseTransformStrategy implements TransformStrategy {
  /**
   * Current transformation result
   */
  protected result: ClientResult | SSRResult | SSGResult;

  /**
   * Babel state
   */
  protected state: State;

  /**
   * Create a new base strategy
   * @param state Babel state
   */
  constructor(state: State) {
    this.state = state;
    this.result = this.createResult();
  }

  /**
   * Transform a JSX element (to be implemented by subclasses)
   * @param path JSX element path
   */
  abstract transform(path: NodePath<JSXElement>): void;

  /**
   * Create transformation result (to be implemented by subclasses)
   */
  abstract createResult(): ClientResult | SSRResult | SSGResult;

  /**
   * Create component node common to all strategies
   * @param tagName Component tag name
   * @param props Properties object
   * @returns Component call expression
   */
  protected createComponentNode(tagName: string, props: Record<string, any>): t.CallExpression {
    const isFragment = tagName === 'Fragment';
    const fnName = isFragment ? 'Fragment' : 'createComponent';

    addImport(importObject[fnName]);

    const propsArg = createPropsObjectExpression(props, true);
    const args = isFragment ? [propsArg] : [t.identifier(tagName), propsArg];

    return t.callExpression(this.state.imports[fnName], args);
  }

  /**
   * Process component element - common functionality across strategies
   * @param path JSX element path
   * @param isRoot Flag indicating if this is a root element
   * @returns Processed props including children
   */
  protected processComponentElement(
    path: NodePath<JSXElement>,
    isRoot = false,
  ): Record<string, any> {
    const { props } = processJSXAttributes(path, this.state, this.transform.bind(this));

    if (isRoot) {
      const children = getChildren(path, this.transform.bind(this));
      if (children.length > 0) {
        props.children = children;
      }
    }

    return props;
  }

  /**
   * Detect if a JSX element is a component or a native element
   * @param path JSX element path
   * @returns Object containing tagName and isComponent flag
   */
  protected detectElementType(path: NodePath<JSXElement>): {
    tagName: string;
    isComponent: boolean;
  } {
    // Handle fragment case
    if (path.isJSXFragment()) {
      return { tagName: 'Fragment', isComponent: true };
    }

    // Handle regular element case
    if (path.isJSXElement()) {
      const tagName = getTagName(path.node);
      const isComponent = isComponentName(tagName);
      return { tagName, isComponent };
    }

    throw new Error('Unsupported JSX node type');
  }

  /**
   * Get template variable identifier
   * @param path JSX element path
   * @param tagName Tag name
   * @param isComponent Flag indicating if this is a component
   * @returns Template identifier
   */
  protected getTemplateIdentifier(
    path: NodePath<JSXElement>,
    tagName: string,
    isComponent: boolean,
  ): t.Identifier {
    return isComponent ? t.identifier(tagName) : path.scope.generateUidIdentifier('_tmpl$');
  }
}
