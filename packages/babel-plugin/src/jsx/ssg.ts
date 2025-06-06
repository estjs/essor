import { types as t } from '@babel/core';
import { isArray, isObject, isString } from '@estjs/shared';
import { addImport, importMap } from '../import';
import { addTemplateMaps, getContext, hasTemplateMaps, setContext } from './context';
import { createTree } from './tree';
import { NODE_TYPE } from './constants';
import { isTreeNode } from './utils';
import type { State } from '../types';
import type { JSXElement, SSGProcessResult, TreeNode } from './types';
import type { NodePath } from '@babel/core';
/**
 * Transforms JSX into static site generation code
 * @param {NodePath<JSXElement>} path - JSX node path
 * @returns {t.Expression | undefined} The transformed expression
 */
export function transformJSX(path: NodePath<JSXElement>): t.Expression | undefined {
  const state = path.state as State;

  setContext({ path, state });

  // Create JSX node tree
  const tree = createTree(path, state);

  // Process SSG-specific templates and dynamic content
  const { templates, dynamics } = processSSGTemplate(tree);
  // Generate SSG render function
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
 * Processes SSG templates and dynamic content
 */
export function processSSGTemplate(tree: TreeNode): SSGProcessResult {
  const result: SSGProcessResult = {
    templates: [],
    dynamics: [],
    root: tree,
  };

  // Recursively process nodes
  processNodeForSSG(tree, result);

  return result;
}

/**
 * Recursively processes nodes, generates SSG templates and collects dynamic content
 */
export function processNodeForSSG(node: TreeNode, result: SSGProcessResult): void {
  if (!node) {
    return;
  }

  switch (node.type) {
    case NODE_TYPE.COMPONENT:
    case NODE_TYPE.FRAGMENT:
      // Components and Fragments are processed as dynamic content
      handleComponentForSSG(node, result);
      break;

    case NODE_TYPE.EXPRESSION:
      // Expressions are processed as dynamic content
      handleExpressionForSSG(node, result);
      break;

    case NODE_TYPE.TEXT:
      // Text is added directly to the template
      if (node.children && node.children.length > 0) {
        addTemplate(result, node.children.join(''), true);
      }
      break;

    case NODE_TYPE.NORMAL:
    case NODE_TYPE.SVG:
      // Process normal HTML elements
      handleElementForSSG(node, result);
      break;

    case NODE_TYPE.COMMENT:
      // Comment node
      addTemplate(result, '<!>', true);
      break;
  }
}

/**
 * Processes component nodes
 */
export function handleComponentForSSG(node: TreeNode, result: SSGProcessResult): void {
  // Add placeholder
  result.templates.push('');

  // Create component expression
  const componentProps = { ...node.props, children: node.children };
  const { state } = getContext();

  // Add necessary imports
  addImport(importMap.createComponent);

  // Create component call expression
  const componentExpr = t.callExpression(state.imports.createComponent, [
    t.identifier(node.tag as string),
    createPropsObjectExpression(componentProps, (treeNode: TreeNode) => {
      // Recursively process nested TreeNodes, here ensuring TreeNode type is passed
      const { templates, dynamics } = processSSGTemplate(treeNode);
      return generateSSGRenderFunction(treeNode, templates, dynamics);
    }),
  ]);

  // Add to dynamic content
  result.dynamics.push({
    type: 'text',
    node: componentExpr,
  });
}

/**
 * Processes expression nodes
 */
export function handleExpressionForSSG(node: TreeNode, result: SSGProcessResult): void {
  if (!node.children || node.children.length === 0) {
    return;
  }

  const firstChild = node.children[0];

  // Break template where expression appears
  result.templates.push('');

  // Process various types of expressions
  if (
    typeof firstChild === 'string' ||
    typeof firstChild === 'number' ||
    typeof firstChild === 'boolean'
  ) {
    // Primitive value processing
    const { state } = getContext();
    addImport(importMap.escapeHTML);

    result.dynamics.push({
      type: 'text',
      node: t.callExpression(state.imports.escapeHTML, [t.valueToNode(firstChild)]),
    });
  } else if (typeof firstChild === 'object' && firstChild !== null && 'type' in firstChild) {
    // AST expression node processing
    const exprNode = firstChild as t.Expression;

    // Handle special case of map function calls
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
        // Check if a JSX element is returned
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

        // Process JSX element
        if (jsxElement) {
          const { state } = getContext();
          const tagName =
            jsxElement.openingElement.name.type === 'JSXIdentifier'
              ? jsxElement.openingElement.name.name
              : '';

          // Extract props
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

          if (tagName === 'Fragment') {
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

    // Add to dynamic content
    result.dynamics.push({
      type: 'text',
      node: exprNode,
    });
  }
}

/**
 * Processes HTML element nodes
 */
export function handleElementForSSG(node: TreeNode, result: SSGProcessResult): void {
  // Build opening tag
  let openTag = `<${node.tag} data-idx="${node.index}" `;

  // Process attributes
  const { staticAttrs, dynamicAttrs } = processAttributesForSSG(node.props || {});
  openTag += staticAttrs;
  addTemplate(result, openTag, true);

  addTemplate(result, '>', dynamicAttrs.length === 0);

  // Process children
  if (node.children && node.children.length > 0) {
    node.children.forEach(child => {
      if (isTreeNode(child)) {
        processNodeForSSG(child, result);
      } else if (typeof child === 'string') {
        addTemplate(result, child, true);
      }
    });
  }

  // Add closing tag
  if (!node.isSelfClosing) {
    addTemplate(result, `</${node.tag}>`, true);
  }

  // Process dynamic attributes
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
 * Processes SSG attributes
 */
export function processAttributesForSSG(props: Record<string, any>): {
  staticAttrs: string;
  dynamicAttrs: Array<{ name: string; value: t.Expression }>;
} {
  let staticAttrs = '';
  const dynamicAttrs: Array<{ name: string; value: t.Expression }> = [];

  for (const [prop, value] of Object.entries(props)) {
    // Skip event handlers and update functions
    if (prop.startsWith('on') || prop.startsWith('update')) {
      continue;
    }

    // Process static attributes
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      if (value === true) {
        staticAttrs += ` ${prop}`;
      } else if (value !== false) {
        staticAttrs += ` ${prop}="${value}"`;
      }
    }
    // Process dynamic attributes
    else if (t.isExpression(value)) {
      dynamicAttrs.push({ name: prop, value });
    }
  }

  return { staticAttrs, dynamicAttrs };
}

/**
 * Generates the SSG render function
 */
export function generateSSGRenderFunction(
  jsxTree: TreeNode,
  templates: string[],
  dynamics: Array<{ type: string; node: t.Expression; attrName?: string }>,
): t.Expression {
  const { path, state } = getContext();

  // If it is the root component, return the component call expression directly
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
  // Create render call parameters
  const renderArgs: t.Expression[] = [];

  if (templates?.length) {
    // Create identifier for template
    let id: any = null;

    const hasedTemplate = hasTemplateMaps(templates);
    if (hasedTemplate) {
      id = hasedTemplate.id;
    } else {
      // Add necessary imports
      addImport(importMap.template);
      id = path.scope.generateUidIdentifier('_tmpl$');
      addTemplateMaps({
        id,
        template: templates,
      });
    }

    renderArgs.push(id);
  }

  // Create render call parameters
  renderArgs.push(t.callExpression(state.imports.getHydrationKey, []));
  // Add necessary imports
  addImport(importMap.render);
  addImport(importMap.getHydrationKey);

  // Attributes should be placed first, text content should be placed last
  const textDynamics = dynamics.filter(d => d.type === 'text');
  const attrDynamics = dynamics.filter(d => d.type === 'attr');

  // Add attribute dynamic content
  attrDynamics.forEach(dynamic => {
    renderArgs.push(dynamic.node);
  });

  // Add text dynamic content
  textDynamics.forEach(dynamic => {
    renderArgs.push(dynamic.node);
  });

  // Create render call
  return t.callExpression(state.imports.render, renderArgs);
}

/**
 * Creates props object expression
 */
export function createPropsObjectExpression(
  propsData: Record<string, any>,
  transformJSXHandler: (tree: TreeNode) => t.Expression,
): t.ObjectExpression {
  const objectProperties: (t.ObjectProperty | t.SpreadElement)[] = [];

  for (const propName in propsData) {
    let propValue = propsData[propName];
    // Skip empty children
    if (propName === 'children' && (!propValue || (isArray(propValue) && !propValue.length))) {
      continue;
    }

    propValue = convertValueToASTNode(propValue, transformJSXHandler);

    // Process spread attributes
    if (propName === '_$spread$') {
      objectProperties.push(t.spreadElement(propValue));
    } else {
      objectProperties.push(t.objectProperty(t.stringLiteral(propName), propValue));
    }
  }

  return t.objectExpression(objectProperties);
}

/**
 * Converts JavaScript values to corresponding AST nodes
 */
export function convertValueToASTNode(
  value: any,
  transformJSXHandler: (tree: TreeNode) => t.Expression,
): t.Expression {
  // If it is already an AST node, return directly
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
      value.type === NODE_TYPE.TEXT
    ) {
      // Already TreeNode type, recursively process directly
      return transformJSXHandler(value);
    }

    // If it is an original JSX AST node (e.g., t.JSXElement, t.JSXFragment)
    // and they are passed as attribute values, they need to be converted to TreeNode first
    if (t.isJSXElement(value) || t.isJSXFragment(value)) {
      const { path, state } = getContext();
      const mockNodePath = {
        node: value,
        parentPath: path, // Keep parent path reference
        scope: path.scope, // Keep scope reference
      } as NodePath<t.JSXElement | t.JSXFragment>;
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
