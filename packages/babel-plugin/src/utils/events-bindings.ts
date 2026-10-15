/**
 * Event and binding emission utilities.
 *
 * This module generates runtime code for:
 * 1. Event handlers (onClick, onInput, etc.) - delegated vs direct
 * 2. Two-way bindings (bind:value, bind:checked, etc.)
 * 3. Element refs (ref={callback})
 *
 * Key decisions:
 * - Static handlers use addEventListener (can be removed)
 * - Dynamic handlers use property assignment (reactive updates)
 * - Delegated events (click, input) use special slots for performance
 */
import * as t from '@babel/types';
import { DELEGATED_SLOT_PREFIX, isDelegatedEvent } from '@estjs/shared';
import { createBindingSetter, unwrapBindTuple } from '../shared/bind';
import { SPECIAL_PROPS } from '../constants';
import type { CompileContext } from '../core/context';
import type { IRBind, IREvent, IRRef } from '../core/types';

/** Event name prefix in JSX attributes (e.g., "onClick" starts with "on") */
const EVENT_PREFIX = 'on';
const EVENT_PREFIX_LENGTH = 2;

/**
 * Checks if an expression is static (compile-time constant) vs reactive.
 *
 * Static expressions don't need effect wrapping:
 * - Function identifiers: onClick={handleClick}
 * - Arrow functions: onClick={() => ...}
 * - Member expressions: onClick={handlers.click}
 *
 * Reactive expressions need effect wrapping:
 * - Signal reads: onClick={$signal.value}
 * - Prop getters: onClick={__props.handler}
 * - Computed values: onClick={$computed}
 *
 * @param expr - Expression to analyze
 * @returns true if the expression is static
 */
function isStaticExpression(expr: t.Expression): boolean {
  // Identifiers are static (function references, not signal reads)
  if (t.isIdentifier(expr)) {
    return true;
  }

  // Function expressions are always static
  if (t.isFunctionExpression(expr) || t.isArrowFunctionExpression(expr)) {
    return true;
  }

  // Member expressions: distinguish static from reactive
  if (t.isMemberExpression(expr)) {
    // __props.* is always dynamic (props are reactive getters)
    if (t.isIdentifier(expr.object) && expr.object.name === SPECIAL_PROPS.PROPS) {
      return false;
    }

    // *.value might be signal access - treat as dynamic for safety
    // Example: $count.value in onClick={$count.value > 0 ? a : b}
    if (t.isIdentifier(expr.property) && expr.property.name === SPECIAL_PROPS.VALUE) {
      return false;
    }

    // Regular member expressions like handlers.handleClick are static
    return true;
  }

  // Call expressions are dynamic (they produce values, not references)
  if (t.isCallExpression(expr)) {
    return false;
  }

  // Conditional expressions might contain reactive branches
  if (t.isConditionalExpression(expr)) {
    return false;
  }

  // Conservative default: treat unknown patterns as dynamic
  return false;
}

/**
 * Emits runtime code to attach an event handler to an element.
 *
 * Strategy depends on handler type and event category:
 *
 * 1. Delegated + Static:
 *    ```js
 *    el.__click = handler; // Captured by global listener
 *    ```
 *
 * 2. Delegated + Dynamic:
 *    ```js
 *    effect(() => el.__click = handler); // Updates when handler changes
 *    ```
 *
 * 3. Non-delegated + Static:
 *    ```js
 *    addEventListener(el, 'mouseenter', handler); // Can remove listener
 *    ```
 *
 * 4. Non-delegated + Dynamic:
 *    ```js
 *    el.onmouseenter = handler; // Property assignment, no cleanup needed
 *    ```
 *
 * @param el - Element identifier
 * @param prop - Event property from IR
 * @param ctx - Compilation context
 * @returns Statement to attach the event handler
 */
