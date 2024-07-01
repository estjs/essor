import { types as t } from '@babel/core';
import { startsWith } from 'essor-shared';
import { imports } from '../program';
import type { Identifier, VariableDeclarator } from '@babel/types';
import type { NodePath } from '@babel/core';

/**
 * 当一个变量/常量声明的时候，判断是否是$(定义的符号）开头，如果是，则进行转换。
 *
 * case 1: let $a = 1 => let $a = useSignal(1);
 * case 2: const $a = ()=>{return $a} => const $a = useComputed(()=>{return $a})
 *
 * 并且所有当前用到的值，都会添加.value
 * @param path
 * @returns {void}
 */
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
    const newInit = t.callExpression(t.identifier(path.state.useSignal.name), init ? [init] : []);
    imports.add('useSignal');
    path.node.init = newInit;
  }
}

export function symbolIdentifier(path) {
  // 忽略变量声明和导入声明
  if (
    path.parentPath.isVariableDeclarator() ||
    path.parentPath.isImportSpecifier() ||
    path.parentPath.isObjectProperty() ||
    path.parentPath.isArrayPattern() ||
    path.parentPath.isObjectPattern()
  ) {
    return;
  }

  const { node } = path;

  if (node.name.startsWith('$')) {
    const uniqueId = path.scope.generateUidIdentifierBasedOnNode(node, '$');
    path.scope.rename(node.name, uniqueId.name);

    const newNode = t.memberExpression(t.identifier(uniqueId.name), t.identifier('value'));
    path.replaceWith(newNode);
  }
}

export function symbolObjectPattern(path) {
  path.node.properties.forEach(property => {
    if (
      t.isObjectProperty(property) &&
      t.isIdentifier(property.key) &&
      property.key.name.startsWith('$')
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
          property.key.name.startsWith('$')
        ) {
          const newKey = t.identifier(property.key.name);
          property.key = newKey;
        }
      });
    }
  });
}
