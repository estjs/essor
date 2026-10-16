/**
 * Static expression analysis utilities.
 *
 * Determines whether expressions are static (computed at compile time or
 * don't require reactive tracking) vs dynamic (need runtime evaluation or
 * reactive effects).
 */
import * as t from '@babel/types';
import { isArray, isPlainObject, isPrimitive, startsWith } from '@estjs/shared';
import { RUNTIME_IDENTIFIER } from '../constants';

/**
 * Check if an expression is static (doesn't require reactive tracking).
 *
 * Static expressions include:
 * - Identifiers (function references, const variables)
 * - Function expressions (handlers, callbacks)
 * - Static member expressions (handlers.onClick, utils.format)
 *
 * Dynamic expressions include:
 * - Props access (__props.*)
 * - Signal reads (*.value)
 * - Call expressions (fn())
 * - Conditional expressions (a ? b : c)
 *
 * @param expr - Expression to analyze
 * @returns true if the expression is static
 */
export function isStaticExpression(expr: t.Expression): boolean {
  // Identifiers are generally static (function names, const vars)
  if (t.isIdentifier(expr)) {
    return true;
  }

  // Function expressions are always static
  if (t.isFunctionExpression(expr) || t.isArrowFunctionExpression(expr)) {
    return true;
  }

  // Member expressions need deeper analysis
  if (t.isMemberExpression(expr)) {
    // Props access is always dynamic (getters)
    if (t.isIdentifier(expr.object) && expr.object.name === RUNTIME_IDENTIFIER.COMPONENT_PROPS) {
      return false;
    }

    // Signal reads (*.value) are dynamic
    if (t.isIdentifier(expr.property) && expr.property.name === 'value') {
      return false;
    }

    // Other member expressions are static (e.g., handlers.onClick)
    return true;
  }

  // Call expressions are dynamic (need runtime evaluation)
  if (t.isCallExpression(expr)) {
    return false;
  }

  // Conditional expressions are dynamic
  if (t.isConditionalExpression(expr)) {
    return false;
  }

  // Logical expressions might be dynamic
  if (t.isLogicalExpression(expr)) {
    return false;
  }

  // Binary expressions might be dynamic
  if (t.isBinaryExpression(expr)) {
    return false;
  }

  // Unary expressions might be dynamic
  if (t.isUnaryExpression(expr)) {
    return false;
  }

  // Template literals are dynamic
  if (t.isTemplateLiteral(expr)) {
    return false;
  }

  // Array/object expressions are dynamic
  if (t.isArrayExpression(expr) || t.isObjectExpression(expr)) {
    return false;
  }

  // Everything else is considered non-static for safety
  return false;
}

/**
 * Check if an expression is a compile-time constant literal.
 *
 * @param expr - Expression to check
 * @returns true if it's a literal value
 */
export function isLiteralExpression(expr: t.Expression): boolean {
  return (
    t.isStringLiteral(expr) ||
    t.isNumericLiteral(expr) ||
    t.isBooleanLiteral(expr) ||
    t.isNullLiteral(expr) ||
    t.isIdentifier(expr, { name: 'undefined' })
  );
}

/**
 * Check if an expression references a signal variable.
 *
 * This checks for direct signal references or member access on signals.
 * Used to determine if an expression needs reactive tracking.
 *
 * @param expr - Expression to analyze
 * @param signalPrefix - Configured signal prefix (default '$')
 * @returns true if the expression involves signal access
 */
export function isSignalReference(expr: t.Expression, signalPrefix: string = '$'): boolean {
  // Direct signal identifier
  if (t.isIdentifier(expr) && startsWith(expr.name, signalPrefix)) {
    return true;
  }

  // Signal.value access
  if (t.isMemberExpression(expr)) {
    if (t.isIdentifier(expr.object) && startsWith(expr.object.name, signalPrefix)) {
      return true;
    }
  }

  // Check for signal reads in call expressions
  if (t.isCallExpression(expr)) {
    return expr.arguments.some(
      (arg) => t.isExpression(arg) && isSignalReference(arg, signalPrefix),
    );
  }

  // Check for signal reads in binary/logical expressions
  if (t.isBinaryExpression(expr) || t.isLogicalExpression(expr)) {
    return (
      (t.isExpression(expr.left) && isSignalReference(expr.left, signalPrefix)) ||
      isSignalReference(expr.right, signalPrefix)
    );
  }

  // Check for signal reads in unary expressions
  if (t.isUnaryExpression(expr)) {
    return isSignalReference(expr.argument, signalPrefix);
  }

  // Check for signal reads in conditional expressions
  if (t.isConditionalExpression(expr)) {
    return (
      isSignalReference(expr.test, signalPrefix) ||
      isSignalReference(expr.consequent, signalPrefix) ||
      isSignalReference(expr.alternate, signalPrefix)
    );
  }

  return false;
}

/**
 * Check if a value can be serialized to HTML attributes.
 *
 * Only primitives and plain objects/arrays can be serialized.
 * Functions, classes, symbols, etc. cannot.
 *
 * @param value - Value to check
 * @returns true if serializable
 */
export function isSerializableValue(value: unknown): boolean {
  const stack: unknown[] = [value];

  while (stack.length > 0) {
    const current = stack.pop();

    // Primitives are serializable
    if (isPrimitive(current)) {
      continue;
    }

    // Arrays are serializable if all elements are
    if (isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }

    // Plain objects are serializable if all values are
    if (isPlainObject(current)) {
      for (const item of Object.values(current)) {
        stack.push(item);
      }
      continue;
    }

    // Functions, classes, symbols, etc. are not serializable
    return false;
  }

  return true;
}

/**
 * Check if an initializer expression is already wrapped in a reactive call.
 *
 * This avoids double-wrapping like `signal(signal(0))`.
 *
 * @param init - Initializer expression
 * @returns true if already wrapped
 */
export function isAlreadyWrapped(init: t.Expression | null | undefined): boolean {
  if (!init || !t.isCallExpression(init)) return false;

  if (t.isIdentifier(init.callee)) {
    const name = init.callee.name;
    return (
      name === 'signal' ||
      name === 'computed' ||
      name === 'reactive' ||
      name === 'shallowReactive' ||
      startsWith(name, '_signal$') ||
      startsWith(name, '_computed$') ||
      startsWith(name, '_reactive$') ||
      startsWith(name, '_shallowReactive$')
    );
  }

  return false;
}

/**
 * Check if an initializer expression is a reactive proxy wrapper.
 *
 * Reactive proxies (reactive(), shallowReactive()) do NOT use `.value` access,
 * unlike signal()/computed(). When a $-prefixed variable is initialized with
 * one of these, the compiler must not append `.value` to its references.
 *
 * @param init - Initializer expression
 * @returns true if wrapped with reactive() or shallowReactive()
 */
export function isReactiveWrapped(init: t.Expression | null | undefined): boolean {
  if (!init || !t.isCallExpression(init)) return false;

  if (t.isIdentifier(init.callee)) {
    const name = init.callee.name;
    return (
      name === 'reactive' ||
      name === 'shallowReactive' ||
      startsWith(name, '_reactive$') ||
      startsWith(name, '_shallowReactive$')
    );
  }

  return false;
}
