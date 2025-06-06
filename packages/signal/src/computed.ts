import { isFunction, isObject, warn } from '@estjs/shared';
import { effect, track, trigger } from './effect';
import { ComputedKey, SignalFlags } from './constants';

/**
 * Interface representing a computed property that is read-only and tracks its dependencies.
 * Computed properties automatically update when their dependencies change.
 *
 * @template T - The type of the computed value.
 */
export interface Computed<T> {
  /**
   * The computed value. Reading this property will automatically track dependencies.
   * The value is lazily evaluated and cached until dependencies change.
   */
  readonly value: T;

  /**
   * Retrieves the computed value without tracking dependencies.
   * Useful when you need to read the value without creating a dependency relationship.
   *
   * @returns The current computed value.
   */
  peek(): T;
}

/**
 * Options for creating a computed property.
 * @template T - The type of the computed value.
 */
export interface ComputedOptions<T> {
  /**
   * A function that computes and returns the value.
   * This function can access reactive state, which will be tracked as dependencies.
   */
  get: () => T;

  /**
   * Optional setter function to handle writes to the computed value.
   * If not provided, the computed property will be read-only.
   */
  set?: (value: T) => void;
}

/**
 * Implementation of the computed property.
 * The computed value is eagerly recalculated when its dependencies change.
 * This implementation supports branch switching by re-collecting dependencies on each run.
 *
 * @template T - The type of the computed value.
 * @internal
 */
export class ComputedImpl<T> implements Computed<T> {
  private _value!: T;
  //@ts-ignore
  private readonly [SignalFlags.IS_COMPUTED] = true;
  // We store stop function in case we want to stop the effect later
  constructor(
    private readonly _getter: () => T,
    private readonly _setter?: (v: T) => void,
  ) {
    // Create an effect that computes the value eagerly.
    // Using flush: 'sync' so that the effect runs immediately when dependencies change,
    // and onTrigger to notify dependents by triggering ComputedKey.
    effect(
      () => {
        this._value = this._getter();
      },
      {
        flush: 'sync',
        onTrigger: () => {
          trigger(this, ComputedKey);
        },
      },
    );
  }

  /**
   * Gets the current computed value, tracking it as a dependency
   */
  get value(): T {
    track(this, ComputedKey);
    return this._value;
  }

  /**
   * Gets the current value without tracking it as a dependency
   */
  peek(): T {
    return this._value;
  }

  /**
   * Computed values are readonly
   */
  set value(v: T) {
    if (__DEV__) {
      warn('Write operation failed: computed value is readonly');
    }
    this._setter?.(v);
  }
}

/**
 * Creates a computed property that automatically tracks its dependencies.
 * The computed value is cached and only recalculated when dependencies change.
 *
 * @template T - The type of the computed value.
 * @param options - A getter function or an object with get/set functions.
 * @returns A computed property of type Computed<T>.
 *
 * @example
 * ```ts
 * const count = signal(0);
 *
 * // Read-only computed
 * const double = computed(() => count.value * 2);
 * console.log(double.value); // 0
 * count.value++;
 * console.log(double.value); // 2
 *
 * // Writable computed
 * const plusOne = computed({
 *   get: () => count.value + 1,
 *   set: (value) => count.value = value - 1
 * });
 * console.log(plusOne.value); // 2
 * plusOne.value = 5;
 * console.log(count.value); // 4
 * ```
 */
export function computed<T>(options: (() => T) | ComputedOptions<T>): Computed<T> {
  let getter: () => T;
  let setter: ((v: T) => void) | undefined;

  if (isFunction(options)) {
    getter = options;
  } else if (isObject(options)) {
    getter = options.get;
    setter = options.set;

    if (!getter) {
      if (__DEV__) {
        warn('Computed getter is required. Provide a function that returns the computed value.');
      }
      throw new Error('Computed getter is required');
    }
  } else {
    if (__DEV__) {
      warn(
        'Invalid computed options. Provide either a getter function or an object with get/set functions.',
      );
    }
    throw new Error('Invalid computed options');
  }

  return new ComputedImpl<T>(getter, setter);
}

/**
 * Type guard to check if a value is a computed property.
 *
 * @template T - The type of the computed value.
 * @param value - The value to check.
 * @returns True if the value is a computed property; false otherwise.
 *
 * @example
 * ```ts
 * const count = signal(0);
 * const double = computed(() => count.value * 2);
 *
 * console.log(isComputed(double)); // true
 * console.log(isComputed(count)); // false
 * ```
 */
export function isComputed<T>(value: unknown): value is Computed<T> {
  if (!value || !isObject(value)) {
    return false;
  }
  return !!(value as Record<symbol, unknown>)[SignalFlags.IS_COMPUTED];
}

/**
 * Type helper to extract the value type from a computed property.
 *
 * @template T - The computed property type.
 */
export type ComputedValue<T> = T extends Computed<infer V> ? V : never;
