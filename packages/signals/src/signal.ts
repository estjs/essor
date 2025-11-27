// Import shared utility functions for checking value changes, object types, and sending warnings in development mode.
import { hasChanged, isObject, warn } from '@estjs/shared';
import { activeSub, linkReactiveNode, shallowPropagate } from './link';
import { ReactiveFlags, SignalFlags } from './constants';
import { reactive, shallowReactive, toRaw } from './reactive';
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

  private _oldValue: T; // Store old value for comparison
  private _rawValue: T; // Store raw (non-proxied) new value

  _value: T; // Store current value (may be a reactive proxy)

  private readonly [SignalFlags.IS_SHALLOW]: boolean; // Mark whether it's shallow reactive

  // @ts-ignore
  private readonly [SignalFlags.IS_SIGNAL] = true as const; // Mark as Signal

  /**
   * Create a new Signal with the given initial value.
   *
   * @param value - Initial value
   * @param shallow - Whether only the top level should be reactive
   */
  constructor(value?: T, shallow = false) {
    this._oldValue = this._rawValue = value as T;
    // In shallow mode, wrap objects/arrays/collections in shallow reactive proxy
    // In deep mode, wrap objects in deep reactive proxy
    if (shallow) {
      this._value = (isObject(value) ? shallowReactive(value as object) : value) as T;
    } else {
      this._value = (isObject(value) ? reactive(value as object) : value) as T;
    }
    this[SignalFlags.IS_SHALLOW] = shallow;
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

    if (this.flag & ReactiveFlags.DIRTY && this.shouldUpdate()) {
      // Cache subLink locally to avoid repeated property access
      const subs = this.subLink;
      if (subs) {
        shallowPropagate(subs);
      }
    }

    return this._value;
  }

  // value setter, triggers update when value changes
  set value(value: T) {
    // If the new value is another signal, unwrap it
    if (isSignal(value)) {
      if (__DEV__) {
        warn(
          'Setting a signal value to another signal is not recommended. ' +
            'The value will be unwrapped automatically.',
        );
      }
      value = (value as Signal<T>).peek() as T;
    }

    // Extract raw value
    value = toRaw(value);

    if (!hasChanged(this._rawValue, value)) {
      return;
    }

    // Mark as dirty using bitwise OR
    this.flag |= ReactiveFlags.DIRTY;
    this._rawValue = value;

    // Cache shallow flag locally to avoid repeated property access
    const shallow = this[SignalFlags.IS_SHALLOW];

    // In shallow mode, wrap in shallow reactive proxy; in deep mode, wrap in deep reactive proxy
    if (shallow) {
      this._value = (isObject(value) ? shallowReactive(value as object) : value) as T;
    } else {
      this._value = (isObject(value) ? reactive(value as object) : value) as T;
    }

    // Cache subLink locally to avoid repeated property access
    const subs = this.subLink;
    if (subs) {
      propagate(subs); // Propagate notification
    }
  }

  // Check if the value should be updated
  shouldUpdate(): boolean {
    // Clear "dirty" flag using bitwise AND with NOT
    this.flag &= ~ReactiveFlags.DIRTY;
    // Compare old value with new raw value, and update old value
    return hasChanged(this._oldValue, (this._oldValue = this._rawValue));
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
export function signal<T>(value?: T): Signal<T> {
  // If the value is already a signal, return it directly to avoid duplicate creation
  if (isSignal(value)) {
    if (__DEV__) {
      warn(
        'Creating a signal with another signal is not recommended. The value will be unwrapped.',
      );
    }
    return value as Signal<T>;
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
    if (__DEV__) {
      warn(
        'Creating a shallow signal with another signal is not recommended. The value will be unwrapped.',
      );
    }
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

/**
 * A more precise type for the value held by a signal.
 * This type helps TypeScript understand the type of the unwrapped value.
 *
 * @template T - The type of value held by the signal
 */
export type SignalValue<T> = T extends Signal<infer V> ? V : never;
