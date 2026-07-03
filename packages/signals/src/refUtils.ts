import { isFunction } from '@estjs/shared';
import { isRef } from './ref';
import { isSignal } from './signal';
import { type Computed, computed, isComputed } from './computed';

// ── unref ────────────────────────────────────────────────────────────────

/**
 * Unwrap a signal, computed, ref, or getter function to its raw value.
 *
 * - Signal / Computed / Ref → returns `.value`
 * - Getter function → calls and returns the result
 * - Plain value → returns as-is
 *
 * @example
 * ```ts
 * const count = signal(5)
 * unref(count)     // 5
 * unref(5)         // 5
 * unref(() => count.value) // 5
 * ```
 */
export function unref<T>(
  value: T,
): T extends { value: infer V } ? V : T extends (...args: any[]) => infer R ? R : T;
export function unref(value: any): any {
  if (isSignal(value) || isRef(value) || isComputed(value)) {
    return (value as any).value;
  }
  if (isFunction(value)) {
    return (value as () => any)();
  }
  return value;
}

// ── toRef ────────────────────────────────────────────────────────────────

/**
 * Create a writable computed that proxies a single property of a reactive object.
 * Changes propagate both ways — reading the ref reads from the object,
 * writing to the ref writes back to the object.
 *
 * Useful for destructuring reactive state while maintaining reactivity.
 *
 * @param obj - A reactive object (created by `reactive()`)
 * @param key - The property key to extract
 * @param defaultValue - Optional default value when the property is undefined
 * @returns A writable Computed bound to that property
 *
 * @example
 * ```ts
 * const state = reactive({ count: 0, name: 'Alice' })
 * const countRef = toRef(state, 'count')
 * countRef.value      // 0
 * countRef.value = 5  // state.count === 5
 * ```
 */
export function toRef<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  defaultValue?: T[K],
): Computed<T[K]> {
  return computed({
    get: () => {
      const val = obj[key];
      return val !== undefined ? val : (defaultValue as T[K]);
    },
    set: (v: T[K]) => {
      obj[key] = v;
    },
  });
}

// ── toRefs ───────────────────────────────────────────────────────────────

/**
 * Convert a reactive object into a plain object where every property
 * is wrapped in a writable computed ref.
 *
 * Enables `const { x, y } = toRefs(state)` — destructuring while
 * keeping reactivity.
 *
 * @param obj - A reactive object (created by `reactive()`)
 * @returns A plain object with each property wrapped as a writable Computed
 *
 * @example
 * ```ts
 * const state = reactive({ x: 1, y: 2 })
 * const { x, y } = toRefs(state)
 * x.value        // 1
 * x.value = 10   // state.x === 10
 * ```
 */
export function toRefs<T extends object>(obj: T): { [K in keyof T]: Computed<T[K]> } {
  const result = {} as { [K in keyof T]: Computed<T[K]> };
  for (const key of Object.keys(obj) as (keyof T)[]) {
    result[key] = toRef(obj, key);
  }
  return result;
}
