import { type NodePath, types as t } from '@babel/core';
import { isNumber, isObject, isString } from '@estjs/shared';
import { addImport, importMap } from '../import';
import { CLASS_NAME, FRAGMENT_NAME, NODE_TYPE, STYLE_NAME } from './constants';
import { getContext } from './context';
import type { DynamicContent, JSXChild, TreeNode } from './types';

/**
 * Determine whether a string is a component name
 * @description Determine whether it is a component name based on whether the first letter is capitalized, contains a dot, or a non-alphabetic character.
 * @param {string} tagName - The tag name to check.
 * @returns {boolean} `true` if the tag represents a component, `false` otherwise.
 */
export function isComponentName(tagName: string): boolean {
  return (
    (tagName[0] && tagName[0].toLowerCase() !== tagName[0]) || // First letter capitalized
    tagName.includes('.') || // Contains dot (e.g., SomeLibrary.SomeComponent)
    /[^a-z]/i.test(tagName[0]) // First letter non-alphabetic (e.g., _Component)
  );
}

/**
 * Get tag name from JSX element node
 * @description Process JSXElement and JSXFragment nodes, returning their corresponding tag string.
 * @param {t.JSXElement | t.JSXFragment} node - AST node of JSX element or fragment.
 * @returns {string} Tag name string (e.g., 'div', 'MyComponent', 'Fragment').
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
  node: t.JSXMemberExpression | t.JSXIdentifier | t.JSXNamespacedName,
): string {
  if (t.isJSXMemberExpression(node)) {
    // Process member expression, recursively join (e.g., SomeLibrary.SomeComponent)
    return `${jsxElementNameToString(node.object)}.${jsxElementNameToString(node.property)}`;
  }

  if (t.isJSXIdentifier(node) || t.isIdentifier(node)) {
    // Process identifier (e.g., MyComponent)
    return node.name;
  }

  // Process namespace expression (e.g., namespace:ComponentName)
  return `${node.namespace.name}:${node.name.name}`;
}

/**
 * Determine if the given path represents a text child node in JSX expression
 * @description Check if the node is of type JSXText, StringLiteral, or NumericLiteral.
 * @param {NodePath<JSXChild>} path - AST path of potential text child node.
 * @returns {boolean} `true` if the path represents a text child node, `false` otherwise.
 */
export function isTextChild(path: NodePath<JSXChild>): boolean {
  if (path.isJSXExpressionContainer()) {
    const expression = path.get('expression');
    if (expression.isJSXText() || expression.isStringLiteral() || expression.isNumericLiteral()) {
      return true;
    }
  }
  if (path.isJSXText() || path.isStringLiteral() || path.isNullLiteral()) {
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
  return node.value.replaceAll(/\s+/g, ' ').trim();
}

/**
 * Determine if a JSX child node is valid
 * @description Ignore text nodes that contain only whitespace.
 * @param {NodePath<JSXChild>} path - AST path of JSX child node.
 * @returns {boolean} `true` if the node is valid, `false` otherwise.
 */
export function isValidChild(path: NodePath<JSXChild>): boolean {
  const regex = /^\s*$/;
  if (path.isStringLiteral() || path.isJSXText()) {
    return !regex.test(path.node.value);
  }
  return Object.keys(path.node).length > 0; // For other types of nodes, consider valid if they have content
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
  return children.reduce<NodePath<JSXChild>[]>((acc, cur) => {
    if (isValidChild(cur)) {
      const lastChild = acc.at(-1);
      if (lastChild && isTextChild(cur) && isTextChild(lastChild)) {
        // Merge adjacent text nodes
        setNodeText(lastChild, getNodeText(lastChild) + getNodeText(cur));
      } else {
        acc.push(cur as NodePath<JSXChild>);
      }
    }
    return acc;
  }, []);
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
  const { state } = getContext();

  let classStyleString = '';

  // Check if any property contains conditional expressions (ternary expressions)
  const hasConditionalProps = objectExpr.properties.some(
    property => t.isObjectProperty(property) && t.isConditionalExpression(property.value),
  );

  // Handle conditional properties by wrapping in computed()
  if (hasConditionalProps) {
    addImport(importMap.computed);
    propsCollection[propName] = t.callExpression(state.imports.computed, [
      t.arrowFunctionExpression([], objectExpr),
    ]);
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
  const { state } = getContext();

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
    // Process conditional expressions
    else if (t.isConditionalExpression(attrValue as t.Node)) {
      addImport(importMap.computed);
      attributes[attrName] = t.callExpression(state.imports.computed, [
        t.arrowFunctionExpression([], attrValue as t.Expression),
      ]);
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

  // If value exists, ensure there's a space at the beginning
  return attributesString.length && attributesString.charAt(0) !== ' '
    ? ` ${attributesString}`
    : attributesString;
}

/**
 * Type guard to determine if a given value is a TreeNode
 * @description Check if the object has key properties of TreeNode.
 * @param {any} value - Value to check.
 * @returns {value is TreeNode} True if it's a TreeNode type, false otherwise.
 */
export function isTreeNode(value: any): value is TreeNode {
  return isObject(value) && !!value._isTreeNode;
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
  const dynamicTypes = [
    NODE_TYPE.EXPRESSION,
    NODE_TYPE.FRAGMENT,
    NODE_TYPE.COMPONENT,
    NODE_TYPE.COMMENT, // Comment nodes are also treated as markers for dynamic content insertion in client-side rendering
  ];

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
export function findIndexPosition(targetIndex: number, indexMap: number[]): number {
  return indexMap.indexOf(targetIndex);
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
    if (shouldInsertComment(node.children, i)) {
      // Insert comment node, note its index is set to -1, as it's not a regular DOM node, only used as marker.
      node.children.splice(i + 1, 0, {
        type: NODE_TYPE.COMMENT,
        isComment: true,
        children: [],
        index: -1,
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
