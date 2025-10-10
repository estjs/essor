import { startsWith } from '@estjs/shared';
import { type NodePath, types as t } from '@babel/core';
import { addImport, importMap } from '../import';
import type { PluginState } from '../types';
import type {
  ArrowFunctionExpression,
  Expression,
  FunctionDeclaration,
  Identifier,
  ObjectProperty,
  RestElement,
} from '@babel/types';

/**
 * Property transformation context interface
 * Used to pass necessary context information when recursively processing object destructuring
 */
interface PropertyTransformContext {
  path: NodePath<FunctionDeclaration | ArrowFunctionExpression>;
  parentPath: string; // Parent path prefix for building complete property paths
  properties: (ObjectProperty | RestElement)[]; // List of properties to process
}

/**
 * Default value collector interface
 * Used to collect and store default values in property destructuring
 */
interface DefaultValueCollector {
  [key: string]: Expression; // Property name -> default value expression
}

/**
 * Props transformation configuration options
 */
interface PropsTransformOptions {
  /** Whether to enable development mode checks */
  devMode?: boolean;
  /** Signal variable prefix */
  signalPrefix?: string;
}

/**
 * Check if function returns JSX elements
 * Only functions that return JSX need props transformation
 * @param path - Function node path
 * @returns true if function returns JSX element or JSX fragment, false otherwise
 */
function hasJSXReturn(path: NodePath<FunctionDeclaration | ArrowFunctionExpression>): boolean {
  try {
    const body = path.get('body');

    if (t.isBlockStatement(body.node)) {
      // Function body is block statement, find return statement
      const returnStatement = body.get('body').find(statement => statement.isReturnStatement());

      if (!returnStatement) return false;

      const returnArg = (returnStatement.node as t.ReturnStatement).argument;
      return returnArg ? t.isJSXElement(returnArg) || t.isJSXFragment(returnArg) : false;
    } else {
      // Arrow function implicit return
      const returnArg = body.node as t.Expression;
      return t.isJSXElement(returnArg) || t.isJSXFragment(returnArg);
    }
  } catch {
    // If parsing fails, conservatively return false
    return false;
  }
}

/**
 * Create default value object
 * Merge all collected default values into an object as default parameter for __props
 *
 * @param defaultValues - Collected default value mapping
 * @returns Object expression containing default values
 */
function createDefaultValueObject(defaultValues: DefaultValueCollector): t.ObjectExpression {
  const properties = Object.entries(defaultValues).map(([key, value]) =>
    t.objectProperty(t.identifier(key), value),
  );
  return t.objectExpression(properties);
}

/**
 * Recursively replace properties in object destructuring
 * This is the core transformation function that handles various types of property destructuring patterns
 * while collecting default value information
 *
 * @param context - Property transformation context
 * @param defaultValues - Default value collector
 */
function replaceObjectProperties(
  { path, properties, parentPath }: PropertyTransformContext,
  defaultValues: DefaultValueCollector = {},
): void {
  properties.forEach(property => {
    try {
      // Only process object properties, skip other types
      if (!t.isObjectProperty(property)) {
        return;
      }

      // Ensure key is identifier
      if (!t.isIdentifier(property.key)) {
        // For computed property names, skip processing
        return;
      }

      const keyName = property.key.name;

      if (t.isIdentifier(property.value)) {
        // Case 1: Simple identifier - direct rename
        // Example: { name } -> __props.name
        path.scope.rename(property.value.name, `${parentPath}${keyName}`);
      } else if (t.isAssignmentPattern(property.value)) {
        // Case 2: Assignment pattern (with default value) - collect default value and rename
        // Example: { delay = 1500 } -> collect default value, rename to __props.delay
        if (t.isIdentifier(property.value.left)) {
          // Collect default value
          defaultValues[keyName] = property.value.right;
          // Rename identifier to use parent path
          path.scope.rename(property.value.left.name, `${parentPath}${keyName}`);
        }
      } else if (t.isObjectPattern(property.value)) {
        // Case 3: Nested object pattern - recursive processing
        // Example: { user: { name, age } } -> __props.user.name, __props.user.age
        replaceObjectProperties(
          {
            path,
            properties: property.value.properties,
            parentPath: `${parentPath}${keyName}.`,
          },
          defaultValues,
        );
      }
      // Other cases (like array patterns, rest elements, etc.) are skipped for now
    } catch (error) {
      // Single property processing failure should not affect other properties
      // Can log warnings in development mode
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(`Failed to process property ${property.key}:`, error);
      }
    }
  });
}

