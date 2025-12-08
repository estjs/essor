import { error, isFunction, warn } from '@estjs/shared';
import { EffectFlags, ReactiveFlags, SignalFlags } from './constants';
import { checkDirty, endTracking, startTracking, unlinkReactiveNode } from './link';
import { isBatching } from './batch';
import { createScheduler, queueJob } from './scheduler';
import type { Computed } from './computed';
import type { Signal } from './signal';
import type { Reactive } from './reactive';
import type { DebuggerEvent, Link, ReactiveNode } from './link';
import type { FlushTiming } from './scheduler';

/**
 * Unwrap a Signal, Computed, or Reactive type to get the underlying value type
 *
 * @template T - The wrapped type
 *
 * @example
 * ```typescript
 * import type { Signal, Computed, Reactive, Unwrap } from '@estjs/signals';
 *
 * type Count = Unwrap<Signal<number>>; // number
 * type User = Unwrap<Reactive<{ name: string }>>; // { name: string }
 * type Double = Unwrap<Computed<number>>; // number
 * ```
 */
export type Unwrap<T> =
  T extends Signal<infer V>
    ? V
    : T extends Computed<infer V>
      ? V
      : T extends Reactive<infer V extends object>
        ? V
        : T;

/**
 * Effect function type
 */
export type EffectFunction<T = any> = () => T;

/**
 * Effect scheduler function type
 */
export type EffectScheduler = (effect: EffectImpl) => void;

/**
 * Effect options configuration
 */
export interface EffectOptions {
  /**
   * Custom scheduler for controlling when the effect runs
   * Can be a function or a timing string ('sync', 'pre', 'post')
   */
  scheduler?: EffectScheduler | FlushTiming;

  /**
   * Alias for scheduler - controls when the effect runs
   * Can be 'sync', 'pre', or 'post'
   */
  flush?: FlushTiming;

  /**
   * Callback invoked when the effect is stopped
   * Useful for cleanup operations
   */
  onStop?: () => void;

  /**
   * Debug callback invoked when a dependency is tracked
   * Only called in development mode
   *
   * @param event - Information about the tracked dependency
   *
   * @example
   * ```typescript
   * effect(() => {
   *   console.log(signal.value);
   * }, {
   *   onTrack(event) {
   *     console.log('Tracked:', event.type, event.key);
   *   }
   * });
   * ```
   */
  onTrack?: (event: DebuggerEvent) => void;

  /**
   * Debug callback invoked when the effect is triggered by a dependency change
   * Only called in development mode
   *
   * @param event - Information about what triggered the effect
   *
   * @example
   * ```typescript
   * effect(() => {
   *   console.log(signal.value);
   * }, {
   *   onTrigger(event) {
   *     console.log('Triggered by:', event.type, event.key, event.newValue);
   *   }
   * });
   * ```
   */
  onTrigger?: (event: DebuggerEvent) => void;
}

/**
 * Effect runner function with attached effect instance
 */
export interface EffectRunner<T = any> {
  (): T;
  effect: EffectImpl<T>;
  stop: () => void;
}

/**
 * Effect implementation class
 *
 * Implements the ReactiveNode interface, acting as a subscriber in the reactive system.
 *
 * Core features:
 * - Automatically tracks dependent reactive values
 * - Automatically re-executes when dependencies change
 * - Supports custom scheduling strategies
 * - Complete lifecycle management
 *
 * @template T - The return type of the effect function
 */
export class EffectImpl<T = any> implements ReactiveNode {
  // ===== ReactiveNode interface implementation =====
  depLink?: Link;
  subLink?: Link;
  depLinkTail?: Link;
  subLinkTail?: Link;
  flag: ReactiveFlags = ReactiveFlags.WATCHING | ReactiveFlags.DIRTY;

  // @ts-ignore
  private readonly [SignalFlags.IS_EFFECT] = true as const;

  // ===== Core properties =====
  readonly fn: EffectFunction<T>;
  readonly scheduler?: EffectScheduler | FlushTiming;
  readonly onStop?: () => void;
  readonly onTrack?: (event: DebuggerEvent) => void;
  readonly onTrigger?: (event: DebuggerEvent) => void;
  readonly flash?: 'sync' | 'pre' | 'post';

  // ===== State management =====
  private _active = true;

  /**
   * Create an Effect instance
   *
   * @param fn - The effect function
   * @param options - Configuration options
   */
  constructor(fn: EffectFunction<T>, options?: EffectOptions) {
    this.fn = fn;

    if (options) {
      // Use flush as an alias for scheduler if provided
      this.scheduler = options.flush || options.scheduler;
      this.onStop = options.onStop;
      this.onTrack = options.onTrack;
      this.onTrigger = options.onTrigger;
    }
  }

  /**
   * Check if the Effect is active
   */
  get active(): boolean {
    return this._active;
  }

