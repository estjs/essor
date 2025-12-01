import { type NodePath, types as t } from '@babel/core';
import {
  isArray,
  isBoolean,
  isNull,
  isNumber,
  isObject,
  isString,
  isUndefined,
} from '@estjs/shared';

import {
  CHILDREN_NAME,
  CLASS_NAME,
  FRAGMENT_NAME,
  NODE_TYPE,
  SPREAD_NAME,
  STYLE_NAME,
} from './constants';
import { createTree, isTreeNode } from './tree';
import { getContext } from './context';
import type { Expression } from '@babel/types';
import type { TreeNode } from './tree';
import type { JSXChild, JSXElement } from '../types';

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

/**
 * Determine whether a string is a component name
 *
 * Identifies React components by checking naming conventions:
 * - First letter capitalized (e.g., MyComponent)
 * - Contains dot notation (e.g., SomeLibrary.Component)
 * - Starts with non-alphabetic character (e.g., _Component)
 *
 * @param {string} tagName - The tag name to check
 * @returns {boolean} `true` if the tag represents a component, `false` otherwise
 */
export function isComponentName(tagName: string): boolean {
  if (!tagName) {
    return false;
  }

  const firstChar = tagName[0];

  if (firstChar && firstChar.toLowerCase() !== firstChar) {
    return true;
  }

  if (tagName.includes('.') || tagName.includes(':')) {
    const segments = tagName.split(/[:.]/);
    return segments.some(segment => segment[0] && segment[0].toLowerCase() !== segment[0]);
  }

  return /[^a-z]/i.test(firstChar); // Handles _Component and similar cases
}

/**
 * Get tag name from JSX element node
 *
 * Extracts the tag name from JSX elements and fragments, handling both
 * regular HTML elements and React components.
 *
 * @param {t.JSXElement | t.JSXFragment} node - AST node of JSX element or fragment
 * @returns {string} Tag name string (e.g., 'div', 'MyComponent', 'Fragment')
 */
export const getTagName = (node: t.JSXElement | t.JSXFragment): string => {
  // Handle JSX Fragment (<>...</> or <Fragment>...</Fragment>) case
  if (t.isJSXFragment(node)) {
    return FRAGMENT_NAME;
  }

  // Handle regular JSX elements (like <div>, <MyComponent.Nested/>)
  const tag = node.openingElement.name;
  return jsxElementNameToString(tag);
};

/**
 * Convert JSX element name to string representation
 * @description Supports JSXIdentifier (e.g., MyComponent), JSXMemberExpression (e.g., SomeLibrary.SomeComponent)
 * and JSXNamespacedName (e.g., namespace:ComponentName) forms.
 * @param {t.JSXMemberExpression | t.JSXIdentifier | t.JSXNamespacedName} node - AST node of JSX element name.
 * @returns {string} String representation of JSX element name.
 */
export function jsxElementNameToString(
  node: t.JSXMemberExpression | t.JSXIdentifier | t.JSXNamespacedName | t.MemberExpression,
): string {
  if (t.isJSXMemberExpression(node)) {
    // Process member expression, recursively join (e.g., SomeLibrary.SomeComponent)
    return `${jsxElementNameToString(node.object)}.${jsxElementNameToString(node.property)}`;
  }

  if (t.isMemberExpression(node)) {
    const objectName = jsxElementNameToString(node.object as any);
    const propertyName = jsxElementNameToString(node.property as any);
    return `${objectName}.${propertyName}`;
  }

  if (t.isJSXIdentifier(node) || t.isIdentifier(node)) {
    // Process identifier (e.g., MyComponent)
    return node.name;
  }

  // Process namespace expression (e.g., namespace:ComponentName)
  const namespace = node.namespace?.name ?? '';
  const name = node.name?.name ?? '';
  if (!namespace) {
    return name;
  }
  if (!name) {
    return namespace;
  }
  return `${namespace}:${name}`;
}

/**
 * Determine if the given path represents a text child node in JSX expression
 * @description Check if the node is of type JSXText, StringLiteral, or NumericLiteral.
 * @param {NodePath<JSXChild>} path - AST path of potential text child node.
 * @returns {boolean} `true` if the path represents a text child node, `false` otherwise.
 */
