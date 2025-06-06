import { types as t } from '@babel/core';
import { isArray, isObject, isPrimitive, isString, isSymbol } from '@estjs/shared';
import { addImport, importMap } from '../import';
import { addTemplateMaps, getContext, hasTemplateMaps, setContext } from './context';
import { createTree } from './tree';
import {
  CHILDREN_NAME,
  EVENT_ATTR_NAME,
  FRAGMENT_NAME,
  NODE_TYPE,
  SPREAD_NAME,
  UPDATE_NAME,
} from './constants';
import { isTreeNode } from './utils';
import type { State } from '../types';
import type { JSXElement, SSGProcessResult, TreeNode } from './types';
import type { NodePath } from '@babel/core';
/**
 * 转换JSX为静态站点生成代码
 * @param {NodePath<JSXElement>} path - JSX节点路径
 * @returns {t.Expression | undefined} 转换后的表达式
 */
export function transformJSX(path: NodePath<JSXElement>): t.Expression | undefined {
  const state = path.state as State;

  setContext({ path, state });

  // 创建JSX节点树
  const tree = createTree(path, state);

  // 处理SSG特定的模板和动态内容
  const { templates, dynamics } = processSSGTemplate(tree);
  // 生成SSG渲染函数
  return generateSSGRenderFunction(tree, templates, dynamics);
}
/**
 * Add content to template
 */
export function addTemplate(currentResult, content: string, join = false): void {
  if (currentResult.templates.length === 0) {
    currentResult.templates.push(content);
  } else {
    if (join) {
      currentResult.templates[currentResult.templates.length - 1] += content;
    } else {
      currentResult.templates.push(content);
    }
  }
}

/**
 * 处理SSG模板和动态内容
 */
export function processSSGTemplate(tree: TreeNode): SSGProcessResult {
  const result: SSGProcessResult = {
    templates: [],
    dynamics: [],
    root: tree,
  };

  // 递归处理节点
  processNodeForSSG(tree, result);

  return result;
}

/**
 * 递归处理节点，生成SSG模板和收集动态内容
 */
export function processNodeForSSG(node: TreeNode, result: SSGProcessResult): void {
  if (!node) {
    return;
  }

  switch (node.type) {
    case NODE_TYPE.COMPONENT:
    case NODE_TYPE.FRAGMENT:
      // 组件和Fragment处理为动态内容
      handleComponentForSSG(node, result);
      break;

    case NODE_TYPE.EXPRESSION:
      // 表达式处理为动态内容
      handleExpressionForSSG(node, result);
      break;

    case NODE_TYPE.TEXT:
      // 文本直接添加到模板
      if (node.children && node.children.length > 0) {
        addTemplate(result, node.children.join(''), true);
      }
      break;

    case NODE_TYPE.NORMAL:
    case NODE_TYPE.SVG:
      // 处理普通HTML元素
      handleElementForSSG(node, result);
      break;

    case NODE_TYPE.COMMENT:
      // 注释节点
      addTemplate(result, '<!>', true);
      break;
  }
}

/**
 * 处理组件节点
 */
export function handleComponentForSSG(node: TreeNode, result: SSGProcessResult): void {
  // 添加占位符
  result.templates.push('');

  // 创建组件表达式
  const componentProps = { ...node.props };

  if (node.children.length) {
    componentProps.children = node.children;
  }
  const { state } = getContext();

  // 添加必要的导入
  addImport(importMap.createComponent);

  // 创建组件调用表达式
  const componentExpr = t.callExpression(state.imports.createComponent, [
    t.identifier(node.tag as string),
    createPropsObjectExpression(componentProps, (treeNode: TreeNode) => {
      // 递归处理嵌套的 TreeNode，这里需要确保传入的是 TreeNode 类型
      const { templates, dynamics } = processSSGTemplate(treeNode);
      return generateSSGRenderFunction(treeNode, templates, dynamics);
    }),
  ]);

  // 添加到动态内容
  result.dynamics.push({
    type: 'text',
    node: componentExpr,
  });
}

/**
 * 处理表达式节点
 */
