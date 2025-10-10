import { type NodePath, types as t } from '@babel/core';
import { isSVGTag, isSelfClosingTag, warn } from '@estjs/shared';
import { BIND_REG, FRAGMENT_NAME, NODE_TYPE, SPREAD_NAME, UPDATE_PREFIX } from './constants';
import { getAttrName, getTagName, isComponentName, optimizeChildNodes, textTrim } from './shared';
import type { JSXChild, JSXElement } from '../types';

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
  children: (TreeNode | JSXChild | string | t.Expression)[];
  // index, default start from 1
  index: number;
  // parent index
  parentIndex?: number | null;

  // is last child
  isLastChild?: boolean;
  // is self closing
  selfClosing?: boolean;
  // internal use only
  _isTreeNode?: true;
}
/**
 * Create default tree node structure
 *
 * This function creates a tree node object with default configuration,
 * serving as the base template for all tree nodes. This ensures all nodes
 * have consistent base structure and default values.
 *
 * Default configuration description:
 * - Root node (root: true)
 * - Normal type HTML node (NODE_TYPE.NORMAL)
 * - Empty tag name and attributes
 * - Empty child node array
 * - Non-special states (not last child, not self-closing, not Fragment)
 */
export function createDefaultTree(): TreeNode {
  return {
    root: true,
    type: NODE_TYPE.NORMAL,
    tag: '',
    props: {},
    children: [],
    index: 1,
    parentIndex: null,
    isLastChild: false,
    selfClosing: false,
    _isTreeNode: true, // internal use only
  };
}

export function isTreeNode(node: unknown): node is TreeNode {
  return !!(node && (node as TreeNode)._isTreeNode);
}
/**
 * Global tree node index counter
 *
 * Used to assign unique index identifiers to each tree node. This index is very important
 * in subsequent DOM operations for efficiently locating and manipulating specific DOM elements.
 * Can be understood as nextSibling, incrementing sequentially.
 *
 * Index assignment rules:
 * - Root node starts from 1
 * - Each non-component node gets an incremental index
 * - Component nodes don't get indices (because they don't directly correspond to DOM elements)
 *
 * @internal
 */
let treeIndex = 1;

export function createTree(path: NodePath<JSXElement>, parentNode?: TreeNode): TreeNode {
  const treeNode = createDefaultTree();

  if (parentNode) {
    // Child node processing: only non-component nodes get indices
    const nodeInfo = path.node as JSXElement;
    const isComponentOrFragment = isComponentName(getTagName(nodeInfo)) || path.isJSXFragment();

    if (!isComponentOrFragment) {
      treeNode.index = ++treeIndex;
    }
    treeNode.parentIndex = treeIndex;
  } else {
    // Root node processing: mark as root node and reset counter
    treeNode.root = true;
    treeIndex = 1;
  }

  // Handle text node
  if (t.isJSXText(path.node)) {
    return processJSXText(path as unknown as NodePath<t.JSXText>, treeNode);
  }

  // Handle JSX (including fragment)
  if (t.isJSXElement(path.node)) {
    return processJSXElement(path as NodePath<JSXElement>, treeNode);
  }

  return treeNode;
}

function processJSXElement(path: NodePath<JSXElement>, treeNode: TreeNode): TreeNode {
  const tagName = getTagName(path.node);

  treeNode.tag = tagName;
  treeNode.type = determineNodeType(path, tagName);
  treeNode.selfClosing = isSelfClosingTag(tagName);

  // Process JSX attributes and properties
  treeNode.props = processProps(path);

  // Self-closing tags don't need to process children
  if (!treeNode.selfClosing) {
    // Process child elements recursively

    processChildren(path, treeNode);
  }

  return treeNode;
}

function processProps(path: NodePath<JSXElement>): Record<string, unknown> {
  const props = {};
  const attributes = path.get('openingElement.attributes') as NodePath<
    t.JSXAttribute | t.JSXSpreadAttribute
  >[];

  if (!attributes.length) {
    return props;
  }

  attributes.forEach(attribute => {
    if (t.isJSXAttribute(attribute.node)) {
      const name = getAttrName(attribute.node);
      const value = attribute.get('value');

      // <div a>
      if (!value.node) {
        props[name] = true;
      } else if (value) {
        // <div a={1} >
        if (value.isJSXExpressionContainer()) {
          const expression = value.get('expression');
          // <div a={1} >
          if (expression.isStringLiteral() || expression.isNumericLiteral()) {
            props[name] = expression.node.value;
            // <div a={<div />} >
          } else if (expression.isJSXElement() || expression.isJSXFragment()) {
            props[name] = expression.node;
          } else if (expression.isExpression()) {
            // <div a={a} >
            processPropsExpression(expression, name, props, path);
          }
        } else if (value.isStringLiteral() || value.isNumericLiteral()) {
          props[name] = value.node.value;
        } else if (value.isJSXElement() || value.isJSXFragment()) {
          props[name] = value.node;
        } else if (value.isExpression()) {
          // <div a={a} >
          processPropsExpression(value, name, props, path);
        }
      }
    } else if (t.isJSXSpreadAttribute(attribute.node)) {
      props[SPREAD_NAME] = attribute.get('argument').node;
    }
  });

  return props;
}