export function isTextChild(path: NodePath<JSXChild>): boolean {
  if (path.isJSXExpressionContainer && path.isJSXExpressionContainer()) {
    const expression = path.get('expression');
    if (expression.isJSXText() || expression.isStringLiteral() || expression.isNumericLiteral()) {
      return true;
    }
  }
  if (path.isJSXText && path.isJSXText()) {
    return true;
  }
  if (path.isStringLiteral && path.isStringLiteral()) {
    return true;
  }
  if (path.isNullLiteral && path.isNullLiteral()) {
    return true;
  }
  return false;
}

/**
 * Trim text content of JSXText node
 * @description Remove excess whitespace and line breaks, merge multiple spaces into a single space.
 * @param {t.JSXText} node - JSXText AST node.
 * @returns {string} Trimmed text content.
 */
export function textTrim(node: t.JSXText): string {
  if (!node || !node.value) return '';
  // Handle escaped sequences properly by checking original value
  if (/^\s*$/.test(node.value)) {
    return '';
  }
  return node.value.trim();
}

/**
 * Determine if a JSX child node is valid
 * @description Ignore text nodes that contain only whitespace.
 * @param {NodePath<JSXChild>} path - AST path of JSX child node.
 * @returns {boolean} `true` if the node is valid, `false` otherwise.
 */
export function isValidChild(path: NodePath<JSXChild>): boolean {
  const regex = /^\s*$/;
  if (path.isStringLiteral && path.isStringLiteral()) {
    return !regex.test(path.node.value);
  }
  if (path.isJSXText && path.isJSXText()) {
    return !regex.test(path.node.value);
  }
  return Object.keys(path.node).length > 0; // For other types of nodes, consider valid if they have content
}

/**
 * Get raw text content of a node without trimming
 * @description Extract raw text from JSXText or JSXExpressionContainer without trimming whitespace.
 * @param {NodePath<JSXChild>} path - AST path of JSX child node.
 * @returns {string} Raw text content of the node, or empty string if not a text node.
 */
export function getRawNodeText(path: NodePath<JSXChild>): string {
  if (path.isJSXText()) {
    return path.node.value || '';
  }
  if (path.isJSXExpressionContainer()) {
    const expression = path.get('expression');
    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      return String(expression.node.value);
    }
  }
  return '';
}

/**
 * Get text content of a node
 * @description Extract text from JSXText or JSXExpressionContainer containing StringLiteral/NumericLiteral.
 * @param {NodePath<JSXChild>} path - AST path of JSX child node.
 * @returns {string} Text content of the node, or empty string if not a text node.
 */
export function getNodeText(path: NodePath<JSXChild>): string {
  if (path.isJSXText()) {
    return textTrim(path.node);
  }
  if (path.isJSXExpressionContainer()) {
    const expression = path.get('expression');
    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      return String(expression.node.value);
    }
  }
  return '';
}

/**
 * Set text content of JSX child node
 * @description Update value of JSXText or StringLiteral/NumericLiteral in JSXExpressionContainer.
 * @param {NodePath<JSXChild>} path - AST path of JSX child node.
 * @param {string} text - Text content to set.
 */
export function setNodeText(path: NodePath<JSXChild>, text: string): void {
  if (path.isJSXText()) {
    path.node.value = text;
  }
  if (path.isJSXExpressionContainer()) {
    const expression = path.get('expression');
    if (expression.isStringLiteral() || expression.isNumericLiteral()) {
      expression.replaceWith(t.stringLiteral(text));
    }
  }
}

/**
 * Optimize child node list, merge adjacent text nodes
 * @description Traverse child node list, merge consecutive text nodes into one, reduce number of generated AST nodes, improve rendering performance.
 * @param {NodePath<JSXChild>[]} children - Original array of child node paths.
 * @returns {NodePath<JSXChild>[]} Optimized array of child node paths.
 */
