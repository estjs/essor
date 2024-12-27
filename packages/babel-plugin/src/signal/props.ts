import { startsWith } from '@aube/shared';
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

/**
 * Replaces the properties of a function's first parameter with new names.
 *
 *  auto replace pattern to props object
 *
 *  rule1:  function argument
 *  rule2: first argument is object and it pattern
 *  rule3: function has return
 *
 * transform case
 *    case1  ({a, b}) => <div>{a.value}</div>  to=> (_props)=><div>{_props.a.value}</div>
 *    case2  ({a, b, ...rest}) => <div>{a.value}{rest}</div>  to=> (_props)=> {const restProps = useReactive(props,[a,b]);return <div>{_props.a.value}{reset}</div>}
 *
 * not transform case
 *    case1 ([a,b])=> <div>{a.value}</div>
 *    case2 ({a.,b}) ={}
 *
 * @param {NodePath<FunctionDeclaration | ArrowFunctionExpression>} path - The path to the function node.
 * @return {void}
 */
export function replaceProps(path: NodePath<FunctionDeclaration | ArrowFunctionExpression>) {
  const state: State = path.state;
  const firstParam = path.node.params[0];

  if (!firstParam || !t.isObjectPattern(firstParam)) return;

  const returnStatement = path
    .get('body')
    .get('body')
    .find(statement => statement.isReturnStatement());

  if (!returnStatement || !t.isJSXElement((returnStatement.node as any)?.argument)) return;

  const replaceProperties = (properties: (ObjectProperty | RestElement)[], parentPath: string) => {
    properties.forEach(property => {
      if (t.isObjectProperty(property) && t.isIdentifier(property.key)) {
        const keyName = property.key.name;
        if (t.isIdentifier(property.value)) {
          path.scope.rename(property.value.name, `${parentPath}${keyName}`);
        } else if (t.isObjectPattern(property.value)) {
          replaceProperties(property.value.properties, `${parentPath}${keyName}.`);
        }
      }
    });
  };

  const properties = firstParam.properties;
  const notRestProperties = properties.filter(
    property => !t.isRestElement(property),
  ) as ObjectProperty[];
  replaceProperties(notRestProperties, '__props.');

  const notRestNames = notRestProperties.map(property => (property.key as Identifier).name);
  if (__DEV__ && notRestNames.some(name => startsWith(name, '$'))) {
    console.warn('props name can not start with $');
    return;
  }

  handleRestElement(path, state, properties, notRestNames);
}

function handleRestElement(path, state: State, properties, notRestNames) {
  const restElement = properties.find(property => t.isRestElement(property)) as
    | RestElement
    | undefined;
  path.node.params[0] = t.identifier('__props');

  if (restElement) {
    const restName = (restElement.argument as Identifier).name;
    if (notRestNames.length === 0) {
      path.node.params[0] = t.identifier(restName);
    } else {
      const restVariableDeclaration = createRestVariableDeclaration(state, restName, notRestNames);
      imports.add('useReactive');
      (path.node.body as t.BlockStatement).body.unshift(restVariableDeclaration);
    }
  }
}

function createRestVariableDeclaration(state: State, restName: string, notRestNames: string[]) {
  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier(restName),
      t.callExpression(state.useReactive, [
        t.identifier('__props'),
        t.arrayExpression(notRestNames.map(name => t.stringLiteral(name))),
      ]),
    ),
  ]);
}
