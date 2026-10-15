/**
 * Spread attribute handling for JSX elements.
 *
 * When a JSX element has multiple props and spreads, we need to merge them
 * in source order to correctly handle overrides:
 *
 * ```jsx
 * <div class="default" {...spread} class="override" />
 * // Result: class depends on order - later props override earlier ones
 * ```
 *
 * This module builds a single merged object expression that preserves source order.
 */
import * as t from '@babel/types';
import { SPECIAL_PROPS } from '../constants';
import type { IRElement, IRProps } from '../core/types';

/**
 * Identifier validation regex: must start with letter/underscore/$,
 * followed by alphanumeric/underscore/$.
 */
const VALID_IDENTIFIER_PATTERN = /^[a-z_$][\w$]*$/i;

/**
 * Union type representing different kinds of prop parts in source order.
 * Each part tracks its original order so we can merge correctly.
 */
type SpreadPart =
  /** Static prop with compile-time known value */
  | { kind: 'static'; order: number; name: string; value: string | boolean | null | t.Expression }
  /** Dynamic prop with runtime expression value */
  | { kind: 'dynamic'; order: number; name: string; value: t.Expression }
  /** Event handler (onClick, onInput, etc.) */
  | { kind: 'event'; order: number; name: string; value: t.Expression }
  /** Spread operator {...expr} */
  | { kind: 'spread'; order: number; value: t.Expression };

/**
 * Builds a merged object expression from all element props and spreads,
 * preserving source order to handle overrides correctly.
 *
 * Example transformation:
 * ```jsx
 * <div id="x" {...obj} class="y" />
 * ```
 * Becomes:
 * ```js
 * { id: "x", ...obj, class: "y" }
 * ```
 *
 * @param ir - Intermediate representation of the element
 * @returns Object expression merging all props in source order
 */
export function buildSpreadSnapshot(ir: IRElement): t.ObjectExpression {
  const parts: SpreadPart[] = [];
  const props: IRProps = ir.props;

  // Collect static props (compile-time constants)
  for (const prop of props.static) {
    // Skip props that are overridden by later spreads
    if (prop.isOverridden) continue;
    parts.push({
      kind: 'static',
      order: prop.order,
      name: prop.name,
      value: prop.value,
    });
  }

  // Collect dynamic props (runtime expressions)
  for (const prop of props.dynamic) {
    if (prop.isOverridden) continue;
    parts.push({
      kind: 'dynamic',
      order: prop.order,
      name: prop.name,
      value: prop.value,
    });
  }

  // Collect event handlers
  for (const event of props.events) {
    parts.push({
      kind: 'event',
      order: event.order,
      name: event.name,
      value: event.handler,
    });
  }

  // Collect spread operators
  for (const spread of props.spreads) {
    parts.push({
      kind: 'spread',
      order: spread.order,
      value: spread.value,
    });
  }

  // Sort all parts by their original source order
  // This ensures later props can override earlier ones
  parts.sort((a, b) => a.order - b.order);

  // Build the merged object expression
  const properties: Array<t.ObjectProperty | t.SpreadElement> = [];

  for (const part of parts) {
    // Spread operators pass through directly
    if (part.kind === 'spread') {
      properties.push(t.spreadElement(part.value));
      continue;
    }

    let key: string;
    let value: t.Expression;

    if (part.kind === 'event') {
      // Event handlers: onClick, onInput, etc.
      key = part.name;
      value = part.value;
    } else if (part.kind === 'static') {
      // Static props: convert primitive values to AST literals
      key = part.name;
      if (typeof part.value === 'string') {
        value = t.stringLiteral(part.value);
      } else if (typeof part.value === 'boolean') {
        value = t.booleanLiteral(part.value);
      } else if (part.value === null) {
        value = t.nullLiteral();
      } else {
        // Already an expression node
        value = part.value;
      }
    } else {
      // Dynamic props: use expression as-is
      key = part.name;
      value = part.value;
    }

    // Check if the key is a valid JavaScript identifier
    const isValidIdentifier = VALID_IDENTIFIER_PATTERN.test(key);

    // Use computed string literal for:
    // 1. Special names like __proto__ (security: prevent prototype pollution)
    // 2. Invalid identifiers (data-*, aria-*, names with dashes, etc.)
    if (key === SPECIAL_PROPS.PROTO || !isValidIdentifier) {
      properties.push(
        t.objectProperty(
          t.stringLiteral(key),
          value,
          true, // computed: obj["key"]
        ),
      );
    } else {
      // Valid identifier: obj.key
      properties.push(t.objectProperty(t.identifier(key), value));
    }
  }

  return t.objectExpression(properties);
}
