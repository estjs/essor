import type { NodePath, types as t } from '@babel/core';

/**
 * Checks whether a function body returns JSX.
 */
export function checkHasJSXReturn(
  path: NodePath<t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression>,
): boolean {
  if (path.isArrowFunctionExpression()) {
    const body = path.get('body');
    if (body.isJSXElement() || body.isJSXFragment()) {
      return true;
    }
  }

  let found = false;

  path.traverse({
    /**
     * Stops once a JSX-returning branch is found.
     */
    ReturnStatement(returnPath) {
      const argumentPath = returnPath.get('argument');
      if (argumentPath.isJSXElement() || argumentPath.isJSXFragment()) {
        found = true;
        returnPath.stop();
      }
    },
    /**
     * Skips nested functions so only the current function body is inspected.
     */
    Function(functionPath) {
      if (functionPath.node !== path.node) {
        functionPath.skip();
      }
    },
  });

  return found;
}
