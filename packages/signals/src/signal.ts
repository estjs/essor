import { hasChanged, isObject, warn } from '@estjs/shared';
import { activeSub, linkReactiveNode, shallowPropagate } from './link';
import { ReactiveFlags, SignalFlags } from './constants';
import { isReactive, reactive, shallowReactive, toRaw } from './reactive';
import { propagate } from './propagation';
import type { Link, ReactiveNode } from './link';

/**
 * Signal is a reactive primitive that holds a value and notifies subscribers when the value changes.
 * It provides methods for reading, writing, and observing value changes.
 *
 * @template T - The type of value held by the Signal
 */
export interface Signal<T> {
  /**
   * The current value of the Signal. Reading this property tracks dependencies,
   * and writing to it notifies subscribers of changes.
   */
  value: T;

  /**
   * Get the current value without establishing a dependency relationship.
   * Useful when you need to read the value without tracking dependencies.
   *
   * @returns The current value
   */
  peek(): T;

  /**
   * Set a new value without notifying subscribers.
   * Used for batching multiple updates together.
   *
   * @param value - The new value to set
   */
  set(value: T): void;

  /**
   * Update the value using a function that receives the current value.
   * This is an atomic operation that only notifies subscribers once.
   *
   * @param updater - A function that receives the current value and returns the new value
   */
  update(updater: (prev: T) => T): void;
}

/**
 * A more precise type for the value held by a signal.
 * This type helps TypeScript understand the type of the unwrapped value.
 *
 * @template T - The type of value held by the signal
 */
export type SignalValue<T> = T extends Signal<infer V> ? V : never;
/**
 * Extract the value type from a Signal
 *
 * @template T - The Signal type
 *
 * @example
 * ```typescript
 * import { signal, type SignalType } from '@estjs/signals';
 *
 * const count = signal(0);
 * type CountValue = SignalType<typeof count>; // number
 * ```
 */
export type SignalType<T> = T extends Signal<infer V> ? V : never;

/**
 * Internal implementation of the Signal interface.
 * This class manages reactive state and handles dependency tracking.

 * @template T - The type of value held by the Signal
 */

export class SignalImpl<T> implements ReactiveNode {
  // Implement ReactiveNode interface
  depLink?: Link | undefined;
  subLink?: Link | undefined;
  depLinkTail?: Link | undefined;
  subLinkTail?: Link | undefined;
  flag: ReactiveFlags = ReactiveFlags.MUTABLE; // Initial state is "mutable"

  // _oldValue is deliberately NOT initialized here so that `'_oldValue' in instance`
  // returns false until the first value change — the test suite directly checks this.
  protected _oldValue!: T; // on-demand, only present after first change
  protected _rawValue: T; // Store raw (non-proxied) new value

  _value: T; // Store current value (may be a reactive proxy)

  private readonly [SignalFlags.IS_SHALLOW]: boolean; // Mark whether it's shallow reactive

  // @ts-ignore: used internally by isSignal typeguard
  private readonly [SignalFlags.IS_SIGNAL] = true as const;

  /**
   * Create a new Signal with the given initial value.
   *
   * @param value - Initial value
   * @param shallow - Whether only the top level should be reactive
   */
  constructor(value?: T, shallow = false) {
    // Optimization: Don't initialize _oldValue in constructor
    // It will be created on-demand in shouldUpdate()

    // Extract raw value correctly in constructor to ensure _rawValue is never a proxy
    const unwrapped = toRaw(value);
    this._rawValue = unwrapped as T;

    this[SignalFlags.IS_SHALLOW] = shallow;

    // Fast path: if primitive, no proxy needed
    if (!isObject(unwrapped)) {
      this._value = unwrapped as T;
    } else {
      // If value is already reactive, reuse it directly instead of lookup
      if (isReactive(value)) {
        this._value = value as T;
      } else {
        this._value = (
          shallow ? shallowReactive(unwrapped as object) : reactive(unwrapped as object)
        ) as T;
      }
    }
  }

  // dep getter, returns itself for dependency collection
  get dep(): this {
    return this;
  }

  get value(): T {
    const sub = activeSub;
    if (sub) {
      linkReactiveNode(this, sub);
    }

    // Optimization: Cache flag and subLink to local variables to reduce property access
    const flags = this.flag;
    if (flags & ReactiveFlags.DIRTY && this.shouldUpdate()) {
      // Cache subLink locally to avoid repeated property access
      const subs = this.subLink;
      if (subs) {
        shallowPropagate(subs);
      }
    }

    return this._value;
  }

