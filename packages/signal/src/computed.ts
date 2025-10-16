import { hasChanged, isFunction, isObject, warn } from '@estjs/shared';
import {
  type Link,
  type ReactiveNode,
  activeSub,
  checkDirty,
  endTracking,
  linkReactiveNode as link,
  shallowPropagate,
  startTracking,
} from './link';
import { ReactiveFlags, SignalFlags } from './constants';
import type { DebuggerEvent, DebuggerOptions } from './effect';
/**
 * Public interface for computed values.
 *
 * Computed values are reactive expressions that derive their value from other
 * reactive sources. They automatically track dependencies and update when
 * those dependencies change.
 *
 * @template T - The type of value computed by this computed property
 */
export interface Computed<T = any> {
  /**
   * The current computed value.
   *
   * Reading this property:
   * - Establishes a dependency relationship with the currently active effect
   * - Triggers recomputation if the value is stale
   * - Returns the cached value if dependencies haven't changed
   *
   * Writing to this property:
   * - Only works if a setter function was provided during creation
   * - Triggers the setter function with the new value
   */
  readonly value: T;

  /**
   * Reads the current value without establishing a dependency.
   *
   * This is useful when you need to read a computed value but don't want
   * to create a dependency relationship, such as:
   * - Inside effect cleanup functions
   * - In debugging or logging code
   * - When implementing custom reactive patterns
   *
   * @returns The current computed value without side effects
   */
  peek(): T;
}
// Define the getter function type for computed properties.
export type ComputedGetter<T> = (oldValue?: T) => T;
// Define the setter function type for computed properties.
export type ComputedSetter<T> = (newValue: T) => void;

// Define the options interface for computed properties.
export interface ComputedOptions<T, S = T> extends DebuggerOptions {
  get: ComputedGetter<T>; // getter function
  set: ComputedSetter<S>; // setter function
}

// Core implementation class for computed properties.
export class ComputedImpl<T = any> implements ReactiveNode {
  // Implement ReactiveNode interface
  depLink?: Link; // Dependency link head
  subLink?: Link; // Subscriber link head
  depLinkTail?: Link; // Dependency link tail
  subLinkTail?: Link; // Subscriber link tail
  flag: number = ReactiveFlags.MUTABLE | ReactiveFlags.DIRTY; // Initial state is "mutable" and "dirty"

  /**
   * @internal
   * Store the computed value.
   */
  _value: T;

  /**
   * @internal
   * Mark as ref for Vue compatibility.
   */
  readonly __v_isRef = true;

  // Fix type: correctly declare computed property flag, remove unnecessary type ignore
  // This flag is used for runtime identification of computed property instances
  //@ts-ignore
  private readonly [SignalFlags.IS_COMPUTED] = true as const;

  // Provide effect getter for backward compatibility.
  get effect(): this {
    return this;
  }
  // Provide dep getter for backward compatibility.
  get dep(): ReactiveNode {
    return this;
  }
  /**
   * @internal
   * Provide _dirty getter for backward compatibility.
   */
  get _dirty(): boolean {
    const flags = this.flag;
    if (flags & ReactiveFlags.DIRTY) {
      return true;
    }
    if (flags & ReactiveFlags.PENDING) {
      if (checkDirty(this.depLink!, this)) {
        this.flag = flags | ReactiveFlags.DIRTY;
        return true;
      } else {
        this.flag = flags & ~ReactiveFlags.PENDING;
      }
    }
    return false;
  }
  /**
   * @internal
   * Provide _dirty setter for backward compatibility.
   */
  set _dirty(v: boolean) {
    if (v) {
      this.flag |= ReactiveFlags.DIRTY;
    } else {
      this.flag &= ~(ReactiveFlags.DIRTY | ReactiveFlags.PENDING);
    }
  }

  // onTrack callback used only in development mode.
  onTrack?: (event: DebuggerEvent) => void;
  // onTrigger callback used only in development mode.
  onTrigger?: (event: DebuggerEvent) => void;

