import { type NodePath, types as t } from '@babel/core';
import { isSVGTag, isSelfClosingTag, warn } from '@estjs/shared';
import { BIND_REG, NODE_TYPE, SPREAD_NAME, UPDATE_PREFIX } from './constants';
import { getAttrName, getTagName, isComponentName, optimizeChildNodes, textTrim } from './shared';
import type { JSXChild, JSXElement } from '../types';

/**
 * TreeNode represents a unified abstraction of JSX elements in the compilation process.
 * It serves as the core intermediate representation between JSX AST and generated runtime code.
 *
 * @interface TreeNode
 *
 * @property {NODE_TYPE} type - The type of the node (NORMAL, TEXT, EXPRESSION, COMPONENT, FRAGMENT, SVG, COMMENT, SPREAD)
 * @property {string} [tag] - The tag name for HTML elements or component name for components
 * @property {number} index - Unique sequential index for DOM node location (starts from 1, skips components/expressions)
 * @property {number | null} [parentIndex] - Index of the parent node, used to establish parent-child relationships
 * @property {Record<string, unknown>} [props] - Collection of element attributes and properties
 * @property {Array<TreeNode | JSXChild | string | t.Expression>} children - Child nodes of this element
 * @property {boolean} [root] - Whether this is the root node of the tree
 * @property {boolean} [isLastChild] - Whether this is the last child of its parent
 * @property {boolean} [selfClosing] - Whether this is a self-closing tag (e.g., <img />, <br />)
 * @property {true} [_isTreeNode] - Internal marker to identify TreeNode objects (used by isTreeNode type guard)
 *
 * @example
 * ```typescript
 * // Example TreeNode for: <div class="container">Hello</div>
 * {
 *   type: NODE_TYPE.NORMAL,
 *   tag: 'div',
 *   index: 1,
 *   props: { class: 'container' },
 *   children: [
 *     {
 *       type: NODE_TYPE.TEXT,
 *       children: ['Hello'],
 *       index: 2,
 *       _isTreeNode: true
 *     }
 *   ],
 *   root: true,
 *   _isTreeNode: true
 * }
 * ```
 */
export interface TreeNode {
  /** The type of the node */
  type: NODE_TYPE;
  /** The tag name for HTML elements or component name */
  tag?: string;
  /** Unique sequential index for DOM node location */
  index: number;
  /** Index of the parent node */
  parentIndex?: number | null;
  /** Collection of element attributes and properties */
  props?: Record<string, unknown>;
  /** Child nodes of this element */
  children: (TreeNode | JSXChild | string | t.Expression)[];
  /** Whether this is the root node */
  root?: boolean;
  /** Whether this is the last child of its parent */
  isLastChild?: boolean;
  /** Whether this is a self-closing tag */
  selfClosing?: boolean;
  /** Internal marker to identify TreeNode objects */
  _isTreeNode?: true;
}
/**
 * Creates a default TreeNode structure with initial configuration.
 *
 * This factory function provides a consistent base template for all tree nodes,
 * ensuring uniform structure and default values across the tree building process.
 *
 * @returns {TreeNode} A new TreeNode with default configuration:
 *   - `root: true` - Marked as root node
 *   - `type: NODE_TYPE.NORMAL` - Default to normal HTML element
 *   - `tag: ''` - Empty tag name (to be filled by caller)
 *   - `props: {}` - Empty properties object
 *   - `children: []` - Empty children array
 *   - `index: 1` - Default index (root nodes start at 1)
 *   - `parentIndex: null` - No parent for root nodes
 *   - `isLastChild: false` - Not marked as last child initially
 *   - `selfClosing: false` - Not self-closing by default
 *   - `_isTreeNode: true` - Internal marker for type checking
 *
 * @example
 * ```typescript
 * const node = createDefaultTree();
 * node.tag = 'div';
 * node.type = NODE_TYPE.NORMAL;
 * // node is now ready to be populated with actual data
 * ```
 *
 * @internal
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
    _isTreeNode: true,
  };
}

/**
 * Type guard to check if an unknown value is a TreeNode.
 *
 * This function provides runtime type checking for TreeNode objects by checking
 * for the presence of the internal `_isTreeNode` marker. This is more reliable
 * than checking for specific properties since TreeNode has many optional fields.
 *
 * @param {unknown} node - The value to check
 * @returns {boolean} `true` if the value is a TreeNode, `false` otherwise
 *
 * @example
 * ```typescript
 * const maybeNode: unknown = getSomeValue();
 * if (isTreeNode(maybeNode)) {
 *   // TypeScript now knows maybeNode is TreeNode
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Filtering TreeNodes from mixed array
 * const mixed: Array<TreeNode | string | Expression> = [...];
 * const treeNodes = mixed.filter(isTreeNode);
 * // treeNodes is now TreeNode[]
 * ```
 */
