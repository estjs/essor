import { type NodePath, types as t } from '@babel/core';
import { imports } from '../program';
import type {
  ArrowFunctionExpression,
  FunctionDeclaration,
  Identifier,
  ObjectProperty,
  RestElement,
} from '@babel/types';

export function replaceProps(path: NodePath<FunctionDeclaration | ArrowFunctionExpression>) {
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

  const notRestProperties = properties.filter(
    property => !t.isRestElement(property),
  ) as unknown as ObjectProperty[];
  const restElement = properties.find(property => t.isRestElement(property)) as
    | RestElement
    | undefined;

  if (restElement) {
    const restName = (restElement.argument as any).name;
    imports.add('__exclude');

    const restVariableDeclaration = t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(restName),
        t.callExpression(t.identifier(path.state.__exclude.name), [
          t.identifier('__props'),
          t.arrayExpression(
            notRestProperties.map(property => t.stringLiteral((property.key as Identifier).name)),
          ),
        ]),
      ),
    ]);

    (path.node.body as any).body.unshift(restVariableDeclaration);
  }

  path.node.params[0] = t.identifier('__props');
}