  // Constructor that receives getter and optional setter.
  constructor(
    public fn: ComputedGetter<T>,
    private readonly setter: ComputedSetter<T> | undefined,
  ) {}

  // value getter, the core of computed properties.
  get value(): T {
    const flags = this.flag;
    // If "dirty", or "pending" and dependencies are dirty, need to recalculate.
    if (
      flags & ReactiveFlags.DIRTY ||
      (flags & ReactiveFlags.PENDING && checkDirty(this.depLink!, this))
    ) {
      // shouldUpdate will execute calculation and update _value.
      if (this.shouldUpdate()) {
        const subs = this.subLink;
        // If there are subscribers, shallow propagate changes.
        if (subs) {
          shallowPropagate(subs);
        }
      }
    } else if (flags & ReactiveFlags.PENDING) {
      // If pending but dependencies are not dirty, clear pending state.
      this.flag = flags & ~ReactiveFlags.PENDING;
    }
    // If there is an active subscriber, establish dependency relationship.
    if (activeSub) {
      link(this, activeSub);
    }
    if (this.onTrack) {
      this.onTrack({
        type: 'track',
        target: this.fn,
        effect: this,
        oldValue: this._value,
        newValue: this._value,
      });
    }
    // Return cached or newly computed value.
    return this._value;
  }

  // value setter.
  set value(newValue) {
    // If setter is provided, call it.
    if (this.setter) {
      this.setter(newValue);
    } else if (__DEV__) {
      // Otherwise, warn in development mode that this is a readonly computed property.
      warn('Write operation failed: computed value is readonly');
    }
  }

  // Determine if update is needed and execute update.
  shouldUpdate(): boolean {
    // Start dependency tracking.
    const prevSub = startTracking(this);
    try {
      const oldValue = this._value;
      // Execute getter function to get new value.
      const newValue = this.fn(oldValue);

      // If value has changed.
      if (hasChanged(oldValue, newValue)) {
        // Update internal value.
        this._value = newValue;
        if (this.onTrigger) {
          this.onTrigger({
            type: 'trigger',
            target: this.fn,
            effect: this,
            oldValue,
            newValue,
          });
        }
        return true; // Return true indicating updated
      }
      return false; // Return false indicating not updated
    } finally {
      // End dependency tracking.
      endTracking(this, prevSub);
    }
  }

  peek(): T {
    return this._value;
  }
}

/**
 * Create a computed property that automatically tracks its dependencies.
 * The computed value is cached and only recalculated when dependencies change.
 *
 * @param options - A getter function or an object containing get/set functions.
 * @returns A computed property of type ComputedImpl<T>.
 */
export function computed<T>(options: (() => T) | ComputedOptions<T>): ComputedImpl<T> {
  let getter: () => T;
  let setter: ((v: T) => void) | undefined;

  // Handle different types of options parameters.
  if (isFunction(options)) {
    getter = options;
  } else if (isObject(options)) {
    getter = options.get;
    setter = options.set;

    // Getter must be provided.
    if (!getter) {
      if (__DEV__) {
        warn('Computed getter is required. Provide a function that returns the computed value.');
      }
      throw new Error('Computed getter is required');
    }
  } else {
    // Invalid options parameter.
    if (__DEV__) {
      warn(
        'Invalid computed options. Provide either a getter function or an object with get/set functions.',
      );
    }
    throw new Error('Invalid computed options');
  }

  // Return new ComputedImpl instance.
  return new ComputedImpl<T>(getter, setter);
}

/**
 * Type guard to check if a value is a computed property.
 *
 * @param value - The value to check.
 * @returns True if the value is a computed property, false otherwise.
 */
export function isComputed<T>(value: unknown): value is ComputedImpl<T> {
  if (!value || !isObject(value)) {
    return false;
  }
  // Determine by checking the internal flag.
  return !!(value as Record<symbol, unknown>)[SignalFlags.IS_COMPUTED];
}

/**
 * 类型助手，从计算属性类型中提取其值的类型。
 *
 * @template T - 计算属性的类型。
 */
export type ComputedValue<T> = T extends ComputedImpl<infer V> ? V : never;
