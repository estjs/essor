import { types as t } from '@babel/core';
import { type Identifier, type VariableDeclarator, cloneNode } from '@babel/types';
import { startsWith } from 'essor-shared';
import { imports } from '../program';
import type { NodePath } from '@babel/core';

export function replaceSymbol(path: NodePath<VariableDeclarator>) {
  const init = path.node.init;
  const variableName = (path.node.id as Identifier).name;

  if (t.isObjectPattern(path.node.id) || t.isArrayPattern(path.node.id)) {
    return;
  }

  if (!startsWith(variableName, '$')) {
    return;
  }

  if (
    init &&
    (t.isFunctionExpression(init) || t.isArrowFunctionExpression(init)) &&
    (path.parent as t.VariableDeclaration).kind === 'const'
  ) {
    const newInit = t.callExpression(t.identifier(path.state.useComputed.name), init ? [init] : []);
    imports.add('useComputed');
    path.node.init = newInit;
  } else {
    const originalImportDeclarationNodes = cloneNode(path.get('id').node, true);

    const newInit = t.callExpression(t.identifier(path.state.useSignal.name), init ? [init] : []);
    imports.add('useSignal');
    path.node.init = newInit;

    path.scope.rename(variableName, `${variableName}.value`);

    path.get('id').replaceWith(originalImportDeclarationNodes);
  }
}