  /**
   * Check if the Effect is dirty (needs re-execution)

   */
  get dirty(): boolean {
    const flags = this.flag;

    // Explicitly marked as dirty
    if (flags & ReactiveFlags.DIRTY) {
      return true;
    }

    // Pending state, need to check dependencies
    if (flags & ReactiveFlags.PENDING) {
      if (this.depLink && checkDirty(this.depLink, this)) {
        // Use bitwise operations to set DIRTY and clear PENDING in one operation
        this.flag = (flags & ~ReactiveFlags.PENDING) | ReactiveFlags.DIRTY;
        return true;
      }
      // Dependencies unchanged, clear pending flag using cached flags
      this.flag = flags & ~ReactiveFlags.PENDING;
    }

    return false;
  }

  /**
   * Pause Effect execution
   *
   * When an effect is paused:
   * - It stops responding to dependency changes
   * - Notifications are ignored (see notify method)
   * - DIRTY and PENDING flags are still set when dependencies change
   * - The effect remains active and maintains its dependency links
   *
   * Use cases:
   * - Temporarily disable effects during bulk updates
   * - Prevent effects from running during initialization
   * - Control when side effects should execute
   *
   * @example
   * ```typescript
   * const count = signal(0);
   * const runner = effect(() => console.log(count.value));
   *
   * runner.effect.pause();
   * count.value = 1; // Effect won't run
   * count.value = 2; // Effect won't run
   * runner.effect.resume(); // Effect runs once with latest value
   * ```
   */
  pause(): void {
    this.flag |= EffectFlags.PAUSED;
  }

  /**
   * Resume Effect execution
   *
   * When an effect is resumed:
   * - The PAUSED flag is cleared
   * - If dependencies changed during pause (DIRTY or PENDING flags set),
   *   the effect executes immediately via notify()
   * - If no changes occurred, the effect simply becomes active again
   *
   * State management:
   * - Clears PAUSED flag atomically
   * - Checks for accumulated DIRTY/PENDING flags
   * - Triggers execution if needed
   *
   * @example
   * ```typescript
   * const count = signal(0);
   * const runner = effect(() => console.log(count.value));
   *
   * runner.effect.pause();
   * count.value = 1; // Queued
   * count.value = 2; // Queued
   * runner.effect.resume(); // Executes once with count.value = 2
   * ```
   */
  resume(): void {
    const flags = this.flag;
    const nextFlags = flags & ~EffectFlags.PAUSED;

    this.flag = nextFlags;

    // Check if there are pending updates that accumulated during pause
    const wasDirty = (nextFlags & ReactiveFlags.DIRTY) !== 0;
    const wasPending = (nextFlags & ReactiveFlags.PENDING) !== 0;

    if (wasDirty || wasPending) {
      this.notify();
    }
  }

  /**
   * Execute the Effect function
   *
   * Core execution flow:
   * 1. Check if active
   * 2. Clear dirty flag
   * 3. Start tracking dependencies
   * 4. Execute user function
   * 5. End tracking, clean up stale dependencies

   * @returns The return value of the effect function
   */
  run(): T {
    // Already stopped, execute without tracking
    if (!this._active) {
      return this.fn();
    }

    // Cache flags and use bitwise operations to update multiple flags efficiently
    const flags = this.flag;
    this.flag = (flags & ~ReactiveFlags.DIRTY) | EffectFlags.STOP;

    // Start dependency tracking
    const prevSub = startTracking(this);

    try {
      // Execute the effect function
      return this.fn();
    } catch (error) {
      // Execution error, restore dirty flag
      this.flag |= ReactiveFlags.DIRTY;

      throw error;
    } finally {
      // Clear running flag
      this.flag &= ~EffectFlags.STOP;
      // End tracking, clean up stale dependencies
      endTracking(this, prevSub);
    }
  }

  private _job?: () => void;

  /**
   * Get or create the job function for this effect
   */
  private getJob(): () => void {
    if (!this._job) {
      this._job = () => this.run();
    }
    return this._job;
  }

  /**
   * Notify that the Effect needs to execute
   *
   * Called by dependent reactive values.
   * Decides whether to execute immediately or defer based on scheduling strategy.
   */
  notify(): void {
    // Cache flags for efficient checking
    const flags = this.flag;

    // Early exit: check multiple conditions using bitwise operations
    // Already stopped, paused, running, or dirty - ignore notification
    if (!this._active || flags & (EffectFlags.PAUSED | EffectFlags.STOP | ReactiveFlags.DIRTY)) {
      return;
    }

    // Mark as dirty
    this.flag = flags | ReactiveFlags.DIRTY;

    // Trigger callback
    if (__DEV__ && this.onTrigger) {
      this.onTrigger({
        effect: this,
        target: {},
        type: 'set',
      });
    }

    // Use scheduler or decide execution method based on batch state
    if (this.scheduler) {
      if (isFunction(this.scheduler)) {
        this.scheduler(this);
      } else {
        // Create and immediately call the scheduler for flush timing
        const schedulerFn = createScheduler(() => this.run(), this.scheduler);
        schedulerFn();
      }
    } else if (isBatching()) {
      // When in batch, queue for execution
      queueJob(this.getJob());
    } else {
      // In normal case, execute immediately and synchronously
      this.run();
    }
  }

