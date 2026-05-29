/**
 * Component-props preprocessor.
 *
 * Rewrites JSX component parameter destructuring into reactive `__props`
 * accessors, hoisting default values and rest parameters to the function body.
 *
 * Example:
 *   function C({ title, count = 0, ...rest }) { return <div>{title}</div>; }
 * becomes:
 *   function C(__props) {
 *     __props = resolveDefaultProps(__props, { count: 0 });
 *     const rest = omitProps(__props, ['title', 'count']);
 *     return <div>{__props.title}</div>;
 *   }
 */

import { type NodePath, types as t } from '@babel/core';
import { isPlainObject, startsWith, warn } from '@estjs/shared';
import { TRANSFORM_PROPERTY_NAME, importMap } from '../constants';
import { getCompileContext, useImport } from '../context';
import { checkHasJSXReturn } from '../ast-utils';
import type {
  ArrowFunctionExpression,
  FunctionDeclaration,
  ObjectProperty,
  RestElement,
} from '@babel/types';

/**
 * Recursive default-values tree: a leaf is a Babel expression, a branch is a
 * nested object (one per nested destructuring pattern).
 */
type DefaultValueTree = { [key: string]: t.Expression | DefaultValueTree };

/**
 * Recursively rewrites destructured property references to `__props.*` access
 * and collects default values. Supports nested patterns, aliases, and defaults.
 */
function transformProperty(
  path: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression>,
  properties: (t.ObjectProperty | t.RestElement)[],
  parentPath: string,
  defaults: DefaultValueTree = {},
): DefaultValueTree {
  for (const property of properties) {
    if (!t.isObjectProperty(property)) continue;

    const key = property.key;
    const keyName = t.isIdentifier(key) ? key.name : t.isStringLiteral(key) ? key.value : '';
    if (!keyName) continue;

    const value = property.value;
    const childPath = `${parentPath}.${keyName}`;

    if (t.isAssignmentPattern(value)) {
      const left = value.left;
      if (t.isIdentifier(left)) {
        defaults[keyName] = value.right;
        path.scope.rename(left.name, childPath);
      } else if (t.isObjectPattern(left)) {
        transformProperty(path, left.properties, childPath, defaults);
        defaults[keyName] = value.right;
      }
    } else if (t.isIdentifier(value)) {
      path.scope.rename(value.name, childPath);
    } else if (t.isObjectPattern(value)) {
      const nested: DefaultValueTree = {};
      transformProperty(path, value.properties, childPath, nested);
      if (Object.keys(nested).length > 0) defaults[keyName] = nested;
    }
  }

  return defaults;
}

/**
 * Builds `const name = omitProps(sourceObject, [excluded...])`, or
 * `const name = sourceObject` when there's nothing to exclude.
 */
function buildRestVariableDeclaration(
  restName: string,
  parentPath: string,
  excludeProps: string[],
): t.VariableDeclaration {
  const validExcludeProps = excludeProps.filter(Boolean);

  // Build source from dotted path, e.g. '__props' → __props, '__props.user' → __props.user.
  const pathParts = parentPath.split('.').filter(Boolean);
  let sourceObject: t.Expression = t.identifier(pathParts[0] || '__props');
  for (let i = 1; i < pathParts.length; i++) {
    sourceObject = t.memberExpression(sourceObject, t.identifier(pathParts[i]));
  }

  const init: t.Expression =
    validExcludeProps.length === 0
      ? sourceObject
      : t.callExpression(useImport(importMap.omitProps), [
          sourceObject,
          t.arrayExpression(validExcludeProps.map((name) => t.stringLiteral(name))),
        ]);

  return t.variableDeclaration('const', [t.variableDeclarator(t.identifier(restName), init)]);
}

/**
 * Emits rest-parameter variable declarations at the top of the function body
 * (or, when the first parameter was a pure `{ ...rest }` pattern, substitutes
 * the rest identifier directly in the parameter slot).
 */
