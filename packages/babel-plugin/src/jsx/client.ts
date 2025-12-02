import {
  coerceArray,
  isArray,
  isDelegatedEvent,
  isNil,
  isObject,
  isString,
  startsWith,
  warn,
} from '@estjs/shared';
import { types as t } from '@babel/core';
import { addImport, importMap } from '../import';
import {
  CLASS_NAME,
  CREATE_COMPONENT_NAME,
  EVENT_ATTR_NAME,
  FRAGMENT_NAME,
  NODE_TYPE,
  SPREAD_NAME,
  STYLE_NAME,
  UPDATE_PREFIX,
} from './constants';
import {
  createPropsObjectExpression,
  findBeforeIndex,
  findIndexPosition,
  getSetFunctionForAttribute,
  isDynamicExpression,
  serializeAttributes,
} from './shared';
import { getContext, setContext } from './context';
import type { TreeNode } from './tree';
import type { NodePath } from '@babel/core';
import type { JSXElement, PluginState } from '../types';

export function transformJSXToClient(path: NodePath<JSXElement>, node: TreeNode) {
  const state = path.state;

  // Handle component or fragment
  if (node.type === NODE_TYPE.COMPONENT || node.type === NODE_TYPE.FRAGMENT) {
    const props = { ...node.props, children: node.children };
    return createComponentExpression(node, props);
  }
  // Generate static template
  const staticTemplate = generateStaticTemplate(node);

  // Collect dynamic props and children (static ones are already in template)
  const dynamicCollection = generateDynamic(node);

  // Generate index mapping for DOM node references
  const indexMap = generateIndexMap(dynamicCollection);

  // Create identifiers for root element and node mapping
  const elementId = path.scope.generateUidIdentifier('_el');
  const nodesId = path.scope.generateUidIdentifier('_nodes');

  // Initialize statements array for function body
  const statements: t.Statement[] = [];

  if (staticTemplate) {
    addImport(importMap.template);
    const tmplId = path.scope.generateUidIdentifier('_tmpl$');

    state.declarations.push(
      t.variableDeclarator(
        tmplId,
        t.callExpression(state.imports.template, coerceArray(staticTemplate).map(t.stringLiteral)),
      ),
    );
    statements.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(elementId, t.callExpression(tmplId, [])),
      ]),
    );
  }
  if (dynamicCollection.children.length || dynamicCollection.props.length) {
    // Import mapNodes
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
    // Process dynamic child nodes if any exist
    if (dynamicCollection.children.length) {
      generateDynamicChildrenCode(dynamicCollection.children, statements, state, nodesId, indexMap);
    }

    // Process dynamic properties if any exist
    if (dynamicCollection.props.length) {
      generateDynamicPropsCode(dynamicCollection.props, statements, state, nodesId, indexMap);
    }

    // Process reactive operations if any exist
    if (dynamicCollection.operations.length) {
      generateUnifiedMemoizedEffect(
        dynamicCollection.operations,
        statements,
        state,
        nodesId,
        indexMap,
      );
    }
  }

  // Add return statement
  statements.push(t.returnStatement(elementId));

  // Create and return IIFE expression
  return t.callExpression(t.arrowFunctionExpression([], t.blockStatement(statements)), []);
}

/**
 * Generate property key name (for state objects)
 *
 * Creates unique property keys for DOM attributes in the state object,
 * ensuring proper batching and tracking of dynamic attribute updates.
 *
 * @param attrName - The attribute name to generate a key for
 * @returns A unique property key string
 */
function generatePropKey(attrName: string): string {
  const { operationIndex } = getContext();
  const keyMap: Record<string, string> = {
    [CLASS_NAME]: 'c',
    [STYLE_NAME]: 's',
    name: 'n',
  };

  const baseKey = keyMap[attrName] || attrName.charAt(0);
  setContext({ ...getContext(), operationIndex: operationIndex + 1 });
  return `${baseKey}${operationIndex}`;
}

/**
 * Transform JSX element to client rendering code
 * @param path - The path of the JSX element being transformed
 * @param treeNode - The tree node representation of the JSX element
 * @returns The transformed client rendering code
 */