export function optimizeChildNodes(children: NodePath<JSXChild>[]): NodePath<JSXChild>[] {
  const mergedWithExpression = new WeakSet<NodePath<JSXChild>>();

  return children.reduce<NodePath<JSXChild>[]>((acc, cur) => {
    if (isValidChild(cur)) {
      const lastChild = acc.at(-1);
      if (!lastChild) {
        acc.push(cur as NodePath<JSXChild>);
        return acc;
      }

      const lastIsPlainText = lastChild.isJSXText?.() ?? false;
      const currentIsPlainText = cur.isJSXText?.() ?? false;

      if (
        lastIsPlainText &&
        t.isJSXExpressionContainer(cur.node) &&
        (cur.get('expression').isStringLiteral() || cur.get('expression').isNumericLiteral()) &&
        !mergedWithExpression.has(lastChild)
      ) {
        const mergedText = getRawNodeText(lastChild) + getRawNodeText(cur);
        setNodeText(lastChild, mergedText);
        mergedWithExpression.add(lastChild);
        return acc;
      }

      if (lastIsPlainText && currentIsPlainText && !mergedWithExpression.has(lastChild)) {
        const mergedText = getRawNodeText(lastChild) + getRawNodeText(cur);
        setNodeText(lastChild, mergedText);
        return acc;
      }

      acc.push(cur as NodePath<JSXChild>);
    }
    return acc;
  }, []);
}

/**
 * Deep check if any property in ObjectExpression contains dynamic values
 * Recursively examines object expressions to detect dynamic attributes
 *
 * @example
 * // dynamic attribute
 * <div class={{'a': a}} />
 *
 * // dynamic object dynamic attribute
 * <div class={{'a': {b: c}}} />
 *
 * // conditional expression
 * <div class={a ? 'a' : 'b'} />
 *
 * // deep conditional expression
 * <div class={a:{b:{c:c ? 'c' : 'd'}}} />
 *
 * // string expression
 * <div class={{with:`${a}px`}} />
 *
 * // string dynamic object expression
 * <div class={{with:`${a ? '1' : '2'}px`}} />
 *
 * @param  {ObjectExpression} node
 * @return {boolean}
 */
export function deepCheckObjectDynamic(node: t.ObjectExpression): boolean {
  if (!t.isObjectExpression(node)) return false;

  let dynamic = false;

  // Recursive traversal
  function walk(current) {
    if (dynamic) return; // Already hit, early pruning

    // 1. Common 'dynamic' nodes: directly set to true
    if (
      t.isIdentifier(current) ||
      t.isCallExpression(current) ||
      t.isMemberExpression(current) ||
      t.isConditionalExpression(current) ||
      t.isTemplateLiteral(current) ||
      t.isBinaryExpression(current) ||
      t.isUpdateExpression(current) ||
      t.isUnaryExpression(current) ||
      t.isAwaitExpression(current) ||
      t.isYieldExpression(current) ||
      t.isTaggedTemplateExpression(current)
    ) {
      dynamic = true;
      return;
    }

    // 2. Object / Array expressions continue searching downward
    if (t.isObjectExpression(current)) {
      current.properties.forEach(prop => {
        if (t.isObjectProperty(prop)) walk(prop.value);
        if (t.isSpreadElement(prop)) walk(prop.argument);
      });
      return;
    }

    if (t.isArrayExpression(current)) {
      current.elements.forEach(el => el && walk(el));
      return;
    }

    // 3. Other nodes (Literal, RegExpLiteral...) are considered static, no processing needed
  }

  walk(node);
  return dynamic;
}

/**
 * Processes object expressions in JSX attributes, handling both conditional expressions
 * and static class/style attribute extraction (when isCt=true)
 *
 * @param propName - Current property name being processed (e.g., "class" or "style")
 * @param objectExpr - The object expression AST node to process
 * @param propsCollection - Collection of component props to modify
 * @param isClassOrStyleAttr - Flag indicating if processing class/style attribute (special handling)
 * @returns Generated class/style string when processing class/style attributes
 */
