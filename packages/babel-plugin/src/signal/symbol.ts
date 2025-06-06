import { types as t } from '@babel/core';
import { startsWith } from '@estjs/shared';
import { addImport } from '../import';
import type { State } from '../types';
import type { Identifier, VariableDeclarator } from '@babel/types';
import type { NodePath } from '@babel/core';

/**
 *  get the symbol start with
 */
function isSymbolStart(path: NodePath<any>, name: string) {
  const state: State = path.state;
  const { symbol = '$' } = state?.opts || {};

  return startsWith(name, symbol);
}

/**
 * Replaces the symbol in a variable declarator with a computed or signal expression.
 *
 * case 1: let $a = 1 => let $a = signal(1);
 * case 2: const $a = ()=>{return $a} => const $a = computed(()=>{return $a})
 *
 * @param {NodePath<VariableDeclarator>} path - The path to the variable declarator node.
 * @return {void}
 */
export function replaceSymbol(path: NodePath<VariableDeclarator>) {
  const { init, id } = path.node;
  const variableName = (id as Identifier).name;

  if (t.isObjectPattern(id) || t.isArrayPattern(id) || !isSymbolStart(path, variableName)) {
    return;
  }

  const isComputed =
    init &&
    (t.isFunctionExpression(init) || t.isArrowFunctionExpression(init)) &&
    (path.parent as t.VariableDeclaration).kind === 'const';

  const hookName = isComputed ? 'computed' : 'signal';
  const newInit = t.callExpression(
    t.identifier(path.state.imports[hookName].name),
    init ? [init] : [],
  );

  addImport(hookName);
  path.node.init = newInit;
}

export function symbolIdentifier(path) {
  const parentPath = path.parentPath;
  if (!shouldProcessIdentifier(parentPath)) {
    return;
  }

  const { node } = path;
  if (!isSymbolStart(path, node.name)) {
    return;
  }

  if (!path.findParent(p => p.isMemberExpression() && p.node.property.name === 'value')) {
    path.replaceWith(t.memberExpression(t.identifier(node.name), t.identifier('value')));
  }
}

function shouldProcessIdentifier(parentPath) {
  return (
    parentPath &&
    !t.isVariableDeclarator(parentPath) &&
    !t.isImportSpecifier(parentPath) &&
    !t.isObjectProperty(parentPath) &&
    !t.isArrayPattern(parentPath) &&
    !t.isObjectPattern(parentPath)
  );
}

export function symbolObjectPattern(path) {
  path.node.properties.forEach(property => {
    if (
      t.isObjectProperty(property) &&
      t.isIdentifier(property.key) &&
      isSymbolStart(path, property.key.name)
    ) {
      property.key = t.identifier(property.key.name);
    }
  });
}

export function symbolArrayPattern(path) {
  path.node.elements.forEach(element => {
    if (t.isIdentifier(element) && element.name.startsWith('$')) {
      element.name = t.identifier(element.name).name;
    } else if (t.isObjectPattern(element)) {
      symbolObjectPattern({ node: element } as NodePath);
    }
  });
}
