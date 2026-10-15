/**
 * Map-to-For: `{list.map((item, i) => <li/>)}` in JSX children becomes
 * `<For each={list}>{(item, i) => <li/>}</For>`.
 *
 * `each` compiles to a component prop getter (`get each() { return list }`),
 * and For reads it inside its effect, so signals/props in the source are
 * tracked without an extra wrapper. Unsupported shapes are left untouched.
 */
import * as t from '@babel/types';
import type { NodePath } from '@babel/core';

/** `For` resolves to the runtime builtin: unbound, or imported from essor. */
function isRuntimeFor(path: NodePath): boolean {
  const binding = path.scope.getBinding('For');
  if (!binding) return true;
  const decl = binding.path.parentPath?.node;
  return (
    binding.kind === 'module' &&
    t.isImportDeclaration(decl) &&
    (decl.source.value === 'essor' || decl.source.value === 'essor/server')
  );
}

function getReturnedElement(node: t.Node): t.JSXElement | t.JSXFragment | null {
  if (t.isJSXElement(node) || t.isJSXFragment(node)) return node;
  if (t.isParenthesizedExpression && t.isParenthesizedExpression(node)) {
    return getReturnedElement(node.expression);
  }
  if (t.isBlockStatement(node)) {
    for (const stmt of node.body) {
      if (t.isReturnStatement(stmt) && stmt.argument) {
        return getReturnedElement(stmt.argument);
      }
    }
  }
  return null;
}

function extractKeyFromElement(element: t.JSXElement): t.Expression | null {
  const attrs = element.openingElement.attributes;
  const keyIdx = attrs.findIndex((attr) => t.isJSXAttribute(attr) && attr.name.name === 'key');
  if (keyIdx === -1) return null;

  const keyAttr = attrs[keyIdx] as t.JSXAttribute;
  attrs.splice(keyIdx, 1);

  if (t.isJSXExpressionContainer(keyAttr.value)) {
    if (t.isJSXEmptyExpression(keyAttr.value.expression)) return null;
    return keyAttr.value.expression;
  } else if (t.isStringLiteral(keyAttr.value)) {
    return keyAttr.value;
  } else if (!keyAttr.value) {
    return t.booleanLiteral(true);
  }
  return null;
}

function extractKeyFromCallback(
  callback: t.ArrowFunctionExpression | t.FunctionExpression,
): t.Expression | null {
  const targetElement = getReturnedElement(callback.body);
  if (!targetElement) return null;

  if (t.isJSXElement(targetElement)) {
    return extractKeyFromElement(targetElement);
  }

  if (t.isJSXFragment(targetElement)) {
    const validChildren = targetElement.children.filter(
      (c) => t.isJSXElement(c) || (t.isJSXText(c) && c.value.trim() !== ''),
    );
    if (validChildren.length === 1 && t.isJSXElement(validChildren[0])) {
      return extractKeyFromElement(validChildren[0]);
    }
  }

  return null;
}

export function transformMapToFor(programPath: NodePath<t.Program>): void {
  programPath.traverse({
    JSXExpressionContainer(path) {
      // Children only: an attribute value cannot hold a <For> element.
      if (!path.parentPath.isJSXElement() && !path.parentPath.isJSXFragment()) return;

      const expr = path.node.expression;
      if (!t.isCallExpression(expr) || expr.arguments.length !== 1) return;

      const { callee } = expr;
      if (
        !t.isMemberExpression(callee) ||
        callee.computed ||
        !t.isIdentifier(callee.property, { name: 'map' }) ||
        !t.isExpression(callee.object)
      ) {
        return;
      }

      // For renders rows synchronously with (item, index) only.
      const callback = expr.arguments[0];
      if (!t.isArrowFunctionExpression(callback) && !t.isFunctionExpression(callback)) return;
      if (callback.async || callback.generator || callback.params.length > 2) return;
      if (!isRuntimeFor(path)) return;

      const keyExpr = extractKeyFromCallback(callback);

      const forAttrs: (t.JSXAttribute | t.JSXSpreadAttribute)[] = [
        t.jsxAttribute(t.jsxIdentifier('each'), t.jsxExpressionContainer(callee.object)),
      ];

      if (keyExpr) {
        const prelude: t.Statement[] = [];
        if (t.isBlockStatement(callback.body)) {
          for (const stmt of callback.body.body) {
            if (t.isReturnStatement(stmt)) break;
            prelude.push(t.cloneNode(stmt, true));
          }
        }
        const keyBody =
          prelude.length > 0
            ? t.blockStatement([...prelude, t.returnStatement(t.cloneNode(keyExpr, true))])
            : t.cloneNode(keyExpr, true);

        forAttrs.push(
          t.jsxAttribute(
            t.jsxIdentifier('key'),
            t.jsxExpressionContainer(
              t.arrowFunctionExpression(
                callback.params.map((p) => t.cloneNode(p, true)),
                keyBody,
              ),
            ),
          ),
        );
      }

      path.replaceWith(
        t.jsxElement(
          t.jsxOpeningElement(t.jsxIdentifier('For'), forAttrs),
          t.jsxClosingElement(t.jsxIdentifier('For')),
          [t.jsxExpressionContainer(callback)],
        ),
      );
    },
  });
}
