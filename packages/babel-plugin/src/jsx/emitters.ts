import { types as t } from '@babel/core';

export type PatchHelperName = 'patchAttr' | 'patchClass' | 'patchStyle';

export interface PatchCallOptions {
  includePreviousValuePlaceholder?: boolean;
  previousValue?: t.Expression | null;
  nextValue?: t.Expression;
  isSVG?: boolean;
}

/**
 * Returns patch helper.
 */
export function getPatchHelper(attrName: string): {
  helper: PatchHelperName;
  name: string;
} {
  if (attrName === 'class') return { helper: 'patchClass', name: 'class' };
  if (attrName === 'style') return { helper: 'patchStyle', name: 'style' };
  return { helper: 'patchAttr', name: attrName };
}

/**
 * Creates patch call.
 */
export function createPatchCall(
  importFn: (name: PatchHelperName) => t.Identifier,
  target: t.Expression,
  attrName: string,
  value: t.Expression,
  options: PatchCallOptions = {},
): t.CallExpression {
  const { helper, name } = getPatchHelper(attrName);
  const nextValue = options.nextValue ?? value;
  const isAttr = helper === 'patchAttr';

  // `patchClass(el, prev, next, isSVG)` takes the SVG flag as a 4th positional
  // arg, so `prev` must be present for the flag to land in the right slot.
  const emitSVGFlag = helper === 'patchClass' && options.isSVG === true;

  const args: t.Expression[] = isAttr ? [target, t.stringLiteral(name)] : [target];

  if (options.previousValue != null || options.includePreviousValuePlaceholder || emitSVGFlag) {
    args.push(options.previousValue ?? t.identifier('undefined'));
  }

  args.push(nextValue);

  if (emitSVGFlag) {
    args.push(t.booleanLiteral(true));
  }

  return t.callExpression(importFn(helper), args);
}

/**
 * Creates ref expression.
 */
export function createRefExpression(target: t.Expression, value: t.Expression): t.Expression {
  return t.callExpression(
    t.arrowFunctionExpression(
      [t.identifier('_r$')],
      t.conditionalExpression(
        t.binaryExpression(
          '===',
          t.unaryExpression('typeof', t.identifier('_r$')),
          t.stringLiteral('function'),
        ),
        t.callExpression(t.identifier('_r$'), [target]),
        t.assignmentExpression(
          '=',
          t.memberExpression(t.identifier('_r$'), t.identifier('value')),
          target,
        ),
      ),
    ),
    [value],
  );
}

/**
 * Creates binding setter.
 */
export function createBindingSetter(value: t.Expression, nextValueName = '_v$'): t.Expression {
  const nextValue = t.identifier(nextValueName);
  return t.arrowFunctionExpression(
    [nextValue],
    t.isIdentifier(value) || t.isMemberExpression(value)
      ? t.assignmentExpression('=', t.cloneNode(value), nextValue)
      : nextValue,
  );
}

/**
 * Creates effect key.
 */
export function createEffectKey(attrName: string, index: number): string {
  if (attrName === 'class') return `c${index}`;
  if (attrName === 'style') return `s${index}`;
  return `a${index}`;
}

/**
 * Creates spread effect key.
 */
export function createSpreadEffectKey(index: number): string {
  return `sp${index}`;
}
