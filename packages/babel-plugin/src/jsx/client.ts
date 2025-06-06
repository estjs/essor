import { types as t } from '@babel/core';
import {
  isArray,
  isBoolean,
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
import { NODE_TYPE } from './constants';
import type { ObjectProperty, SpreadElement } from '@babel/types';
import type { NodePath } from '@babel/core';
import type { State } from '../types';
import type { DynamicCollection, DynamicContent, JSXElement, TreeNode } from './types';
/**
 * Processes JSX tree nodes and generates HTML templates
 * @param {TreeNode} tree - JSX tree node
 * @returns {string | null} Template information object, or null if generation fails
 */
export function processTemplate(tree: TreeNode): string | null {
  const templateString = buildTemplateString(tree);

  if (!templateString) {
    return null;
  }

  return templateString;
}

/**
 * Builds the template string for a node
 * @param {TreeNode} node - Current node
 * @returns {string} The built template string
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

    // Add templates for all child nodes
    if (node.children && node.children.length > 0) {
      node.children.forEach((child: any) => {
        templateHtml += buildTemplateString(child);
      });
    }

    templateHtml += `</${node.tag}>`;
  } else if (node.children) {
    // Container node, process its children
    node.children.forEach((child: any) => {
      templateHtml += buildTemplateString(child);
    });
  }

  return templateHtml;
}

/**
 * Collects dynamic content
 * @param {TreeNode} node - JSX tree structure
 * @return {DynamicCollection} Collection of dynamic content
 */
export function processDynamic(node: TreeNode): DynamicCollection {
  // Collection container
  const result: DynamicCollection = {
    children: [],
    props: [],
  };

  // Execute actual collection logic
  collectDynamicRecursive(node, null, result);

  return result;
}
/**
 * Recursively collects dynamic content
 * @param {TreeNode} node - Current node
 * @param {TreeNode | null} parentNode - Parent node
 * @param {DynamicCollection} result - Result collection
 */
function collectDynamicRecursive(
  node: TreeNode,
  parentNode: TreeNode | null,
  result: DynamicCollection,
): void {
  // Process based on node type
  processDynamicNode(node, parentNode, result);

  // Recursively process child nodes
  if (node.children && node.children.length > 0) {
    node.children.forEach((child: any) => {
      collectDynamicRecursive(child, node, result);
    });
  }
}
/**
 * Processes dynamic content for a single node
 * @param {TreeNode} node - Current node
 * @param {TreeNode | null} parent - Parent node
 * @param {DynamicCollection} result - Result collection
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
      // Prepare component properties
      const componentProps = { ...node.props, children: node.children };

      // Create component call expression
      const componentExpr = createComponentExpression(node, componentProps);

      // Add to dynamic content list
      children.push({
        index: node.index,
        node: componentExpr,
        before: findBeforeIndex(node, parent as TreeNode),
        parentIndex: parent?.index ?? null,
      });
      break;
    }

    case NODE_TYPE.EXPRESSION:
      // Ensure children array is not empty and the first element is an expression
      if (node.children && node.children.length > 0) {
        const firstChild = node.children[0];
        // Process expression node
        if (
          typeof firstChild === 'object' &&
          firstChild !== null &&
          t.isExpression(firstChild as t.Node)
        ) {
          children.push({
            index: node.index,
            node: firstChild as t.Expression,
            before: findBeforeIndex(node, parent as TreeNode),
            parentIndex: parent?.index ?? null,
          });
        } else if (
          typeof firstChild === 'object' &&
          firstChild !== null &&
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

    // Text nodes are not processed
    case NODE_TYPE.TEXT:
      break;

    default:
      // Process dynamic attributes
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
 * Collects node index map
 * @param dynamicChildren - Collection of dynamic child nodes
 * @param dynamicProps - Collection of dynamic attributes
 * @returns Index map array
 */
export function collectNodeIndexMap(
  dynamicChildren: DynamicContent[],
  dynamicProps: Array<{ props: Record<string, any>; parentIndex: number | null }>,
): number[] {
  // Create a Set for deduplication
  const indexSet = new Set<number>();

  // Collect parent and before node indices for dynamic children
  dynamicChildren.forEach(item => {
    if (item.parentIndex != null) {
      indexSet.add(item.parentIndex);
    }
    if (item.before != null) {
      indexSet.add(item.before);
    }
  });

  // Collect parent node indices for dynamic properties
  dynamicProps.forEach(item => {
    if (item.parentIndex != null) {
      indexSet.add(item.parentIndex);
    }
  });

  // Convert to array and sort
  return Array.from(indexSet).sort((a, b) => a - b);
}

/**
 * Recursive JSX transformation function
 * @description Internal JSX transformation function, used for nested JSX processing
 * @param {TreeNode} jsxTree - JSX tree node
 * @returns {t.Expression | undefined} The transformed expression
 */
export function transformJSXChildren(jsxTree: TreeNode): t.Expression | undefined {
  try {
    // Process template
    const templates = processTemplate(jsxTree);

    // Collect dynamic content
    const { children, props } = processDynamic(jsxTree);

    // Collect index map
    const nodeIndexMap = collectNodeIndexMap(children, props);

    // Generate render function
    const result = generateRenderFunction(jsxTree, templates, children, props, nodeIndexMap);

    return result;
  } catch {
    // Return undefined identifier in case of error to avoid complete crash
    return t.identifier('undefined');
  }
}

/**
 * Creates component expression
 * @description Creates the corresponding function call expression for a component or Fragment, and handles nested JSX elements in props
 * @param {TreeNode} node - Node
 * @param {Record<string, any>} props - Component properties
 * @return {t.CallExpression} Component function call expression
 */
function createComponentExpression(node: TreeNode, props: Record<string, any>): t.CallExpression {
  const { state } = getContext();
  // Determine if it is a Fragment component
  const fnName = node.isFragment ? 'Fragment' : 'createComponent';

  // Add corresponding import
  addImport(importMap.createComponent);
  addImport(importMap[fnName]);

  // Create attribute object expression, passing transformation function and context
  const propsObj = createPropsObjectExpression(props, transformJSXChildren);

  // Create different call expressions based on component type
  if (node.isFragment) {
    return t.callExpression(state.imports[fnName], [propsObj]);
  }
  return t.callExpression(state.imports[fnName], [t.identifier(node.tag as string), propsObj]);
}

/**
 * Creates props object expression
 * @description Converts property records to AST object expressions
 * @param {Record<string, any>} propsData - Property data
 * @param {Function} transformJSX2 - JSX transformation function
 * @return {t.ObjectExpression} Generated object expression
 */
export function createPropsObjectExpression(
  propsData: Record<string, any>,
  transformJSX2: Function,
): t.ObjectExpression {
  const objectProperties: (ObjectProperty | SpreadElement)[] = [];

  for (const propName in propsData) {
    let propValue = propsData[propName];
    // Skip empty children
    if (propName === 'children' && !propValue.length) {
      continue;
    }
    propValue = convertValueToASTNode(propValue, transformJSX2);

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
 * @description Converts to corresponding AST expression nodes based on value type
 * @param {any} value - The value to convert
 * @param {Function} transformJSX2 - JSX transformation function
 * @return {t.Expression} The corresponding AST node
 */
function convertValueToASTNode(value: any, transformJSX2: Function): t.Expression {
  // If it is already an AST node, return directly
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
      value.type === NODE_TYPE.TEXT
    ) {
      return transformJSX2(value);
    }

    // Fix type error: ensure children exist and are an array
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
 * Adds node mapping statement
 * @param statements - Array of statements
 * @param elementId - Element ID
 * @param nodesId - Node mapping ID
 * @param indexMap - Index map
 * @param state - Plugin state
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
 * Generates dynamic child node insertion code
 * @param dynamicChildren - Collection of dynamic child nodes
 * @param statements - Collection of statements
 * @param state - Plugin state
 * @param nodesId - Node mapping identifier
 * @param indexMap - Index map
 */
function generateDynamicChildrenCode(
  dynamicChildren: DynamicContent[],
  statements: t.Statement[],
  state: State,
  nodesId: t.Identifier,
  indexMap: number[],
): void {
  addImport(importMap.insert);

  // Create insertion statement for each dynamic content
  dynamicChildren.forEach(dynamicContent => {
    // Special handling for IIFE expressions
    const processedNode = processIIFEExpression(dynamicContent.node);

    // Create insertion arguments
    const insertArgs = createInsertArguments(
      { ...dynamicContent, node: processedNode },
      nodesId,
      indexMap,
    );

    statements.push(t.expressionStatement(t.callExpression(state.imports.insert, insertArgs)));
  });
}

/**
 * Processes IIFE expressions
 * @param node - Expression node
 * @returns Processed expression
 */
export function processIIFEExpression(node: t.Expression): t.Expression {
  // Check if it is an IIFE (Immediately Invoked Function Expression)
  if (
    t.isCallExpression(node) &&
    (t.isArrowFunctionExpression(node.callee) || t.isFunctionExpression(node.callee))
  ) {
    // For IIFE, extract the return statement from the function body
    const body = node.callee.body;

    if (t.isBlockStatement(body) && body.body.length > 0) {
      const lastStatement = body.body[body.body.length - 1];

      if (t.isReturnStatement(lastStatement) && lastStatement.argument) {
        // Replace the entire IIFE with the return value
        return lastStatement.argument;
      }
    } else if (!t.isBlockStatement(body)) {
      // For shorthand arrow function, return the expression body directly
      return body;
    }
  }

  // Not an IIFE or cannot extract return value, keep as is
  return node;
}

export function createInsertArguments(
  dynamicContent: DynamicContent,
  nodesIdentifier: t.Identifier,
  indexMap: number[],
): t.Expression[] {
  // Get parent node position in mapping array
  const parentPosition = findIndexPosition(dynamicContent.parentIndex!, indexMap);

  // Build basic argument list
  const argExpressions: t.Expression[] = [
    // Target node reference: nodes[parentPosition]
    t.memberExpression(nodesIdentifier, t.numericLiteral(parentPosition), true),
    // Content function: () => dynamicContent
    t.arrowFunctionExpression([], dynamicContent.node),
  ];
  // Handle before node (for positioning insertion)
  if (dynamicContent.before !== null) {
    const beforePosition = findIndexPosition(dynamicContent.before, indexMap);
    argExpressions.push(
      t.memberExpression(nodesIdentifier, t.numericLiteral(beforePosition), true),
    );
  }

  return argExpressions;
}

/**
 * Generates dynamic attribute setting code
 * @param dynamicProps - Collection of dynamic attributes
 * @param statements - Collection of statements
 * @param state - Plugin state
 * @param nodesId - Node mapping identifier
 * @param indexMap - Index map
 */
function generateDynamicPropsCode(
  dynamicProps: Array<{ props: Record<string, any>; parentIndex: number | null }>,
  statements: t.Statement[],
  state: State,
  nodesId: t.Identifier,
  indexMap: number[],
): void {
  // Process each dynamic attribute item
  dynamicProps.forEach(propItem => {
    const { parentIndex, props } = propItem;
    if (parentIndex === null) {
      return;
    }

    // Find parent node index position
    const parentIndexPosition = indexMap.indexOf(parentIndex);
    if (parentIndexPosition === -1) {
      console.warn(`Parent node index not found: ${parentIndex}`);
      return;
    }

    // Process each attribute
    Object.entries(props).forEach(([attrName, attrValue]) => {
      if (attrName.startsWith('on')) {
        // Handle events
        addEventListenerStatement(
          attrName,
          attrValue as t.Expression,
          nodesId,
          parentIndexPosition,
          statements,
          state,
        );
      } else {
        // Handle other types of attributes
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
 * Adds event listener statement
 * @param attrName - Attribute name
 * @param attrValue - Attribute value
 * @param nodesId - Node mapping identifier
 * @param nodeIndex - Node index position
 * @param statements - Collection of statements
 * @param state - Plugin state
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
 * Creates attribute setting statement
 * @param functionIdentifier - Function identifier
 * @param nodesId - Node mapping identifier
 * @param nodeIndex - Node index position
 * @param value - Value expression
 * @param key - Optional key expression
 * @returns Created statement
 */
export function createAttributeStatement(
  functionIdentifier: t.Identifier,
  nodesId: t.Identifier,
  nodeIndex: number,
  value: t.Expression,
  key?: t.Expression,
): t.ExpressionStatement {
  // Prepare argument array
  const args: t.Expression[] = [t.memberExpression(nodesId, t.numericLiteral(nodeIndex), true)];

  // If there is a key, add it
  if (key) {
    args.push(key);
  }

  if (value) {
    args.push(value);
  }

  // Create function call expression statement
  return t.expressionStatement(t.callExpression(functionIdentifier, args));
}

/**
 * Generates specific attribute setting code based on attribute name
 * @param attributeName - Attribute name
 * @param attributeValue - Attribute value
 * @param nodesId - Node mapping identifier
 * @param nodeIndex - Node index position
 * @param statements - Collection of statements
 * @param state - Plugin state
 */
function generateSpecificAttributeCode(
  attributeName: string,
  attributeValue: t.Expression,
  nodesId: t.Identifier,
  nodeIndex: number,
  statements: t.Statement[],
  state: State,
): void {
  // Choose appropriate handling method for different attribute types
  switch (attributeName) {
    case 'class':
      addImport(importMap.setClass);
      statements.push(
        createAttributeStatement(state.imports.setClass, nodesId, nodeIndex, attributeValue),
      );
      break;

    case '_$spread$':
      addImport(importMap.setSpread);
      statements.push(
        createAttributeStatement(state.imports.setSpread, nodesId, nodeIndex, attributeValue),
      );
      break;

    case 'style':
      addImport(importMap.setStyle);
      statements.push(
        createAttributeStatement(state.imports.setStyle, nodesId, nodeIndex, attributeValue),
      );
      break;

    default:
      // Handle normal attributes
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
 * Generates client-side rendering code
 * @param {TreeNode} jsxTree - JSX tree structure
 * @param {string | null} template - Template information
 * @param {DynamicContent[]} dynamicChildren - Collection of dynamic child nodes
 * @param {Array<{ props: Record<string, any>; parentIndex: number | null }>} dynamicProps - Collection of dynamic attributes
 * @param {number[]} indexMap - Index map
 * @return {t.Expression} Generated render function expression
 */
export function generateRenderFunction(
  jsxTree: TreeNode,
  template: string | null,
  dynamicChildren: DynamicContent[],
  dynamicProps: Array<{ props: Record<string, any>; parentIndex: number | null }>,
  indexMap: number[],
): t.Expression {
  const { path, state } = getContext();

  // If it is the root component, return the component call expression directly
  if (jsxTree.type === NODE_TYPE.COMPONENT) {
    // Process component props
    const componentProps = { ...jsxTree.props, children: jsxTree.children };
    return createComponentExpression(jsxTree, componentProps);
  }

  // Create identifier for root component
  const elementId = path.scope.generateUidIdentifier('_el');
  const nodesId = path.scope.generateUidIdentifier('_nodes');

  // Create function body statement array
  const statements: t.Statement[] = [];

  if (template) {
    let id: any = null;
    const hasedTemplate = hasTemplateMaps(template);
    if (hasedTemplate) {
      id = hasedTemplate.id;
    } else {
      // Add necessary imports
      addImport(importMap.template);
      id = path.scope.generateUidIdentifier('_tmpl$');
      addTemplateMaps({
        id,
        template,
      });
    }

    // Add root element declaration statement
    statements.push(
      t.variableDeclaration('const', [t.variableDeclarator(elementId, t.callExpression(id, []))]),
    );
  }

  // Process dynamic content
  if (dynamicChildren.length > 0 || dynamicProps.length > 0) {
    // Add node mapping
    addNodesMapping(statements, elementId, nodesId, indexMap, state);

    // Process dynamic child nodes
    if (dynamicChildren.length) {
      generateDynamicChildrenCode(dynamicChildren, statements, state, nodesId, indexMap);
    }

    // Process dynamic attributes
    if (dynamicProps.length) {
      generateDynamicPropsCode(dynamicProps, statements, state, nodesId, indexMap);
    }
  }

  // Add return statement
  statements.push(t.returnStatement(elementId));

  // Create and return IIFE expression
  return t.callExpression(t.arrowFunctionExpression([], t.blockStatement(statements)), []);
}

/**
 * Internal implementation of JSX transformation for client-side rendering.
 * @description Responsible for the AST transformation process of JSX elements in client-side mode, including node tree construction, template processing, dynamic content collection, and render function generation.
 * @param {NodePath<JSXElement>} path - The AST path of the current JSX element.
 * @returns {t.Expression} The transformed client-side render expression.
 */
export function transformJSX(path: NodePath<JSXElement>): t.Expression {
  const state = path.state as State;

  setContext({ path, state });

  // Create JSX node tree
  const tree = createTree(path, state);

  // Process static template, extract static HTML fragments, and pass state
  const template = processTemplate(tree);

  // Collect dynamic content, including dynamic child nodes and attributes, and pass state
  const { children, props } = processDynamic(tree);
  // Collect index map
  const nodeIndexMap = collectNodeIndexMap(children, props);

  // Generate render function
  return generateRenderFunction(tree, template, children, props, nodeIndexMap);
}
