import { startsWith, warn } from '@estjs/shared';
import { type NodePath, types as t } from '@babel/core';
import type { State } from '../types';
import type {
  ArrowFunctionExpression,
  FunctionDeclaration,
  Identifier,
  ObjectProperty,
  RestElement,
} from '@babel/types';

interface PropertyTransformContext {
  path: NodePath<FunctionDeclaration | ArrowFunctionExpression>;
  parentPath: string;
  properties: (ObjectProperty | RestElement)[];
}
/**
 * Check if a function returns a JSX element
 * @param path - Function node path
 * @returns boolean
 */
function hasJSXReturn(path: NodePath<FunctionDeclaration | ArrowFunctionExpression>): boolean {
  const body = path.get('body');
  const returnStatement = t.isBlockStatement(body.node)
    ? body.get('body').find(statement => statement.isReturnStatement())
    : body;

  return !!returnStatement && t.isJSXElement((returnStatement.node as any)?.argument);
}

/**
 * Recursively replace object destructuring properties
 */
function replaceObjectProperties({ path, properties, parentPath }: PropertyTransformContext): void {
  properties.forEach(property => {
    if (!t.isObjectProperty(property) || !t.isIdentifier(property.key)) {
      return;
    }

    const keyName = property.key.name;
    if (t.isIdentifier(property.value)) {
      path.scope.rename(property.value.name, `${parentPath}${keyName}`);
    } else if (t.isObjectPattern(property.value)) {
      replaceObjectProperties({
        path,
        properties: property.value.properties,
        parentPath: `${parentPath}${keyName}.`,
      });
    }
  });
}

// Optimized rest parameter handling
function handleRestElement(params): void {
  const { path, state, properties, excludedProps } = params;
  const restElement = properties.find(t.isRestElement);

  if (!restElement) {
    return;
  }

  const restName = (restElement.argument as Identifier).name;
  path.node.params[0] = t.identifier('__props');

  if (excludedProps.length > 0) {
    // create exclude props object
    const excludeObject = t.objectExpression(
      excludedProps.map(name =>
        t.objectProperty(t.identifier(name), t.identifier(`__props.${name}`)),
      ),
    );

    const declaration = t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(restName),
        t.callExpression(state.imports.reactive, [excludeObject]),
      ),
    ]);
    (path.get('body') as NodePath<t.BlockStatement>).unshiftContainer('body', declaration);
  }
}

/**
 * Transform function parameters into reactive properties
 * @param path - Function node path
 */
export function transformProps(
  path: NodePath<FunctionDeclaration | ArrowFunctionExpression>,
): void {
  const firstParam = path.node.params[0];

  // Quick validation conditions
  if (!firstParam || !t.isObjectPattern(firstParam) || !hasJSXReturn(path)) {
    return;
  }

  const state: State = path.state;
  const properties = firstParam.properties;
  const notRestProperties = properties.filter(prop => !t.isRestElement(prop)) as ObjectProperty[];

  // Validate property names
  const notRestNames = notRestProperties.map(prop => (prop.key as Identifier).name);
  if (__DEV__ && notRestNames.some(name => startsWith(name, '$'))) {
    warn('Props name cannot start with $');
    return;
  }

  // Replace properties
  replaceObjectProperties({
    path,
    properties: notRestProperties,
    parentPath: '__props.',
  });

  // Handle rest parameters
  handleRestElement({ path, state, properties, excludedProps: notRestNames });
}
