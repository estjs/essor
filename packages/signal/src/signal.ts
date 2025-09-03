import { hasChanged, isObject, warn } from '@estjs/shared';
import { SignalFlags, SignalKey } from './constants';
import { track, trigger } from './effect';
import { reactiveImpl } from './reactive';
import type { Link, ReactiveNode } from './link';

/**
 * A Signal is a reactive primitive that holds a value and notifies subscribers when the value changes.
 * It provides methods to read, write, and observe changes to the value.
 *
 * @template T - The type of value held by the signal
 */
export interface Signal<T> extends ReactiveNode {
  /**
   * The current value of the signal. Reading this property will track dependencies,
   * and writing to it will notify subscribers of changes.
   */
  value: T;

  /**
   * Gets the current value without establishing a dependency.
   * Useful when you need to read the value without tracking it as a dependency.
   *
   * @returns The current value
   */
  peek(): T;

  /**
   * Sets a new value without notifying subscribers.
   * Useful for batching multiple updates together.
   *
   * @param value - The new value to set
   */
  set(value: T): void;

  /**
   * Updates the value using a function that receives the current value.
   * This is an atomic operation that will notify subscribers only once.
   *
   * @param updater - A function that receives the current value and returns the new value
   */
  update(updater: (prev: T) => T): void;
}

/**
 * Internal implementation of the Signal interface.
 * This class manages the reactive state and handles dependency tracking.
 *
 * @template T - The type of value held by the signal
 * @internal
 */
export class SignalImpl<T> implements Signal<T> {
  protected _value: T;
  private readonly [SignalFlags.IS_SHALLOW]: boolean;
  // @ts-ignore
  private readonly [SignalFlags.IS_SIGNAL] = true;

  // ReactiveNode implementation
  depLink?: Link;
  subLink?: Link;
  depLinkTail?: Link;
  subLinkTail?: Link;
  flag: number = 0; // ReactiveFlags.NONE

  /**
   * Creates a new signal with the given initial value.
   *
   * @param value - The initial value
   * @param shallow - Whether to make only the top level reactive
   */
  constructor(value?: T, shallow = false) {
    this._value = value as T;
    this[SignalFlags.IS_SHALLOW] = shallow;
  }

  get value(): T {
    // Track this signal as a dependency
    track(this, SignalKey);

    // For object values, wrap them in a reactive proxy unless it's an HTML element
    // or we're in shallow mode
    if (isObject(this._value)) {
      return reactiveImpl(this._value, this[SignalFlags.IS_SHALLOW]) as T;
    }

    return this._value;
  }

  set value(value: T) {
    // Handle nested signals by unwrapping them
    if (isSignal(value)) {
      value = value.value as T;
    }

    // Only trigger updates if the value has actually changed
    if (hasChanged(value, this._value)) {
      this._value = value;
      trigger(this, SignalKey);
    }
  }

  peek(): T {
    return this._value;
  }

  set(value: T): void {
    this.value = value;
  }

  update(updater: (prev: T) => T): void {
    const nextValue = updater(this.peek());
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
 * Creates a new signal with the given initial value.
 * The signal will track all nested properties of object values.
 *
 * @template T - The type of value to store in the signal
 * @param value - The initial value
 * @returns A new signal instance
 *
 * @example
 * ```ts
 * const count = signal(0);
 * const user = signal({ name: 'John', age: 30 });
 *
 * // Reading and writing values
 * console.log(count.value); // 0
 * count.value = 1;
 *
 * // Updating with a function
 * count.update(n => n + 1);
 * ```
 */
export function signal<T>(value?: T): Signal<T> {
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
 * Creates a new shallow signal with the given initial value.
 * Only the top level properties of object values will be reactive.
 *
 * @template T - The type of value to store in the signal
 * @param value - The initial value
 * @returns A new shallow signal instance
 *
 * @example
 * ```ts
 * const user = shallowSignal({
 *   name: 'John',
 *   address: { city: 'New York' }
 * });
 *
 * // Only top-level properties are reactive
 * user.value.name = 'Jane'; // Triggers updates
 * user.value.address.city = 'Boston'; // Does not trigger updates
 * ```
 */
export function shallowSignal<T>(value?: T): Signal<T> {
  return new SignalImpl(value, true);
}

/**
 * Type guard to check if a value is a Signal instance.
 *
 * @template T - The type of value held by the signal
 * @param value - The value to check
 * @returns True if the value is a Signal instance
 */
export function isSignal<T>(value: unknown): value is Signal<T> {
  return !!value && isObject(value) && !!value[SignalFlags.IS_SIGNAL];
}

/**
 * A more precise type for the value held by a signal.
 * This type helps TypeScript understand the unwrapped value type.
 *
 * @template T - The type of value held by the signal
 */
export type SignalValue<T> = T extends Signal<infer V> ? V : never;