export function processObjectExpression(
  propName: string,
  objectExpr: t.ObjectExpression,
  propsCollection: Record<string, any>,
  isClassOrStyleAttr = false,
): string {
  let classStyleString = '';

  // Handle conditional properties - let unified architecture handle
  if (deepCheckObjectDynamic(objectExpr)) {
    // Directly store object expression, let unified memoizedEffect architecture handle
    propsCollection[propName] = objectExpr;
  }
  // Special handling for static class/style attributes
  else if (isClassOrStyleAttr) {
    classStyleString = objectExpr.properties
      .filter((property): property is t.ObjectProperty => t.isObjectProperty(property))
      .reduce((acc, property) => {
        const key = t.isIdentifier(property.key)
          ? property.key.name
          : (property.key as t.StringLiteral).value;

        // Ensure value is static string literal
        if (t.isStringLiteral(property.value)) {
          return `${acc}${key}:${property.value.value};`;
        }
        return acc;
      }, '');

    // Remove original prop as we've converted it to string
    delete propsCollection[propName];
  }

  return classStyleString;
}

/**
 * Get the name of JSX attribute
 * @description Extract string name from JSXAttribute node.
 * @param {t.JSXAttribute} attribute - AST node of JSX attribute.
 * @returns {string} Name of the attribute.
 * @throws {Error} If attribute type is not supported.
 */
export function getAttrName(attribute: t.JSXAttribute): string {
  if (t.isJSXIdentifier(attribute.name)) {
    return attribute.name.name;
  }
  if (t.isJSXNamespacedName(attribute.name)) {
    return `${attribute.name.namespace.name}:${attribute.name.name.name}`;
  }

  return '';
}

/**
 * Serialize HTML element attributes to string
 * @description Serialize JSX attribute object to HTML attribute string
 * @param {Record<string, unknown>|undefined} attributes - Attribute object
 * @param {State} state - Plugin state
 * @return {string} Serialized HTML attribute string
 */
export function serializeAttributes(attributes: Record<string, unknown> | undefined): string {
  if (!attributes || !isObject(attributes)) {
    return '';
  }

  let attributesString = '';
  let classNames = '';
  let styleString = '';

  // Process all attributes
  for (const [attrName, attrValue] of Object.entries(attributes)) {
    // Process class attribute
    if (attrName === CLASS_NAME && isString(attrValue)) {
      classNames += ` ${attrValue}`;
      delete attributes[attrName];
    }
    // Process style attribute
    else if (attrName === STYLE_NAME && isString(attrValue)) {
      styleString += `${attrValue}${attrValue.at(-1) === ';' ? '' : ';'}`;
      delete attributes[attrName];
    }
    // Process boolean attributes
    else if (attrValue === true) {
      attributesString += ` ${attrName}`;
      delete attributes[attrName];
    }
    // Ignore false attributes
    else if (attrValue === false) {
      delete attributes[attrName];
    }
    // Process string and number attributes
    else if (isString(attrValue) || isNumber(attrValue)) {
      attributesString += ` ${attrName}="${attrValue}"`;
      delete attributes[attrName];
    }
    // Process conditional expressions - let unified architecture handle
    else if (t.isConditionalExpression(attrValue as t.Node)) {
      // Store conditional expressions directly, let unified memoizedEffect architecture handle
      // This way all reactive attributes will be handled uniformly in generateDynamicPropsCode
      attributes[attrName] = attrValue;
    }
    // Process object expressions
    else if (t.isObjectExpression(attrValue as t.Node)) {
      const result = processObjectExpression(
        attrName,
        attrValue as t.ObjectExpression,
        attributes,
        attrName === CLASS_NAME || attrName === STYLE_NAME,
      );

      if (result) {
        if (attrName === CLASS_NAME) {
          classNames += ` ${result}`;
        }
        if (attrName === STYLE_NAME) {
          styleString += `${result}${result.at(-1) === ';' ? '' : ';'}`;
        }
      }
    }
  }

  // Add class and style attributes
  if (classNames.trim()) {
    attributesString += ` ${CLASS_NAME}="${classNames.trim()}"`;
  }
  if (styleString.trim()) {
    attributesString += ` ${STYLE_NAME}="${styleString.trim()}"`;
  }

  return attributesString;
}

