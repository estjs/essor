import { type NodePath, types as t } from '@babel/core';

import { isPlainObject, startsWith, warn } from '@estjs/shared';
import { TRANSFORM_PROPERTY_NAME } from '../constants';
import { addImport, importMap } from '../import';
import { checkHasJSXReturn } from './utils';
import type { PluginState } from '../types';
import type {
  ArrowFunctionExpression,
  FunctionDeclaration,
  ObjectProperty,
  RestElement,
} from '@babel/types';

/**
 * Recursively replaces properties in object destructuring patterns
 *
 * This is the core transformation function that handles various types of property
 * destructuring patterns while collecting default value information.
 *
 * Supported patterns:
 * 1. **Simple destructuring**: `{ name }` → `__props.name`
 * 2. **Aliasing**: `{ name: userName }` → `__props.name` (userName renamed)
 * 3. **Default values**: `{ delay = 1500 }` → `__props.delay` (default collected)
 * 4. **Nested objects**: `{ user: { name } }` → `__props.user.name`
 * 5. **Mixed patterns**: `{ a, b: { c = 1 } }` → `__props.a`, `__props.b.c`
 *
 * @param path - Function node path being transformed
 * @param properties - List of properties to process from object destructuring pattern
 * @param parentPath - Parent path prefix for building complete property paths
 * @param defaultValues - Default value collector to store extracted default values
 * @throws Never throws - handles all errors internally and continues processing
 *
 * @example
 * ```typescript
 * // Input: function Component({ name, user: { age = 18 } }) { ... }
 * // After: function Component(__props = { user: { age: 18 } }) {
 * //   // name → __props.name
 * //   // age → __props.user.age
 * // }
 * ```
 */