export function isTreeNode(node: unknown): node is TreeNode {
  return !!(node && (node as TreeNode)._isTreeNode);
}
/**
 * Global tree node index counter.
 *
 * This counter is used to assign unique sequential indices to tree nodes for efficient
 * DOM node location and manipulation at runtime. The index system is crucial for the
 * `mapNodes()` runtime function to quickly locate specific DOM elements.
 *
 * **Index Assignment Rules:**
 * - Root node starts at index 1
 * - Each non-component, non-expression node gets an incremental index (2, 3, 4, ...)
 * - Component nodes do NOT get indices (they don't correspond to DOM elements)
 * - Fragment nodes do NOT get indices (they're virtual containers)
 * - Expression nodes do NOT get indices (they're dynamic content placeholders)
 *
 * **Index Usage:**
 * The indices are used to generate an `indexMap` array that maps logical positions
 * to actual DOM nodes, enabling O(1) node lookup at runtime.
 *
 * @example
 * ```typescript
 * // JSX: <div><span/>{expr}<p/></div>
 * // Indices: div=1, span=2, expr=2 (no increment), p=3
 * // indexMap: [1, 2, 3] -> [divNode, spanNode, pNode]
 * ```
 *
 * @internal
 */
let treeIndex = 1;

/**
 * Creates a TreeNode from a JSX AST node path.
 *
 * This is the main entry point for building the Tree intermediate representation.
 * It recursively processes JSX elements and their children, assigning indices and
 * building the complete tree structure.
 *
 * **Processing Flow:**
 * 1. Create default tree node structure
 * 2. Assign index based on node type and parent context
 * 3. Determine node type (text, element, component, etc.)
 * 4. Process attributes and children recursively
 * 5. Return completed TreeNode
 *
 * **Index Assignment:**
 * - Root nodes: Reset counter to 1 and use it
 * - Child nodes: Increment counter for non-component/non-expression nodes
 * - Components/Fragments: Skip index increment (don't correspond to DOM)
 *
 * @param {NodePath<JSXElement>} path - Babel AST path to the JSX element
 * @param {TreeNode} [parentNode] - Parent TreeNode (undefined for root nodes)
 * @returns {TreeNode} The constructed TreeNode with all children processed
 *
 * @example
 * ```typescript
 * // Building a tree from JSX
 * const jsxPath = getJSXPath(); // from Babel visitor
 * const tree = createTree(jsxPath);
 * // tree now contains the complete TreeNode structure
 * ```
 *
 * @example
 * ```typescript
 * // Recursive child processing
 * const parentTree = createTree(parentPath);
 * const childTree = createTree(childPath, parentTree);
 * // childTree.parentIndex === parentTree.index
 * ```
 */
