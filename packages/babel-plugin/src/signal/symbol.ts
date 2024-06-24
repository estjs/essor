import { types as t } from '@babel/core';
import { type Identifier, type VariableDeclarator, cloneNode } from '@babel/types';
import { startsWith } from 'essor-shared';
import { imports } from '../program';
import type { NodePath } from '@babel/core';
/**
 * 当一个变量/常量声明的时候，判断是否是$(定义的符号）开头，如果是，则进行转换。
 *
 * case 1: let $a = 1 => let $a = useSignal(1);
 * case 2: const $a = ()=>{return $a} => const $a = useComputed(()=>{return $a})
 *
 *  并且所有当前用到的值，都会添加.value
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
    // 处理箭头函数表达式，将其转换为 _computed 调用
    const newInit = t.callExpression(t.identifier(path.state.useComputed.name), init ? [init] : []);
    imports.add('useComputed');
    path.node.init = newInit; // 直接替换 AST 节点
  } else {
    // 判断参数是否是基本数据类型 ，也可能没有参数
    const originalImportDeclarationNodes = cloneNode(path.get('id').node, true);

    const newInit = t.callExpression(t.identifier(path.state.useSignal.name), init ? [init] : []);
    imports.add('useSignal');
    path.node.init = newInit;

    path.scope.rename(variableName, `${variableName}.value`);

    path.get('id').replaceWith(originalImportDeclarationNodes);

    // // 这里需要确保只修改在当前作用域中的变量名
    // path.scope.traverse(path.scope.block, {
    //   Identifier(innerPath) {
    //     if (t.isExportSpecifier(innerPath.parent)) {
    //       const { name } = innerPath.node;
    //       if (name.endsWith('.value')) {
    //         innerPath.node.name = name.slice(0, -6); // 删除 '.value' 部分
    //       }
    //     }
    //   },
    // });
  }
}