export function emitEventBinding(
  el: t.Identifier,
  prop: IREvent,
  ctx: CompileContext,
): t.Statement {
  // Extract event name: "onClick" -> "click"
  const eventName = prop.name.slice(EVENT_PREFIX_LENGTH).toLowerCase();
  const handler = prop.handler;
  const isStatic = isStaticExpression(handler);
  const isDelegated = isDelegatedEvent(eventName);

  if (isDelegated) {
    // Delegated events store handlers in special element slots
    // Runtime's global listener reads from these slots
    const member = t.memberExpression(
      el,
      t.stringLiteral(`${DELEGATED_SLOT_PREFIX}${eventName}`),
      true, // computed: el["__click"]
    );
    const assignment = t.assignmentExpression('=', member, handler);

    if (isStatic) {
      // Static handler: one-time assignment
      return t.expressionStatement(assignment);
    }

    // Dynamic handler: wrap in effect to track reactivity
    const effectFn = ctx.imports.get('effect');
    return t.expressionStatement(
      t.callExpression(effectFn, [t.arrowFunctionExpression([], assignment)]),
    );
  }

  // Non-delegated events (mouseenter, focus, etc.)
  if (isStatic) {
    // Static handler: use addEventListener for proper cleanup
    const addEventListenerFn = ctx.imports.get('addEventListener');
    return t.expressionStatement(
      t.callExpression(addEventListenerFn, [el, t.stringLiteral(eventName), handler]),
    );
  }

  // Dynamic handler: direct property assignment (reactive)
  // Example: el.onmouseenter = handler
  return t.expressionStatement(
    t.assignmentExpression(
      '=',
      t.memberExpression(el, t.identifier(`${EVENT_PREFIX}${eventName}`)),
      handler,
    ),
  );
}

/**
 * Emits runtime code for two-way binding (bind:value, bind:checked, etc.).
 *
 * Generates a call to the runtime's bindElement function:
 * ```js
 * bindElement(
 *   el,                    // DOM element
 *   "value",               // binding name
 *   () => signal.value,    // getter (reactive read)
 *   (v) => signal.value = v, // setter (write back)
 *   { trim: true }         // optional modifiers
 * )
 * ```
 *
 * The runtime sets up:
 * - Initial value from getter
 * - Effect to update DOM when signal changes
 * - Event listener to update signal when user edits
 *
 * @param el - Element identifier
 * @param prop - Bind property from IR
 * @param ctx - Compilation context
 * @returns Statement to set up two-way binding
 */
export function emitBindStatement(
  el: t.Identifier,
  prop: IRBind,
  ctx: CompileContext,
): t.Statement {
  // Bind name is pre-normalized by parser (bind: prefix already stripped)
  const bindName = prop.name;
  const rawValue = prop.value as t.Expression;

  // Unwrap tuple format: [signal, modifiers] or just signal
  const { value: valueExpr, modifiers } = unwrapBindTuple(rawValue, bindName);

  // Build arguments for bindElement(el, name, getter, setter, modifiers?)
  const args: t.Expression[] = [
    el,
    t.stringLiteral(bindName),
    // Getter: wrap in arrow to defer read (reactive tracking)
    t.arrowFunctionExpression([], t.cloneNode(valueExpr, true)),
    // Setter: arrow that assigns back to the signal
    createBindingSetter(valueExpr, (hint: string) => ctx.uids.generate(hint), bindName),
  ];

  // Add modifiers object if present
  if (modifiers) {
    args.push(t.cloneNode(modifiers, true));
  }

  const bindFn = ctx.imports.get('bindElement');
  return t.expressionStatement(t.callExpression(bindFn, args));
}

/**
 * Emits runtime code for element ref callback.
 *
 * Generates:
 * ```js
 * refCallback(el);
 * ```
 *
 * The callback receives the DOM element and can:
 * - Store it in a signal for later access
 * - Set up imperative APIs
 * - Integrate with third-party libraries
 *
 * @param el - Element identifier
 * @param prop - Ref property from IR
 * @returns Statement to invoke the ref callback
 */
export function emitRefBinding(el: t.Identifier, prop: IRRef): t.Statement {
  const refFn = prop.value as t.Expression;
  return t.expressionStatement(t.callExpression(refFn, [el]));
}
