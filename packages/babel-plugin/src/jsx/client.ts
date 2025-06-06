import { types as t } from '@babel/core';
import {
  isArray,
  isBoolean,
  isNil,
  isNull,
  isNumber,
  isObject,
  isString,
  isUndefined,
} from '@estjs/shared';
import { addImport, importMap } from '../import';
import { addTemplateMaps, getContext, hasTemplateMaps, setContext } from './context';
import { createTree } from './tree';
import { findBeforeIndex, findIndexPosition, serializeAttributes } from './utils';
import { CHILDREN_NAME, CLASS_NAME, NODE_TYPE, SPREAD_NAME, STYLE_NAME } from './constants';
import type { ObjectProperty, SpreadElement } from '@babel/types';
import type { NodePath } from '@babel/core';
import type { State } from '../types';
import type { DynamicCollection, DynamicContent, JSXElement, TreeNode } from './types';
/**
 * 处理JSX树节点并生成HTML模板
 * @param {TreeNode} tree - JSX树节点
 * @returns {string | null} 模板信息对象，如果生成失败则返回null
 */
export function processTemplate(tree: TreeNode): string | null {
  const templateString = buildTemplateString(tree);

  if (!templateString) {
    return null;
  }

  return templateString;
}

/**
 * 构建节点的模板字符串
 * @param {TreeNode} node - 当前节点
 * @returns {string} 构建的模板字符串
 */
function buildTemplateString(node: TreeNode): string {
  if (!node || node.type === NODE_TYPE.COMPONENT || node.type === NODE_TYPE.FRAGMENT) {
    return '';
  }
  const { state } = getContext();

  let templateHtml = '';

  if (node.type === NODE_TYPE.TEXT) {
    templateHtml = node.children.join('');
  } else if (node.type === NODE_TYPE.COMMENT) {
    templateHtml = '<!>';
  } else if (node.isSelfClosing) {
    templateHtml = `<${node.tag}${serializeAttributes(node.props, state)}/>`;
  } else if (node.tag) {
    templateHtml = `<${node.tag}${serializeAttributes(node.props, state)}>`;

    // 添加所有子节点的模板
    if (node.children && node.children.length > 0) {
      node.children.forEach((child: any) => {
        templateHtml += buildTemplateString(child);
      });
    }

    templateHtml += `</${node.tag}>`;
  } else if (node.children) {
    // 容器节点，处理其子节点
    node.children.forEach((child: any) => {
      templateHtml += buildTemplateString(child);
    });
  }

  return templateHtml;
}

/**
 * 收集动态内容
 * @param {TreeNode} node - JSX树结构
 * @return {DynamicCollection} 动态内容集合
 */
export function processDynamic(node: TreeNode): DynamicCollection {
  // 收集容器
  const result: DynamicCollection = {
    children: [],
    props: [],
  };

  // 执行实际的收集逻辑
  collectDynamicRecursive(node, null, result);

  return result;
}
/**
 * 递归收集动态内容
 * @param {TreeNode} node - 当前节点
 * @param {TreeNode | null} parentNode - 父节点
 * @param {DynamicCollection} result - 结果集合
 */
function collectDynamicRecursive(
  node: TreeNode,
  parentNode: TreeNode | null,
  result: DynamicCollection,
): void {
  // 根据节点类型处理
  processDynamicNode(node, parentNode, result);

  // 递归处理子节点
  if (node.children && node.children.length > 0) {
    node.children.forEach((child: any) => {
      collectDynamicRecursive(child, node, result);
    });
  }
}
/**
 * 处理单个节点的动态内容
 * @param {TreeNode} node - 当前节点
 * @param {TreeNode | null} parent - 父节点
 * @param {DynamicCollection} result - 结果集合
 */
