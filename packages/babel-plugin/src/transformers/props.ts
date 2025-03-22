import { startsWith } from '@estjs/shared';
import { type NodePath, types as t } from '@babel/core';
import { addImport, importObject } from '../import';
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
 * Check if function returns a JSX element
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
 * Recursively replace properties in object destructuring
 * @param context - Property transformation context
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

/**
 * Create variable declaration for rest parameters
 * @param state - Babel state
 * @param restName - Rest parameter name
 * @param excludeProps - List of property names to exclude
 */
function createRestVariableDeclaration(
  state: State,
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
 * Handle rest parameters
 * @param path - Function node path
 * @param state - Babel state
 * @param properties - All properties
 * @param notRestNames - List of non-rest property names
 */
function handleRestElement(
  path: NodePath<FunctionDeclaration | ArrowFunctionExpression>,
  state: State,
  properties: (ObjectProperty | RestElement)[],
  notRestNames: string[],
): void {
  const restElement = properties.find(prop => t.isRestElement(prop)) as RestElement | undefined;
  path.node.params[0] = t.identifier('__props');

  if (!restElement) {
    return;
  }

  const restName = (restElement.argument as Identifier).name;
  if (notRestNames.length === 0) {
    path.node.params[0] = t.identifier(restName);
  } else {
    const restDeclaration = createRestVariableDeclaration(state, restName, notRestNames);
    addImport(importObject.reactive);
    (path.node.body as t.BlockStatement).body.unshift(restDeclaration);
  }
}

/**
 * Transform function parameters to reactive properties
 * @param path - Function node path
 */
export function replaceProps(path: NodePath<FunctionDeclaration | ArrowFunctionExpression>): void {
  const firstParam = path.node.params[0];

  // Quick validation
  if (!firstParam || !t.isObjectPattern(firstParam) || !hasJSXReturn(path)) {
    return;
  }

  const state: State = path.state;
  const properties = firstParam.properties;
  const notRestProperties = properties.filter(prop => !t.isRestElement(prop)) as ObjectProperty[];

  // Validate property names
  const notRestNames = notRestProperties.map(prop => (prop.key as Identifier).name);
  if (__DEV__ && notRestNames.some(name => startsWith(name, '$'))) {
    console.warn('Props name cannot start with $');
    return;
  }

  // Replace properties
  replaceObjectProperties({
    path,
    properties: notRestProperties,
    parentPath: '__props.',
  });

  // Handle rest parameters
  handleRestElement(path, state, properties, notRestNames);
}