function transformJSXClientChildren(path: NodePath<JSXElement>, treeNode: TreeNode) {
  return transformJSXToClient(path, treeNode);
}

/**
 * Creates a component expression for client rendering
 * @param node - The tree node representation of the component or fragment
 * @param componentProps - The props object for the component or fragment
 * @returns The transformed component expression
 */
function createComponentExpression(node: TreeNode, componentProps: Record<string, unknown>) {
  const { state } = getContext();

  // Determine component function name
  const componentName = node.type === NODE_TYPE.FRAGMENT ? FRAGMENT_NAME : CREATE_COMPONENT_NAME;

  addImport(importMap.createComponent);
  addImport(importMap[componentName]);

  // Create props object expression
  const propsObj = createPropsObjectExpression(componentProps, transformJSXClientChildren);

  if (node.type === NODE_TYPE.FRAGMENT) {
    // Fragment： Fragment(props)
    return t.callExpression(state.imports[componentName], [propsObj]);
  }

  const args: t.Expression[] = [t.identifier(node.tag!), propsObj];

  return t.callExpression(state.imports[componentName], args);
}

/**
 * Generates an index map for dynamic child nodes and dynamic attributes.
 * The index map is a de-duplicated and sorted array of indices, representing the DOM nodes that need to be mapped.
 * @param {{ props: Array<{ props: Record<string, unknown>; parentIndex: number | null }>, children: Array<{ parentIndex: number | null; before: number | null }>} } - An object containing dynamic props and dynamic children
 * @returns {number[]} The generated index map
 */
function generateIndexMap({ props, children }) {
  const indexSet = new Set<number>();

  // collect indices related to dynamic child nodes
  for (const item of children) {
    // add parent node index
    if (!isNil(item.parentIndex)) {
      indexSet.add(item.parentIndex);
    }
    // add reference node index
    if (!isNil(item.before)) {
      indexSet.add(item.before);
    }
  }

  // collect parent node indices related to dynamic attributes
  for (const item of props) {
    if (!isNil(item.parentIndex)) {
      indexSet.add(item.parentIndex);
    }
  }

  return Array.from(indexSet).sort((a, b) => a - b);
}

/**
 * Create attribute setting statement
 *
 * This is a universal attribute setting statement generator that creates function calls
 * for various DOM attribute operations. It supports multiple function call patterns
 * and serves as the foundation tool for the attribute processing system.
 *
 * Supported function call patterns:
 * 1. **Single parameter mode**: func(element)
 * 2. **Key-value mode**: func(element, key, value)
 * 3. **Multi-value mode**: func(element, value1, value2, ...)
 * 4. **Mixed mode**: func(element, key, value1, value2, ...)
 *
 * Parameter construction logic:
 * - element: Always the first parameter, referenced via nodes[index]
 * - key: Optional attribute key (such as attribute name, event name, etc.)
 * - value: Attribute value, supports single value or array values
 *
 * @param {t.Identifier} functionIdentifier - Function identifier to call (e.g., patchAttr, patchClass)
 * @param {t.Identifier} nodesId - Node mapping array identifier
 * @param {number} nodeIndex - Target node index in the mapping array
 * @param {t.Expression} value - Attribute value expression (supports array spreading)
 * @param {t.Expression} [key] - Optional attribute key expression
 * @returns {t.ExpressionStatement} Created function call statement
 */
export function createAttributeStatement(
  functionIdentifier: t.Identifier,
  nodesId: t.Identifier,
  nodeIndex: number,
  value: t.Expression,
  key?: t.Expression,
): t.ExpressionStatement {
  // Prepare parameter array, first parameter is always the target DOM element
  const args: t.Expression[] = [t.memberExpression(nodesId, t.numericLiteral(nodeIndex), true)];

  // Add optional key parameter (such as attribute name, event name, etc.)
  if (key) {
    args.push(key);
  }

  // Add value parameter, supports array spreading
  if (value) {
    if (isArray(value)) {
      // Array value: spread all elements as independent parameters
      args.push(...value);
    } else {
      // Single value: add directly
      args.push(value);
    }
  }

  // Create function call expression statement
  const functionCall = t.callExpression(functionIdentifier, args);
  return t.expressionStatement(functionCall);
}

