import { type NodePath, types as t } from '@babel/core';
import { capitalize, isSVGTag } from '@estjs/shared';
import { addImport, importMap } from '../import';
import { FRAGMENT_NAME, NODE_TYPE } from './constants';
import { getAttrName, getTagName, isComponentName, optimizeChildNodes, textTrim } from './utils';
import type { JSXChild, JSXElement, TreeNode } from './types';
import type { State } from '../types';

/**
 * Node index counter
 * @description Used to generate a unique index for each JSX element or text node. The index of the root node starts from 1.
 */
let treeIndex = 1;

/**
 * Creates a default TreeNode structure
 * @description Provides a standardized initial TreeNode object with all necessary default properties.
 * @returns {TreeNode} The default tree node object.
 */
export function createDefaultTree(): TreeNode {
  return {
    root: false,
    type: NODE_TYPE.NORMAL,
    tag: '',
    props: {},
    children: [],
    index: 1,
    isLastChild: false,
    isSelfClosing: false,
    isFragment: false,
    _isTreeNode: true,
  };
}

/**
 * Converts Babel's JSX AST node to a custom TreeNode structure
 * @description Recursively processes JSXElement, JSXFragment, JSXText, and JSXExpressionContainer nodes,
 * converting them into an internal unified TreeNode structure for subsequent transformation logic.
 * @param {NodePath<JSXElement | t.JSXText>} path - The AST path of the current JSX node.
 * @param {State} state - The current state object of the Babel plugin.
 * @param {TreeNode} [parentNode] - The TreeNode object of the parent node (optional, used for child node recursion).
 * @returns {TreeNode} The converted tree node object.
 */
export function createTree(
  path: NodePath<JSXElement | t.JSXText>,
  state: State,
  parentNode?: TreeNode,
): TreeNode {
  const treeNode = createDefaultTree();
  const isJSXElement = path.isJSXElement();
  const isJSXFragment = path.isJSXFragment();

  // Reset root node index or set index based on parent node
  if (parentNode) {
    // For component or expression nodes, the childIndex of the parent node is not incremented,
    // as they are not mapped to fixed positions in the DOM tree.
    // isComponentName(getTagName(path.node as JSXElement)) here is to handle the case where Fragment is used as a component name.
    if (!(isComponentName(getTagName(path.node as JSXElement)) || isJSXFragment)) {
      treeNode.index = ++treeIndex;
    }
  } else {
    treeNode.root = true;
    treeIndex = 1; // Reset index each time a new root JSX element is processed
  }

  // Process text nodes
  if (path.isJSXText()) {
    treeNode.type = NODE_TYPE.TEXT;
    const textValue = textTrim(path.node);
    treeNode.children = textValue ? [textValue] : [];
    return treeNode;
  }

  // Process JSXElement and JSXFragment
  const jsxElementPath = path as NodePath<JSXElement>;
  const tagName = getTagName(jsxElementPath.node);
  const isComponent = isComponentName(tagName);
  const isFragment = isJSXFragment || (isComponent && tagName === FRAGMENT_NAME);

  treeNode.tag = tagName;
  treeNode.type = determineNodeType(isComponent, isFragment, tagName);
  treeNode.isFragment = isFragment;
  treeNode.isSelfClosing =
    t.isJSXClosingElement(jsxElementPath.node) || t.isJSXClosingFragment(jsxElementPath.node); // Check if it is a self-closing tag

  // Process attributes (JSXElement nodes only)
  if (isJSXElement) {
    treeNode.props = processJSXAttributes(jsxElementPath);
  }

  // Process children
  treeNode.children = [];
  if (!treeNode.isSelfClosing) {
    processJSXChildren(jsxElementPath, treeNode, state);
  }

  return treeNode;
}

/**
 * Processes the children of a JSX element
 * @description Optimizes the child node list (merging adjacent text nodes) and recursively processes each child node.
 * @param {NodePath<JSXElement>} path - The AST path of the current JSX element.
 * @param {TreeNode} parentNode - The TreeNode object of the parent node.
 * @param {State} state - The current state object of the Babel plugin.
 */
function processJSXChildren(path: NodePath<JSXElement>, parentNode: TreeNode, state: State): void {
  if (!path.node.children || path.node.children.length === 0) {
    return;
  }

  // Merge adjacent text nodes for optimization
  const optimizedChildren = optimizeChildNodes(path.get('children'));

  // Iterate and process each child node
  optimizedChildren.forEach((childPath, idx) => {
    const isLastChild = idx === optimizedChildren.length - 1;
    processSingleJSXChild(childPath, parentNode, isLastChild, state);
  });
}

/**
 * Processes a single JSX child node
 * @description Recursively converts based on the child node's type (JSXElement, JSXFragment, JSXExpressionContainer, JSXText)
 * to TreeNode and adds it to the parent node's children list.
 * @param {NodePath<JSXChild>} childPath - The AST path of the single child node.
 * @param {TreeNode} parentNode - The TreeNode object of the parent node.
 * @param {boolean} isLastChild - Whether it is the last child of the parent node.
 * @param {State} state - The current state object of the Babel plugin.
 */