function transformProperty(
  path: NodePath<FunctionDeclaration | ArrowFunctionExpression>,
  properties: ObjectProperty[],
  parentPath: string,
  defaultValues: Record<string, unknown> = {},
): Record<string, unknown> {
  properties.forEach((property, index) => {
    try {
      // Only process object properties, skip rest elements
      if (!t.isObjectProperty(property)) {
        return;
      }

      // Ensure key is identifier
      if (!t.isIdentifier(property.key)) {
        // For computed property names, skip processing
        if (__DEV__) {
          warn('transformObjectProperties: Skipping computed property', { index });
        }
        return;
      }

      const keyName = property.key.name;

      if (t.isIdentifier(property.value)) {
        path.scope.rename(property.value.name, `${parentPath}${keyName}`);
      } else if (t.isAssignmentPattern(property.value)) {
        // Case 2: Assignment pattern (with default value) - collect default value and rename
        // Example: { delay = 1500 } -> collect default value, rename to __props.delay
        if (t.isIdentifier(property.value.left)) {
          // Collect default value
          defaultValues[keyName] = property.value.right;
          // Rename identifier to use parent path

          path.scope.rename(property.value.left.name, `${parentPath}${keyName}`);
        } else if (t.isObjectPattern(property.value.left)) {
          // Nested object with default: { nested: { x } = {} }
          transformProperty(
            path,
            property.value.left.properties as ObjectProperty[],
            `${parentPath}${keyName}.`,
            defaultValues,
          );
          // Store the default value for the nested object
          defaultValues[keyName] = property.value.right;
        }
      } else if (t.isObjectPattern(property.value)) {
        // Case 3: Nested object pattern - recursive processing
        // Example: { user: { name, age } } -> __props.user.name, __props.user.age
        transformProperty(
          path,
          property.value.properties as ObjectProperty[],
          `${parentPath}${keyName}.`,
          defaultValues,
        );
      }
      // Other cases (like array patterns) are not commonly used in props and are skipped
    } catch (error) {
      // Single property processing failure should not affect other properties
      warn('transformProperty', `Failed to process property at index ${index}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return defaultValues;
}

/**
 * Rest parameter information collected during transformation
 */
interface RestParameterInfo {
  /** Rest parameter variable name */
  name: string;
  /** Parent path prefix (e.g., '__props.user.') */
  parentPath: string;
  /** Properties to exclude from this rest object */
  excludeProps: string[];
}
/**
 * Creates a variable declaration for rest parameter
 *
 * When a rest parameter exists, creates a reactive rest object that excludes
 * the explicitly destructured properties using the omit utility.
 *
 * Strategy:
 * - If no excludeProps: `const rest = __props` (direct reference)
 * - If has excludeProps: `const rest = omit(__props, ['name', 'age'])`
 * - For nested rest: `const userRest = omit(__props.user, ['name', 'age'])`
 *
 * @param state - Babel plugin state object (must contain imports.omit)
 * @param restName - Rest parameter name (e.g., 'rest', 'otherProps')
 * @param parentPath - Parent path prefix (e.g., '__props.' or '__props.user.')
 * @param excludeProps - List of property names to exclude from rest object
 * @returns Variable declaration AST node for the rest parameter
 * @throws {Error} If state is invalid or missing omit import
 * @throws {Error} If restName is invalid
 * @throws {TypeError} If excludeProps is not an array
 *
 * @example
 * ```typescript
 * // Top-level rest: { name, age, ...rest }
 * // Output: const rest = omit(__props, ['name', 'age']);
 *
 * // Nested rest: { user: { name, ...userRest } }
 * // Output: const userRest = omit(__props.user, ['name']);
 *
 * // Usage in component:
 * // <div {...rest} /> will spread all props except name and age
 * ```
 */
function buildRestVariableDeclaration(
  state: PluginState,
  restName: string,
  parentPath: string,
  excludeProps: string[],
): t.VariableDeclaration {
  // Validate restName
  // if (!restName || restName.trim() !== restName || !parentPath) {
  //   return;
  // }

  // Validate each property name in excludeProps
  const validExcludeProps = excludeProps.filter(Boolean);

  let init: t.Expression;

  // Build the source object expression from parentPath
  // e.g., '__props.' -> __props, '__props.user.' -> __props.user
  const pathParts = parentPath.split('.').filter(part => part.length > 0);
  let sourceObject: t.Expression = t.identifier(pathParts[0] || '__props');

  for (let i = 1; i < pathParts.length; i++) {
    sourceObject = t.memberExpression(sourceObject, t.identifier(pathParts[i]));
  }

  if (validExcludeProps.length === 0) {
    // No properties to exclude, directly reference the source object
    init = sourceObject;
  } else {
    // Create: omit(sourceObject, ['name', 'age'])
    init = t.callExpression(state.imports.omitProps, [
      sourceObject,
      t.arrayExpression(validExcludeProps.map(name => t.stringLiteral(name))),
    ]);
  }

  return t.variableDeclaration('const', [t.variableDeclarator(t.identifier(restName), init)]);
}

function transformRestProperties(
  path: NodePath<FunctionDeclaration | ArrowFunctionExpression>,
  restProperties: RestElement,
  notRestNames: string[] = [],
  nestedRestParams: RestParameterInfo[] = [],
): void {
  if (!t.isIdentifier(restProperties.argument)) {
    return;
  }
  const restName = restProperties.argument.name;

  if (notRestNames.length === 0 && nestedRestParams.length === 0) {
    // Only rest parameter, no other properties and no nested rest
    // Directly use rest parameter name as first parameter
    path.node.params[0] = t.identifier(restName);
  } else {
    // Has regular properties or nested rest parameters
    const restDeclarations: t.VariableDeclaration[] = [];

    // Process nested rest parameters first (from deepest to shallowest for correct order)
    if (nestedRestParams.length > 0) {
      for (const nestedRest of nestedRestParams) {
        const nestedRestDeclaration = buildRestVariableDeclaration(
          path.state,
          nestedRest.name,
          nestedRest.parentPath,
          nestedRest.excludeProps,
        );
        restDeclarations.push(nestedRestDeclaration);

        // Add omit import if there are props to exclude
        if (nestedRest.excludeProps.length > 0) {
          addImport(importMap.omitProps);
        }
      }
    }

    // Process top-level rest parameter if exists
    if (restProperties) {
      const restDeclaration = buildRestVariableDeclaration(
        path.state,
        restName,
        `${TRANSFORM_PROPERTY_NAME},`,
        notRestNames,
      );
      restDeclarations.push(restDeclaration);

      // Only add omit import if we actually need it (when there are props to exclude)
      if (notRestNames.length) {
        addImport(importMap.omitProps);
      }
    }

    // Insert all rest declarations at function body start
    for (const declaration of restDeclarations) {
      const body = path.node.body as t.BlockStatement;
      body.body.unshift(declaration);
    }
  }
}
/**
 * Creates a default value object expression with support for nested defaults
 *
 * @param defaultValues - Collected default value mapping (key → expression or nested object)
 * @returns Object expression containing default values, or empty object if input is invalid
 * @throws Never throws - returns empty object on any error
 *
 * @example
 * ```typescript
 * // Input: { count: 0, user: { age: 18, settings: { theme: 'dark' } } }
 * // Output: AST for { count: 0, user: { age: 18, settings: { theme: 'dark' } } }
 *
 * // Used as: function Component(__props = { count: 0, user: { age: 18 } })
 * ```
 */
function buildDefaultValueObject(defaultValues): t.ObjectExpression {
  // Validate input type
  if (!isPlainObject(defaultValues)) {
    return t.objectExpression([]);
  }

  const properties: t.ObjectProperty[] = [];

  for (const [key, value] of Object.entries(defaultValues)) {
    if (!key) {
      continue;
    }

    let propertyValue: t.Expression;

    // Check if value is a nested DefaultValueCollector
    if (isPlainObject(value) && !t.isNode(value)) {
      // Recursively build nested object
      propertyValue = buildDefaultValueObject(value);
    } else if (t.isExpression(value)) {
      // Direct expression value
      propertyValue = value;
    } else {
      continue;
    }

    properties.push(t.objectProperty(t.identifier(key), propertyValue));
  }

  return t.objectExpression(properties);
}

function buildDefaultValue(
  path: NodePath<FunctionDeclaration | ArrowFunctionExpression>,
  defaultValues: Record<string, unknown>,
): void {
  const propsParam =
    Object.keys(defaultValues).length > 0
      ? t.assignmentPattern(
          t.identifier(TRANSFORM_PROPERTY_NAME),
          buildDefaultValueObject(defaultValues),
        )
      : t.identifier(TRANSFORM_PROPERTY_NAME);

  path.node.params[0] = propsParam;
}

/**
 * Transforms function parameters to reactive properties
 * @param path - Function node path to transform
 * @throws Never throws - handles all errors internally and continues compilation
 *
 * Transformation flow:
 * 1. Validate function returns JSX
 * 2. Validate first parameter is object pattern
 * 3. Check prop names don't conflict with signal prefix
 * 4. Replace property references with __props.xxx
 * 5. Collect default values
 * 6. Handle rest parameters
 *
 * @example
 * ```typescript
 * // Before
 * function Component({ title, count = 0, ...rest }) {
 *   return <div>{title} {count} {rest}</div>;
 * }
 *
 * // After
 * function Component(__props = { count: 0 }) {
 *   const rest = omitProps(__props, ['title', 'count']);
 *   return <div>{__props.title} {__props.count} {rest}</div>;
 * }
 * ```
 */
export function transformProps(
  path: NodePath<FunctionDeclaration | ArrowFunctionExpression>,
): void {
  // just transform the first parameter
  const firstParam = path.node.params[0];

  // validate the first parameter is an object pattern and the function returns JSX
  if (!firstParam || !t.isObjectPattern(firstParam) || !checkHasJSXReturn(path)) {
    return;
  }

  const state: PluginState = path.state;
  const properties = firstParam.properties as ObjectProperty[];

  const signalPrefix = state.opts.symbol || '$';

  const notRestProperties = properties.filter(prop => !t.isRestElement(prop)) as ObjectProperty[];

  // one object just have one rest
  const restProperties = properties.find(prop => t.isRestElement(prop)) as RestElement | undefined;
  const notRestNames = notRestProperties
    .map(prop => (t.isIdentifier(prop.key) ? prop.key.name : null))
    .filter((name): name is string => name !== null);

  if (__DEV__) {
    // if the property names start with the signal prefix,
    if (notRestNames.some(name => startsWith(name, signalPrefix))) {
      warn(
        'transformProps',
        'Property names cannot start with signal prefix',
        notRestNames.filter(name => startsWith(name, signalPrefix)),
      );
    }
  }

  if (notRestProperties.length) {
    const defaultValues = transformProperty(path, notRestProperties, TRANSFORM_PROPERTY_NAME);
    buildDefaultValue(path, defaultValues);
  }
  if (restProperties) {
    transformRestProperties(path, restProperties, notRestNames);
  }
}