export function createTree(path: NodePath<JSXElement>, parentNode?: TreeNode): TreeNode {
  const treeNode = createDefaultTree();
  const tagName = getTagName(path.node);

  treeNode.tag = tagName;
  treeNode.type = determineNodeType(tagName);
  treeNode.selfClosing = isSelfClosingTag(tagName);
  if (parentNode) {
    const parentIsComponent = parentNode.type === NODE_TYPE.COMPONENT;
    if (parentIsComponent) {
      treeIndex = 1;
      treeNode.index = treeIndex;
    } else if (treeNode.type !== NODE_TYPE.COMPONENT) {
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
  if (t.isJSXElement(path.node) || t.isJSXFragment(path.node)) {
    return processJSXElement(path as NodePath<JSXElement>, treeNode);
  }

  return treeNode;
}

/**
 * Processes a JSX element node and populates the TreeNode with element-specific data.
 *
 * This function handles the core transformation of JSX elements into TreeNode structure,
 * including tag name extraction, type determination, attribute processing, and recursive
 * child processing.
 *
 * **Processing Steps:**
 * 1. Extract tag name from JSX element
 * 2. Determine node type (NORMAL, COMPONENT, FRAGMENT, SVG)
 * 3. Check if element is self-closing
 * 4. Process all attributes and properties
 * 5. Recursively process children (if not self-closing)
 *
 * @param {NodePath<JSXElement>} path - Babel AST path to the JSX element
 * @param {TreeNode} treeNode - The TreeNode to populate with element data
 * @returns {TreeNode} The populated TreeNode with all element data
 *
 * @example
 * ```typescript
 * // Processing: <div class="container"><span>Hello</span></div>
 * const node = createDefaultTree();
 * processJSXElement(path, node);
 * // node.tag === 'div'
 * // node.type === NODE_TYPE.NORMAL
 * // node.props === { class: 'container' }
 * // node.children.length === 1
 * ```
 *
 * @internal
 */
function processJSXElement(path: NodePath<JSXElement>, treeNode: TreeNode): TreeNode {
  // Process JSX attributes and properties,fragment not have props
  if (!path.isJSXFragment()) {
    treeNode.props = processProps(path);
  }

  // Self-closing tags don't need to process children
  if (!treeNode.selfClosing) {
    // Process child elements recursively
    processChildren(path, treeNode);
  }

  return treeNode;
}

/**
 * Processes JSX attributes and converts them into a props object.
 *
 * This function handles all types of JSX attributes including:
 * - Boolean attributes: `<div disabled />` → `{ disabled: true }`
 * - String literals: `<div class="foo" />` → `{ class: 'foo' }`
 * - Expression containers: `<div class={expr} />` → `{ class: expr }`
 * - JSX elements as props: `<div icon={<Icon />} />` → `{ icon: <Icon /> }`
 * - Spread attributes: `<div {...props} />` → `{ [SPREAD_NAME]: props }`
 * - Bind attributes: `<input bind:value={val} />` → `{ 'update:value': [val, setter] }`
 *
 * **Attribute Processing Rules:**
 * - Boolean attributes (no value) are set to `true`
 * - String/number literals are extracted as primitive values
 * - Expressions are stored as AST nodes for later code generation
 * - Spread attributes are stored under the special `SPREAD_NAME` key
 * - Bind attributes are transformed into update handlers
 *
 * @param {NodePath<JSXElement>} path - Babel AST path to the JSX element
 * @returns {Record<string, unknown>} Object mapping attribute names to their values
 *
 * @example
 * ```typescript
 * // <div class="container" id={dynamicId} disabled />
 * const props = processProps(path);
 * // props = {
 * //   class: 'container',
 * //   id: <Identifier: dynamicId>,
 * //   disabled: true
 * // }
 * ```
 *
 * @internal
 */
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

      // Boolean attribute: <div a>
      if (!value.node) {
        props[name] = true;
      } else if (value) {
        // Expression container: <div a={expr}>
        if (value.isJSXExpressionContainer()) {
          const expression = value.get('expression');
          // Literal values: <div a={1}>
          if (expression.isStringLiteral() || expression.isNumericLiteral()) {
            props[name] = expression.node.value;
            // JSX as prop: <div a={<div />}>
          } else if (expression.isJSXElement() || expression.isJSXFragment()) {
            props[name] = expression.node;
            // Other expressions: <div a={variable}>
          } else if (expression.isExpression()) {
            processPropsExpression(expression, name, props, path);
          }
          // Direct literal: <div a="value">
        } else if (value.isStringLiteral() || value.isNumericLiteral()) {
          props[name] = value.node.value;
          // Direct JSX: <div a=<div />>
        } else if (value.isJSXElement() || value.isJSXFragment()) {
          props[name] = value.node;
          // Direct expression
        } else if (value.isExpression()) {
          processPropsExpression(value, name, props, path);
        }
      }
    } else if (t.isJSXSpreadAttribute(attribute.node)) {
      // Spread attribute: <div {...props}>
      props[SPREAD_NAME] = attribute.get('argument').node;
    }
  });

  return props;
}

/**
 * Processes a JSX attribute expression and stores it in the props object.
 *
 * This function handles special attribute types like `bind:` directives and
 * regular dynamic attributes. It determines the appropriate processing based
 * on the attribute name pattern.
 *
 * **Attribute Types:**
 * - `bind:xxx` attributes: Two-way binding directives (e.g., `bind:value`)
 * - Regular attributes: Event handlers, refs, keys, and other dynamic props
 *
 * @param {NodePath<t.Expression>} expression - The attribute value expression
 * @param {string} name - The attribute name
 * @param {Record<string, unknown>} props - The props object to populate
 * @param {NodePath<JSXElement>} path - The JSX element path (for scope access)
 *
 * @example
 * ```typescript
 * // <input bind:value={inputValue} />
 * processPropsExpression(valueExpr, 'bind:value', props, path);
 * // props['update:value'] = [inputValue, (value) => inputValue = value]
 * ```
 *
 * @internal
 */