function processPropsExpression(
  expression: NodePath<t.Expression>,
  name: string,
  props: Record<string, unknown>,
  path: NodePath<JSXElement>,
): void {
  if (BIND_REG.test(name)) {
    processPropsBind(name, expression, props, path);
  } else {
    // normal attribute & key/ref/on
    props[name] = expression.node;
  }
}

function processPropsBind(
  name: string,
  expression: NodePath<t.Expression>,
  props: Record<string, any>,
  path: NodePath<JSXElement>,
): void {
  const value = path.scope.generateUidIdentifier('value');
  const bindName = name.slice(5).toLowerCase();

  // Register update:value
  props[`${UPDATE_PREFIX}:${bindName}`] = [
    expression.node,
    t.arrowFunctionExpression(
      [value],
      t.assignmentExpression('=', expression.node as t.LVal, value),
    ),
  ];
}

/**
 * Process all child nodes of JSX element
 *
 * This function is responsible for traversing and processing all child nodes of JSX elements,
 * converting them to tree node structures. It first optimizes child nodes, then converts
 * each child node individually.
 *
 * Processing flow:
 * 1. **Boundary check**: Check if child nodes exist
 * 2. **Child node optimization**: Use optimizeChildNodes for performance optimization
 * 3. **Individual processing**: Call specific processing functions for each child node
 * 4. **Position marking**: Mark the last child node for layout optimization
 *
 * Child node optimization features:
 * - Merge adjacent text nodes
 * - Remove empty text nodes
 * - Optimize expression containers
 *
 * @param {NodePath<JSXElement>} path - AST path of JSX element node
 * @param {TreeNode} parentNode - Tree node object of parent node
 * @param {State} state - Current state of Babel plugin
 *
 * @example
 * ```typescript
 * // Before processing: <div>  text1  {expr}  text2  </div>
 * // After optimization: <div>text1{expr}text2</div>
 * // Result: parentNode.children = [textNode1, exprNode, textNode2]
 * ```
 */
function processChildren(path: NodePath<JSXElement>, treeNode: TreeNode): void {
  // Boundary check: check if child nodes exist
  if (!path.node.children || path.node.children.length === 0) {
    return;
  }
  const children = optimizeChildNodes(path.get('children'));

  children.forEach(child => {
    processChild(child, treeNode, children.length === 1);
  });
}

function processChild(child: NodePath<JSXChild>, treeNode: TreeNode, isLastChild: boolean): void {
  // jsx
  if (t.isJSXElement(child.node)) {
    const childNode = createTree(child as NodePath<JSXElement>, treeNode);
    childNode.isLastChild = isLastChild;
    treeNode.children.push(childNode);
    return;
  }
  // expression
  if (t.isJSXExpressionContainer(child.node)) {
    processChildExpressionContainer(
      child as NodePath<t.JSXExpressionContainer>,
      treeNode,
      isLastChild,
    );
    return;
  }
  // text
  if (t.isJSXText(child.node)) {
    processJSXChildText(child as NodePath<t.JSXText>, treeNode, isLastChild);
    return;
  }
  // spread
  if (t.isJSXSpreadChild(child.node)) {
    processChildSpread(child as NodePath<t.JSXSpreadChild>, treeNode, isLastChild);
    return;
  }
}

function processChildExpressionContainer(
  child: NodePath<t.JSXExpressionContainer>,
  treeNode: TreeNode,
  isLastChild: boolean,
): void {
  const expression = child.get('expression');
  // string literal or numeric literal
  if (expression.isStringLiteral() || expression.isNumericLiteral()) {
    treeNode.children.push({
      type: NODE_TYPE.TEXT,
      children: [String(expression.node.value)],
      index: ++treeIndex, // Static text increments index
      parentIndex: treeNode.index,
      isLastChild,
      _isTreeNode: true,
    });
  }
  // jsx element or jsx fragment
  else if (expression.isJSXElement() || expression.isJSXFragment()) {
    const childNode = createTree(child as unknown as NodePath<JSXElement>, treeNode);
    childNode.isLastChild = isLastChild;
    treeNode.children.push(childNode);
  }
  // expression
  else if (expression.isExpression()) {
    treeNode.children.push({
      type: NODE_TYPE.EXPRESSION,
      index: treeIndex, // Expression doesn't update index because it's dynamic content
      isLastChild,
      children: [expression.node as t.Expression],
      parentIndex: treeNode.index,
      _isTreeNode: true,
    });
  }
}
/**
 * Determine whether to insert comment separator
 *
 * @param {number} childrenLength - Current number of child nodes
 * @param {TreeNode | undefined} previousNode - Previous child node
 * @returns {boolean} Whether to insert comment separator
 */