export function handleExpressionForSSG(node: TreeNode, result: SSGProcessResult): void {
  if (!node.children || node.children.length === 0) {
    return;
  }

  const firstChild = node.children[0];

  // 在表达式出现的地方断开模板
  result.templates.push('');

  // 处理各种类型的表达式
  if (isPrimitive(firstChild)) {
    // 原始值处理
    const { state } = getContext();
    addImport(importMap.escapeHTML);

    result.dynamics.push({
      type: 'text',
      node: t.callExpression(state.imports.escapeHTML, [t.valueToNode(firstChild)]),
    });
    // TODO: need fix type
  } else if (isObject(firstChild)) {
    // AST表达式节点处理
    const exprNode = firstChild as t.Expression;

    // 处理map函数调用的特殊情况
    if (
      t.isCallExpression(exprNode) &&
      t.isMemberExpression(exprNode.callee) &&
      exprNode.arguments.length > 0
    ) {
      const mapCallback = exprNode.arguments[0];

      if (
        (t.isArrowFunctionExpression(mapCallback) || t.isFunctionExpression(mapCallback)) &&
        mapCallback.body
      ) {
        // 检查是否返回JSX元素
        let jsxElement: t.JSXElement | undefined = undefined;

        if (t.isJSXElement(mapCallback.body)) {
          jsxElement = mapCallback.body;
        } else if (t.isBlockStatement(mapCallback.body)) {
          const returnStmt = mapCallback.body.body.find(stmt => t.isReturnStatement(stmt));
          if (
            returnStmt &&
            t.isReturnStatement(returnStmt) &&
            returnStmt.argument &&
            t.isJSXElement(returnStmt.argument)
          ) {
            jsxElement = returnStmt.argument;
          }
        } else if (
          t.isParenthesizedExpression(mapCallback.body) &&
          t.isJSXElement(mapCallback.body.expression)
        ) {
          jsxElement = mapCallback.body.expression;
        }

        // 处理JSX元素
        if (jsxElement) {
          const { state } = getContext();
          const tagName =
            jsxElement.openingElement.name.type === 'JSXIdentifier'
              ? jsxElement.openingElement.name.name
              : '';

          // 提取props
          const props: Record<string, any> = {};
          jsxElement.openingElement.attributes.forEach(attr => {
            if (t.isJSXAttribute(attr)) {
              const name = attr.name.name as string;
              if (t.isJSXExpressionContainer(attr.value)) {
                props[name] = attr.value.expression;
              } else if (t.isStringLiteral(attr.value)) {
                props[name] = attr.value.value;
              } else if (attr.value === null) {
                props[name] = true;
              }
            } else if (t.isJSXSpreadAttribute(attr)) {
              props._$spread$ = attr.argument;
            }
          });

          if (tagName === FRAGMENT_NAME) {
            addImport(importMap.Fragment);
            const newCallback = t.arrowFunctionExpression(
              mapCallback.params,
              t.callExpression(state.imports.Fragment, [
                createPropsObjectExpression(props, (treeNode: TreeNode) => {
                  const { templates, dynamics } = processSSGTemplate(treeNode);
                  return generateSSGRenderFunction(treeNode, templates, dynamics);
                }),
              ]),
            );
            exprNode.arguments[0] = newCallback;
          } else if (tagName && tagName[0] === tagName[0].toUpperCase()) {
            addImport(importMap.createComponent);
            const newCallback = t.arrowFunctionExpression(
              mapCallback.params,
              t.callExpression(state.imports.createComponent, [
                t.identifier(tagName),
                createPropsObjectExpression(props, (treeNode: TreeNode) => {
                  const { templates, dynamics } = processSSGTemplate(treeNode);
                  return generateSSGRenderFunction(treeNode, templates, dynamics);
                }),
              ]),
            );
            exprNode.arguments[0] = newCallback;
          }
        }
      }
    }

    // 添加到动态内容
    result.dynamics.push({
      type: 'text',
      node: exprNode,
    });
  }
}

/**
 * 处理HTML元素节点
 */
export function handleElementForSSG(node: TreeNode, result: SSGProcessResult): void {
  // 构建开始标签
  let openTag = `<${node.tag} data-idx="${node.index}" `;

  // 处理属性
  const { staticAttrs, dynamicAttrs } = processAttributesForSSG(node.props || {});
  openTag += staticAttrs;
  addTemplate(result, openTag, true);

  addTemplate(result, node.isSelfClosing ? '/>' : '>', dynamicAttrs.length === 0);

  // 处理子节点
  if (node.children && node.children.length > 0) {
    node.children.forEach(child => {
      if (isTreeNode(child)) {
        processNodeForSSG(child, result);
      } else if (isString(child)) {
        addTemplate(result, child, true);
      }
    });
  }

  // 添加结束标签
  if (!node.isSelfClosing) {
    addTemplate(result, `</${node.tag}>`, true);
  }

  // 处理动态属性
  dynamicAttrs.forEach(attr => {
    const { state } = getContext();
    addImport(importMap.setAttr);
    addImport(importMap.escapeHTML);

    result.dynamics.push({
      type: 'attr',
      node: t.callExpression(state.imports.setAttr, [
        t.stringLiteral(attr.name),
        t.callExpression(state.imports.escapeHTML, [attr.value]),
        t.booleanLiteral(false),
      ]),
      attrName: attr.name,
    });
  });
}

/**
 * 处理SSG的属性
 */
export function processAttributesForSSG(props: Record<string, any>): {
  staticAttrs: string;
  dynamicAttrs: Array<{ name: string; value: t.Expression }>;
} {
  let staticAttrs = '';
  const dynamicAttrs: Array<{ name: string; value: t.Expression }> = [];

  for (const [prop, value] of Object.entries(props)) {
    // 跳过事件处理器和更新函数
    if (prop.startsWith(EVENT_ATTR_NAME) || prop.startsWith(UPDATE_NAME)) {
      continue;
    }

    // 处理静态属性
    if (isPrimitive(value)) {
      if (value === true) {
        staticAttrs += ` ${prop}`;
      } else if (isSymbol(value)) {
        staticAttrs += ` ${prop}="${value.toString()}"`;
      } else if (value !== false) {
        staticAttrs += ` ${prop}="${value}"`;
      }
    }
    // 处理动态属性
    else if (t.isExpression(value)) {
      dynamicAttrs.push({ name: prop, value });
    }
  }

  return { staticAttrs, dynamicAttrs };
}