function processPropsExpression(
  expression: NodePath<t.Expression>,
  name: string,
  props: Record<string, unknown>,
  path: NodePath<JSXElement>,
): void {
  if (BIND_REG.test(name)) {
    processPropsBind(name, expression, props, path);
  } else {
    // Normal attribute: key/ref/on*/className/etc.
    props[name] = expression.node;
  }
}

/**
 * Processes a `bind:` directive and converts it into an update handler.
 *
 * Two-way binding directives like `bind:value={variable}` are transformed into
 * a tuple containing:
 * 1. The bound expression (for reading the value)
 * 2. A setter function (for updating the value)
 *
 * This enables bidirectional data flow between the DOM and the reactive state.
 *
 * **Transformation:**
 * ```
 * bind:value={inputValue}
 * ↓
 * update:value = [
 *   inputValue,                    // getter
 *   (value) => inputValue = value  // setter
 * ]
 * ```
 *
 * @param {string} name - The bind attribute name (e.g., 'bind:value')
 * @param {NodePath<t.Expression>} expression - The bound variable expression
 * @param {Record<string, unknown>} props - The props object to populate
 * @param {NodePath<JSXElement>} path - The JSX element path (for scope access)
 *
 * @example
 * ```typescript
 * // <input bind:value={inputValue} />
 * processPropsBind('bind:value', valueExpr, props, path);
 * // props['update:value'] = [
 * //   <Identifier: inputValue>,
 * //   (value) => inputValue = value
 * // ]
 * ```
 *
 * @internal
 */
function processPropsBind(
  name: string,
  expression: NodePath<t.Expression>,
  props: Record<string, unknown>,
  path: NodePath<JSXElement>,
): void {
  const value = path.scope.generateUidIdentifier('value');
  const bindName = name.slice(5).toLowerCase(); // Remove 'bind:' prefix

  // Create update handler: [getter, setter]
  props[`${UPDATE_PREFIX}:${bindName}`] = [
    expression.node, // Getter: the bound variable
    t.arrowFunctionExpression(
      [value],
      // Type guard: expression.node must be LVal for bind directive
      t.isLVal(expression.node)
        ? t.assignmentExpression('=', expression.node, value) // Setter: variable = value
        : t.assignmentExpression('=', t.identifier('_'), value), // Fallback for invalid LVal
    ),
  ];
}

/**
 * Process all child nodes of JSX element
 *
 * @param {NodePath<JSXElement>} path - AST path of JSX element node
 * @param {TreeNode} treeNode - Tree node object of parent node
 */
function processChildren(path: NodePath<JSXElement>, treeNode: TreeNode): void {
  const children = path.node.children as JSXChild[];
  // Boundary check: check if child nodes exist
  if (!children || !children.length) {
    return;
  }
  const optimizedChildren = optimizeChildNodes(path.get('children'));

  optimizedChildren.forEach(child => {
    processChild(child, treeNode, optimizedChildren.length === 1);
  });
}

function processChild(child: NodePath<JSXChild>, treeNode: TreeNode, isLastChild: boolean): void {
  // jsx
  if (t.isJSXElement(child.node) || t.isJSXFragment(child.node)) {
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
      // Type guard: expression.node is Expression in JSXExpressionContainer
      children: t.isExpression(expression.node) ? [expression.node] : [],
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
    (previousNode.type === NODE_TYPE.EXPRESSION || previousNode.type === NODE_TYPE.COMPONENT)
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
    // Type guard: spreadExpression.node is Expression in JSXSpreadChild
    children: t.isExpression(spreadExpression.node) ? [spreadExpression.node] : [],
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
 * 1. **COMPONENT**: Custom component (first letter capitalized or contains dot)
 * 3. **SVG**: SVG-related tags (svg, path, circle, etc.)
 * 4. **NORMAL**: Regular HTML elements (div, span, p, etc.)
 *
 * @param {NodePath<JSXElement>} path - JSX element path
 * @param {string} tagName - Tag name
 * @returns {NODE_TYPE} Node type enum value
 */
function determineNodeType(tagName: string): NODE_TYPE {
  const isComponent = isComponentName(tagName);

  if (isComponent) {
    return NODE_TYPE.COMPONENT;
  }

  if (isSVGTag(tagName)) {
    return NODE_TYPE.SVG;
  }

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