/**
 * Create variable declaration for rest parameter
 * When rest parameter exists, need to create reactive rest object
 *
 * @param state - Babel state object
 * @param restName - Rest parameter name
 * @param excludeProps - List of property names to exclude
 * @returns Variable declaration node
 */
function createRestVariableDeclaration(
  state: PluginState,
  restName: string,
  excludeProps: string[],
): t.VariableDeclaration {
  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier(restName),
      t.callExpression(state.imports.reactive, [
        t.identifier('__props'),
        t.arrayExpression(excludeProps.map(name => t.stringLiteral(name))),
      ]),
    ),
  ]);
}

/**
 * Handle rest parameter
 * Decide how to handle parameters based on whether rest parameter and other properties exist
 *
 * @param path - Function node path
 * @param state - Babel state
 * @param properties - All properties
 * @param notRestNames - List of non-rest property names
 * @param defaultValues - Default values object
 */
function handleRestElement(
  path: NodePath<FunctionDeclaration | ArrowFunctionExpression>,
  state: PluginState,
  properties: (ObjectProperty | RestElement)[],
  notRestNames: string[],
  defaultValues: DefaultValueCollector,
): void {
  // Find rest parameter
  const restElement = properties.find(prop => t.isRestElement(prop)) as RestElement | undefined;

  // Create __props parameter, set default value if exists
  const propsParam =
    Object.keys(defaultValues).length > 0
      ? t.assignmentPattern(t.identifier('__props'), createDefaultValueObject(defaultValues))
      : t.identifier('__props');

  path.node.params[0] = propsParam;

  if (!restElement) {
    // No rest parameter, return directly
    return;
  }

  const restName = (restElement.argument as Identifier).name;

  if (notRestNames.length === 0) {
    // Only rest parameter, no other properties
    // Directly use rest parameter name as first parameter
    path.node.params[0] = t.identifier(restName);
  } else {
    // Both regular properties and rest parameter
    // Create rest variable declaration and insert at function body start
    const restDeclaration = createRestVariableDeclaration(state, restName, notRestNames);
    addImport(importMap.reactive);

    // Ensure body is a block statement
    const body = path.node.body;
    if (!t.isBlockStatement(body)) {
      // Convert expression body to block statement
      path.node.body = t.blockStatement([t.returnStatement(body as t.Expression)]);
    }

    (path.node.body as t.BlockStatement).body.unshift(restDeclaration);
  }
}

/**
 * Transform function parameters to reactive properties
 * This is the main transformation entry function that handles function parameter conversion logic
 *
 * @param path - function node path
 * @param options - transformation options
 */
export function transformProps(
  path: NodePath<FunctionDeclaration | ArrowFunctionExpression>,
): void {
  try {
    const firstParam = path.node.params[0];

    // Quick validation: ensure first parameter exists and is object pattern, and function returns JSX
    if (!firstParam || !t.isObjectPattern(firstParam) || !hasJSXReturn(path)) {
      return;
    }

    const state: PluginState = path.state;
    const properties = firstParam.properties;

    // Filter out non-rest properties
    const notRestProperties = properties.filter(prop => !t.isRestElement(prop)) as ObjectProperty[];

    // Validate property names (not allowed to start with specified prefix)
    const signalPrefix = state.opts.symbol || '$';
    const notRestNames = notRestProperties
      .map(prop => (t.isIdentifier(prop.key) ? prop.key.name : null))
      .filter((name): name is string => name !== null);

    if (notRestNames.some(name => startsWith(name, signalPrefix))) {
      if (__DEV__) {
        console.warn(`Props name cannot start with ${signalPrefix}`);
      }
      return;
    }

    // Create default value collector
    const defaultValues: DefaultValueCollector = {};

    // Replace properties: convert destructured properties to __props.xxx form while collecting default values
    replaceObjectProperties(
      {
        path,
        properties: notRestProperties,
        parentPath: '__props.',
      },
      defaultValues,
    );

    // Handle rest parameter, pass in default value information
    handleRestElement(path, state, properties, notRestNames, defaultValues);
  } catch (error) {
    // If errors occur during transformation, log warnings in development mode
    if (__DEV__) {
      console.warn('Props transformation failed:', error);
    }
    // Don't throw errors, let compilation continue
  }
}
