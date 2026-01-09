import { hasChanged } from '@estjs/shared';
import { SIGNAL_KEY, SignalFlags } from './constants';
import { shallowPropagate, track, trigger } from './link';
import { type Signal, SignalImpl, isSignal } from './signal';

/**
 * A Ref is a special type of Signal used primarily for DOM element references.
 * It provides methods to read, write, and observe changes to the value.
 *
 * @template T - The type of value held by the ref
 */
export interface Ref<T> extends Signal<T> {
  /**
   * The current value of the ref. Reading this property will track dependencies,
   * and writing to it will notify subscribers of changes.
   */
  value: T;
}

/**
 * Internal implementation of the Ref interface.
 * This class extends SignalImpl but only overrides the get value() method
 * to provide direct access to the underlying value without reactive wrapping.
 *
 * @template T - The type of value held by the ref
 * @internal
 */
class RefImpl<T> extends SignalImpl<T> implements Ref<T> {
  // @ts-ignore
  private readonly [SignalFlags.IS_REF] = true;

  /**
   * Creates a new ref with the given initial value.
   *
   * @param value - The initial value
   */
  constructor(value: T) {
    super(value, true);
  }

  get value(): T {
    track(this, SIGNAL_KEY);
    // ref just proxy the value without reactive wrapping
    return this._value;
  }

  set value(newValue: T) {
    // Handle nested signals by unwrapping them
    if (isSignal(newValue)) {
      newValue = newValue.value as T;
    }
    if (isRef(newValue)) {
      newValue = newValue.value as T;
    }

    // Only trigger updates if the value has actually changed
    if (hasChanged(this._value, newValue)) {
      this._value = newValue;

      if (this.subLink) {
        shallowPropagate(this.subLink);
      }

      // Keep the old system for backward compatibility
      trigger(this, 'SET', SIGNAL_KEY);
    }
  }
}

/**
 * Creates a new ref with the given initial value.
 * Unlike signals, refs don't create reactive proxies for object values.
 *
 * @template T - The type of value to store in the ref
 * @param value - The initial value
 * @returns A new ref instance
 *
 * @example
 * ```ts
 * const divRef = ref();
 * <div ref={divRef}></div>
 * ```
 */
export function ref<T>(value: T = undefined as unknown as T): Ref<T> {
  if (isRef(value)) {
    return value as Ref<T>;
  }

  if (isSignal(value)) {
    return new RefImpl(value.peek() as T);
  }

  return new RefImpl(value);
}

/**
 * Type guard to check if a value is a Ref instance.
 *
 * @template T - The type of value held by the ref
 * @param value - The value to check
 * @returns True if the value is a Ref instance
 */
export function isRef<T>(value: unknown): value is Ref<T> {
  return !!value && !!value[SignalFlags.IS_REF];
}