function processDynamicNode(
  node: TreeNode,
  parent: TreeNode | null,
  result: DynamicCollection,
): void {
  const { children, props } = result;

  switch (node.type) {
    case NODE_TYPE.COMPONENT:
    case NODE_TYPE.FRAGMENT: {
      // 准备组件属性
      const componentProps = { ...node.props, children: node.children };

      // 创建组件调用表达式
      const componentExpr = createComponentExpression(node, componentProps);

      // 添加到动态内容列表
      children.push({
        index: node.index,
        node: componentExpr,
        before: findBeforeIndex(node, parent as TreeNode),
        parentIndex: parent?.index ?? null,
      });
      break;
    }

    case NODE_TYPE.EXPRESSION:
      // 确保children数组不为空且第一个元素是表达式
      if (node.children && node.children.length > 0) {
        const firstChild = node.children[0];
        // 处理表达式节点
        if (isObject(firstChild) && t.isExpression(firstChild as t.Node)) {
          children.push({
            index: node.index,
            node: firstChild as t.Expression,
            before: findBeforeIndex(node, parent as TreeNode),
            parentIndex: parent?.index ?? null,
          });
        } else if (
          isObject(firstChild) &&
          (t.isJSXElement(firstChild as t.Node) || t.isJSXFragment(firstChild as t.Node))
        ) {
          // If it's a JSX element/fragment directly within an expression container, process it as a component
          children.push({
            index: node.index,
            node: createComponentExpression(node, { children: [firstChild] }), // Treat as a component with the JSX as children
            before: findBeforeIndex(node, parent as TreeNode),
            parentIndex: parent?.index ?? null,
          });
        }
      }
      break;

    // 文本节点不处理
    case NODE_TYPE.TEXT:
      break;

    default:
      // 处理动态属性
      if (Object.keys(node.props || {}).length > 0) {
        props.push({
          props: node.props as Record<string, any>,
          parentIndex: node?.index ?? null,
        });
      }
      break;
  }
}

/**
 * 收集节点索引映射
 * @param dynamicChildren - 动态子节点集合
 * @param dynamicProps - 动态属性集合
 * @returns 索引映射数组
 */
export function collectNodeIndexMap(
  dynamicChildren: DynamicContent[],
  dynamicProps: Array<{ props: Record<string, any>; parentIndex: number | null }>,
): number[] {
  // 创建集合以去重
  const indexSet = new Set<number>();

  // 收集动态子节点的索引
  dynamicChildren.forEach(item => {
    if (!isNil(item.parentIndex)) {
      indexSet.add(item.parentIndex);
    }
    if (!isNil(item.before)) {
      indexSet.add(item.before);
    }
  });

  // 收集动态属性的父节点索引
  dynamicProps.forEach(item => {
    if (!isNil(item.parentIndex)) {
      indexSet.add(item.parentIndex);
    }
  });

  // 转为数组并排序
  return Array.from(indexSet).sort((a, b) => a - b);
}

/**
 * 递归JSX转换函数
 * @description 内部使用的JSX转换函数，用于嵌套JSX的处理
 * @param {TreeNode} jsxTree - JSX树节点
 * @returns {t.Expression | undefined} 转换后的表达式
 */
export function transformJSXChildren(jsxTree: TreeNode): t.Expression | undefined {
  // 处理模板
  const templates = processTemplate(jsxTree);

  // 收集动态内容
  const { children, props } = processDynamic(jsxTree);

  // 收集索引映射
  const nodeIndexMap = collectNodeIndexMap(children, props);

  // 生成渲染函数
  const result = generateRenderFunction(jsxTree, templates, children, props, nodeIndexMap);

  return result;
}

/**
 * 创建组件表达式
 * @description 为组件或Fragment创建相应的函数调用表达式，并处理props中的嵌套JSX元素
 * @param {TreeNode} node - 节点
 * @param {Record<string, any>} props - 组件属性
 * @param {State} state - 转换状态
 * @param {TransformContext} context - 转换上下文
 * @return {t.CallExpression} 组件函数调用表达式
 */
function createComponentExpression(node: TreeNode, props: Record<string, any>): t.CallExpression {
  const { state } = getContext();
  // 判断是否为Fragment组件
  const fnName = node.isFragment ? 'Fragment' : 'createComponent';

  // 添加相应导入
  addImport(importMap.createComponent);
  addImport(importMap[fnName]);

  // 创建属性对象表达式，传入转换函数和上下文
  const propsObj = createPropsObjectExpression(props, transformJSXChildren);

  // 根据组件类型创建不同的调用表达式
  if (node.isFragment) {
    return t.callExpression(state.imports[fnName], [propsObj]);
  }
  return t.callExpression(state.imports[fnName], [t.identifier(node.tag as string), propsObj]);
}

/**
 * 创建props对象表达式
 * @description 将属性记录转换为AST对象表达式
 * @param {Record<string, any>} propsData - 属性数据
 * @param {Function} transformJSX2 - JSX转换函数
 * @return {t.ObjectExpression} 生成的对象表达式
 */
