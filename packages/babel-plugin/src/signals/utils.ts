import { types as t } from '@babel/core';
import type {
  ArrowFunctionExpression,
  FunctionDeclaration,
  FunctionExpression,
} from '@babel/types';
import type { NodePath } from '@babel/core';

/**
 * Validates if a path and its node are valid
 *
 * @param path - AST node path to validate
 * @returns true if path and node are valid, false otherwise
 */
export function isValidPath(path: NodePath<unknown> | null | undefined): boolean {
  return !!(path && path.node);
}
/**
 * Checks if a node is a JSX element or fragment
 *
 * @param node - AST node to check
 * @returns true if node is JSX element or fragment, false otherwise
 */
export function isJSXNode(node: t.Node | null | undefined): boolean {
  return !!(node && (t.isJSXElement(node) || t.isJSXFragment(node)));
}

/**
 * Checks if an expression might return JSX
 * Handles conditional, logical, and sequence expressions recursively
 *
 * @param expr - Expression to check
 * @returns true if expression might return JSX, false otherwise
 */
export function mightReturnJSX(expr: t.Expression | t.Node): boolean {
  // Direct JSX check
  if (isJSXNode(expr)) {
    return true;
  }

  // Conditional: condition ? <A /> : <B />
  if (t.isConditionalExpression(expr)) {
    return mightReturnJSX(expr.consequent) || mightReturnJSX(expr.alternate);
  }

  // Logical: condition && <A /> or condition || <B />
  if (t.isLogicalExpression(expr)) {
    return mightReturnJSX(expr.left) || mightReturnJSX(expr.right);
  }

  // Sequence: (expr1, expr2, <JSX />)
  if (t.isSequenceExpression(expr)) {
    return expr.expressions.some(mightReturnJSX);
  }

  // Parenthesized: (<JSX />)
  if (t.isParenthesizedExpression(expr)) {
    return mightReturnJSX(expr.expression);
  }

  return false;
}

/**
 * Checks if a function returns JSX elements
 *
 * Only functions that return JSX need props transformation. This function
 * performs a comprehensive check to detect JSX returns in various scenarios.
 *
 * @param path - Function node path to analyze
 * @returns true if function returns JSX element or JSX fragment, false otherwise
 * @throws Never throws - returns false on any error
 *
 * @example
 * ```typescript
 * // Returns true
 * function Component() { return <div />; }
 * const Component = () => <div />;
 * const Component = () => { return <div />; };
 * const Component = () => condition ? <div /> : <span />;
 *
 * // Returns false
 * function helper() { return 'string'; }
 * const compute = () => 42;
 * const Component = () => { console.log('no return'); };
 * ```
 */
export function checkHasJSXReturn(
  path: NodePath<FunctionDeclaration | ArrowFunctionExpression | FunctionExpression>,
): boolean {
  if (!isValidPath(path)) return false;

  try {
    const body = path.get('body');
    if (!isValidPath(body)) return false;

    // if the body is not a block statement, check if it might return JSX
    if (!t.isBlockStatement(body.node)) {
      return mightReturnJSX(body.node);
    }

    // check if the body has a return statement that returns JSX
    let hasJSX = false;
    body.traverse({
      'ReturnStatement': function (returnPath) {
        if (!hasJSX && returnPath.node.argument && mightReturnJSX(returnPath.node.argument)) {
          hasJSX = true;
          returnPath.stop();
        }
      },
      'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression': nestedPath => {
        nestedPath.skip();
      },
    });

    return hasJSX;
  } catch {
    return false;
  }
}
/**
 * Checks if a member expression is accessing a specific property
 *
 * @param node - Member expression node
 * @param propertyName - Property name to check
 * @returns true if the member expression accesses the specified property
 */
export function isMemberAccessingProperty(node: t.MemberExpression, propertyName: string): boolean {
  if (t.isIdentifier(node.property) && node.property.name === propertyName) {
    return true;
  }

  if (node.computed && t.isStringLiteral(node.property) && node.property.value === propertyName) {
    return true;
  }

  return false;
}
