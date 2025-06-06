import { type NodePath, types as t } from '@babel/core';
import { isNumber, isObject, isString } from '@estjs/shared';
import { addImport, importMap } from '../import';
import { CLASS_NAME, FRAGMENT_NAME, NODE_TYPE, STYLE_NAME } from './constants';
import type { DynamicContent, JSXChild, TreeNode } from './types';
import type { State } from '../types';

/**
 * 判断一个字符串是否是组件名称
 * @description 根据首字母是否大写、是否包含点号或非字母字符来判断是否为组件名。
 * @param {string} tagName - 要检查的标签名。
 * @returns {boolean} 如果标签表示一个组件，则为 `true`，否则为 `false`。
 */
export function isComponentName(tagName: string): boolean {
  return (
    (tagName[0] && tagName[0].toLowerCase() !== tagName[0]) || // 首字母大写
    tagName.includes('.') || // 包含点号 (如 SomeLibrary.SomeComponent)
    /[^a-z]/i.test(tagName[0]) // 首字母非字母 (如 _Component)
  );
}

/**
 * 从 JSX 元素节点中获取标签名称
 * @description 处理 JSXElement 和 JSXFragment 节点，返回其对应的标签字符串。
 * @param {t.JSXElement | t.JSXFragment} node - JSX 元素或片段的 AST 节点。
 * @returns {string} 标签名字符串（例如 'div', 'MyComponent', 'Fragment'）。
 */
export const getTagName = (node: t.JSXElement | t.JSXFragment): string => {
  // 处理 JSX Fragment (<>...</> 或 <Fragment>...</Fragment>) 的情况
  if (t.isJSXFragment(node)) {
    return FRAGMENT_NAME;
  }

  // 处理常规 JSX 元素 (如 <div>, <MyComponent.Nested/>)
  const tag = node.openingElement.name;
  return jsxElementNameToString(tag);
};

/**
 * 将 JSX 元素名称转换为字符串表示形式
 * @description 支持 JSXIdentifier (如 MyComponent)、JSXMemberExpression (如 SomeLibrary.SomeComponent)
 * 和 JSXNamespacedName (如 namespace:ComponentName) 等形式。
 * @param {t.JSXMemberExpression | t.JSXIdentifier | t.JSXNamespacedName} node - JSX 元素名称的 AST 节点。
 * @returns {string} JSX 元素名称的字符串表示。
 */
export function jsxElementNameToString(
  node: t.JSXMemberExpression | t.JSXIdentifier | t.JSXNamespacedName,
): string {
  if (t.isJSXMemberExpression(node)) {
    // 处理成员表达式，递归拼接 (如 SomeLibrary.SomeComponent)
    return `${jsxElementNameToString(node.object)}.${jsxElementNameToString(node.property)}`;
  }

  if (t.isJSXIdentifier(node) || t.isIdentifier(node)) {
    // 处理标识符 (如 MyComponent)
    return node.name;
  }

  // 处理命名空间表达式 (如 namespace:ComponentName)
  return `${node.namespace.name}:${node.name.name}`;
}

/**
 * 判断给定的路径是否表示 JSX 表达式中的文本子节点
 * @description 检查节点是否为 JSXText、StringLiteral 或 NumericLiteral 类型。
 * @param {NodePath<JSXChild>} path - 潜在文本子节点的 AST 路径。
 * @returns {boolean} 如果路径表示文本子节点，则为 `true`，否则为 `false`。
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
 * 修剪 JSXText 节点的文本内容
 * @description 移除多余的空白字符和换行符，将多个空白合并为一个空格。
 * @param {t.JSXText} node - JSXText AST 节点。
 * @returns {string} 修剪后的文本内容。
 */
export function textTrim(node: t.JSXText): string {
  return node.value.replaceAll(/\s+/g, ' ').trim();
}

/**
 * 判断一个 JSX 子节点是否为有效节点
 * @description 忽略只包含空白字符的文本节点。
 * @param {NodePath<JSXChild>} path - JSX 子节点的 AST 路径。
 * @returns {boolean} 如果节点有效，则为 `true`，否则为 `false`。
 */
export function isValidChild(path: NodePath<JSXChild>): boolean {
  const regex = /^\s*$/;
  if (path.isStringLiteral() || path.isJSXText()) {
    return !regex.test(path.node.value);
  }
  return Object.keys(path.node).length > 0; // 对于其他类型的节点，只要有内容就视为有效
}