export function createPropsObjectExpression(
  propsData: Record<string, any>,
  transformJSX2: Function,
): t.ObjectExpression {
  const objectProperties: (ObjectProperty | SpreadElement)[] = [];

  for (const propName in propsData) {
    let propValue = propsData[propName];
    // 跳过空的children
    if (propName === CHILDREN_NAME && !propValue.length) {
      continue;
    }
    propValue = convertValueToASTNode(propValue, transformJSX2);

    // 处理扩展属性
    if (propName === SPREAD_NAME) {
      objectProperties.push(t.spreadElement(propValue));
    } else {
      objectProperties.push(t.objectProperty(t.stringLiteral(propName), propValue));
    }
  }

  return t.objectExpression(objectProperties);
}

/**
 * 将JavaScript值转换为对应的AST节点
 * @description 根据值类型转换为对应的AST表达式节点
 * @param {any} value - 要转换的值
 * @param {Function} transformJSX2 - JSX转换函数
 * @return {t.Expression} 对应的AST节点
 */
function convertValueToASTNode(value: any, transformJSX2: Function): t.Expression {
  // 如果已经是AST节点，直接返回
  if (t.isExpression(value)) {
    return value;
  }
  if (isArray(value)) {
    return t.arrayExpression(value.map(item => convertValueToASTNode(item, transformJSX2)));
  }
  if (isObject(value)) {
    if (
      value.type === NODE_TYPE.FRAGMENT ||
      value.type === NODE_TYPE.COMPONENT ||
      value.type === NODE_TYPE.NORMAL ||
      value.type === NODE_TYPE.TEXT ||
      value.type === NODE_TYPE.SVG
    ) {
      return transformJSX2(value);
    }

    // 修复类型错误：确保children存在且是数组
    if (
      value.type === NODE_TYPE.EXPRESSION &&
      value.children &&
      isArray(value.children) &&
      value.children.length > 0
    ) {
      return convertValueToASTNode(value.children[0], transformJSX2);
    }

    return createPropsObjectExpression(value, transformJSX2);
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

  return value;
}

/**
 * 添加节点映射语句
 * @param statements - 语句数组
 * @param elementId - 元素ID
 * @param nodesId - 节点映射ID
 * @param indexMap - 索引映射
 * @param state - 插件状态
 */
function addNodesMapping(
  statements: t.Statement[],
  elementId: t.Identifier,
  nodesId: t.Identifier,
  indexMap: number[],
  state: State,
): void {
  addImport(importMap.mapNodes);

  statements.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        nodesId,
        t.callExpression(state.imports.mapNodes, [
          elementId,
          t.arrayExpression(indexMap.map(idx => t.numericLiteral(idx))),
        ]),
      ),
    ]),
  );
}

/**
 * 生成动态子节点插入代码
 * @param dynamicChildren - 动态子节点集合
 * @param statements - 语句集合
 * @param state - 插件状态
 * @param nodesId - 节点映射标识符
 * @param indexMap - 索引映射
 */
function generateDynamicChildrenCode(
  dynamicChildren: DynamicContent[],
  statements: t.Statement[],
  state: State,
  nodesId: t.Identifier,
  indexMap: number[],
): void {
  addImport(importMap.insert);

  // 为每个动态内容创建插入语句
  dynamicChildren.forEach(dynamicContent => {
    // 特殊处理IIFE表达式
    const processedNode = processIIFEExpression(dynamicContent.node);

    // 创建插入参数
    const insertArgs = createInsertArguments(
      { ...dynamicContent, node: processedNode },
      nodesId,
      indexMap,
    );

    statements.push(t.expressionStatement(t.callExpression(state.imports.insert, insertArgs)));
  });
}

/**
 * 处理IIFE表达式
 * @param node - 表达式节点
 * @returns 处理后的表达式
 */
export function processIIFEExpression(node: t.Expression): t.Expression {
  // 检查是否为IIFE（立即调用函数表达式）
  if (
    t.isCallExpression(node) &&
    (t.isArrowFunctionExpression(node.callee) || t.isFunctionExpression(node.callee))
  ) {
    // 对于IIFE，提取函数体中的返回语句
    const body = node.callee.body;

    if (t.isBlockStatement(body) && body.body.length > 0) {
      const lastStatement = body.body[body.body.length - 1];

      if (t.isReturnStatement(lastStatement) && lastStatement.argument) {
        // 使用返回值替代整个IIFE
        return lastStatement.argument;
      }
    } else if (!t.isBlockStatement(body)) {
      // 对于箭头函数的简写形式，直接返回表达式体
      return body;
    }
  }

  // 不是IIFE或无法提取返回值，保持原样
  return node;
}