function processSingleJSXChild(
  childPath: NodePath<JSXChild>,
  parentNode: TreeNode,
  isLastChild: boolean,
  state: State,
): void {
  try {
    if (childPath.isJSXElement() || childPath.isJSXFragment()) {
      // Recursively process JSX elements or fragments
      const childNode = createTree(childPath as NodePath<JSXElement>, state, parentNode);
      childNode.isLastChild = isLastChild;
      parentNode.children.push(childNode);
    } else if (childPath.isJSXExpressionContainer()) {
      // Process expression containers (e.g., {foo}, {'bar'})
      processJSXExpressionContainer(childPath, parentNode, isLastChild);
    } else if (childPath.isJSXText()) {
      // Process JSX text nodes
      processJSXTextNode(childPath, parentNode, isLastChild);
    } else if (childPath.isJSXSpreadChild()) {
      // Process JSX spread children (e.g., { ...items }), temporarily ignore or convert to expression as needed
      console.warn(
        `Unsupported JSX spread child type, will be treated as an expression: ${childPath.type}`,
      );
      const exprNode: TreeNode = {
        type: NODE_TYPE.EXPRESSION,
        index: treeIndex, // Still assign an index, but do not increment
        isLastChild,
        children: [childPath.node.expression],
      };
      parentNode.children.push(exprNode);
    } else {
      console.warn(`Encountered unsupported JSX child type: ${childPath.type}`);
    }
  } catch (error) {
    console.error('Error processing child node:', error);
  }
}

/**
 * Processes JSX expression containers
 * @description Converts expressions within JSXExpressionContainer to TreeNode, handling string/numeric literals
 * and other general expressions.
 * @param {NodePath<t.JSXExpressionContainer>} childPath - The AST path of the expression container.
 * @param {TreeNode} parentNode - The TreeNode object of the parent node.
 * @param {boolean} isLastChild - Whether it is the last child of the parent node.
 */
function processJSXExpressionContainer(
  childPath: NodePath<t.JSXExpressionContainer>,
  parentNode: TreeNode,
  isLastChild: boolean,
): void {
  const expression = childPath.get('expression');

  if (expression.isStringLiteral() || expression.isNumericLiteral()) {
    // If it is a string or numeric literal, treat it as a text node
    const textNode: TreeNode = {
      type: NODE_TYPE.TEXT,
      index: ++treeIndex,
      children: [String(expression.node.value)],
      isLastChild,
    };
    parentNode.children.push(textNode);
  } else if (t.isExpression(expression.node)) {
    // Other expression types, create an expression node
    const exprNode: TreeNode = {
      type: NODE_TYPE.EXPRESSION,
      // Expression nodes do not occupy fixed DOM index positions, so treeNodeIndex is not incremented here
      index: treeIndex, // Maintain the same index as the previous static node or the previous dynamic node
      isLastChild,
      children: [expression.node],
    };
    parentNode.children.push(exprNode);
  } else if (t.isJSXEmptyExpression(expression.node)) {
    // Ignore empty JSX expressions (e.g., {}), do not generate nodes
  } else {
    console.warn(`Encountered unsupported expression type: ${expression.type}`);
  }
}

/**
 * Processes JSX text nodes
 * @description Converts JSXText nodes to TreeNode and handles special cases:
 * If dynamic content (expression/component/fragment) exists between two text nodes, insert a comment node `<!>` as a marker between them.
 * @param {NodePath<t.JSXText>} childPath - The AST path of the text node.
 * @param {TreeNode} parentNode - The TreeNode object of the parent node.
 * @param {boolean} isLastChild - Whether it is the last child of the parent node.
 */
function processJSXTextNode(
  childPath: NodePath<t.JSXText>,
  parentNode: TreeNode,
  isLastChild: boolean,
): void {
  const text = textTrim(childPath.node);
  if (text) {
    // Check if a comment node needs to be inserted between text nodes as a dynamic content marker
    const childrenLength = parentNode.children.length;
    const preNode = parentNode.children[childrenLength - 1] as TreeNode | undefined;

    // Conditions:
    // 1. At least one child node exists in the parent node (preNode exists)
    // 2. The previous node is not a comment node (to avoid duplicate insertions)
    // 3. The previous node is an expression, Fragment, or component (indicating the previous node is dynamic content)
    if (
      childrenLength >= 2 &&
      preNode &&
      preNode.type !== NODE_TYPE.COMMENT &&
      (preNode.type === NODE_TYPE.EXPRESSION ||
        preNode.type === NODE_TYPE.FRAGMENT ||
        preNode.type === NODE_TYPE.COMPONENT)
    ) {
      // Insert a comment node as a marker, its index is set to -1 (not a real DOM node)
      const commentNode: TreeNode = {
        type: NODE_TYPE.COMMENT,
        children: [],
        index: ++treeIndex,
      };
      parentNode.children.push(commentNode);
    }

    // Create a new text node
    const newNode: TreeNode = {
      type: NODE_TYPE.TEXT,
      children: [text],
      index: ++treeIndex,
      isLastChild,
    };
    parentNode.children.push(newNode);
  }
}

