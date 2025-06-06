import { type NodePath, types as t } from '@babel/core';
import { isArray, isNumber, isObject, isString } from '@estjs/shared';
import { addImport, importMap } from '../import';
import { CLASS_NAME, FRAGMENT_NAME, NODE_TYPE, STYLE_NAME } from './constants';
import type { DynamicContent, JSXChild, TreeNode } from './types';
import type { State } from '../types';

/**
 * Checks if a string is a component name
 * @description Determines if a tag represents a component based on whether its first letter is uppercase, contains a dot, or non-alphabetic characters.
 * @param {string} tagName - The tag name to check.
 * @returns {boolean} `true` if the tag represents a component, otherwise `false`.
 */
export function isComponentName(tagName: string): boolean {
  return (
    (tagName[0] && tagName[0].toLowerCase() !== tagName[0]) || // Uppercase first letter
    tagName.includes('.') || // Contains a dot (e.g., SomeLibrary.SomeComponent)
    /[^a-z]/i.test(tagName[0]) // First letter is non-alphabetic (e.g., _Component)
  );
}

/**
 * Gets the tag name from a JSX element node
 * @description Processes JSXElement and JSXFragment nodes and returns their corresponding tag string.
 * @param {t.JSXElement | t.JSXFragment} node - The AST node of the JSX element or fragment.
 * @returns {string} The tag name string (e.g., 'div', 'MyComponent', 'Fragment').
 */
export const getTagName = (node: t.JSXElement | t.JSXFragment): string => {
  // Handle JSX Fragment (<>...</> or <Fragment>...</Fragment>) cases
  if (t.isJSXFragment(node)) {
    return FRAGMENT_NAME;
  }

  // Handle regular JSX elements (e.g., <div>, <MyComponent.Nested/>)
  const tag = node.openingElement.name;
  return jsxElementNameToString(tag);
};

/**
 * Converts a JSX element name to its string representation
 * @description Supports forms such as JSXIdentifier (e.g., MyComponent), JSXMemberExpression (e.g., SomeLibrary.SomeComponent),
 * and JSXNamespacedName (e.g., namespace:ComponentName).
 * @param {t.JSXMemberExpression | t.JSXIdentifier | t.JSXNamespacedName} node - The AST node of the JSX element name.
 * @returns {string} The string representation of the JSX element name.
 */
export function jsxElementNameToString(
  node: t.JSXMemberExpression | t.JSXIdentifier | t.JSXNamespacedName,
): string {
  if (t.isJSXMemberExpression(node)) {
    // Process member expressions, recursively concatenate (e.g., SomeLibrary.SomeComponent)
    return `${jsxElementNameToString(node.object)}.${jsxElementNameToString(node.property)}`;
  }

  if (t.isJSXIdentifier(node) || t.isIdentifier(node)) {
    // Process identifiers (e.g., MyComponent)
    return node.name;
  }

  // Process namespaced expressions (e.g., namespace:ComponentName)
  return `${node.namespace.name}:${node.name.name}`;
}

/**
 * Checks if the given path represents a text child node within a JSX expression
 * @description Checks if the node is of type JSXText, StringLiteral, or NumericLiteral.
 * @param {NodePath<JSXChild>} path - The AST path of the potential text child node.
 * @returns {boolean} `true` if the path represents a text child node, otherwise `false`.
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
 * Trims the text content of a JSXText node
 * @description Removes excess whitespace and newlines, merging multiple whitespaces into a single space.
 * @param {t.JSXText} node - The JSXText AST node.
 * @returns {string} The trimmed text content.
 */
export function textTrim(node: t.JSXText): string {
  return node.value.replaceAll(/\s+/g, ' ').trim();
}

/**
 * Checks if a JSX child node is a valid node
 * @description Ignores text nodes that only contain whitespace.
 * @param {NodePath<JSXChild>} path - The AST path of the JSX child node.
 * @returns {boolean} `true` if the node is valid, otherwise `false`.
 */