export function createInsertArguments(
  dynamicContent: DynamicContent,
  nodesIdentifier: t.Identifier,
  indexMap: number[],
): t.Expression[] {
  // 获取父节点在映射数组中的位置
  const parentPosition = findIndexPosition(dynamicContent.parentIndex!, indexMap);

  // 构建基础参数列表
  const argExpressions: t.Expression[] = [
    // 目标节点引用: nodes[parentPosition]
    t.memberExpression(nodesIdentifier, t.numericLiteral(parentPosition), true),
    // 内容函数: () => dynamicContent
    t.arrowFunctionExpression([], dynamicContent.node),
  ];
  // 处理前置节点（用于定位插入位置）
  if (dynamicContent.before !== null) {
    const beforePosition = findIndexPosition(dynamicContent.before, indexMap);
    argExpressions.push(
      t.memberExpression(nodesIdentifier, t.numericLiteral(beforePosition), true),
    );
  }

  return argExpressions;
}

/**
 * 生成动态属性设置代码
 * @param dynamicProps - 动态属性集合
 * @param statements - 语句集合
 * @param state - 插件状态
 * @param nodesId - 节点映射标识符
 * @param indexMap - 索引映射
 */
function generateDynamicPropsCode(
  dynamicProps: Array<{ props: Record<string, any>; parentIndex: number | null }>,
  statements: t.Statement[],
  state: State,
  nodesId: t.Identifier,
  indexMap: number[],
): void {
  // 处理每个动态属性项
  dynamicProps.forEach(propItem => {
    const { parentIndex, props } = propItem;
    if (parentIndex === null) {
      return;
    }

    // 查找父节点索引位置
    const parentIndexPosition = indexMap.indexOf(parentIndex);
    if (parentIndexPosition === -1) {
      console.warn(`找不到父节点索引: ${parentIndex}`);
      return;
    }

    // 处理每个属性
    Object.entries(props).forEach(([attrName, attrValue]) => {
      if (attrName.startsWith('on')) {
        // 处理事件
        addEventListenerStatement(
          attrName,
          attrValue as t.Expression,
          nodesId,
          parentIndexPosition,
          statements,
          state,
        );
      } else {
        // 处理其他类型的属性
        generateSpecificAttributeCode(
          attrName,
          attrValue as t.Expression,
          nodesId,
          parentIndexPosition,
          statements,
          state,
        );
      }
    });
  });
}

/**
 * 添加事件监听器语句
 * @param attrName - 属性名
 * @param attrValue - 属性值
 * @param nodesId - 节点映射标识符
 * @param nodeIndex - 节点索引位置
 * @param statements - 语句集合
 * @param state - 插件状态
 */
function addEventListenerStatement(
  attrName: string,
  attrValue: t.Expression,
  nodesId: t.Identifier,
  nodeIndex: number,
  statements: t.Statement[],
  state: State,
): void {
  addImport(importMap.addEventListener);

  statements.push(
    createAttributeStatement(
      state.imports.addEventListener,
      nodesId,
      nodeIndex,
      attrValue,
      t.stringLiteral(attrName.slice(2).toLowerCase()),
    ),
  );
}

/**
 * 创建属性设置语句
 * @param functionIdentifier - 函数标识符
 * @param nodesId - 节点映射标识符
 * @param nodeIndex - 节点索引位置
 * @param value - 值表达式
 * @param key - 可选的键表达式
 * @returns 创建的语句
 */
export function createAttributeStatement(
  functionIdentifier: t.Identifier,
  nodesId: t.Identifier,
  nodeIndex: number,
  value: t.Expression,
  key?: t.Expression,
): t.ExpressionStatement {
  // 准备参数数组
  const args: t.Expression[] = [t.memberExpression(nodesId, t.numericLiteral(nodeIndex), true)];

  // 如果有键，添加它
  if (key) {
    args.push(key);
  }

  if (value) {
    args.push(value);
  }

  // 创建函数调用表达式语句
  return t.expressionStatement(t.callExpression(functionIdentifier, args));
}

/**
 * 根据属性名生成特定属性的设置代码
 * @param attributeName - 属性名
 * @param attributeValue - 属性值
 * @param nodesId - 节点映射标识符
 * @param nodeIndex - 节点索引位置
 * @param statements - 语句集合
 * @param state - 插件状态
 */