/**
 * 获取节点的文本内容
 * @description 从 JSXText 或包含 StringLiteral/NumericLiteral 的 JSXExpressionContainer 中提取文本。
 * @param {NodePath<JSXChild>} path - JSX 子节点的 AST 路径。
 * @returns {string} 节点的文本内容，如果不是文本节点则返回空字符串。
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
 * 设置 JSX 子节点的文本内容
 * @description 更新 JSXText 或 JSXExpressionContainer 中 StringLiteral/NumericLiteral 的值。
 * @param {NodePath<JSXChild>} path - JSX 子节点的 AST 路径。
 * @param {string} text - 要设置的文本内容。
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
 * 优化子节点列表，合并相邻文本节点
 * @description 遍历子节点列表，将连续的文本节点合并为一个，减少生成的 AST 节点数量，提高渲染性能。
 * @param {NodePath<JSXChild>[]} children - 原始的子节点路径数组。
 * @returns {NodePath<JSXChild>[]} 优化后的子节点路径数组。
 */
export function optimizeChildNodes(children: NodePath<JSXChild>[]): NodePath<JSXChild>[] {
  return children.reduce<NodePath<JSXChild>[]>((acc, cur) => {
    if (isValidChild(cur)) {
      const lastChild = acc.at(-1);
      if (lastChild && isTextChild(cur) && isTextChild(lastChild)) {
        // 合并相邻文本节点
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

  // Check if any property contains conditional expressions (三元表达式)
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
 * 获取 JSX 属性的名称
 * @description 从 JSXAttribute 节点中提取属性的字符串名称。
 * @param {t.JSXAttribute} attribute - JSX 属性的 AST 节点。
 * @returns {string} 属性的名称。
 * @throws {Error} 如果属性类型不支持。
 */
export function getAttrName(attribute: t.JSXAttribute): string {
  if (t.isJSXIdentifier(attribute.name)) {
    return attribute.name.name;
  }
  if (t.isJSXNamespacedName(attribute.name)) {
    return `${attribute.name.namespace.name}:${attribute.name.name.name}`;
  }
  throw new Error('不支持的属性类型');
}

/**
 * 序列化HTML元素属性为字符串
 * @description 将JSX属性对象序列化为HTML属性字符串
 * @param {Record<string, unknown>|undefined} attributes - 属性对象
 * @param {State} state - 插件状态
 * @return {string} 序列化后的HTML属性字符串
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

  // 处理所有属性
  for (const [attrName, attrValue] of Object.entries(attributes)) {
    // 处理class属性
    if (attrName === CLASS_NAME && isString(attrValue)) {
      classNames += ` ${attrValue}`;
      delete attributes[attrName];
    }
    // 处理style属性
    else if (attrName === STYLE_NAME && isString(attrValue)) {
      styleString += `${attrValue}${attrValue.at(-1) === ';' ? '' : ';'}`;
      delete attributes[attrName];
    }
    // 处理布尔属性
    else if (attrValue === true) {
      attributesString += ` ${attrName}`;
      delete attributes[attrName];
    }
    // 忽略false属性
    else if (attrValue === false) {
      delete attributes[attrName];
    }
    // 处理字符串和数字属性
    else if (isString(attrValue) || isNumber(attrValue)) {
      attributesString += ` ${attrName}="${attrValue}"`;
      delete attributes[attrName];
    }
    // 处理条件表达式
    else if (t.isConditionalExpression(attrValue as t.Node)) {
      addImport(importMap.computed);
      attributes[attrName] = t.callExpression(state.imports.computed, [
        t.arrowFunctionExpression([], attrValue as t.Expression),
      ]);
    }
    // 处理对象表达式
    else if (t.isObjectExpression(attrValue as t.Node)) {
      const result = processObjectExpression(
        attrName,
        attrValue as t.ObjectExpression,
        attributes,
        state,
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

  // 添加class和style属性
  if (classNames.trim()) {
    attributesString += ` ${CLASS_NAME}="${classNames.trim()}"`;
  }
  if (styleString.trim()) {
    attributesString += ` ${STYLE_NAME}="${styleString.trim()}"`;
  }

  // 如果存在值，则确保前面有一个空格
  return attributesString.length && attributesString.charAt(0) !== ' '
    ? ` ${attributesString}`
    : attributesString;
}

/**
 * 类型守卫，判断给定值是否为 TreeNode 类型。
 * @description 检查对象是否具备 TreeNode 的关键属性。
 * @param {any} value - 待检查的值。
 * @returns {value is TreeNode} 如果是 TreeNode 类型，则为 true，否则为 false。
 */
export function isTreeNode(value: any): value is TreeNode {
  return isObject(value) && !!value._isTreeNode;
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
 * 收集需要映射的 DOM 节点索引
 * @description 从动态子节点和动态属性中提取需要在客户端引用的 DOM 节点索引。
 * 这些索引用于在客户端代码中高效地访问特定 DOM 元素。
 * @param {DynamicContent[]} dynamicChildren - 动态子节点集合。
 * @param {Array<{props: Record<string, any>; parentIndex: number | null}>} dynamicProps - 动态属性集合。
 * @returns {number[]} 去重并排序后的索引列表，代表需要映射的 DOM 节点。
 */
export function collectNodeIndexMap(
  dynamicChildren: DynamicContent[],
  dynamicProps: Array<{ props: Record<string, any>; parentIndex: number | null }>,
): number[] {
  // 使用 Set 来自动去重
  const indexSet = new Set<number>();

  // 收集动态子节点的父节点索引和前置节点索引
  dynamicChildren.forEach(item => {
    if (item.parentIndex !== null) {
      indexSet.add(item.parentIndex!);
    }
    if (item.before !== null) {
      indexSet.add(item.before);
    }
  });

  // 收集动态属性的父节点索引
  dynamicProps.forEach(item => {
    if (item.parentIndex !== null) {
      indexSet.add(item.parentIndex);
    }
  });

  // 将 Set 转换为数组并进行升序排序
  return Array.from(indexSet).sort((a, b) => a - b);
}

/**
 * 查找索引在映射数组中的位置
 * @description 在预先生成的 DOM 节点索引映射数组中，查找特定目标索引的实际位置。
 * 这在客户端运行时用于通过索引快速定位到 DOM 节点。
 * @param {number} targetIndex - 目标节点的原始索引（TreeNode.index）。
 * @param {number[]} indexMap - 预先收集并排序的 DOM 节点索引映射数组。
 * @returns {number} 目标索引在 `indexMap` 数组中的位置（0-based index），如果未找到则返回 `-1`。
 *
 * 用例说明:
 * 1. `targetIndex=1`, `indexMap=[1,2,3]` => 返回 `0`
 * 2. `targetIndex=2`, `indexMap=[1,2,3]` => 返回 `1`
 * 3. `targetIndex=3`, `indexMap=[1,2,3]` => 返回 `2`
 * 4. `targetIndex=4`, `indexMap=[1,2,3]` => 返回 `-1` (未找到)
 */
export function findIndexPosition(targetIndex: number, indexMap: number[]): number {
  return indexMap.indexOf(targetIndex);
}

/**
 * 在需要的地方为 TreeNode.children 插入注释节点 (type: COMMENT)
 * @description 此函数用于在 JSX 树转换过程中，当表达式节点位于两个文本节点之间，或者表达式节点后面紧跟另一个表达式节点时，
 * 插入一个空的注释节点 `<!>` 作为动态内容插入的标记。这有助于在客户端渲染时精确地定位插入位置。
 * 该操作不影响原有 `TreeNode.index` 体系。
 * @param {TreeNode} node - 当前需要处理的 TreeNode。
 */
export function processTextElementAddComment(node: TreeNode): void {
  if (!node.children || node.children.length === 0) {
    return;
  }

  // 递归处理所有子节点
  for (const child of node.children) {
    // 只有当子节点是 TreeNode 类型时才进行递归处理
    if (isTreeNode(child)) {
      processTextElementAddComment(child);
    }
  }

  // 只对本层 children 处理注释插入
  let i = 0;
  while (i < node.children.length) {
    // 判断当前位置是否需要插入注释节点
    if (shouldInsertComment(node.children, i)) {
      // 插入注释节点，注意其 index 设置为 -1，因为它不是一个常规的 DOM 节点，仅作标记用。
      node.children.splice(i + 1, 0, {
        type: NODE_TYPE.COMMENT,
        isComment: true,
        children: [],
        index: -1,
      } as TreeNode); // 强制类型断言，因为它是一个特殊的内部节点
      i += 2; // 跳过当前节点和刚插入的注释节点
    } else {
      i += 1;
    }
  }
}

/**
 * 判断是否需要插入注释节点
 * @description 辅助 `processTextElementAddComment` 函数，判断在给定位置是否需要插入注释节点。
 * 规则：当前节点是表达式，且后面紧跟着非 HTML/SVG 元素 (即另一个动态内容或文本节点)。
 * @param {(TreeNode | string)[]} children - 父节点的子节点数组。
 * @param {number} idx - 当前要检查的子节点在数组中的索引。
 * @returns {boolean} 如果需要插入注释节点，则为 `true`，否则为 `false`。
 */
function shouldInsertComment(children: (TreeNode | string | JSXChild)[], idx: number): boolean {
  const cur = children[idx];
  const next = children[idx + 1];

  // 只处理表达式节点，因为注释节点是用来分隔相邻的动态内容的
  if (!cur || !isObject(cur) || cur.type !== NODE_TYPE.EXPRESSION) {
    return false;
  }

  // 如果是最后一个节点，或者后面紧跟着 HTML/SVG 元素，则不需要注释节点
  if (
    !next ||
    (isObject(next) && (next.type === NODE_TYPE.NORMAL || next.type === NODE_TYPE.SVG))
  ) {
    return false;
  }

  // 其他情况 (表达式后面是文本、另一个表达式、Fragment 或 Component)，都需要插入注释节点
  return true;
}