export function isValidChild(path: NodePath<JSXChild>): boolean {
  const regex = /^\s*$/;
  if (path.isStringLiteral() || path.isJSXText()) {
    return !regex.test(path.node.value);
  }
  return Object.keys(path.node).length > 0; // For other node types, it is considered valid as long as it has content
}

/**
 * Gets the text content of a node
 * @description Extracts text from JSXText or JSXExpressionContainer containing StringLiteral/NumericLiteral.
 * @param {NodePath<JSXChild>} path - The AST path of the JSX child node.
 * @returns {string} The text content of the node, or an empty string if it is not a text node.
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
 * Sets the text content of a JSX child node
 * @description Updates the value of StringLiteral/NumericLiteral in JSXText or JSXExpressionContainer.
 * @param {NodePath<JSXChild>} path - The AST path of the JSX child node.
 * @param {string} text - The text content to set.
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
 * Optimizes the child node list, merging adjacent text nodes
 * @description Iterates through the child node list, merging consecutive text nodes into one, reducing the number of generated AST nodes and improving rendering performance.
 * @param {NodePath<JSXChild>[]} children - The original array of child node paths.
 * @returns {NodePath<JSXChild>[]} The optimized array of child node paths.
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
 * @param state - Babel transformation state object
 * @param isClassOrStyleAttr - Flag indicating if processing class/style attribute (special handling)
 * @returns Generated class/style string when processing class/style attributes
 */