function generateSpecificAttributeCode(
  attributeName: string,
  attributeValue: t.Expression,
  nodesId: t.Identifier,
  nodeIndex: number,
  statements: t.Statement[],
  state: State,
): void {
  // 为不同类型的属性选择合适的处理方法
  switch (attributeName) {
    case CLASS_NAME:
      addImport(importMap.setClass);
      statements.push(
        createAttributeStatement(state.imports.setClass, nodesId, nodeIndex, attributeValue),
      );
      break;

    case SPREAD_NAME:
      addImport(importMap.setSpread);
      statements.push(
        createAttributeStatement(state.imports.setSpread, nodesId, nodeIndex, attributeValue),
      );
      break;

    case STYLE_NAME:
      addImport(importMap.setStyle);
      statements.push(
        createAttributeStatement(state.imports.setStyle, nodesId, nodeIndex, attributeValue),
      );
      break;

    default:
      // 处理普通属性
      addImport(importMap.setAttr);
      statements.push(
        createAttributeStatement(
          state.imports.setAttr,
          nodesId,
          nodeIndex,
          attributeValue,
          t.stringLiteral(attributeName),
        ),
      );
      break;
  }
}
/**
 * 生成客户端渲染代码
 * @param {TreeNode} jsxTree - JSX树结构
 * @param {TemplateInfo} template - 模板信息
 * @param {DynamicContent[]} dynamicChildren - 动态子节点集合
 * @param {Array<{ props: Record<string, any>; parentIndex: number | null }>} dynamicProps - 动态属性集合
 * @param {number[]} indexMap - 索引映射
 * @return {t.Expression} 生成的渲染函数表达式
 */
export function generateRenderFunction(
  jsxTree: TreeNode,
  template: string | null,
  dynamicChildren: DynamicContent[],
  dynamicProps: Array<{ props: Record<string, any>; parentIndex: number | null }>,
  indexMap: number[],
): t.Expression {
  const { path, state } = getContext();

  // 如果是根组件，直接返回组件调用表达式
  if (jsxTree.type === NODE_TYPE.COMPONENT) {
    // 处理组件的props
    const componentProps = { ...jsxTree.props, children: jsxTree.children };
    return createComponentExpression(jsxTree, componentProps);
  }

  // 为根组件创建标识符
  const elementId = path.scope.generateUidIdentifier('_el');
  const nodesId = path.scope.generateUidIdentifier('_nodes');

  // 创建函数体语句数组
  const statements: t.Statement[] = [];

  if (template) {
    let id: any = null;
    const hasedTemplate = hasTemplateMaps(template);
    if (hasedTemplate) {
      id = hasedTemplate.id;
    } else {
      // 添加必要的导入
      addImport(importMap.template);
      id = path.scope.generateUidIdentifier('_tmpl$');
      addTemplateMaps({
        id,
        template,
      });
    }

    // 添加根元素声明语句
    statements.push(
      t.variableDeclaration('const', [t.variableDeclarator(elementId, t.callExpression(id, []))]),
    );
  }

  // 处理动态内容
  if (dynamicChildren.length > 0 || dynamicProps.length > 0) {
    // 添加节点映射
    addNodesMapping(statements, elementId, nodesId, indexMap, state);

    // 处理动态子节点
    if (dynamicChildren.length) {
      generateDynamicChildrenCode(dynamicChildren, statements, state, nodesId, indexMap);
    }

    // 处理动态属性
    if (dynamicProps.length) {
      generateDynamicPropsCode(dynamicProps, statements, state, nodesId, indexMap);
    }
  }

  // 添加返回语句
  statements.push(t.returnStatement(elementId));

  // 创建并返回IIFE表达式
  return t.callExpression(t.arrowFunctionExpression([], t.blockStatement(statements)), []);
}

/**
 * 转换 JSX 为客户端渲染代码的内部实现。
 * @description 负责客户端模式下 JSX 元素的 AST 转换流程，包括节点树构建、模板处理、动态内容收集和渲染函数生成。
 * @param {NodePath<JSXElement>} path - 当前 JSX 元素的 AST 路径。
 * @returns {t.Expression} 转换后的客户端渲染表达式。
 */
export function transformJSX(path: NodePath<JSXElement>): t.Expression {
  const state = path.state as State;

  setContext({ path, state });

  // 创建JSX节点树
  const tree = createTree(path, state);

  // 处理静态模板，提取静态HTML片段，并传入 state
  const template = processTemplate(tree);

  // 收集动态内容，包括动态子节点和属性，并传入 state
  const { children, props } = processDynamic(tree);
  // 收集索引映射
  const nodeIndexMap = collectNodeIndexMap(children, props);

  // 生成渲染函数
  return generateRenderFunction(tree, template, children, props, nodeIndexMap);
}
