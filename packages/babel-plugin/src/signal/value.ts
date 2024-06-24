import { type NodePath, types as t } from '@babel/core';
import type { MemberExpression } from '@babel/types';

export function symbolAddValue(path: NodePath<MemberExpression>) {
  const { node } = path;

  if (t.isIdentifier(node.object) && node.object.name.startsWith('$')) {
    // Replace the identifier with a MemberExpression
    const newValue = t.memberExpression(t.identifier(node.object.name), t.identifier('value'));

    path.replaceWith(newValue);
  }
}