/**
 * Find the marker node index where dynamic content should be inserted
 * @description Used to determine the insertion position of dynamic nodes within a parent node, handling two main scenarios:
 * 1. Followed by static node: Use the following static node as insertion marker.
 * 2. Followed by dynamic content: Need to create a comment node `<!>` as insertion marker.
 *
 * Typical use case analysis table:
 * +---------------------+-------------------------------+---------------------------+-----------------------+
 * | Template Structure  | Compiled Structure           | Insertion Logic           | Return Value          |
 * +---------------------+-------------------------------+---------------------------+-----------------------+
 * | `<div>{v}</div>`      | `<div></div>`                  | Append to end             | `null` (no following node) |
 * | `<div>A{v}B</div>`    | `<div>A<!>B</div>`             | Insert before `<!>`         | Comment node index     |
 * | `<div>{v}<span/></div>` | `<div><span/></div>`         | Insert before `span`        | `span` node index        |
 * | `<div>{v}{v}</div>`   | `<div><!></div>`               | Insert in order before `<!>`  | Comment node index     |
 * | `<div><p/>{v}</div>`  | `<div><p/></div>`              | Append to end             | `null`                  |
 * | `<div>{v}<!></div>`   | `<div><!></div>`               | Insert before existing `<!>`  | Comment node index     |
 * | `<div>{v1}{v2}<br/></div>` | `<div><br/></div>`       | Insert `v2` before `br`, then insert `v1` | `br` node index         |
 * | `<div>{v}<!-- --></div>` | `<div><!-- --></div>`       | Insert before comment node | Comment node index     |
 * | `<div>{v}<Component/></div>` | `<div><Component/></div>` | Insert before component  | Component node index    |
 * +---------------------+-------------------------------+---------------------------+-----------------------+
 *
 * @param {TreeNode} currentNode - Current dynamic node (expression/fragment/component).
 * @param {TreeNode} parentNode - Parent node of the current node.
 * @returns {number | null} Index of the target marker node, or `null` if no suitable position.
 */
export function findBeforeIndex(currentNode: TreeNode, parentNode: TreeNode): number | null {
  // Boundary condition check: If parent node has no children, or current node is the last child, no need for prefix marker
  if (!parentNode?.children?.length || currentNode.isLastChild) {
    return null;
  }

  const nodeIndex = parentNode.children.indexOf(currentNode);
  // Define node types considered "dynamic", these nodes won't serve as static insertion markers
  const dynamicTypes = [NODE_TYPE.EXPRESSION, NODE_TYPE.FRAGMENT, NODE_TYPE.COMPONENT];

  // Search backward for the nearest non-dynamic sibling node as insertion marker
  for (let searchIndex = nodeIndex + 1; searchIndex < parentNode.children.length; searchIndex++) {
    const siblingNode = parentNode.children[searchIndex] as TreeNode;

    if (!dynamicTypes.includes(siblingNode.type)) {
      return siblingNode.index; // Found static node, return its index
    }
  }

  return null; // If all following nodes are dynamic or there are no nodes, append to the end (return null)
}

/**
 * Collect DOM node indices that need to be mapped
 * @description Extract DOM node indices that need to be referenced on the client side from dynamic children and dynamic attributes.
 * These indices are used to efficiently access specific DOM elements in client-side code.
 * @param {DynamicContent[]} dynamicChildren - Dynamic children collection.
 * @param {Array<{props: Record<string, any>; parentIndex: number | null}>} dynamicProps - Dynamic attribute collection.
 * @returns {number[]} De-duplicated and sorted index list, representing DOM nodes that need to be mapped.
 */
