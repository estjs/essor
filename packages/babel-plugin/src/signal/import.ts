import { type NodePath, types as t } from '@babel/core';
import type { ImportDeclaration } from '@babel/types';

function isVariableUsedAsObject(path: NodePath<ImportDeclaration>, variableName: string) {
  const binding = path.scope.getBinding(variableName);
  let isUsedObject = false;
  if (!binding || !binding.referencePaths) {
    return isUsedObject;
  }

  for (const referencePath of binding.referencePaths) {
    if (t.isMemberExpression(referencePath.parent)) {
      //   const memberExprParent = referencePath.parent;

      //   if (memberExprParent.object && memberExprParent.property) {
      //     const newMemberExpr = t.memberExpression(
      //       memberExprParent.object,
      //       t.identifier(`${(memberExprParent.property as t.Identifier).name}.value`),
      //     );
      //     referencePath.parentPath?.replaceWith(newMemberExpr);
      isUsedObject = true;
      // }
    }
  }

  return isUsedObject;
}
// TODO: 暂时不支持对象
export function replaceImportDeclaration(path: NodePath<ImportDeclaration>) {
  const imports = path.node.specifiers;
  imports.forEach(specifier => {
    const variableName = specifier.local.name;

    if (variableName.indexOf('$') === 0 && !isVariableUsedAsObject(path, variableName)) {
      path.scope.rename(variableName, `${variableName}.value`);
      specifier.local.name = `${variableName}`;
    }
  });
}