  /**
   * Stop the Effect
   *
   * After stopping:
   * - No longer responds to dependency changes
   * - Disconnects all dependency links
   * - Clears cached job function
   * - Calls onStop callback
   * - Verifies complete cleanup in development mode
   */
  stop(): void {
    if (!this._active) {
      if (__DEV__) {
        warn('[Effect] Attempting to stop an already stopped effect.');
      }
      return;
    }

    this._active = false;

    // Disconnect all dependency links
    // This removes this effect from all signals/computed it depends on
    let dep = this.depLink;
    while (dep) {
      dep = unlinkReactiveNode(dep, this);
    }

    // Disconnect all subscription links
    // This removes any subscribers that depend on this effect (rare but possible)
    let sub = this.subLink;
    while (sub) {
      sub = unlinkReactiveNode(sub);
    }

    // Clear cached job function to free memory
    this._job = undefined;

    // Clear link tail pointers to ensure no dangling references
    this.depLinkTail = undefined;
    this.subLinkTail = undefined;

    // Verify cleanup in development mode
    if (__DEV__) {
      // Verify all links are properly cleared
      if (this.depLink) {
        error(
          '[Effect] Cleanup verification failed: depLink not cleared. ' +
            'This indicates a memory leak in the dependency tracking system.',
        );
      }
      if (this.subLink) {
        error(
          '[Effect] Cleanup verification failed: subLink not cleared. ' +
            'This indicates a memory leak in the subscription system.',
        );
      }
    }

    // Call stop callback
    if (this.onStop) {
      this.onStop();
    }
  }
}

/**
 * Create and immediately execute an Effect
 *
 * @param fn - The effect function
 * @param options - Configuration options
 * @returns Effect runner
 *
 * @example
 * ```typescript
 * const count = signal(0);
 *
 * // Basic usage
 * const runner = effect(() => {
 *   console.log('Count:', count.value);
 * });
 *
 * count.value = 1; // Automatically executes, prints 'Count: 1'
 *
 * // Manual execution
 * runner();
 *
 * // Stop
 * runner.effect.stop();
 *
 * // Custom scheduling
 * effect(() => {
 *   console.log(count.value);
 * }, {
 *   scheduler: (eff) => {
 *     setTimeout(() => eff.run(), 100);
 *   }
 * });
 * ```
 */
export function effect<T = any>(fn: EffectFunction<T>, options?: EffectOptions): EffectRunner<T> {
  const effectInstance = new EffectImpl(fn, options);

  try {
    // Execute immediately once
    effectInstance.run();
  } catch (_error) {
    // First execution failed, stop Effect and rethrow
    effectInstance.stop();
    if (__DEV__) {
      error(
        '[Effect] Effect failed during initial execution and has been stopped. ' +
          'Fix the error in your effect function.',
        _error,
      );
    }
    throw _error;
  }

  // Create runner function
  const runner: any = () => effectInstance.run();
  runner.effect = effectInstance;
  runner.stop = () => effectInstance.stop();

  return runner as EffectRunner<T>;
}

/**
 * Stop Effect execution
 *
 * @param runner - The effect runner
 */
export function stop(runner: EffectRunner): void {
  runner.effect.stop();
}

/**
 * Type guard - Check if value is an Effect
 *
 * @param value - The value to check
 * @returns true if value is an Effect
 */
export function isEffect(value: any): value is EffectImpl {
  return !!(value && value[SignalFlags.IS_EFFECT]);
}

// ==================== Memoized Effect ====================

/**
 * Memoized effect function type
 *
 * @template T - State type
 * @param prevState - State from previous execution
 * @returns New state
 */
export type MemoEffectFn<T> = (prevState: T) => T;

/**
 * Create a memoized Effect
 *
 * A memoized effect remembers the return value from the previous execution
 * and passes it as a parameter on the next execution.
 *
 * Use cases:
 * - Incremental DOM updates
 * - Avoiding duplicate operations
 * - State persistence
 * - Difference detection
 *
 * @param fn - The memoized function
 * @param initialState - Initial state
 * @param options - Configuration options
 * @returns Effect runner
 *
 * @example
 * ```typescript
 * const width = signal(100);
 *
 * // Only update DOM when width changes
 * memoEffect(prev => {
 *   const current = width.value;
 *
 *   if (current !== prev.width) {
 *     element.style.width = `${current}px`;
 *     prev.width = current;
 *   }
 *
 *   return prev;
 * }, { width: 0 });
 * ```
 */
export function memoEffect<T>(
  fn: MemoEffectFn<T>,
  initialState: T,
  options?: EffectOptions,
): EffectRunner<void> {
  let currentState = initialState;

  const effectFn = () => {
    // Pass current state each time
    // fn may modify the passed object, so the return value is the update state
    const result = fn(currentState);
    currentState = result;
  };

  return effect(effectFn, options);
}