/**
 * Determines the type of a node
 * @description Determines the final type of a node based on its characteristics (whether it is a component, a Fragment, or an SVG tag).
 * @param {boolean} isComponent - Whether the tag is recognized as a component.
 * @param {boolean} isFragment - Whether the tag is a Fragment.
 * @param {string} tagName - The name of the tag.
 * @returns {NODE_TYPE} The determined node type enum value.
 */
function determineNodeType(isComponent: boolean, isFragment: boolean, tagName: string): NODE_TYPE {
  if (isComponent) {
    return NODE_TYPE.COMPONENT;
  }
  if (isFragment) {
    return NODE_TYPE.FRAGMENT;
  }
  if (isSVGTag(tagName)) {
    return NODE_TYPE.SVG;
  }
  return NODE_TYPE.NORMAL;
}

function processJSXAttributes(path: NodePath<JSXElement>) {
  const props: Record<string, unknown> = {};

  // get path attr
  const attributes = path.get('openingElement.attributes');
  if (!Array.isArray(attributes)) {
    return props;
  }
  attributes.forEach(attribute => {
    if (attribute.isJSXAttribute()) {
      const name = getAttrName(attribute.node);
      const value = attribute.get('value');

      // Process based on different types of attribute values
      if (!value.node) {
        // Boolean attributes (e.g., <button disabled></button>)
        props[name] = true;
      } else if (value.isStringLiteral()) {
        // String literals
        props[name] = value.node.value;
      } else if (value.isJSXExpressionContainer()) {
        // Expression containers
        const expression = value.get('expression');
        if (expression.isStringLiteral() || expression.isNumericLiteral()) {
          // String or numeric literals
          props[name] = expression.node.value;
        } else if (expression.isJSXElement() || expression.isJSXFragment()) {
          // props[name] = createTreeNode(expression as NodePath<JSXElement>, node);
          props[name] = expression.node;
        } else if (expression.isExpression()) {
          // Handle different types of expressions
          processExpressionByType(expression, name, props, path);
        }
      } else if (value.isJSXElement() || value.isJSXFragment()) {
        // props[name] = createTreeNode(value as NodePath<JSXElement>, node);
        props[name] = value.node;
      }
    } else if (attribute.isJSXSpreadAttribute()) {
      // spread attr {...props}
      props._$spread$ = attribute.get('argument').node;
    }
  });

  return props;
}
/**
 * Handles different expression cases based on expression and attribute name type
 *
 * @param {NodePath<t.Expression>} expression - Expression node
 * @param {string} name - Attribute name
 * @param {Record<string, any>} props - Props object
 * @param {NodePath<t.JSXElement>} path - JSX element path
 */
function processExpressionByType(
  expression: NodePath<t.Expression>,
  name: string,
  props: Record<string, any>,
  path: NodePath<JSXElement>,
): void {
  if (/^key|ref|on.+$/.test(name)) {
    // Special attributes: key, ref, event handlers (onClick, etc.)
    props[name] = expression.node;
  } else if (/^bind:.+/.test(name)) {
    // Two-way binding attributes
    processBind(name, expression, props, path);
  } else if (expression.isConditionalExpression()) {
    // Conditional expressions
    processConditionalExpression(expression, name, props, path);
  } else {
    // Other expressions
    props[name] = expression.node;
  }
}
/**
 * Processes bind attributes
 * Processes two-way binding attributes, such as bind:value
 *
 * @param {string} name - Attribute name
 * @param {NodePath} expression - Expression path
 * @param {Record<string, any>} props - Props object
 * @param {NodePath<t.JSXElement>} path - JSX element path
 */
function processBind(
  name: string,
  expression: NodePath,
  props: Record<string, any>,
  path: NodePath<JSXElement>,
): void {
  const value = path.scope.generateUidIdentifier('value');
  const bindName = name.slice(5).toLowerCase();

  // Set original value
  props[bindName] = expression.node;

  // Set update function
  props[`update${capitalize(bindName)}`] = t.arrowFunctionExpression(
    [value],
    t.assignmentExpression('=', expression.node as t.LVal, value),
  );
}
/**
 * Processes conditional expressions
 *
 * @param {NodePath<t.Expression>} expression - Expression node
 * @param {string} name - Attribute name
 * @param {Record<string, any>} props - Props object
 * @param {NodePath<t.JSXElement>} path - JSX element path
 */
function processConditionalExpression(
  expression: NodePath<t.Expression>,
  name: string,
  props: Record<string, any>,
  path: NodePath<JSXElement>,
): void {
  // Safely access imports
  try {
    addImport(importMap.computed);
    props[name] = t.callExpression(path.state.imports.computed, [
      t.arrowFunctionExpression([], expression.node),
    ]);
  } catch (error) {
    // If an error occurs, use the expression directly
    console.error('Error creating computed expression:', error);
    props[name] = expression.node;
  }
}