export function processObjectExpression(
  propName: string,
  objectExpr: t.ObjectExpression,
  propsCollection: Record<string, any>,
  state: State,
  isClassOrStyleAttr = false,
): string {
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
 * Gets the name of a JSX attribute
 * @description Extracts the string name of an attribute from a JSXAttribute node.
 * @param {t.JSXAttribute} attribute - The AST node of the JSX attribute.
 * @returns {string} The name of the attribute.
 * @throws {Error} If the attribute type is not supported.
 */
export function getAttrName(attribute: t.JSXAttribute): string {
  if (t.isJSXIdentifier(attribute.name)) {
    return attribute.name.name;
  }
  if (t.isJSXNamespacedName(attribute.name)) {
    return `${attribute.name.namespace.name}:${attribute.name.name.name}`;
  }
  throw new Error('Unsupported attribute type');
}

/**
 * Serializes HTML element attributes to a string
 * @description Serializes JSX attribute objects into an HTML attribute string
 * @param {Record<string, unknown>|undefined} attributes - The attribute object
 * @param {State} state - Plugin state
 * @return {string} The serialized HTML attribute string
 */
export function serializeAttributes(
  attributes: Record<string, unknown> | undefined,
  state: State,
): string {
  if (!attributes || !isObject(attributes)) {
    return '';
  }

  let attributesString = '';
  let classNames = '';
  let styleString = '';

  // Process all attributes
  const entries = Object.entries(attributes);
  if (!entries.length) return '';

  // Process class attribute
  const classAttr = entries.find(([key]) => key === CLASS_NAME);
  if (classAttr) {
    const [, value] = classAttr;
    if (isString(value)) {
      classNames = ` ${value}`;
    }
  }

  // Process style attribute
  const styleAttr = entries.find(([key]) => key === STYLE_NAME);
  if (styleAttr) {
    const [, value] = styleAttr;
    if (isString(value)) {
      styleString = `${value}${value.at(-1) === ';' ? '' : ';'}`;
    }
  }

  // Process boolean attributes
  const booleanAttrs = entries
    .filter(([, value]) => value === true)
    .map(([key]) => ` ${key}`)
    .join('');

  // Ignore false attributes
  const stringAttrs = entries
    .filter(([, value]) => value !== true && value !== false && !isObject(value))
    .map(([key, value]) => {
      if (isString(value) || isNumber(value)) {
        return ` ${key}="${value}"`;
      }
      return '';
    })
    .join('');

  // Process conditional expressions
  const conditionalAttrs = entries
    .filter(([, value]) => t.isConditionalExpression(value as any))
    .map(([key, value]) => {
      addImport(importMap.computed);
      return ` ${key}={${state.imports.computed}(() => ${(value as any).value})}`;
    })
    .join('');

  // Process object expressions
  const objectAttrs = entries
    .filter(([, value]) => t.isObjectExpression(value as any))
    .map(([key, value]) => {
      addImport(importMap.computed);
      return ` ${key}={${state.imports.computed}(() => ${(value as any).value})}`;
    })
    .join('');

  // Add class and style attributes
  const result = `${classNames}${styleString}${booleanAttrs}${stringAttrs}${conditionalAttrs}${objectAttrs}`;

  // If there is a value, ensure there is a leading space
  return result.length > 0 ? result : '';
}

/**
 * Checks if a value is a TreeNode
 * @description Type guard to check if a value is a TreeNode
 * @param {any} value - The value to check
 * @returns {boolean} True if the value is a TreeNode
 */
export function isTreeNode(value: any): value is TreeNode {
  return (
    isObject(value) && isString(value.type) && isArray(value.children) && isNumber(value.index)
  );
}

/**
 * 查找动态内容应插入的标记节点索引
 * @description 用于确定动态节点在父节点中的插入位置，处理两种主要场景：
 * 1. 后接静态节点：直接使用后置静态节点作为插入标记。
 * 2. 后接动态内容：需创建注释节点 `<!>` 作为插入标记。
 *
 * 典型用例分析表：
 * +---------------------+-------------------------------+---------------------------+-----------------------+
 * | 模板结构            | 编译后结构                   | 插入逻辑                  | 返回值说明            |
 * +---------------------+-------------------------------+---------------------------+-----------------------+
 * | `<div>{v}</div>`      | `<div></div>`                  | 追加到末尾                | `null` (无后置节点)     |
 * | `<div>A{v}B</div>`    | `<div>A<!>B</div>`             | 在`<!>`前插入               | 注释节点索引          |
 * | `<div>{v}<span/></div>` | `<div><span/></div>`         | 在`span`前插入              | `span`节点索引          |
 * | `<div>{v}{v}</div>`   | `<div><!></div>`               | 在`<!>`前顺序插入           | 注释节点索引          |
 * | `<div><p/>{v}</div>`  | `<div><p/></div>`              | 追加到末尾                | `null`                  |
 * | `<div>{v}<!></div>`   | `<div><!></div>`               | 在已有`<!>`前插入           | 注释节点索引          |
 * | `<div>{v1}{v2}<br/></div>` | `<div><br/></div>`       | 在`br`前插入`v2`，再插入`v1`    | `br`节点索引            |
 * | `<div>{v}<!-- --></div>` | `<div><!-- --></div>`       | 在注释节点前插入          | 注释节点索引          |
 * | `<div>{v}<Component/></div>` | `<div><Component/></div>` | 在组件前插入            | 组件节点索引          |
 * +---------------------+-------------------------------+---------------------------+-----------------------+
 *
 * @param {TreeNode} currentNode - 当前动态节点 (表达式/片段/组件)。
 * @param {TreeNode} parentNode - 当前节点的父节点。
 * @returns {number | null} 目标标记节点的索引，若无合适位置返回 `null`。
 */
export function findBeforeIndex(currentNode: TreeNode, parentNode: TreeNode): number | null {
  // 边界条件检查：如果父节点没有子节点，或者当前节点是最后一个子节点，则无需前置标记
  if (!parentNode?.children?.length || currentNode.isLastChild) {
    return null;
  }

  const nodeIndex = parentNode.children.indexOf(currentNode);
  // 定义被视为"动态"的节点类型，这些节点不会作为静态插入标记
  const dynamicTypes = [
    NODE_TYPE.EXPRESSION,
    NODE_TYPE.FRAGMENT,
    NODE_TYPE.COMPONENT,
    NODE_TYPE.COMMENT, // 注释节点在客户端渲染时也视为动态内容插入的标记
  ];

  // 向后查找最近的非动态兄弟节点作为插入标记
  for (let searchIndex = nodeIndex + 1; searchIndex < parentNode.children.length; searchIndex++) {
    const siblingNode = parentNode.children[searchIndex] as TreeNode;

    if (!dynamicTypes.includes(siblingNode.type)) {
      return siblingNode.index; // 找到静态节点，返回其索引
    }
  }

  return null; // 如果后面全部是动态节点或者没有节点，则追加到末尾 (返回 null)
}
/**
 * Collects node index mappings for dynamic content
 * @description Creates a map of parent indices and insertion points for dynamic content
 * @param {DynamicContent[]} dynamicChildren - Dynamic child nodes
 * @param {Array<{props: Record<string, any>; parentIndex: number | null}>} dynamicProps - Dynamic properties
 * @returns {number[]} Sorted array of parent indices
 */
export function collectNodeIndexMap(
  dynamicChildren: DynamicContent[],
  dynamicProps: Array<{ props: Record<string, any>; parentIndex: number | null }>,
): number[] {
  // Use Set for automatic deduplication
  const parentIndices = new Set<number>();

  // Collect parent indices and insertion points for dynamic child nodes
  dynamicChildren.forEach(({ parentIndex, beforeIndex }) => {
    if (parentIndex !== null) {
      parentIndices.add(parentIndex);
    }
    if (beforeIndex !== null) {
      parentIndices.add(beforeIndex);
    }
  });

  // Collect parent indices for dynamic attributes
  dynamicProps.forEach(({ parentIndex }) => {
    if (parentIndex !== null) {
      parentIndices.add(parentIndex);
    }
  });

  // Convert Set to array and sort in ascending order
  return Array.from(parentIndices).sort((a, b) => a - b);
}

/**
 * Finds the position of a target index in an index map
 * @description Binary search to efficiently find the position of a target index
 * @param {number} targetIndex - The index to find
 * @param {number[]} indexMap - The sorted index map
 * @returns {number} The position of the target index
 */
export function findIndexPosition(targetIndex: number, indexMap: number[]): number {
  let left = 0;
  let right = indexMap.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (indexMap[mid] === targetIndex) return mid;
    if (indexMap[mid] < targetIndex) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}

/**
 * Process text elements and insert comment nodes as needed
 * @description Inserts comment nodes between dynamic content to maintain proper rendering
 * @param {TreeNode} node - The tree node to process
 */
export function processTextElementAddComment(node: TreeNode): void {
  // Recursively process all child nodes
  node.children.forEach(child => {
    // Only process child nodes that are TreeNode type
    if (isTreeNode(child)) {
      processTextElementAddComment(child);
    }
  });

  // Only process comments insertion at this children level
  const { children } = node;
  for (let i = 0; i < children.length; i++) {
    // Check if we need to insert a comment node at this position
    if (shouldInsertComment(children, i)) {
      // Insert comment node with index -1 as it's not a regular DOM node, just a marker
      children.splice(
        i + 1,
        0,
        {
          type: NODE_TYPE.COMMENT,
          index: -1,
          children: [''],
        } as TreeNode, // Force type assertion as it's a special internal node
      );
      i += 2; // Skip current node and the inserted comment node
    }
  }
}

/**
 * Determines if a comment node should be inserted between nodes
 * @description Checks if a comment marker is needed between dynamic content
 * @param {(TreeNode | string | t.Expression)[]} children - The child nodes
 * @param {number} idx - The current index
 * @returns {boolean} True if a comment node should be inserted
 */
function shouldInsertComment(children: (TreeNode | string | t.Expression)[], idx: number): boolean {
  const currentNode = children[idx];
  const nextNode = children[idx + 1];

  // Only process expression nodes, as comment nodes are used to separate adjacent dynamic content
  if (isTreeNode(currentNode) && currentNode.type === NODE_TYPE.EXPRESSION) {
    // If it's the last node, or followed by HTML/SVG element, no comment node needed
    if (
      !nextNode ||
      (isTreeNode(nextNode) &&
        (nextNode.type === NODE_TYPE.NORMAL || nextNode.type === NODE_TYPE.SVG))
    ) {
      return false;
    }

    // Other cases (expression followed by text, another expression, Fragment or Component), need comment node
    return true;
  }

  return false;
}