/**
 * Add event listener handling statement
 *
 * This function is responsible for adding event handling logic to DOM elements,
 * supporting two event handling modes:
 *
 * **Delegated Event Mode** (Performance Optimization):
 * - For common event types (click, input, change, etc.), uses event delegation
 * - Attaches event handlers directly to element's $eventName property
 * - Managed uniformly by global event system, reducing event listener count
 * - Format: element.$click = handler
 *
 * **Direct Event Mode** (Compatibility Guarantee):
 * - For event types that don't support delegation, directly adds event listeners
 * - Uses addEventListener function for binding
 * - Format: addEventListener(element, 'eventName', handler)
 *
 * Event name processing:
 * - Automatically removes 'on' prefix: onClick -> click
 * - Converts to lowercase: onMouseOver -> mouseover
 * - Supports all standard DOM events
 *
 * @param {string} attrName - Event attribute name (e.g., 'onClick', 'onMouseOver')
 * @param {t.Expression} attrValue - Event handler function expression
 * @param {t.Identifier} nodesId - Node mapping array identifier
 * @param {number} nodeIndex - Target node index position in mapping array
 * @param {t.Statement[]} statements - Statement collection (for adding generated code)
 * @param {State} state - Plugin state (contains event registration info)
 */
function addEventListenerStatement(
  attrName: string,
  attrValue: t.Expression,
  nodesId: t.Identifier,
  nodeIndex: number,
  statements: t.Statement[],
  state: PluginState,
): void {
  // Extract event name: remove 'on' prefix and convert to lowercase
  const eventName = attrName.slice(2).toLowerCase();

  // Delegated event handling (performance optimization path)
  if (isDelegatedEvent(eventName)) {
    const activeContext = getContext();
    if (!activeContext) {
      warn('Missing active context, unable to handle delegated events');
      return;
    }

    // Generate delegated event code: element.$eventName = handler
    const elementRef = t.memberExpression(nodesId, t.numericLiteral(nodeIndex), true);
    const eventProperty = t.memberExpression(elementRef, t.stringLiteral(`_$${eventName}`), true);

    // Create assignment statement: nodes[index].$eventName = handler
    const assignmentStmt = t.expressionStatement(
      t.assignmentExpression('=', eventProperty, attrValue),
    );
    statements.push(assignmentStmt);

    // Register event to global event system
    state.events?.add(eventName);
    return;
  }

  // Direct event handling (compatibility path)
  addImport(importMap.addEventListener);

  // Generate direct event listener code: addEventListener(element, 'eventName', handler)
  const eventListenerStmt = createAttributeStatement(
    state.imports.addEventListener,
    nodesId,
    nodeIndex,
    attrValue,
    t.stringLiteral(eventName),
  );
  statements.push(eventListenerStmt);
}
/**
 * Generate specific attribute setting code based on attribute name
 * @param attributeName - Attribute name
 * @param attributeValue - Attribute value
 * @param nodesId - Node mapping identifier
 * @param nodeIndex - Node index position
 * @param statements - Statement collection
 * @param state - Plugin state
 */
