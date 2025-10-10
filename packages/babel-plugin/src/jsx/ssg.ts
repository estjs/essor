import { type NodePath, types as t } from '@babel/core';
import { isObject, isPrimitive, isString, isSymbol } from '@estjs/shared';
import { addImport, importMap } from '../import';
import { EVENT_ATTR_NAME, FRAGMENT_NAME, NODE_TYPE, UPDATE_PREFIX } from './constants';
import { getContext } from './context';
import { createPropsObjectExpression } from './shared';
import { type TreeNode, isTreeNode } from './tree';
import type { JSXElement } from '../types';

/**
 * SSG Processing Result Interface
 * @description Stores template and dynamic content information in SSG mode
 */
export interface transformResult {
  /** Template string array */
  templates: string[];
  /** Dynamic content array */
  dynamics: Array<{
    /** Content type: text or attribute */
    type: 'text' | 'attr';
    /** Expression node */
    node: t.Expression;
    /** Attribute name (only for attr type) */
    attrName?: string;
  }>;
}

export function transformJSXToSSG(path: NodePath<JSXElement>, treeNode: TreeNode) {
  const { state } = getContext();

  const result = transformTemplate(treeNode);
  const { templates, dynamics } = result;

  // Handle root component case
  if (treeNode.type === NODE_TYPE.COMPONENT || treeNode.type === NODE_TYPE.FRAGMENT) {
    const componentProps = { ...treeNode.props, children: treeNode.children };

    addImport(importMap.createComponent);
    return t.callExpression(state.imports.createComponent, [
      t.identifier(treeNode.tag as string),
      createPropsObjectExpression(componentProps, transformJSXToSSG),
    ]);
  }

  // Create render arguments
  const args: t.Expression[] = [];

  // Add template if exists
  if (templates && templates.length > 0) {
    addImport(importMap.template);
    const tmplId = path.scope.generateUidIdentifier('_tmpl$');

    // create template string array expression
    const templateNode = t.arrayExpression(templates.map(str => t.stringLiteral(str)));
    state.declarations.push(t.variableDeclarator(tmplId, templateNode));

    args.push(tmplId);
  }

  // Create render call parameters
  args.push(t.callExpression(state.imports.getHydrationKey, []));
  // Add necessary imports
  addImport(importMap.render);
  addImport(importMap.getHydrationKey);

  // Attributes should be placed before text content
  const textDynamics = dynamics.filter(d => d.type === 'text');
  const attrDynamics = dynamics.filter(d => d.type === 'attr');

  // Add attribute dynamic content
  attrDynamics.forEach(dynamic => {
    args.push(dynamic.node);
  });

  // Add text dynamic content
  textDynamics.forEach(dynamic => {
    args.push(dynamic.node);
  });

  // Create render call
  return t.callExpression(state.imports.render, args);
}

function transformTemplate(treeNode: TreeNode) {
  const result: transformResult = {
    templates: [],
    dynamics: [],
  };

  // Recursively process nodes
  walkTreeNode(treeNode, result);

  return result;
}

function walkTreeNode(treeNode: TreeNode, result: transformResult) {
  if (!treeNode) {
    return;
  }

  switch (treeNode.type) {
    case NODE_TYPE.COMPONENT:
    case NODE_TYPE.FRAGMENT:
      handleComponent(treeNode, result);
      break;

    case NODE_TYPE.EXPRESSION:
      handleExpression(treeNode, result);
      break;

    case NODE_TYPE.TEXT:
      handleText(treeNode, result);
      break;

    case NODE_TYPE.NORMAL:
    case NODE_TYPE.SVG:
      handleElement(treeNode, result);
      break;

    case NODE_TYPE.COMMENT:
      addTemplate(result, '<!>', true);
      break;

    default:
      // Handle unknown node types gracefully
      if (treeNode.children && treeNode.children.length > 0) {
        processChildren(treeNode.children as TreeNode[], result);
      }
      break;
  }
}
/**
 * Add content to template
 */
export const addTemplate = (
  result: transformResult,
  content: string,
  join: boolean = false,
): void => {
  if (result.templates.length === 0) {
    result.templates.push(content);
  } else {
    if (join) {
      result.templates[result.templates.length - 1] += content;
    } else {
      result.templates.push(content);
    }
  }
};
/**
 * Handle component for SSG
 */
