import { startsWith } from 'essor-shared';
import { type NodePath, types as t } from '@babel/core';
import { imports } from '../program';
import type { State } from '../types';
import type {
  ArrowFunctionExpression,
  FunctionDeclaration,
  Identifier,
  ObjectProperty,
  RestElement,
} from '@babel/types';

export function replaceProps(path: NodePath<FunctionDeclaration | ArrowFunctionExpression>) {
  const state: State = path.state;

  const firstParam = path.node.params[0];

  if (!firstParam || !t.isObjectPattern(firstParam)) {
    return;
  }

  const returnStatement = path
    .get('body')
    .get('body')
    .find(statement => statement.isReturnStatement());

  if (!returnStatement) {
    return;
  }

  const returnValue = (returnStatement.node as any)?.argument;
  if (!t.isJSXElement(returnValue)) {
    return;
  }

  function replaceProperties(properties: (ObjectProperty | RestElement)[], parentPath: string) {
    properties.forEach(property => {
      if (t.isObjectProperty(property)) {
        const keyName = (property.key as Identifier).name;

        if (t.isIdentifier(property.value)) {
          const propertyName = property.value.name;
          const newName = `${parentPath}${keyName}`;
          path.scope.rename(propertyName, newName);
        } else if (t.isObjectPattern(property.value)) {
          replaceProperties(property.value.properties, `${parentPath}${keyName}.`);
        }
      }
    });
  }

  const properties = firstParam.properties;
  replaceProperties(
    properties.filter(property => !t.isRestElement(property)),
    '__props.',
  );
  const notRestProperties = properties.filter(property => !t.isRestElement(property));
  const notRestNames = notRestProperties.map(
    property => ((property as ObjectProperty).key as Identifier).name,
  );
  if (__DEV__ && notRestNames.some(name => startsWith(name, '$'))) {
    console.warn('props name can not start with $');
    return;
  }

  const restElement = properties.find(property => t.isRestElement(property)) as
    | RestElement
    | undefined;
  path.node.params[0] = t.identifier('__props');

  if (restElement) {
    const restName = (restElement.argument as any).name;
    if (notRestProperties.length === 0) {
      path.node.params[0] = t.identifier(restName);
    } else {
      const restVariableDeclaration = t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier(restName),
          t.callExpression(state.useReactive, [
            t.identifier('__props'),
            t.arrayExpression(notRestNames.map(name => t.stringLiteral(name))),
          ]),
        ),
      ]);
      imports.add('useReactive');

      (path.node.body as any).body.unshift(restVariableDeclaration);
    }
  }
}