export function collectNodeIndexMap(
  dynamicChildren: DynamicContent[],
  dynamicProps: Array<{ props: Record<string, any>; parentIndex: number | null }>,
): number[] {
  // Use Set for automatic de-duplication
  const indexSet = new Set<number>();

  // Collect parent node indices and preceding node indices of dynamic children
  dynamicChildren.forEach(item => {
    if (item.parentIndex !== null) {
      indexSet.add(item.parentIndex!);
    }
    if (item.before !== null) {
      indexSet.add(item.before);
    }
  });

  // Collect parent node indices of dynamic attributes
  dynamicProps.forEach(item => {
    if (item.parentIndex !== null) {
      indexSet.add(item.parentIndex);
    }
  });

  // Convert Set to array and sort in ascending order
  return Array.from(indexSet).sort((a, b) => a - b);
}

/**
 * Find the position of an index in the mapping array
 * @description In a pre-generated DOM node index mapping array, find the actual position of a specific target index.
 * Used at client runtime to quickly locate DOM nodes by index.
 * @param {number} targetIndex - Original index of the target node (TreeNode.index).
 * @param {number[]} indexMap - Pre-collected and sorted DOM node index mapping array.
 * @returns {number} Position of the target index in the `indexMap` array (0-based index), returns `-1` if not found.
 *
 * Use case examples:
 * 1. `targetIndex=1`, `indexMap=[1,2,3]` => returns `0`
 * 2. `targetIndex=2`, `indexMap=[1,2,3]` => returns `1`
 * 3. `targetIndex=3`, `indexMap=[1,2,3]` => returns `2`
 * 4. `targetIndex=4`, `indexMap=[1,2,3]` => returns `-1` (not found)
 */
export function findIndexPosition(
  targetIndex: number,
  indexMap: number[] | Map<number, number>,
): number {
  if (Array.isArray(indexMap)) {
    return indexMap.indexOf(targetIndex);
  }
  if (indexMap instanceof Map) {
    const position = indexMap.get(targetIndex);
    return typeof position === 'number' ? position : -1;
  }
  return -1;
}

/**
 * Insert comment nodes (type: COMMENT) into TreeNode.children where needed
 * @description This function is used during JSX tree conversion, when an expression node is located between two text nodes,
 * or an expression node is immediately followed by another expression node,
 * to insert an empty comment node `<!>` as a marker for dynamic content insertion. This helps precisely locate insertion positions during client-side rendering.
 * This operation does not affect the original `TreeNode.index` system.
 * @param {TreeNode} node - Current TreeNode to process.
 */
export function processTextElementAddComment(node: TreeNode): void {
  if (!node.children || node.children.length === 0) {
    return;
  }

  // Recursively process all child nodes
  for (const child of node.children) {
    // Only recursively process when child is TreeNode type
    if (isTreeNode(child)) {
      processTextElementAddComment(child);
    }
  }

  // Process comment insertion only for this level of children
  let i = 0;
  while (i < node.children.length) {
    // Determine if comment node needs to be inserted at current position
    if (shouldInsertComment(node.children as TreeNode[], i)) {
      // Insert comment node, note its index is set to -1, as it's not a regular DOM node, only used as marker.
      node.children.splice(i + 1, 0, {
        type: NODE_TYPE.COMMENT,
        isComment: true,
        children: [],
        index: -1,
        parentIndex: node.index, // Add required property to satisfy TreeNode type
      } as TreeNode); // Force type assertion, as it's a special internal node
      i += 2; // Skip current node and just inserted comment node
    } else {
      i += 1;
    }
  }
}

/**
 * Determine if comment node should be inserted
 * @description Assists the `processTextElementAddComment` function, determines if comment node should be inserted at given position.
 * Rule: Current node is an expression, and is immediately followed by non-HTML/SVG element (i.e., another dynamic content or text node).
 * @param {(TreeNode | string)[]} children - Array of child nodes of parent node.
 * @param {number} idx - Index of current child node to check in the array.
 * @returns {boolean} `true` if comment node needs to be inserted, `false` otherwise.
 */