  // value setter, triggers update when value changes
  set value(newValue: T) {
    // If the new value is another signal, unwrap it
    if (isSignal(newValue)) {
      if (__DEV__) {
        warn(
          'Setting a signal value to another signal is not recommended. ' +
            'The value will be unwrapped automatically.',
        );
      }
      newValue = (newValue as Signal<T>).peek() as T;
    }

    // Keep a reference to the caller-supplied value (may already be a reactive proxy)
    // before stripping it to raw, so we can reuse the existing proxy if present.
    const originalValue = newValue;
    const rawValue = toRaw(newValue);

    if (!hasChanged(this._rawValue, rawValue)) {
      return;
    }

    this._oldValue = this._rawValue;
    this._rawValue = rawValue;
    this.flag |= ReactiveFlags.DIRTY;

    if (!isObject(rawValue)) {
      // Primitive: no proxy needed
      this._value = rawValue as T;
    } else if (isReactive(originalValue)) {
      // The caller already handed us a reactive proxy — reuse it directly.
      // This avoids an unnecessary WeakMap lookup in reactiveCaches.
      this._value = originalValue as T;
    } else {
      // Plain object/array: wrap in a reactive proxy (cached by reactiveCaches).
      const shallow = this[SignalFlags.IS_SHALLOW];
      this._value = (
        shallow ? shallowReactive(rawValue as object) : reactive(rawValue as object)
      ) as T;
    }

    const subs = this.subLink;
    if (subs) {
      propagate(subs);
    }
  }

  // Check if the value should be updated
  shouldUpdate(): boolean {
    this.flag &= ~ReactiveFlags.DIRTY;

    // _oldValue is only assigned in the setter (on-demand), so `'_oldValue' in this` is false
    // until the first actual change. This preserves the test-verified optimization.
    if (!('_oldValue' in this)) {
      return true;
    }

    const changed = hasChanged(this._oldValue as T, this._rawValue);
    this._oldValue = this._rawValue;
    return changed;
  }

  // Get current value without triggering dependency tracking
  peek(): T {
    return this._value;
  }

  // set method is an alias for the value setter
  set(value: T): void {
    this.value = value;
  }

  // Update value using an updater function
  update(updater: (prev: T) => T): void {
    const nextValue = updater(this.peek());
    // Handle case where updater function returns a signal
    if (isSignal(nextValue)) {
      if (__DEV__) {
        warn(
          'Returning a signal from an update function is not recommended. The value will be unwrapped.',
        );
      }
      this.value = nextValue.peek() as T;
    } else {
      this.value = nextValue;
    }
  }
}

/**
 * Create a new signal with the given initial value.
 * The signal will track all nested properties of object values.
 *
 * @template T - The type of value to store in the signal
 * @param value - Initial value (defaults to undefined)
 * @returns A new signal instance
 *
 * @example
 * ```typescript
 * const count = signal(0);
 * const user = signal({ name: 'John' });
 * const empty = signal(); // undefined
 * ```
 */
export function signal<T>(value: Signal<T>): Signal<T>;
export function signal<T>(value?: T): Signal<T>;
export function signal<T>(value?: T) {
  // If the value is already a signal, return it directly to avoid duplicate creation
  if (isSignal(value)) {
    if (__DEV__) {
      warn(
        'Creating a signal with another signal is not recommended. The value will be unwrapped.',
      );
    }
    return value as T;
  }
  return new SignalImpl(value);
}
/**
 * Create a new shallow signal with the given initial value.
 * Only the top-level properties of object values are reactive.
 *
 * @template T - The type of value to store in the signal
 * @param value - Initial value (defaults to undefined)
 * @returns A new shallow signal instance
 *
 * @example
 * ```typescript
 * const state = shallowSignal({ nested: { value: 1 } });
 * // Only state.nested is reactive, not state.nested.value
 * ```
 */
export function shallowSignal<T>(value?: T): Signal<T> {
  // If the value is a signal, extract its value
  if (isSignal(value)) {
    value = value.peek() as T;
  }
  return new SignalImpl(value, true);
}

/**
 * Type guard to check if a value is a Signal instance.
 *
 * @template T - The type of value held by the signal
 * @param value - The value to check
 * @returns true if the value is a Signal instance
 */
export function isSignal<T>(value: unknown): value is Signal<T> {
  return !!value && !!value[SignalFlags.IS_SIGNAL];
}
