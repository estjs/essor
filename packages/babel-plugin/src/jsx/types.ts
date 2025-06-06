import type { State } from '../types';
import type { NODE_TYPE } from './constants';
import type { NodePath, types as t } from '@babel/core';

export type JSXElement = t.JSXElement | t.JSXFragment;

export type JSXChild =
  | t.JSXElement
  | t.JSXFragment
  | t.JSXExpressionContainer
  | t.Expression
  | t.JSXSpreadChild
  | t.JSXText;

export interface TreeNode {
  // is root node
  root?: boolean;
  // node type
  type: NODE_TYPE;
  // node name
  tag?: string;
  // node attributes
  props?: Record<string, unknown>;
  // node children
  children: (TreeNode | JSXChild | string)[];
  // index, default start from 1
  index: number;

  // is last child
  isLastChild?: boolean;
  // is self closing
  isSelfClosing?: boolean;
  // is fragment
  isFragment?: boolean;

  _isTreeNode?: boolean;
}

/**
 * Dynamic Content Interface
 * @description Represents JSX content that needs dynamic processing, such as components, expressions, etc.
 */
export interface DynamicContent {
  /** Dynamic content type identifier */
  type?: string;
  /** Node index */
  index: number;
  /** AST node expression */
  node: t.Expression;
  /** Previous node index, used to determine insertion position */
  before: number | null;
  /** Template index */
  templateIndex?: number;
  /** Parent node index */
  parentIndex?: number | null;
  /** Attribute name, used for dynamic attributes */
  attrName?: string;
}

/**
 * Dynamic Content Collection Interface
 * @description Used to type-strengthen dynamic content collection results
 */
export interface DynamicCollection {
  /** Dynamic child node list */
  children: DynamicContent[];
  /** Dynamic attribute list */
  props: Array<{
    /** Attribute object */
    props: Record<string, any>;
    /** Parent node index */
    parentIndex: number | null;
  }>;
}

export interface TransformContext {
  path: NodePath<JSXElement>;
  state: State;
}

/**
 * SSG Processing Result Interface
 * @description Stores template and dynamic content information in SSG mode
 */
export interface SSGProcessResult {
  /** Template string array */
  templates: string[];
  /** Dynamic content array */
  dynamics: Array<{
    /** Content type: text or attribute */
    type: 'text' | 'attr';
    /** Expression node */
    node: t.Expression;
    /** Attribute name (only for attr type) */
    attrName?: string;
  }>;
  /** Root node */
  root: TreeNode | null;
}
/**
 * Template Information Interface
 * @description Describes information related to a template fragment
 */
export interface TemplateInfo {
  /** Template identifier */
  id: t.Identifier;
  /** Template content */
  template: string | Array<string>;
}
