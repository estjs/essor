import { types as t } from '@babel/core';
import { imports } from '../program';
import { isSymbolStart } from '../shared';
import type { Identifier, VariableDeclarator } from '@babel/types';
import type { NodePath } from '@babel/core';

/**
 * Replaces the symbol in a variable declarator with a computed or signal expression.
 *
 * case 1: let $a = 1 => let $a = useSignal(1);
 * case 2: const $a = ()=>{return $a} => const $a = useComputed(()=>{return $a})
 *
 * @param {NodePath<VariableDeclarator>} path - The path to the variable declarator node.
 * @return {void}
 */
export function replaceSymbol(path: NodePath<VariableDeclarator>) {
  const init = path.node.init;

  const variableName = (path.node.id as Identifier).name;

  if (t.isObjectPattern(path.node.id) || t.isArrayPattern(path.node.id)) {
    return;
  }

  if (!isSymbolStart(path, variableName)) {
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
    const newInit = t.callExpression(t.identifier(path.state.useSignal.name), init ? [init] : []);
    imports.add('useSignal');
    path.node.init = newInit;
  }
}

export function symbolIdentifier(path) {
  const parentPath = path.parentPath;

  if (
    !parentPath ||
    t.isVariableDeclarator(parentPath) ||
    t.isImportSpecifier(parentPath) ||
    t.isObjectProperty(parentPath) ||
    t.isArrayPattern(parentPath) ||
    t.isObjectPattern(parentPath)
  ) {
    return;
  }

  const { node } = path;

  if (isSymbolStart(path, node.name)) {
    // check is has .value
    let currentPath = path;
    while (currentPath.parentPath && !currentPath.parentPath.isProgram()) {
      if (
        currentPath.parentPath.isMemberExpression() &&
        currentPath.parentPath.node.property.name === 'value'
      ) {
        return;
      }
      currentPath = currentPath.parentPath;
    }

    // add with .value
    const newNode = t.memberExpression(t.identifier(node.name), t.identifier('value'));

    path.replaceWith(newNode);
  }
}

export function symbolObjectPattern(path) {
  path.node.properties.forEach(property => {
    if (
      t.isObjectProperty(property) &&
      t.isIdentifier(property.key) &&
      isSymbolStart(path, property.key.name)
    ) {
      const newKey = t.identifier(property.key.name);
      property.key = newKey;
    }
  });
}

export function symbolArrayPattern(path) {
  path.node.elements.forEach(element => {
    if (t.isIdentifier(element) && element.name.startsWith('$')) {
      const newElement = t.identifier(element.name);
      element.name = newElement.name;
    } else if (t.isObjectPattern(element)) {
      element.properties.forEach(property => {
        if (
          t.isObjectProperty(property) &&
          t.isIdentifier(property.key) &&
          isSymbolStart(path, property.key.name)
        ) {
          const newKey = t.identifier(property.key.name);
          property.key = newKey;
        }
      });
    }
  });
}
