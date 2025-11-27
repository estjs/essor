import { hasChanged, isFunction, isPlainObject } from '@estjs/shared';
import { ReactiveFlags, SignalFlags } from './constants';
import { activeSub, checkDirty, endTracking, linkReactiveNode, startTracking } from './link';
import { shallowPropagate } from './propagation';
import type { DebuggerEvent, Link, ReactiveNode } from './link';

/**
 * Computed getter function type
 */
export type ComputedGetter<T> = () => T;

/**
 * Computed setter function type
 */
export type ComputedSetter<T> = (value: T) => void;

/**
 * Computed options configuration
 */
export interface ComputedOptions<T> {
  /** Getter function to compute the value */
  get: ComputedGetter<T>;

  /** Optional setter function to make the computed writable */
  set?: ComputedSetter<T>;

  /**
   * Debug callback invoked when a dependency is tracked
   * Only called in development mode
   *
   * @param event - Information about the tracked dependency
   */
  onTrack?: (event: DebuggerEvent) => void;

  /**
   * Debug callback invoked when the computed is triggered by a dependency change
   * Only called in development mode
   *
   * @param event - Information about what triggered the recomputation
   */
  onTrigger?: (event: DebuggerEvent) => void;
}

/**
 * Computed interface
 */
export interface Computed<T> {
  readonly value: T;
  peek(): T;
}

/**
 * Sentinel symbol used to represent "no value" state in computed
 * Using a Symbol ensures it cannot conflict with any actual computed value
 */
const NO_VALUE = Symbol('computed-no-value');

/**
 * Computed implementation class
 *
 * Implements both Computed and ReactiveNode interfaces.
 * Features:
 * - Lazy evaluation: only computes when accessed
 * - Smart caching: returns cached value when dependencies haven't changed
 * - Automatic tracking: automatically tracks dependencies during computation
 *
 * @template T - The type of the computed value
 */
export class ComputedImpl<T = any> implements Computed<T>, ReactiveNode {
  // ===== ReactiveNode interface implementation =====
  depLink?: Link;
  subLink?: Link;
  depLinkTail?: Link;
  subLinkTail?: Link;
  flag: ReactiveFlags = ReactiveFlags.MUTABLE | ReactiveFlags.DIRTY;

  //@ts-ignore
  private readonly [SignalFlags.IS_COMPUTED] = true as const;

  // ===== Core properties =====
  readonly getter: ComputedGetter<T>;
  readonly setter?: ComputedSetter<T>;

  // ===== Debug hooks =====
  readonly onTrack?: (event: DebuggerEvent) => void;
  readonly onTrigger?: (event: DebuggerEvent) => void;

  // ===== Cache =====
  // Use symbol sentinel to distinguish "no value" from undefined/null values
  private _value: T | typeof NO_VALUE = NO_VALUE;

  /**
   * Create a Computed instance
   *
   * @param getter - The computation function
   * @param setter - Optional setter function
   * @param onTrack - Optional debug callback for dependency tracking
   * @param onTrigger - Optional debug callback for triggers
   */
  constructor(
    getter: ComputedGetter<T>,
    setter?: ComputedSetter<T>,
    onTrack?: (event: DebuggerEvent) => void,
    onTrigger?: (event: DebuggerEvent) => void,
  ) {
    this.getter = getter;
    this.setter = setter;
    this.onTrack = onTrack;
    this.onTrigger = onTrigger;
    this.flag |= ReactiveFlags.DIRTY;
  }

  get value(): T {
    // Track dependencies if accessed within an effect or computed
    if (activeSub) {
      linkReactiveNode(this, activeSub);
    }

    // Cache flag and hasValue to reduce property access
    const flags = this.flag;
    const hasValue = this._value !== NO_VALUE;

    if (hasValue && !(flags & (ReactiveFlags.DIRTY | ReactiveFlags.PENDING))) {
      return this._value as T;
    }

    // Dirty state or no value: must recompute
    if (!hasValue || flags & ReactiveFlags.DIRTY) {
      this.recompute();
      return this._value as T;
    }

    // Pending state: check if dependencies actually changed
    if (flags & ReactiveFlags.PENDING) {
      if (this.depLink && checkDirty(this.depLink, this)) {
        // Dependencies changed, recompute
        this.recompute();
      } else {
        // Dependencies unchanged, clear pending flag using cached flags
        this.flag = flags & ~ReactiveFlags.PENDING;
      }
    }

    return this._value as T;
  }

  /**
   * Set value (only effective when setter is provided)
   *
   * @param newValue - The new value
   */
  set value(newValue: T) {
    if (this.setter) {
      this.setter(newValue);
    } else if (__DEV__) {
      console.warn(
        '[Computed] Cannot set readonly computed value. ' +
          'Provide a setter in the computed options to make it writable.\n' +
          'Example: computed({ get: () => value, set: (v) => { ... } })',
      );
    }
  }

  /**
   * Read value without tracking dependencies
   *
   * @returns Current value
   */
  peek(): T {
    if (this._value === NO_VALUE) {
      this.recompute();
    }
    return this._value as T;
  }

