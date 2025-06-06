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
  if (!node || !node.value) return '';
  return node.value.replace(/\s+/g, ' ').trim();
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
 * @returns {number | null} 目标标记节点的索引，若无合适位置返回 `null`
