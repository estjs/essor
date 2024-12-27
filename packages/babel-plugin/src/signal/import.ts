import { types as t } from '@babel/core';
import { startsWith } from '@aube/shared';

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
  path.node.specifiers.forEach(specifier => {
    const variableName = specifier.local.name;
    if (startsWith(variableName, '$') && !isVariableUsedAsObject(path, variableName)) {
      path.scope.rename(variableName, `${variableName}.value`);
      specifier.local.name = variableName;
    }
  });
}

/**
 * Checks if a variable is used as an object.
 *
 * @param path - The path to the variable.
 * @param variableName - The name of the variable.
 * @returns {boolean} - Whether the variable is used as an object.
 */
function isVariableUsedAsObject(path, variableName) {
  const binding = path.scope.getBinding(variableName);
  return (
    binding?.referencePaths?.some(referencePath => {
      if (t.isMemberExpression(referencePath.parent)) {
        const { object, property } = referencePath.parent;
        if (t.isIdentifier(object, { name: variableName })) {
          referencePath.parentPath.replaceWith(
            t.memberExpression(t.memberExpression(object, t.identifier('value')), property),
          );
          return true;
        }
      }
      return false;
    }) || false
  );
}