function shouldInsertComment(children: (TreeNode | string | JSXChild)[], idx: number): boolean {
  const cur = children[idx];
  const next = children[idx + 1];

  // Only process expression nodes, because comment nodes are used to separate adjacent dynamic content
  if (!cur || !isObject(cur) || cur.type !== NODE_TYPE.EXPRESSION) {
    return false;
  }

  // If it's the last node, or is immediately followed by HTML/SVG element, comment node is not needed
  if (
    !next ||
    (isObject(next) && (next.type === NODE_TYPE.NORMAL || next.type === NODE_TYPE.SVG))
  ) {
    return false;
  }

  // Other cases (expression followed by text, another expression, Fragment or Component), comment node should be inserted
  return true;
}

/**
 * Normalize JSX props into a single flat record.
 * 1. Multiple occurrences of `class` / `className` / `style` are merged into a single string (static) or array (dynamic).
 * 2. Collect multiple object spreads as unified `SPREAD_NAME` record to avoid extra traversal.
 */
export function normalizeProps(raw: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};

  const classBuffer: string[] = [];
  const styleBuffer: string[] = [];

  for (const [key, value] of Object.entries(raw)) {
    // Handle both 'class' and 'className' (React compatibility)
    if (key === CLASS_NAME || key === 'className') {
      if (typeof value === 'string') classBuffer.push(value);
      else {
        // If there's already a dynamic class expression, keep the last one
        normalized[CLASS_NAME] = value; // Keep dynamic expressions as-is
      }
      continue;
    }

    if (key === STYLE_NAME) {
      if (typeof value === 'string') styleBuffer.push(value);
      else normalized[STYLE_NAME] = value;
      continue;
    }

    if (key === SPREAD_NAME) {
      // If spread already exists, merge directly as array
      if (!normalized[SPREAD_NAME]) normalized[SPREAD_NAME] = [];
      (normalized[SPREAD_NAME] as any[]).push(value);
      continue;
    }

    normalized[key] = value;
  }

  if (classBuffer.length) normalized[CLASS_NAME] = classBuffer.join(' ').trim();
  if (styleBuffer.length) {
    const s = styleBuffer.map(str => (str.endsWith(';') ? str : `${str};`)).join('');
    normalized[STYLE_NAME] = s;
  }

  return normalized;
}

/**
 * Create props object expression
 * @description Convert attribute record to AST object expression
 * @param {Record<string, unknown>} propsData - Attribute data
 * @param {Function} transformJSX - JSX conversion function
 * @return {t.ObjectExpression} Generated object expression
 */
export function createPropsObjectExpression(
  propsData: Record<string, unknown>,
  transformJSX: (path: NodePath<JSXElement>, tree: TreeNode) => t.Expression,
): t.ObjectExpression {
  const objectProperties: (t.ObjectProperty | t.SpreadElement | t.ObjectMethod)[] = [];

  const propsToProcess = normalizeProps(propsData);

  for (const propName in propsToProcess) {
    const propValue = propsToProcess[propName];
    // Skip empty children
    if (propName === CHILDREN_NAME && (!propValue || (isArray(propValue) && !propValue.length))) {
      continue;
    }
    const astValue = convertValueToASTNode(propValue as any, transformJSX);

    // Process spread attribute
    if (propName === SPREAD_NAME) {
      objectProperties.push(t.spreadElement(astValue));
    } else {
      // Check if dynamic and not a function
      // if (isDynamicExpression(astValue) && !t.isFunction(astValue) && propName !== 'children') {
      //   objectProperties.push(
      //     t.objectMethod(
      //       'get',
      //       t.identifier(propName),
      //       [],
      //       t.blockStatement([t.returnStatement(astValue)]),
      //     ),
      //   );
      // } else {
      objectProperties.push(t.objectProperty(t.stringLiteral(propName), astValue));
      // }
    }
  }

  return t.objectExpression(objectProperties);
}

/**
 * Convert JavaScript value to corresponding AST node
 * @description Convert value to corresponding AST expression node based on value type
 * @param {unknown} value - Value to convert
 * @param {Function} transformJSX - JSX conversion function
 * @return {t.Expression} Corresponding AST node
 */