  /**
   * Recompute the value
   *
   *  computation logic:
   * 1. Start tracking dependencies
   * 2. Execute getter function
   * 3. Check if value changed using optimized comparison
   * 4. If changed, update cache and notify subscribers
   * 5. End tracking, clean up stale dependencies
   * @private
   */
  private recompute(): void {
    // Store old value for change detection
    // Use NO_VALUE sentinel to distinguish initial state from undefined/null values
    const oldValue = this._value;
    const hadValue = oldValue !== NO_VALUE;

    // Start tracking dependencies
    const prevSub = startTracking(this);

    try {
      // Execute computation
      const newValue = this.getter();

      // Cache current flags for efficient bitwise operations
      const flags = this.flag;
      // Pre-calculate the mask for clearing DIRTY and PENDING flags
      const clearMask = ~(ReactiveFlags.DIRTY | ReactiveFlags.PENDING);

      // - If no previous value, always consider it changed
      // - Otherwise use hasChanged for proper comparison (handles NaN, etc.)
      const valueChanged = !hadValue || hasChanged(oldValue as any, newValue);

      if (valueChanged) {
        // Update cache
        this._value = newValue;

        // Clear DIRTY and PENDING flags in single operation using cached flags
        this.flag = flags & clearMask;

        // Debug hook: notify about the trigger
        if (__DEV__ && this.onTrigger) {
          this.onTrigger({
            effect: this,
            target: this as any,
            type: 'set',
            key: 'value',
            newValue,
          });
        }

        // Notify subscribers only when value actually changed
        // This prevents unnecessary propagation
        if (this.subLink) {
          shallowPropagate(this.subLink);
        }
      } else {
        // Value unchanged, only clear flags using cached flags
        // No need to propagate since subscribers already have correct value
        this.flag = flags & clearMask;
      }
    } catch (error) {
      // On error, ensure flags are cleared to prevent stuck dirty state
      this.flag &= ~(ReactiveFlags.DIRTY | ReactiveFlags.PENDING);

      if (__DEV__) {
        console.error(
          '[Computed] Error occurred while computing value. ' +
            'Check your getter function for errors.',
          error,
        );
      }

      throw error;
    } finally {
      // End tracking, clean up stale dependencies
      // This removes links to dependencies that are no longer accessed
      endTracking(this, prevSub);
    }
  }

  /**
   * Check if update is needed
   *
   * Internal use, called by reactive system.
   *
   * @returns true if value changed
   */
  shouldUpdate(): boolean {
    const hadValue = this._value !== NO_VALUE;
    const oldValue = this._value;

    this.recompute();

    if (!hadValue) {
      return true;
    }

    return hasChanged(this._value, oldValue);
  }
}

/**
 * Create a Computed value
 *
 * @param getterOrOptions - Computation function or configuration object
 * @returns Computed instance
 *
 * @example
 * ```typescript
 * // Read-only computed
 * const count = signal(0);
 * const doubled = computed(() => count.value * 2);
 *
 * console.log(doubled.value); // 0
 * count.value = 5;
 * console.log(doubled.value); // 10
 *
 * // Writable computed
 * const firstName = signal('John');
 * const lastName = signal('Doe');
 *
 * const fullName = computed({
 *   get: () => `${firstName.value} ${lastName.value}`,
 *   set: (value) => {
 *     const [first, last] = value.split(' ');
 *     firstName.value = first;
 *     lastName.value = last;
 *   }
 * });
 *
 * fullName.value = 'Jane Smith';
 * console.log(firstName.value); // 'Jane'
 * ```
 */
export function computed<T>(
  getterOrOptions: ComputedGetter<T> | ComputedOptions<T>,
): ComputedImpl<T> {
  // Guard: Prevent passing computed to computed
  if (isComputed(getterOrOptions)) {
    if (__DEV__) {
      console.warn(
        '[Computed] Creating a computed from another computed is not recommended. ' +
          'The existing computed will be returned to avoid unnecessary wrapping.',
      );
    }
    return getterOrOptions as unknown as ComputedImpl<T>;
  }

  // Validate input
  if (!getterOrOptions) {
    throw new Error(
      '[Computed] Invalid argument: computed() requires a getter function or options object.',
    );
  }

  if (isFunction(getterOrOptions)) {
    return new ComputedImpl(getterOrOptions);
  }

  if (isPlainObject(getterOrOptions)) {
    const { get, set, onTrack, onTrigger } = getterOrOptions;

    if (!get) {
      throw new Error(
        '[Computed] Invalid options: getter function is required.\n' +
          'Usage: computed({ get: () => value, set: (v) => { ... } })',
      );
    }

    if (!isFunction(get)) {
      throw new TypeError(
        '[Computed] Invalid options: getter must be a function.\n' + `Received: ${typeof get}`,
      );
    }

    return new ComputedImpl(get, set, onTrack, onTrigger);
  }

  throw new Error(
    '[Computed] Invalid argument: expected a function or options object.\n' +
      `Received: ${typeof getterOrOptions}`,
  );
}

/**
 * Type guard - Check if value is Computed
 *
 * @param value - The value to check
 * @returns true if value is Computed
 */
export function isComputed<T>(value: unknown): value is Computed<T> {
  return !!value && !!value[SignalFlags.IS_COMPUTED];
}