function transformRestProperties(
  path: NodePath<FunctionDeclaration | ArrowFunctionExpression>,
  restProperties: RestElement,
  notRestNames: string[] = [],
): void {
  if (!t.isIdentifier(restProperties.argument)) return;
  const restName = restProperties.argument.name;

  if (notRestNames.length === 0) {
    path.node.params[0] = t.identifier(restName);
    return;
  }

  const declaration = buildRestVariableDeclaration(restName, TRANSFORM_PROPERTY_NAME, notRestNames);

  const body = path.node.body as t.BlockStatement;
  body.body.unshift(declaration);
}

/**
 * Serializes a collected {@link DefaultValueTree} into a Babel object expression.
 */
function buildDefaultValueObject(defaults: DefaultValueTree): t.ObjectExpression {
  if (!isPlainObject(defaults)) return t.objectExpression([]);

  const properties: t.ObjectProperty[] = [];
  for (const [key, value] of Object.entries(defaults)) {
    if (!key) continue;

    let propertyValue: t.Expression;
    if (isPlainObject(value) && !t.isNode(value)) {
      propertyValue = buildDefaultValueObject(value as DefaultValueTree);
    } else if (t.isExpression(value)) {
      propertyValue = value;
    } else {
      continue;
    }

    properties.push(t.objectProperty(t.identifier(key), propertyValue));
  }
  return t.objectExpression(properties);
}

/**
 * Inserts a runtime default-props resolution call at the top of the function
 * body and renames the first parameter to `__props`.
 */
function buildDefaultValue(
  path: NodePath<FunctionDeclaration | ArrowFunctionExpression>,
  defaults: DefaultValueTree,
): void {
  path.node.params[0] = t.identifier(TRANSFORM_PROPERTY_NAME);

  if (Object.keys(defaults).length === 0) return;

  const resolveDefaultProps = useImport(importMap.resolveDefaultProps);
  const body = t.isBlockStatement(path.node.body)
    ? path.node.body
    : t.blockStatement([t.returnStatement(path.node.body)]);

  path.node.body = body;
  body.body.unshift(
    t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.identifier(TRANSFORM_PROPERTY_NAME),
        t.callExpression(resolveDefaultProps, [
          t.identifier(TRANSFORM_PROPERTY_NAME),
          buildDefaultValueObject(defaults),
        ]),
      ),
    ),
  );
}

/**
 * Transforms a JSX component function's first object-pattern parameter into
 * a reactive `__props` accessor, hoisting defaults and rest properties.
 *
 * Preconditions: the function must return JSX and its first parameter must
 * be an object pattern. Otherwise this is a no-op.
 */
export function transformFnProps(
  path: NodePath<FunctionDeclaration | ArrowFunctionExpression>,
): void {
  const firstParam = path.node.params[0];
  if (!firstParam || !t.isObjectPattern(firstParam) || !checkHasJSXReturn(path)) return;

  const ctx = getCompileContext();
  const properties = firstParam.properties as ObjectProperty[];
  const signalPrefix = ctx.options.signalPrefix || '$';

  const notRestProperties = properties.filter((prop) => !t.isRestElement(prop)) as ObjectProperty[];
  const restProperties = properties.find((prop) => t.isRestElement(prop)) as
    | RestElement
    | undefined;
  const notRestNames = notRestProperties
    .map((prop) => (t.isIdentifier(prop.key) ? prop.key.name : null))
    .filter((name): name is string => name !== null);

  const signalConflicts = notRestNames.filter((name) => startsWith(name, signalPrefix));
  if (signalConflicts.length > 0) {
    warn('transformProps', 'Property names cannot start with signal prefix', signalConflicts);
  }

  if (notRestProperties.length > 0) {
    const defaults = transformProperty(path, notRestProperties, TRANSFORM_PROPERTY_NAME);
    if (restProperties) transformRestProperties(path, restProperties, notRestNames);
    buildDefaultValue(path, defaults);
    return;
  }

  buildDefaultValue(path, {});
  if (restProperties) transformRestProperties(path, restProperties, notRestNames);
}

/**
 * Visitor map for props transforms. Reference directly in merged traversals
 * instead of through `transformProps` to avoid an extra `path.traverse` call.
 */
export const propsVisitors = {
  FunctionDeclaration: transformFnProps,
  ArrowFunctionExpression: transformFnProps,
} as const;

/**
 * Applies props-parameter rewriting across the current program.
 */
export function transformProps(path: NodePath<t.Program>): void {
  path.traverse(propsVisitors);
}