/**
 * 生成SSG渲染函数
 */
export function generateSSGRenderFunction(
  jsxTree: TreeNode,
  templates: string[],
  dynamics: Array<{ type: string; node: t.Expression; attrName?: string }>,
): t.Expression {
  const { path, state } = getContext();

  // 如果是根组件，直接返回组件调用表达式
  if (jsxTree.type === NODE_TYPE.COMPONENT) {
    const componentProps = { ...jsxTree.props, children: jsxTree.children };

    addImport(importMap.createComponent);

    return t.callExpression(state.imports.createComponent, [
      t.identifier(jsxTree.tag as string),
      createPropsObjectExpression(componentProps, (treeNode: TreeNode) => {
        const { templates, dynamics } = processSSGTemplate(treeNode);
        return generateSSGRenderFunction(treeNode, templates, dynamics);
      }),
    ]);
  }
  // 创建render调用参数
  const renderArgs: t.Expression[] = [];

  if (templates?.length) {
    // 为模板创建标识符
    let id: any = null;

    const hasedTemplate = hasTemplateMaps(templates);
    if (hasedTemplate) {
      id = hasedTemplate.id;
    } else {
      // 添加必要的导入
      addImport(importMap.template);
      id = path.scope.generateUidIdentifier('_tmpl$');
      addTemplateMaps({
        id,
        template: templates,
      });
    }

    renderArgs.push(id);
  }

  // 创建render调用参数
  renderArgs.push(t.callExpression(state.imports.getHydrationKey, []));
  // 添加必要的导入
  addImport(importMap.render);
  addImport(importMap.getHydrationKey);

  // 属性应该放在前面，文本内容应该放在后面
  const textDynamics = dynamics.filter(d => d.type === 'text');
  const attrDynamics = dynamics.filter(d => d.type === 'attr');

  // 添加属性动态内容
  attrDynamics.forEach(dynamic => {
    renderArgs.push(dynamic.node);
  });

  // 添加文本动态内容
  textDynamics.forEach(dynamic => {
    renderArgs.push(dynamic.node);
  });

  // 创建render调用
  return t.callExpression(state.imports.render, renderArgs);
}

/**
 * 创建props对象表达式
 */
export function createPropsObjectExpression(
  propsData: Record<string, any>,
  transformJSXHandler: (tree: TreeNode) => t.Expression,
): t.ObjectExpression {
  const objectProperties: (t.ObjectProperty | t.SpreadElement)[] = [];

  for (const propName in propsData) {
    let propValue = propsData[propName];
    // 跳过空的children
    if (propName === CHILDREN_NAME && (!propValue || (isArray(propValue) && !propValue.length))) {
      continue;
    }

    propValue = convertValueToASTNode(propValue, transformJSXHandler);

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
 */
export function convertValueToASTNode(
  value: any,
  transformJSXHandler: (tree: TreeNode) => t.Expression,
): t.Expression {
  // 如果已经是AST节点，直接返回
  if (t.isExpression(value)) {
    return value;
  }
  if (isArray(value)) {
    return t.arrayExpression(value.map(item => convertValueToASTNode(item, transformJSXHandler)));
  }
  if (isObject(value)) {
    if (
      value.type === NODE_TYPE.FRAGMENT ||
      value.type === NODE_TYPE.COMPONENT ||
      value.type === NODE_TYPE.NORMAL ||
      value.type === NODE_TYPE.TEXT ||
      value.type === NODE_TYPE.SVG
    ) {
      // 已经是 TreeNode 类型，直接递归处理
      return transformJSXHandler(value);
    }

    // 如果是原始的 JSX AST 节点 (例如 t.JSXElement, t.JSXFragment)
    // 并且它们是作为属性值传入的，需要先转换为 TreeNode
    if (t.isJSXElement(value) || t.isJSXFragment(value)) {
      const { path, state } = getContext();
      const mockNodePath = {
        node: value,
        parentPath: path, // 保持父路径引用
        scope: path.scope, // 保持 scope 引用
      } as NodePath<t.JSXElement | t.JSXFragment> as any;
      const tree = createTree(mockNodePath, state);
      return transformJSXHandler(tree);
    }

    return createPropsObjectExpression(value, transformJSXHandler);
  }
  if (isString(value)) {
    return t.stringLiteral(value);
  }
  if (typeof value === 'number') {
    return t.numericLiteral(value);
  }
  if (typeof value === 'boolean') {
    return t.booleanLiteral(value);
  }
  if (value === undefined) {
    return t.identifier('undefined');
  }
  if (value === null) {
    return t.nullLiteral();
  }

  return value;
}
