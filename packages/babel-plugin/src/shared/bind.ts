/**
 * Two-way binding helpers (bind:value, bind:checked, etc.)
 */
import * as t from '@babel/types';
import { collectIdentifiers, unwrapTSWrappers } from '../utils/ast';
import { CompileErrors } from '../utils/errors';

/** Modifier whitelist — keep in sync with runtime */
const ALLOWED_BIND_MODIFIERS = new Set(['trim', 'number', 'lazy']);

/**
 * Validates a tuple `bind:` modifier object literal. Unknown keys throw at
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
      CompileErrors.unknownBindModifier(bindName, key, [...ALLOWED_BIND_MODIFIERS], modifiers);
    }
  }
}

export interface BindTuple {
  value: t.Expression;
  modifiers: t.Expression | null;
}

/**
 * Single source of truth for the `bind:x={[signal, modifiers]}` tuple shape.
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

/**
 * Creates the binding setter arrow function.
 *
 * The bind target must be assignable — an identifier or member expression.
 */
export function createBindingSetter(
  value: t.Expression,
  generateUid: (hint: string) => t.Identifier,
  bindName = 'value',
): t.Expression {
  const target = unwrapTSWrappers(value);

  if (!t.isIdentifier(target) && !t.isMemberExpression(target)) {
    const targetType = t.isOptionalMemberExpression(target)
      ? 'an optional chain (`a?.b`) — optional chains cannot be assignment targets'
      : `a non-assignable ${target.type}`;

    CompileErrors.invalidBindTarget(bindName, targetType, value);
  }

  // Generate a unique parameter name that doesn't conflict with identifiers in the target
  const used = new Set<string>();
  collectIdentifiers(target as t.Node, used);
  let nextValue = generateUid('v');
  while (used.has(nextValue.name)) {
    nextValue = generateUid('v');
  }

  return t.arrowFunctionExpression(
    [nextValue],
    t.assignmentExpression('=', t.cloneNode(target) as t.LVal, nextValue),
  );
}
