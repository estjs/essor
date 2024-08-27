
import { type NodePath, types as t } from '@babel/core';
import { startsWith } from "@essor/shared";
import type { ImportDeclaration } from '@babel/types';

/**
 * Replaces import declarations
 *
 *  case1: import { $a } from 'a';console.log(a)  =>  import { $a } from 'a';console.log($a.value)
 *  case2: import $a from 'a';console.log(a)  =>  import $a from 'a';console.log($a.value)
 *
 * @param {object} path - The path to replace import declarations.
 * @return {void}
 */
export function replaceImportDeclaration(path) {
  const imports = path.node.specifiers;
  imports.forEach(specifier => {
    const variableName = specifier.local.name;

    if (startsWith(variableName, '$') && !isVariableUsedAsObject(path, variableName)) {
      path.scope.rename(variableName, `${variableName}.value`);
      specifier.local.name = `${variableName}`;
    }
  });
}
function isVariableUsedAsObject(path, variableName) {
  const binding = path.scope.getBinding(variableName);
  let isUsedObject = false;

  if (!binding || !binding.referencePaths) {
    return isUsedObject;
  }

  for (const referencePath of binding.referencePaths) {
    if (t.isMemberExpression(referencePath.parent)) {
      const memberExprParent = referencePath.parent;

      if (t.isIdentifier(memberExprParent.object, { name: variableName })) {
        const newMemberExpr = t.memberExpression(
          t.memberExpression(memberExprParent.object, t.identifier('value')),
          memberExprParent.property,
        );
        referencePath.parentPath.replaceWith(newMemberExpr);
        isUsedObject = true;
      }
    }
  }

  return isUsedObject;
}