function generateSpecificAttributeCode(
  attributeName: string,
  attributeValue: t.Expression,
  nodesId: t.Identifier,
  nodeIndex: number,
  statements: t.Statement[],
  state: PluginState,
): void {
  // Note: Reactive attributes are already handled uniformly in generateDynamicPropsCode
  // This only handles non-reactive static attributes

  switch (attributeName) {
    case CLASS_NAME:
      addImport(importMap.patchClass);
      statements.push(
        createAttributeStatement(state.imports.patchClass, nodesId, nodeIndex, attributeValue),
      );
      break;

    case SPREAD_NAME:
      addImport(importMap.setSpread);
      statements.push(
        createAttributeStatement(state.imports.setSpread, nodesId, nodeIndex, attributeValue),
      );
      break;

    case STYLE_NAME:
      addImport(importMap.patchStyle);
      statements.push(
        createAttributeStatement(state.imports.patchStyle, nodesId, nodeIndex, attributeValue),
      );
      break;

    default:
      if (startsWith(attributeName, `${UPDATE_PREFIX}:`)) {
        addImport(importMap.bindElement);
        const attrName = attributeName.split(':')[1];
        statements.push(
          createAttributeStatement(
            state.imports.bindElement,
            nodesId,
            nodeIndex,
            attributeValue,
            t.stringLiteral(attrName),
          ),
        );
        return;
      }
      // Process normal attributes
      addImport(importMap.patchAttr);
      statements.push(
        createAttributeStatement(
          state.imports.patchAttr,
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
 * Process Immediately Invoked Function Expression (IIFE) optimization
 *
 * @param {t.Expression} node - Expression node to be processed
 * @returns {t.Expression} Optimized expression
 */
export function processIIFEExpression(node: t.Expression): t.Expression {
  // Check if it's an IIFE (Immediately Invoked Function Expression)
  if (
    t.isCallExpression(node) &&
    (t.isArrowFunctionExpression(node.callee) || t.isFunctionExpression(node.callee)) &&
    node.arguments.length === 0 // Ensure no parameters are passed for safe optimization
  ) {
    const callee = node.callee;
    const body = callee.body;

    // Handle block-level function body { return value; }
    if (t.isBlockStatement(body)) {
      // Only handle simple cases with single return statement
      if (body.body.length === 1) {
        const statement = body.body[0];
        if (t.isReturnStatement(statement) && statement.argument) {
          // Directly return the return value, remove IIFE wrapper
          return statement.argument;
        }
      }
    }
    // Handle arrow function shorthand form (() => expression)
    else if (t.isExpression(body)) {
      // Directly return expression body, remove function wrapper
      return body;
    }
  }

  // Not IIFE or cannot be safely optimized, keep original expression
  return node;
}

/**
 * Create parameter array for DOM insertion operations
 *
 * @param {DynamicContent} dynamicContent - Dynamic content object (contains node and position info)
 * @param {t.Identifier} nodesIdentifier - Node mapping array identifier
 * @param {number[]} indexMap - Pre-calculated index mapping array
 * @returns {t.Expression[]} Parameter array for insert function call
 */
export function createInsertArguments(
  dynamicContent: any,
  nodesIdentifier: t.Identifier,
  indexMap: number[] | Map<number, number>,
): t.Expression[] {
  // Validate required parent node index
  if (isNil(dynamicContent.parentIndex)) {
    throw new Error('Dynamic content missing valid parent node index');
  }

  // Get parent node position in mapping array
  const parentPosition = findIndexPosition(dynamicContent.parentIndex, indexMap);
  if (parentPosition === -1) {
    throw new Error(
      `Cannot find parent node index in index mapping: ${dynamicContent.parentIndex}`,
    );
  }

  // Build basic parameter list
  const argExpressions: t.Expression[] = [
    // Target parent node reference: nodes[parentPosition]
    t.memberExpression(nodesIdentifier, t.numericLiteral(parentPosition), true),
    // Content lazy function: () => dynamicContent (implements on-demand calculation)
    t.arrowFunctionExpression([], dynamicContent.node),
  ];

  // Handle insert position node (for insertBefore operation)
  if (dynamicContent.before !== null) {
    const beforePosition = findIndexPosition(dynamicContent.before, indexMap);
    if (beforePosition === -1) {
      throw new Error(`Cannot find before node index in index mapping: ${dynamicContent.before}`);
    }

    // Add before node reference: nodes[beforePosition]
    argExpressions.push(
      t.memberExpression(nodesIdentifier, t.numericLiteral(beforePosition), true),
    );
  }

  return argExpressions;
}

/**
 * Generate dynamic child node insertion code
 *
 * @param {DynamicContent[]} dynamicChildren - Dynamic child node collection
 * @param {t.Statement[]} statements - Statement collection (for adding generated code)
 * @param {State} state - Plugin state (contains import mapping)
 * @param {t.Identifier} nodesId - Node mapping array identifier
 * @param {number[]} indexMap - Index mapping array
 */
function generateDynamicChildrenCode(
  dynamicChildren: any[],
  statements: t.Statement[],
  state: PluginState,
  nodesId: t.Identifier,
  indexMap: number[],
): void {
  // Ensure insert function is imported
  addImport(importMap.insert);

  // Create insertion statement for each dynamic content
  for (const dynamicContent of dynamicChildren) {
    // Special handling for IIFE expressions, optimize performance
    const processedNode = processIIFEExpression(dynamicContent.node);

    // Create insertion parameters
    const insertArgs = createInsertArguments(
      { ...dynamicContent, node: processedNode },
      nodesId,
      indexMap,
    );

    // Add insertion statement to code
    const insertCall = t.callExpression(state.imports.insert, insertArgs);
    statements.push(t.expressionStatement(insertCall));
  }
}

/**
 * Generate dynamic attribute setting code
 *
 * Redesigned as unified memoizedEffect architecture:
 * 1. Collect all reactive attributes
 * 2. Generate a unified memoizedEffect to handle all updates
 * 3. Set non-reactive attributes directly
 *
 * @param {Array<{ props: Record<string, unknown>; parentIndex: number | null }>} dynamicProps - Dynamic attribute collection
 * @param {t.Statement[]} statements - Statement collection (for adding generated code)
 * @param {State} state - Plugin state (contains import mapping and configuration)
 * @param {t.Identifier} nodesId - Node mapping array identifier
 * @param {number[]} indexMap - Index mapping array
 */
function generateDynamicPropsCode(
  dynamicProps: Array<{ props: Record<string, unknown>; parentIndex: number | null }>,
  statements: t.Statement[],
  state: PluginState,
  nodesId: t.Identifier,
  indexMap: number[],
): void {
  // Process each dynamic attribute item
  for (const propItem of dynamicProps) {
    const { parentIndex, props } = propItem;

    // Skip invalid parent node indices
    if (parentIndex === null) {
      continue;
    }

    // Find parent node position in index mapping
    const parentIndexPosition = indexMap.indexOf(parentIndex);
    if (parentIndexPosition === -1) {
      warn(`Cannot find parent node index: ${parentIndex}`);
      continue;
    }

    // Process each dynamic attribute of the node
    for (const [attrName, attrValue] of Object.entries(props)) {
      try {
        // Process by attribute name classification
        if (attrName.startsWith('on')) {
          // Handle event attributes (onClick, onMouseOver, etc.)
          addEventListenerStatement(
            attrName,
            attrValue as t.Expression,
            nodesId,
            parentIndexPosition,
            statements,
            state,
          );
        } else {
          // Non-reactive attributes, set directly
          generateSpecificAttributeCode(
            attrName,
            attrValue as t.Expression,
            nodesId,
            parentIndexPosition,
            statements,
            state,
          );
        }
      } catch (error) {
        // When single attribute processing fails, log error but continue processing other attributes
        warn(`Attribute processing failed (${attrName}): ${error}`);
      }
    }
  }

  // Reactive operations have been added to global collector, not processed here
}

/**
 * Generates a unified memoized effect to handle all reactive operations.
 * This function takes in an array of reactive operations, and a statement array
 * to which the generated code will be appended.
 * The generated code will create a memoized effect that will be called with the initial state
 * object, and will return the final state object.
 *
 * @param reactiveOperations An array of reactive operations to be processed.
 * @param statements The statement array to which the generated code will be appended.
 * @param state The plugin state.
 * @param nodesId The identifier of the nodes mapping.
 */
function generateUnifiedMemoizedEffect(
  reactiveOperations: any[],
  statements: t.Statement[],
  state: PluginState,
  nodesId: t.Identifier,
  indexMap: number[],
): void {
  addImport(importMap.memoEffect);

  // Create variable declarations
  const variableDeclarations = reactiveOperations.map((op, index) => {
    return t.variableDeclarator(t.identifier(`_v$${index}`), op.attrValue);
  });

  // Create update statements
  const updateStatements = reactiveOperations.map((op, index) => {
    // Get parent node position in mapping array
    const parentPosition = findIndexPosition(op.nodeIndex, indexMap);
    if (parentPosition === -1) {
      throw new Error(`Cannot find parent node index in index mapping: ${op.nodeIndex}`);
    }

    const varName = t.identifier(`_v$${index}`);
    const elementRef = t.memberExpression(nodesId, t.numericLiteral(parentPosition), true);

    let domOperationCall: t.CallExpression;

    // Handle attribute operations
    if (op.setFunction.name === 'patchAttr') {
      domOperationCall = t.callExpression(op.setFunction.value, [
        elementRef,
        t.stringLiteral(op.attrName),
        t.memberExpression(t.identifier('_p$'), t.identifier(op.propKey)),
        t.assignmentExpression(
          '=',
          t.memberExpression(t.identifier('_p$'), t.identifier(op.propKey)),
          varName,
        ),
      ]);
    } else {
      domOperationCall = t.callExpression(op.setFunction.value, [
        elementRef,
        t.memberExpression(t.identifier('_p$'), t.identifier(op.propKey)),
        t.assignmentExpression(
          '=',
          t.memberExpression(t.identifier('_p$'), t.identifier(op.propKey)),
          varName,
        ),
      ]);
    }

    // _v$0 !== _p$.c0 && (_p$.c0 = _v$0, _$patchClass(_el$, _v$0));
    return t.expressionStatement(
      t.logicalExpression(
        '&&',
        t.binaryExpression(
          '!==',
          varName,
          t.memberExpression(t.identifier('_p$'), t.identifier(op.propKey)),
        ),
        domOperationCall,
      ),
    );
  });

  // Create effect function body
  const effectBody = t.blockStatement([
    // var _v$0 = expr1, _v$1 = expr2, ...;
    t.variableDeclaration('var', variableDeclarations),
    // All update statements
    ...updateStatements,
    // return _p$;
    t.returnStatement(t.identifier('_p$')),
  ]);

  // Create effect function
  const effectFunction = t.arrowFunctionExpression([t.identifier('_p$')], effectBody);

  // Create initial state object
  const initialStateProperties = reactiveOperations.map(op =>
    t.objectProperty(t.identifier(op.propKey), t.identifier('undefined')),
  );
  const initialState = t.objectExpression(initialStateProperties);

  // Create memoizedEffect call
  const memoizedEffectCall = t.callExpression(state.imports.memoEffect, [
    effectFunction,
    initialState,
  ]);

  statements.push(t.expressionStatement(memoizedEffectCall));
}

/**
 * Recursively generates a static HTML template from a given TreeNode.
 *
 * @param {TreeNode} node - The TreeNode to generate the template from.
 * @returns {string} The generated static HTML template.
 */
function generateStaticTemplate(node: TreeNode) {
  if (!node || node.type === NODE_TYPE.COMPONENT || node.type === NODE_TYPE.FRAGMENT) {
    return '';
  }
  switch (node.type) {
    case NODE_TYPE.TEXT:
      // Text node: directly concatenate all child content
      return Array.isArray(node.children) ? node.children.join('') : '';

    case NODE_TYPE.COMMENT:
      // Comment node: generate HTML comment placeholder
      return '<!>';

    case NODE_TYPE.NORMAL:
    case NODE_TYPE.SVG:
      return gstForNormal(node);
    default:
      return gstForChildren(node);
  }
}

/**
 * Generates a static HTML template for a given TreeNode representing a normal HTML element.
 * @param {TreeNode} node - The TreeNode to generate the template from.
 * @returns {string} The generated static HTML template.
 */
function gstForNormal(node: TreeNode) {
  if (!node.tag) {
    return gstForChildren(node);
  }
  const attributes = serializeAttributes(node.props);

  const startTag = `<${node.tag}${attributes ? ` ${attributes}` : ''}`;
  if (node.selfClosing) {
    return `${startTag}/>`;
  }

  return `${startTag}>${gstForChildren(node)}</${node.tag}>`;
}
/**
 * Generates a static HTML template for the given TreeNode's children.
 * The template is generated by recursively calling generateStaticTemplate on each child node.
 * @param {TreeNode} node - The TreeNode to generate the template from.
 * @returns {string} The generated static HTML template.
 */
function gstForChildren(node: TreeNode) {
  if (!node.children || !node.children.length) {
    return '';
  }
  const childTemplates: string[] = [];

  for (const child of node.children) {
    if (isObject(child)) {
      const childTemplate = generateStaticTemplate(child as TreeNode);
      childTemplates.push(childTemplate);
    } else if (isString(child)) {
      childTemplates.push(child);
    }
  }

  return childTemplates.join('');
}

/**
 *  Get dynamic props and children (static ones are already in template)
 * @param {TreeNode} node - The TreeNode to start walking from.
 * @returns {DynamicCollection} The collected dynamic content.
 */
function generateDynamic(node: TreeNode) {
  const dynamicCollection = {
    props: [],
    children: [],
    operations: [],
  };

  function walk(node: TreeNode, parentNode?: TreeNode) {
    processNodeDynamic(dynamicCollection, node, parentNode);
    if (node.children && node.children.length) {
      node.children.forEach(child => {
        walk(child as TreeNode, node);
      });
    }
  }

  walk(node);

  return dynamicCollection;
}

/**
 * Process single node dynamic content
 * @param {DynamicCollection} dynamicCollection - Collected dynamic content
 * @param {TreeNode} node - Current node
 * @param {TreeNode | null} parent - Parent node
 * @returns {void} No return value
 */
function processNodeDynamic(dynamicCollection, node: TreeNode, parentNode?: TreeNode) {
  const { children, props, operations } = dynamicCollection;
  switch (node.type) {
    case NODE_TYPE.COMPONENT:
    case NODE_TYPE.FRAGMENT: {
      // Prepare component attributes
      const componentProps = { ...node.props, children: node.children };

      // Create component call expression
      const componentExpr = createComponentExpression(node, componentProps);

      // Add to dynamic content list
      children.push({
        index: node.index,
        node: componentExpr,
        before: findBeforeIndex(node, parentNode as TreeNode),
        parentIndex: parentNode?.index ?? null,
      });
      break;
    }

    case NODE_TYPE.EXPRESSION:
      // Ensure child node array is not empty and first element is an expression
      if (node.children && node.children.length > 0) {
        const firstChild = node.children[0];

        // Handle JavaScript expression nodes
        if (isObject(firstChild) && t.isExpression(firstChild as t.Node)) {
          children.push({
            index: node.index,
            node: firstChild as t.Expression,
            before: findBeforeIndex(node, parentNode as TreeNode),
            parentIndex: parentNode?.index ?? null,
          });
        }
        // Handle JSX elements/fragments in expression containers
        else if (
          isObject(firstChild) &&
          (t.isJSXElement(firstChild as t.Node) || t.isJSXFragment(firstChild as t.Node))
        ) {
          // Treat JSX elements in expression containers as components
          // This usually occurs in: {<SomeComponent />} or {<></>}
          children.push({
            index: node.index,
            node: createComponentExpression(node, { children: [firstChild] }),
            before: findBeforeIndex(node, parentNode as TreeNode),
            parentIndex: parentNode?.index ?? null,
          });
        }
      }
      break;

    // Text nodes don't need dynamic processing (already handled in template stage)
    case NODE_TYPE.TEXT:
      break;

    default:
      // Handle regular HTML nodes with dynamic attributes
      // Dynamic attributes include: event handlers, conditional rendering attributes, dynamic styles, etc.
      if (node.props && Object.keys(node.props).length > 0) {
        const currentProps = {};
        for (const [attrName, attrValue] of Object.entries(node.props)) {
          const isReactive =
            isDynamicExpression(attrValue as t.Node) &&
            !startsWith(attrName, `${UPDATE_PREFIX}:`) &&
            !startsWith(attrName, EVENT_ATTR_NAME);

          if (isReactive) {
            // Collect reactive attributes for unified processing later
            const setFunction = getSetFunctionForAttribute(attrName);
            addImport(importMap[setFunction.name as keyof typeof importMap]);

            operations.push({
              nodeIndex: node?.index,
              attrName,
              attrValue: attrValue as t.Expression,
              setFunction,
              propKey: generatePropKey(attrName),
            });
          } else {
            currentProps[attrName] = attrValue;
          }
        }
        props.push({
          props: currentProps,
          parentIndex: node?.index ?? null,
        });
        break;
      }
  }
}