const handleComponent = (node: TreeNode, result: transformResult): void => {
  // Add placeholder for component
  result.templates.push('');

  const { state } = getContext();

  // Create component props
  const componentProps = { ...node.props };
  if (node.children.length) {
    componentProps.children = node.children;
  }

  addImport(importMap.createComponent);

  // Create component expression
  const componentExpr = t.callExpression(state.imports.createComponent, [
    t.identifier(node.tag as string),
    createPropsObjectExpression(componentProps, transformJSXToSSG),
  ]);

  // Add to dynamic content
  result.dynamics.push({
    type: 'text',
    node: componentExpr,
  });
};

/**
 * Handle expression for SSG
 */
const handleExpression = (node: TreeNode, result: transformResult): void => {
  if (!node.children || node.children.length === 0) {
    return;
  }

  const firstChild = node.children[0];

  // Break template at expression location
  result.templates.push('');

  // Process various types of expressions
  if (isPrimitive(firstChild)) {
    // Primitive value processing
    const { state } = getContext();
    addImport(importMap.escapeHTML);

    result.dynamics.push({
      type: 'text',
      node: t.callExpression(state.imports.escapeHTML, [t.valueToNode(firstChild)]),
    });
    // TODO: need fix type
  } else if (isObject(firstChild)) {
    // AST expression node processing
    const exprNode = firstChild as t.Expression;

    // Process special case for map function calls
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
        // Check if it returns JSX element
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

          if (tagName === FRAGMENT_NAME) {
            addImport(importMap.Fragment);
            const newCallback = t.arrowFunctionExpression(
              mapCallback.params,
              t.callExpression(state.imports.Fragment, [
                createPropsObjectExpression(props, transformJSXToSSG),
              ]),
            );
            exprNode.arguments[0] = newCallback;
          } else if (tagName && tagName[0] === tagName[0].toUpperCase()) {
            addImport(importMap.createComponent);
            const newCallback = t.arrowFunctionExpression(
              mapCallback.params,
              t.callExpression(state.imports.createComponent, [
                t.identifier(tagName),
                createPropsObjectExpression(props, transformJSXToSSG),
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
};

/**
 * Handle text for SSG
 */
const handleText = (node: TreeNode, result: transformResult): void => {
  if (node.children && node.children.length > 0) {
    addTemplate(result, node.children.join(''), true);
  }
};

/**
 * Handle element for SSG
 */
const handleElement = (node: TreeNode, result: transformResult): void => {
  // Build start tag
  let openTag = `<${node.tag} data-idx="${node.index}"`;

  // Process attributes
  const { staticAttrs, dynamicAttrs } = processAttributes(node.props || {});
  openTag += staticAttrs;

  addTemplate(result, openTag, true);
  addTemplate(result, node.selfClosing ? '/>' : '>', dynamicAttrs.length === 0);

  // Process children
  if (!node.selfClosing && node.children && node.children.length > 0) {
    processChildren(node.children as TreeNode[], result);
  }

  // Add end tag
  if (!node.selfClosing) {
    addTemplate(result, `</${node.tag}>`, true);
  }

  // Process dynamic attributes
  processDynamicAttributes(dynamicAttrs, result);
};

/**
 * Process children for SSG
 */
const processChildren = (children: (TreeNode | string)[], result: transformResult): void => {
  children.forEach(child => {
    if (isTreeNode(child)) {
      walkTreeNode(child, result);
    } else if (isString(child)) {
      addTemplate(result, child, true);
    }
  });
};
/**
 * Process SSG attributes
 */
export function processAttributes(props: Record<string, any>): {
  staticAttrs: string;
  dynamicAttrs: Array<{ name: string; value: t.Expression }>;
} {
  let staticAttrs = '';
  const dynamicAttrs: Array<{ name: string; value: t.Expression }> = [];

  for (const [prop, value] of Object.entries(props)) {
    // Skip event handlers and update functions
    if (prop.startsWith(EVENT_ATTR_NAME) || prop.startsWith(UPDATE_PREFIX)) {
      continue;
    }

    // Process static attributes
    if (isPrimitive(value)) {
      if (value === true) {
        staticAttrs += ` ${prop}`;
      } else if (isSymbol(value)) {
        staticAttrs += ` ${prop}="${value.toString()}"`;
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
 * Process dynamic attributes for SSG
 */
const processDynamicAttributes = (
  dynamicAttrs: Array<{ name: string; value: t.Expression }>,
  result: transformResult,
): void => {
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
};