function shouldInsertComment(childrenLength: number, previousNode: TreeNode | undefined): boolean {
  return !!(
    childrenLength >= 2 && // At least two child nodes
    previousNode && // Previous node exists
    previousNode.type !== NODE_TYPE.COMMENT && // Previous node is not a comment
    // Previous node is dynamic content
    (previousNode.type === NODE_TYPE.EXPRESSION ||
      previousNode.type === NODE_TYPE.FRAGMENT ||
      previousNode.type === NODE_TYPE.COMPONENT)
  );
}

function processJSXChildText(
  child: NodePath<t.JSXText>,
  treeNode: TreeNode,
  isLastChild: boolean,
): void {
  const text = textTrim(child.node);

  // Ignore empty text nodes
  if (!text) {
    return;
  }

  const childrenLength = treeNode.children.length;
  const previousNode = treeNode.children[childrenLength - 1] as TreeNode | undefined;

  // Check if comment node needs to be inserted as separator
  if (shouldInsertComment(childrenLength, previousNode)) {
    const commentNode: TreeNode = {
      type: NODE_TYPE.COMMENT,
      children: [],
      index: ++treeIndex,
      _isTreeNode: true,
    };
    treeNode.children.push(commentNode);
  }

  // Create text node
  const textNode: TreeNode = {
    type: NODE_TYPE.TEXT,
    children: [text],
    index: ++treeIndex,
    isLastChild,
    _isTreeNode: true,
  };
  treeNode.children.push(textNode);
}
/**
 * Handle as array children
 * @param child
 * @param treeNode
 * @param isLastChild
 */
function processChildSpread(
  child: NodePath<JSXChild>,
  treeNode: TreeNode,
  isLastChild: boolean,
): void {
  const spreadExpression = child.get('expression');

  treeNode.children.push({
    type: NODE_TYPE.SPREAD,
    children: [spreadExpression.node as t.Expression],
    index: treeIndex, // Note: doesn't increment here because this is dynamic content
    parentIndex: treeNode.index,
    isLastChild,
    _isTreeNode: true,
  });
}

/**
 * Determine JSX node type
 *
 * Type judgment priority (high to low):
 * 1. **COMPONENT**: React component (first letter capitalized or contains dot)
 * 2. **FRAGMENT**: Fragment component (<></> or <Fragment></Fragment>)
 * 3. **SVG**: SVG-related tags (svg, path, circle, etc.)
 * 4. **NORMAL**: Regular HTML elements (div, span, p, etc.)
 *
 * @param {boolean} isComponent - Whether it's a React component
 * @param {boolean} isFragment - Whether it's a Fragment component
 * @param {string} tagName - Tag name
 * @returns {NODE_TYPE} Node type enum value
 */
function determineNodeType(path: NodePath<JSXElement>, tagName: string): NODE_TYPE {
  const isComponent = isComponentName(tagName);
  const isFragment = path.isJSXFragment() || (isComponent && tagName === FRAGMENT_NAME);

  // Highest priority: component
  if (isComponent) {
    return NODE_TYPE.COMPONENT;
  }

  // Second priority: Fragment component
  if (isFragment) {
    return NODE_TYPE.FRAGMENT;
  }

  // Third priority: SVG tags
  if (isSVGTag(tagName)) {
    return NODE_TYPE.SVG;
  }

  // Default: regular HTML elements
  return NODE_TYPE.NORMAL;
}

/**
 * Process JSX text node and populate tree node information
 *
 * This function converts text content in JSX to tree node structure. It handles
 * text cleaning and normalization, ensuring the final generated HTML has no
 * excess whitespace and line breaks.
 *
 * Text processing logic:
 * 1. **Whitespace handling**: Use textTrim function to clean excess whitespace
 * 2. **Empty content check**: Empty text won't create child nodes
 * 3. **Type marking**: Set node type to TEXT
 * 4. **Content storage**: Store cleaned text in children array
 *
 * @param {NodePath<t.JSXText>} path - AST path of JSX text node
 * @param {TreeNode} treeNode - Tree node object to be populated
 * @returns {TreeNode} Completed tree node object
 *
 * @example
 * ```typescript
 * // JSX: <div>  Hello World  </div>
 * // After processing: node.children = ['Hello World']
 *
 * // JSX: <div>   </div>
 * // After processing: node.children = [] (empty array)
 * ```
 */
function processJSXText(path: NodePath<t.JSXText>, treeNode: TreeNode): TreeNode {
  treeNode.type = NODE_TYPE.TEXT;

  try {
    const textValue = textTrim(path.node);
    // Only create child nodes when valid text exists
    treeNode.children = textValue ? [textValue] : [];
  } catch (error) {
    // Error handling when text processing fails
    warn(`Text node processing failed: ${error}`);
    treeNode.children = [];
  }

  return treeNode;
}
