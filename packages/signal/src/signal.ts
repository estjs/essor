import { hasChanged, isObject, warn } from '@estjs/shared';
import { ReactiveFlags, SignalFlags } from './constants';
import {
  type Link,
  type ReactiveNode,
  activeSub,
  batchDepth,
  flushWatchedEffects,
  linkReactiveNode as link,
  propagate,
  shallowPropagate,
} from './link';
import { shallowReactive, toRaw, toReactive } from './reactive';

/**
 * Signal is a reactive primitive type that holds a value and notifies subscribers when the value changes.
 * It provides methods for reading, writing, and observing value changes.
 *
 * @template T - The type of value held by the Signal
 */
export interface Signal<T> {
  /**
   * The current value of the Signal. Reading this property tracks dependencies,
   * writing to it notifies subscribers of changes.
   */
  value: T;

  /**
   * Get the current value without establishing dependencies.
   * Useful when you need to read the value without tracking dependencies.
   *
   * @returns The current value
   */
  peek(): T;

  /**
   * Set a new value without notifying subscribers.
   * Used to batch multiple updates together.
   *
   * @param updater - A function that receives the current value and returns a new value
   */
  set(value: T): void;

  /**
   * Update the value using a function that receives the current value.
   * This is an atomic operation that notifies subscribers only once.
   *
   * @param updater - A function that receives the current value and returns a new value
   */
  update(updater: (prev: T) => T): void;
}

/**
 * Internal implementation of the Signal interface.
 * This class manages reactive state and handles dependency tracking.
 *
 * @template T - The type of value held by the Signal
 */
export class SignalImpl<T> implements ReactiveNode {
  // Implement ReactiveNode interface
  depLink?: Link; // Dependency link head
  subLink?: Link; // Subscriber link head
  depLinkTail?: Link; // Dependency link tail
  subLinkTail?: Link; // Subscriber link tail
  flag: number = ReactiveFlags.MUTABLE; // Initial state is "mutable"

  private _oldValue: T; // Store old value for comparison
  private _rawValue: T; // Store raw (unproxied) new value
  protected _value: T; // Store current value (may be reactive proxy)

  // Fix type: use index signature to properly declare string key properties, avoid @ts-ignore
  // These flags are used for runtime type checking and internal framework identification
  private readonly [SignalFlags.IS_SHALLOW]: boolean; // Mark if shallow reactive
  //@ts-ignore
  private readonly [SignalFlags.IS_SIGNAL] = true as const; // Mark as Signal

  /**
   * Create a new Signal with the given initial value.
   *
   * @param value - Initial value
   * @param shallow - Whether to make only the top level reactive
   */
  constructor(value?: T, shallow = false) {
    this._oldValue = this._rawValue = value as T;
    this.setValueToReactive(value as T, shallow);
    this[SignalFlags.IS_SHALLOW] = shallow;
  }

  setValueToReactive(value: T, shallow: boolean) {
    if (isObject(value)) {
      this._value = shallow ? shallowReactive(value) : (toReactive(value) as T);
    } else {
      this._value = value;
    }
  }
  // dep getter, returns self for dependency collection.
  get dep(): this {
    return this;
  }

  // value getter, performs dependency tracking when accessed.
  get value(): T {
    if (activeSub) {
      link(this, activeSub);
    }

    // If marked as "dirty" and value actually needs to be updated, notify subscribers.
    if (this.flag & ReactiveFlags.DIRTY && this.shouldUpdate()) {
      const subs = this.subLink;
      if (subs) {
        shallowPropagate(subs);
      }
    }
    return this._value;
  }

  // value setter, triggers update when value changes.
  set value(value: T) {
    const shallow = this[SignalFlags.IS_SHALLOW];
    // If the new value is another signal, unwrap it.
    if (isSignal(value)) {
      value = value.value as T;
    }
    // If it's a shallow signal, use raw value.
    if (shallow) {
      value = toRaw(value);
    }
    // Only trigger update if value has actually changed.
    if (hasChanged(this._value, value)) {
      this.flag |= ReactiveFlags.DIRTY; // Mark as "dirty"
      this._rawValue = value;
      this.setValueToReactive(value as T, shallow);
      const subs = this.subLink;
      if (subs) {
        propagate(subs); // Propagate notifications
        // If not in batch processing, flush effects immediately.
        if (!batchDepth) {
          flushWatchedEffects();
        }
      }
    }
  }

  // Check if value should be updated.
  shouldUpdate() {
    this.flag &= ~ReactiveFlags.DIRTY; // Clear "dirty" flag
    // Compare old value with new raw value and update old value.
    return hasChanged(this._oldValue, (this._oldValue = this._rawValue));
  }

  // Get current value without triggering dependency tracking.
  peek(): T {
    return this._value;
  }

  // set method is an alias for value setter.
  set(value: T): void {
    this.value = value;
  }

  // Update value using update function.
  update(updater: (prev: T) => T): void {
    const nextValue = updater(this.peek());
    // Handle case where update function returns a signal.
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
 * @param value - Initial value
 * @returns A new signal instance
 */
export function signal<T>(value?: T): Signal<T> {
  // If value is already a signal, return it directly to avoid duplicate creation.
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
 * @param value - Initial value
 * @returns A new shallow signal instance
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
  // Determine by checking the internal flag.
  return !!value && isObject(value) && !!value[SignalFlags.IS_SIGNAL];
}

/**
 * A more precise type for the value held by a signal.
 * This type helps TypeScript understand the unpacked value type.
 *
 * @template T - The type of value held by the signal
 */
export type SignalValue<T> = T extends Signal<infer V> ? V : never;