export function convertValueToASTNode(
  value: JSXChild | TreeNode | Expression,
  transformJSX: (path: NodePath<JSXElement>, tree: TreeNode) => t.Expression,
): Expression {
  // If it's already an AST node, return directly
  if (t.isExpression(value as Expression)) {
    return value as Expression;
  }
  if (isArray(value)) {
    return t.arrayExpression(value.map(item => convertValueToASTNode(item, transformJSX)));
  }
  if (isObject(value)) {
    if (
      value.type === NODE_TYPE.FRAGMENT ||
      value.type === NODE_TYPE.COMPONENT ||
      value.type === NODE_TYPE.NORMAL ||
      value.type === NODE_TYPE.TEXT ||
      value.type === NODE_TYPE.SVG
    ) {
      const { path } = getContext();
      return transformJSX(path, value);
    }

    if (
      value.type === NODE_TYPE.EXPRESSION &&
      value.children &&
      isArray(value.children) &&
      value.children.length > 0
    ) {
      return convertValueToASTNode(value.children[0] as JSXChild, transformJSX);
    }

    if (
      t.isJSXElement(value as unknown as JSXElement) ||
      t.isJSXFragment(value as unknown as JSXElement)
    ) {
      const { path } = getContext();
      const mockNodePath = {
        node: value,
        parentPath: path, // Keep parent path reference
        scope: path.scope, // Keep scope reference
      } as unknown as NodePath<JSXElement>;
      const tree = createTree(mockNodePath);
      return transformJSX(path, tree);
    }

    return createPropsObjectExpression(value, transformJSX);
  }
  if (isString(value)) {
    return t.stringLiteral(value);
  }
  if (isNumber(value)) {
    return t.numericLiteral(value);
  }
  if (isBoolean(value)) {
    return t.booleanLiteral(value);
  }
  if (isUndefined(value)) {
    return t.identifier('undefined');
  }
  if (isNull(value)) {
    return t.nullLiteral();
  }

  return value as Expression;
}
/**
 * Get the setting function corresponding to the attribute
 */
export function getSetFunctionForAttribute(attrName: string) {
  const { state } = getContext();
  switch (attrName) {
    case CLASS_NAME:
      return {
        name: 'patchClass',
        value: state.imports.patchClass,
      };
    case STYLE_NAME:
      return { name: 'patchStyle', value: state.imports.patchStyle };
    default:
      return { name: 'patchAttr', value: state.imports.patchAttr };
  }
}

/**
 * Determine if an AST node should be considered dynamic for attribute evaluation.
 * Covers common JS expression types beyond Identifier, including member/call/conditional/template, etc.
 */
export function isDynamicExpression(node: t.Node | null | undefined): boolean {
  if (!node) return false;

  // Direct expression types that are dynamic
  if (
    t.isIdentifier(node) ||
    t.isMemberExpression(node) ||
    t.isOptionalMemberExpression(node) ||
    t.isCallExpression(node) ||
    t.isOptionalCallExpression(node) ||
    t.isConditionalExpression(node) ||
    t.isLogicalExpression(node) ||
    t.isTemplateLiteral(node) ||
    t.isTaggedTemplateExpression(node) ||
    t.isBinaryExpression(node) ||
    t.isUnaryExpression(node) ||
    t.isUpdateExpression(node) ||
    t.isAwaitExpression(node) ||
    t.isYieldExpression(node) ||
    t.isAssignmentExpression(node) ||
    t.isSequenceExpression(node) ||
    t.isArrowFunctionExpression(node) ||
    t.isFunctionExpression(node)
  ) {
    return true;
  }

  // Object/Array: deep check
  if (t.isObjectExpression(node)) {
    return deepCheckObjectDynamic(node);
  }
  if (t.isArrayExpression(node)) {
    return node.elements.some(el => el != null && isDynamicExpression(el as t.Node));
  }

  // Literals/null are static
  if (
    t.isStringLiteral(node) ||
    t.isNumericLiteral(node) ||
    t.isBooleanLiteral(node) ||
    t.isNullLiteral(node) ||
    t.isRegExpLiteral(node)
  ) {
    return false;
  }

  // Fallback: if it is some other Expression, treat as dynamic; otherwise static
  return t.isExpression(node as t.Node);
}
