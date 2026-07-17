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
 * Transparently unwrap TypeScript-only expression wrappers so `$x as string`,
 * `$x!`, `$x satisfies T` and parenthesized forms resolve to the underlying
 * expression for assignability analysis.
 */
export function unwrapTSWrappers(expr: t.Expression): t.Expression {
  let current = expr;
  while (
    t.isTSAsExpression(current) ||
    t.isTSNonNullExpression(current) ||
    t.isTSSatisfiesExpression(current) ||
    t.isTSTypeAssertion(current) ||
    t.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

// Modifier whitelist — keep in sync with `BindModifiers` in
// `packages/template/src/binding.ts`.
const ALLOWED_BIND_MODIFIERS = new Set(['trim', 'number', 'lazy']);

/**
 * Validates a tuple `bind:` modifier object literal. Unknown keys → throw at
 * compile time so typos like `{ trimm: true }` are caught instead of silently
 * ignored. Dynamic (non-literal) modifier expressions cannot be validated.
 */
export function validateBindModifiers(modifiers: t.Expression, bindName: string): void {
  if (!t.isObjectExpression(modifiers)) return; // dynamic — can't validate
  for (const prop of modifiers.properties) {
    if (!t.isObjectProperty(prop) || prop.computed) continue;
    const key = t.isIdentifier(prop.key)
      ? prop.key.name
      : t.isStringLiteral(prop.key)
        ? prop.key.value
        : null;
    if (key && !ALLOWED_BIND_MODIFIERS.has(key)) {
      throw new Error(
        `[essor] Unknown bind:${bindName} modifier "${key}". Allowed: ${[...ALLOWED_BIND_MODIFIERS].join(', ')}.`,
      );
    }
  }
}

export interface BindTuple {
  value: t.Expression;
  modifiers: t.Expression | null;
}

/**
 * Single source of truth for the `bind:x={[signal, modifiers]}` tuple shape.
 * Client, server and component codegen all consume this — the previous three
 * private copies had drifted (only the client validated modifiers).
 */
export function unwrapBindTuple(raw: t.Expression, bindName: string): BindTuple {
  if (
    t.isArrayExpression(raw) &&
    raw.elements.length === 2 &&
    raw.elements[0] != null &&
    !t.isSpreadElement(raw.elements[0])
  ) {
    const modifiers = raw.elements[1] as t.Expression;
    validateBindModifiers(modifiers, bindName);
    return { value: raw.elements[0] as t.Expression, modifiers };
  }
  return { value: raw, modifiers: null };
}

/** Parameter name for the DOM-provided next value in generated bind setters. */
const BIND_NEXT_VALUE_ID = '_v$';

/**
 * Creates binding setter.
 *
 * The bind target must be assignable — an identifier or (non-optional) member
 * expression, possibly under transparent TS wrappers. Anything else (literal,
 * call result, binary/conditional expression, optional chain) cannot receive
 * the DOM value: emitting a silent no-op setter would leave the binding
 * half-duplex (model→DOM works, DOM→model never fires), which is very hard to
 * debug — fail at compile time instead.
 */
export function createBindingSetter(value: t.Expression, bindName = 'value'): t.Expression {
  const target = unwrapTSWrappers(value);

  if (!t.isIdentifier(target) && !t.isMemberExpression(target)) {
    const kind = t.isOptionalMemberExpression(target)
      ? 'an optional chain (`a?.b`) — optional chains cannot be assignment targets'
      : `a non-assignable ${target.type}`;
    throw new Error(
      `[essor] bind:${bindName} target is ${kind}. ` +
        'Two-way binding requires a writable identifier or member expression ' +
        '(e.g. `bind:value={$text}` or `bind:value={form.name}`).',
    );
  }

  const nextValue = t.identifier(BIND_NEXT_VALUE_ID);
  return t.arrowFunctionExpression(
    [nextValue],
    t.assignmentExpression('=', t.cloneNode(target), nextValue),
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
