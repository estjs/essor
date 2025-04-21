/**
 * @file Core types for JSX transformation
 */

import type { NodePath, types as t } from '@babel/core';
import type { State } from '../types';

/**
 * JSX element types supported by the transformer
 */
export type JSXElement = t.JSXElement | t.JSXFragment;

/**
 * JSX child node types
 */
export type JSXChild =
  | t.JSXElement
  | t.JSXFragment
  | t.JSXExpressionContainer
  | t.JSXSpreadChild
  | t.JSXText;

/**
 * Base result interface with common properties
 */
export interface TransformationResult {
  index: number;
  isLastChild: boolean;
  parentIndex: number;
  props: Record<string, any>;
}

/**
 * Client-side rendering result
 */
export interface ClientResult extends TransformationResult {
  template: string;
}

/**
 * Server-side rendering result
 */
export interface SSRResult extends TransformationResult {
  template: string;
}

/**
 * Static site generation result
 */
export interface SSGResult extends TransformationResult {
  template: string[];
  dynamics: DynamicContent[];
}

/**
 * Dynamic content representation for SSG
 */
export interface DynamicContent {
  type: 'attr' | 'text';
  node: t.Expression;
  attrName?: string;
}

/**
 * Transformation context passed to strategies
 */
export interface TransformContext {
  state: State;
  path: NodePath<JSXElement>;
  result: ClientResult | SSRResult | SSGResult;
}

/**
 * Strategy interface for transformation implementations
 */
export interface TransformStrategy {
  /**
   * Transform a JSX element according to the strategy
   */
  transform(path: NodePath<JSXElement>): void;

  /**
   * Create a transformation result object
   */
  createResult(): ClientResult | SSRResult | SSGResult;
}
