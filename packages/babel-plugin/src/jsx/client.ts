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
import { isSignal } from '../signals/symbol';
import {
  BUILT_IN_COMPONENTS,
  CLASS_NAME,
  CREATE_COMPONENT_NAME,
  EVENT_ATTR_NAME,
  NODE_TYPE,
  SPREAD_NAME,
  STYLE_NAME,
  UPDATE_PREFIX,
} from './constants';
import {
  type DynamicContent,
  createPropsObjectExpression,
  findBeforeIndex,
  findIndexPosition,
  getSetFunctionForAttribute,
  isDynamicExpression,
  serializeAttributes,
} from './shared';
import { getContext, setContext } from './context';
import { type TreeNode, isTreeNode } from './tree';
import type { NodePath } from '@babel/core';
import type { JSXElement, PluginState } from '../types';

interface ReactiveOperation {
  nodeIndex: number;
  attrName: string;
  attrValue: t.Expression;
  setFunction: t.Identifier;
  propKey: string;
}

export function transformJSXToClient(path: NodePath<JSXElement>, node: TreeNode) {
  const state = path.state;

  // Handle component or fragment
  if (node.type === NODE_TYPE.COMPONENT) {
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
  const elementId = path.scope.generateUidIdentifier('_$el');
  const nodesId = path.scope.generateUidIdentifier('_$nodes');

  // Initialize statements array for function body
  const statements: t.Statement[] = [];

  if (staticTemplate) {
    addImport(importMap.template);
    const tmplId = path.scope.generateUidIdentifier('_$tmpl');

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
    // Process dynamic child nodes if they exist
    if (dynamicCollection.children.length) {
      generateDynamicChildrenCode(dynamicCollection.children, statements, state, nodesId, indexMap);
    }

    // Process dynamic properties if they exist
    if (dynamicCollection.props.length) {
      generateDynamicPropsCode(dynamicCollection.props, statements, state, nodesId, indexMap);
    }

    // Process reactive operations if they exist
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
function generatePropKey(attrName: string = 'attr'): string {
  const { operationIndex } = getContext();
  const keyMap: Record<string, string> = {
    [CLASS_NAME]: 'c',
    [STYLE_NAME]: 's',
    name: 'n',
    attr: 'a',
  };

  const baseKey = keyMap[attrName] || attrName.charAt(0);
  setContext({ ...getContext(), operationIndex: operationIndex + 1 });
  setContext({ ...getContext(), operationIndex: operationIndex + 1 });
  return `${baseKey}${operationIndex}`;
}

function isMapCall(node: t.Node): boolean {
  return (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property) &&
    node.callee.property.name === 'map' &&
    node.arguments.length === 1
  );
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

  addImport(importMap.createComponent);

  // Built-in components
  const isBuiltIn = BUILT_IN_COMPONENTS.includes(node.tag!);
  if (isBuiltIn) {
    addImport(importMap[node.tag!]);
  }

  const argTag = isBuiltIn ? state.imports[node.tag!] : t.identifier(node.tag!);
  // Create props object expression
  const propsObj = createPropsObjectExpression(componentProps, transformJSXClientChildren);

  const args: t.Expression[] = [argTag, propsObj];

  return t.callExpression(state.imports[CREATE_COMPONENT_NAME], args);
}
/**
 * Generates an optimized index map for DOM node references.
 */
function generateIndexMap({
  props,
  children,
  operations = [],
}: {
  props: Array<{ props: Record<string, unknown>; parentIndex: number | null }>;
  children: Array<{ parentIndex: number | null; before: number | null }>;
  operations?: Array<{ nodeIndex: number }>;
}) {
  const indexSet = new Set<number>();

  // Collect indices related to dynamic child nodes
  for (const item of children) {
    // Add parent node index
    if (!isNil(item.parentIndex)) {
      indexSet.add(item.parentIndex);
    }
    // Add reference node index (for insertBefore)
    if (!isNil(item.before)) {
      indexSet.add(item.before);
    }
  }

  // Collect parent node indices related to dynamic attributes
  for (const item of props) {
    if (!isNil(item.parentIndex)) {
      indexSet.add(item.parentIndex);
    }
  }

  // Collect node indices for reactive operations
  if (operations && operations.length > 0) {
    for (const item of operations) {
      if (!isNil(item.nodeIndex)) {
        indexSet.add(item.nodeIndex);
      }
    }
  }

  // Convert to sorted array for predictable ordering
  const indexMap = Array.from(indexSet).sort((a, b) => a - b);

  // Validation: Ensure all indices are positive integers
  if (__DEV__) {
    for (const index of indexMap) {
      if (!Number.isInteger(index) || index < 1) {
        warn(`Invalid index in index map: ${index}. All indices must be positive integers.`);
      }
    }
  }

  return indexMap;
}

/**
 * Create attribute setting statement

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
    node.arguments.length === 0
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
  dynamicContent: DynamicContent,
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

    // CallExpression not be use call function
    // Content lazy function: () => dynamicContent (implements on-demand calculation)
    t.isCallExpression(dynamicContent.node) ||
    t.isArrowFunctionExpression(dynamicContent.node) ||
    t.isFunctionExpression(dynamicContent.node)
      ? dynamicContent.node
      : t.arrowFunctionExpression([], dynamicContent.node),
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
  dynamicChildren: DynamicContent[],
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
  dynamicProps: Array<{
    props: Record<string, unknown>;
    parentIndex: number | null;
  }>,
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
        // Handle bind attributes (update:xxx) which are arrays [getter, setter]
        if (attrName.startsWith(`${UPDATE_PREFIX}:`) && Array.isArray(attrValue)) {
          // Type guard: ensure array elements are expressions
          if (
            attrValue.length === 2 &&
            t.isExpression(attrValue[0]) &&
            t.isExpression(attrValue[1])
          ) {
            generateSpecificAttributeCode(
              attrName,
              attrValue as any, // Pass array as-is, createAttributeStatement will spread it
              nodesId,
              parentIndexPosition,
              statements,
              state,
            );
          }
          continue;
        }

        // Process by attribute name classification
        // Type guard: attrValue must be Expression for dynamic props
        if (!t.isExpression(attrValue)) {
          continue;
        }

        if (attrName.startsWith('on')) {
          // Handle event attributes (onClick, onMouseOver, etc.)
          addEventListenerStatement(
            attrName,
            attrValue,
            nodesId,
            parentIndexPosition,
            statements,
            state,
          );
        } else {
          // Non-reactive attributes, set directly
          generateSpecificAttributeCode(
            attrName,
            attrValue,
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
  reactiveOperations: ReactiveOperation[],
  statements: t.Statement[],
  state: PluginState,
  nodesId: t.Identifier,
  indexMap: number[],
): void {
  addImport(importMap.memoEffect);

  // Create variable declarations
  const variableDeclarations = reactiveOperations.map((op, index) => {
    let attrValue = op.attrValue;
    // check symbol name
    // TODO:
    if (t.isIdentifier(op.attrValue) && isSignal(op.attrValue.name)) {
      attrValue = t.memberExpression(attrValue, t.identifier('value'));
    }
    return t.variableDeclarator(t.identifier(`_v$${index}`), attrValue);
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
 * This function is the main entry point for static template generation.
 * It handles all node types and delegates to specialized functions for
 * complex cases like normal elements and children processing.
 *
 * **Processing Rules:**
 * - Component/Fragment nodes: Return empty string (handled dynamically)
 * - Text nodes: Concatenate all text content
 * - Comment nodes: Generate HTML comment placeholder `<!>`
 * - Normal/SVG nodes: Delegate to gstForNormal for full element generation
 * - Other nodes: Delegate to gstForChildren for children-only generation
 *
 * @param {TreeNode} node - The TreeNode to generate the template from
 * @returns {string} The generated static HTML template string
 *
 * @example
 * ```typescript
 * // <div class="container">Hello</div>
 * generateStaticTemplate(node)
 * // Returns: '<div class="container">Hello</div>'
 * ```
 */
function generateStaticTemplate(node: TreeNode): string {
  if (!node || node.type === NODE_TYPE.COMPONENT) {
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
 * Generates a static HTML template for a normal HTML element.
 *
 * This function handles the complete generation of HTML elements including:
 * - Opening tag with attributes
 * - Children content (recursively generated)
 * - Closing tag (or self-closing syntax)
 *
 * **Processing Steps:**
 * 1. Validate node has a tag name
 * 2. Serialize static attributes to HTML string
 * 3. Generate opening tag with attributes
 * 4. Handle self-closing tags (e.g., `<img />`, `<br />`)
 * 5. Recursively generate children content
 * 6. Generate closing tag
 *
 * @param {TreeNode} node - The TreeNode representing a normal HTML element
 * @returns {string} The generated static HTML template string
 *
 * @example
 * ```typescript
 * // <div class="container"><span>Hello</span></div>
 * gstForNormal(node)
 * // Returns: '<div class="container"><span>Hello</span></div>'
 * ```
 *
 * @example
 * ```typescript
 * // <img src="logo.png" />
 * gstForNormal(node)
 * // Returns: '<img src="logo.png"/>'
 * ```
 */
function gstForNormal(node: TreeNode): string {
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
 * Recursively generates static HTML template for children nodes.
 *
 * This function processes all children of a TreeNode and concatenates their
 * static HTML representations. It handles both TreeNode children and string
 * literals, skipping dynamic content (which is handled separately).
 *
 * **Processing Rules:**
 * - TreeNode children: Recursively call generateStaticTemplate
 * - String children: Include directly in output
 * - Other types: Skip (dynamic content handled elsewhere)
 *
 * @param {TreeNode} node - The TreeNode whose children to process
 * @returns {string} The concatenated static HTML template of all children
 *
 * @example
 * ```typescript
 * // <div>Hello <span>World</span></div>
 * gstForChildren(divNode)
 * // Returns: 'Hello <span>World</span>'
 * ```
 */
function gstForChildren(node: TreeNode): string {
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
 * Collects all dynamic content from a TreeNode for client-side rendering.
 *
 * This function performs a depth-first traversal of the tree to identify and
 * collect all dynamic content that needs runtime processing. It separates
 * dynamic content into three categories:
 *
 * **Collection Categories:**
 * 1. **props**: Dynamic attributes that need one-time setting
 * 2. **children**: Dynamic child nodes (expressions, components, fragments)
 * 3. **operations**: Reactive attributes that need memoized updates
 *
 * **Processing Strategy:**
 * - Static content is already in the template (handled by generateStaticTemplate)
 * - Dynamic content is collected here for runtime code generation
 * - Reactive attributes are identified and added to operations for memoEffect
 *
 * @param {TreeNode} node - The root TreeNode to start collection from
 * @returns {DynamicCollection} Object containing all collected dynamic content
 *
 * @example
 * ```typescript
 * // <div class={cls}>{message}<button onClick={handler}>Click</button></div>
 * const dynamic = generateDynamic(node);
 * // dynamic.operations: [{ nodeIndex: 1, attrName: 'class', ... }]
 * // dynamic.children: [{ node: message, parentIndex: 1, ... }]
 * // dynamic.props: [{ props: { onClick: handler }, parentIndex: 2 }]
 * ```
 */
function generateDynamic(node: TreeNode) {
  const dynamicCollection = {
    props: [],
    children: [],
    operations: [],
  };

  function walk(node: TreeNode, parentNode?: TreeNode) {
    processNodeDynamic(dynamicCollection, node, parentNode);

    // Skip recursive child processing for Fragment nodes
    // Fragment children are already included in the component expression
    // created by processNodeDynamic, so walking them again would cause duplicates
    if (node.type === NODE_TYPE.COMPONENT || node.type === NODE_TYPE.FRAGMENT) {
      return; // Skip processing component children in parent context
    }

    if (node.children && node.children.length) {
      node.children.forEach(child => {
        if (isTreeNode(child)) {
          walk(child as TreeNode, node);
        }
      });
    }
  }

  walk(node);

  return dynamicCollection;
}

/**
 * Processes a single TreeNode to extract dynamic content.
 *
 * This function is the core of dynamic content collection. It examines each node
 * and categorizes its dynamic aspects into the appropriate collection:
 *
 * **Node Type Processing:**
 * - **COMPONENT/FRAGMENT**: Create component expression and add to children
 * - **EXPRESSION**: Extract expression and add to children
 * - **TEXT**: Skip (already in static template)
 * - **NORMAL/SVG**: Process dynamic attributes
 *
 * **Attribute Classification:**
 * - **Reactive attributes**: Dynamic values that need memoized updates (class, style, etc.)
 * - **Event handlers**: onClick, onInput, etc. (added to props)
 * - **Bind directives**: update:xxx (added to props)
 * - **Static attributes**: Already in template (skipped)
 *
 * @param {DynamicCollection} dynamicCollection - The collection to populate
 * @param {TreeNode} node - The current node to process
 * @param {TreeNode} [parentNode] - The parent node (for context)
 *
 * @example
 * ```typescript
 * // <div class={cls}>{message}</div>
 * processNodeDynamic(collection, divNode, null);
 * // collection.operations: [{ attrName: 'class', attrValue: cls, ... }]
 * // collection.children: [{ node: message, ... }]
 * ```
 */
function processNodeDynamic(dynamicCollection, node: TreeNode, parentNode?: TreeNode): void {
  const { children, props, operations } = dynamicCollection;
  const { state, path } = getContext();

  switch (node.type) {
    case NODE_TYPE.COMPONENT: {
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
        if (isObject(firstChild) && t.isNode(firstChild) && t.isExpression(firstChild)) {
          // if (isMapCall(firstChild)) {
          //   const mapCall = firstChild as t.CallExpression;
          //   const list = (mapCall.callee as t.MemberExpression).object;
          //   const callback = mapCall.arguments[0];

          //   addImport(importMap.For);

          //   let childrenProp = callback;
          //   // Wrap callback if it uses index to unwrap the getter
          //   if (
          //     (t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback)) &&
          //     callback.params.length > 1 &&
          //     checkHasJSXReturn(callback)
          //   ) {
          //     const itemParam = path.scope.generateUidIdentifier('item');
          //     const indexParam = path.scope.generateUidIdentifier('index');
          //     childrenProp = t.arrowFunctionExpression(
          //       [itemParam, indexParam],
          //       t.callExpression(callback as t.Expression, [
          //         itemParam,
          //         t.callExpression(indexParam, []),
          //       ]),
          //     );
          //   }
          //   // 特殊处理，默认tree不处理map，所有这里要添加一个tag
          //   node.tag = 'For';
          //   children.push({
          //     index: node.index,
          //     node: createComponentExpression(node, {
          //       each: list,
          //       children: childrenProp,
          //     }),
          //     before: findBeforeIndex(node, parentNode as TreeNode),
          //     parentIndex: parentNode?.index ?? null,
          //   });
          // } else {
          children.push({
            index: node.index,
            node: t.arrowFunctionExpression([], firstChild),
            before: findBeforeIndex(node, parentNode as TreeNode),
            parentIndex: parentNode?.index ?? null,
          });
          // }
        }
        // Handle JSX elements/fragments in expression containers
        else if (isObject(firstChild) && t.isNode(firstChild) && t.isJSXElement(firstChild)) {
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
          // Type guard: check if attrValue is a Node before checking if it's dynamic
          const isReactive =
            t.isNode(attrValue) &&
            isDynamicExpression(attrValue) &&
            !startsWith(attrName, `${UPDATE_PREFIX}:`) &&
            !startsWith(attrName, EVENT_ATTR_NAME);
          // support bind:value

          if (startsWith(attrName, `${UPDATE_PREFIX}:`)) {
            const name = attrName.split(':')[1];
            const setFunction = getSetFunctionForAttribute();
            addImport(importMap[setFunction.name as keyof typeof importMap]);

            operations.push({
              nodeIndex: node?.index,
              attrName: name,
              attrValue: (attrValue as any)[0],
              setFunction,
              propKey: generatePropKey(),
            });
          }
          if (isReactive && t.isExpression(attrValue)) {
            // Collect reactive attributes for unified processing later
            const setFunction = getSetFunctionForAttribute(attrName);
            addImport(importMap[setFunction.name as keyof typeof importMap]);

            operations.push({
              nodeIndex: node?.index,
              attrName,
              attrValue,
              setFunction,
              propKey: generatePropKey(attrName),
            });
          } else {
            currentProps[attrName] = attrValue;
          }
        }

        if (Object.keys(currentProps).length > 0) {
          props.push({
            props: currentProps,
            parentIndex: node?.index ?? null,
          });
        }
      }
      break;
  }
}
