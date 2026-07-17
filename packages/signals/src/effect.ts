import { error, isFunction } from '@estjs/shared';
import { EffectFlags, ReactiveFlags, SignalFlags } from './constants';
import {
  checkDirty,
  clearPropagationFlags,
  endTracking,
  setActiveSub,
  startTracking,
  unlinkReactiveNode,
} from './system';
import { isBatching } from './batch';
import {
  type EffectScope,
  type ScopedReactiveEffect,
  recordDisposable,
  releaseDisposable,
} from './effectScope';
import { createScheduler, queueJob } from './scheduler';
import type { Computed } from './computed';
import type { Signal } from './signal';
import type { Reactive } from './reactive';
import type { DebuggerEvent, Link, ReactiveNode } from './system';
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
   * Whether a function returned by the effect function is captured as a
   * cleanup handler (invoked before the next run and on stop).
   * Defaults to true. watch() disables this because its getter's return
   * value is data, not a cleanup.
   */
  captureCleanup?: boolean;

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
export class EffectImpl<T = any> implements ReactiveNode, ScopedReactiveEffect {
  //  ReactiveNode interface implementation
  depLink?: Link;
  subLink?: Link;
  depLinkTail?: Link;
  subLinkTail?: Link;
  flag: ReactiveFlags = ReactiveFlags.WATCHING | ReactiveFlags.DIRTY;

  // @ts-ignore
  private readonly [SignalFlags.IS_EFFECT] = true as const;

  //  Core properties
  readonly fn: EffectFunction<T>;
  readonly options?: EffectOptions;
  private _flushScheduler?: () => void | Promise<void>;
  /** Resolved once in the constructor: `options.flush` aliases `options.scheduler`. */
  private readonly _scheduler?: EffectScheduler | FlushTiming;

  // Debug callbacks (only in development)
  onTrack?: (event: DebuggerEvent) => void;
  onTrigger?: (event: DebuggerEvent) => void;

  //  State management
  private _active = true;
  scope?: EffectScope;

  /**
   * Cleanup function returned by the previous execution of `fn`.
   * Invoked exactly once — before the next run, or on stop().
   */
  private _cleanup?: () => void;

  /**
   * Create an Effect instance.
   *
   * @param fn - The effect function.
   * @param options - Configuration options.
   */
  constructor(fn: EffectFunction<T>, options?: EffectOptions) {
    this.fn = fn;

    if (options) {
      this.options = options;
      // Use flush as an alias for scheduler if provided
      const scheduler = options.flush || options.scheduler;
      this._scheduler = scheduler;

      if (scheduler && !isFunction(scheduler)) {
        this._flushScheduler = createScheduler(() => this._guardedRun(), scheduler);
      }

      // For development debugging hooks, we assign them directly to the instance
      // so dependency tracking can read them without an extra optional chain.
      if (__DEV__) {
        if (options.onTrack) this.onTrack = options.onTrack;
        if (options.onTrigger) this.onTrigger = options.onTrigger;
      }
    }

    recordDisposable(this);
  }

  /**
   * Check if the Effect is active.
   *
   * @returns {boolean} True if the effect is active.
   */
  get active(): boolean {
    return this._active;
  }

  /**
   * Check if the Effect is dirty (needs re-execution).
   *
   * @returns {boolean} True if the effect is dirty.
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
   * Pause Effect execution.
   *
   * When an effect is paused:
   * - It stops responding to dependency changes.
   * - Notifications are ignored (see notify method).
   * - DIRTY and PENDING flags are still set when dependencies change.
   * - The effect remains active and maintains its dependency links.
   *
   * Use cases:
   * - Temporarily disable effects during bulk updates.
   * - Prevent effects from running during initialization.
   * - Control when side effects should execute.
   *
   * @returns {void}
   */
  pause(): void {
    this.flag |= EffectFlags.PAUSED;
  }

  /**
   * Resume Effect execution.
   *
   * When an effect is resumed:
   * - The PAUSED flag is cleared.
   * - If dependencies changed during pause (DIRTY or PENDING flags set),
   *   the effect re-executes according to its scheduling strategy.
   * - If no changes occurred, the effect simply becomes active again.
   *
   * State management:
   * - Clears PAUSED flag atomically.
   * - Checks for accumulated DIRTY/PENDING flags.
   * - Triggers execution if needed.
   *
   * @returns {void}
   */
  resume(): void {
    if (!this._active) {
      return;
    }

    this.flag &= ~EffectFlags.PAUSED;

    // Check for updates that accumulated during pause. The `dirty` getter
    // validates a bare PENDING via checkDirty(), so an effect whose deps did
    // not actually change is NOT re-run on resume.
    if (this.dirty) {
      // Dispatch directly instead of going through notify(), whose
      // early-exit would swallow the call when DIRTY is already set.
      this._scheduleRun();
    }
  }

  /**
   * Execute the Effect function.
   *
   * Core execution flow:
   * 1. Check if active
   * 2. Run the cleanup returned by the previous execution
   * 3. Clear dirty flag
   * 4. Start tracking dependencies
   * 5. Execute user function, capture returned cleanup
   * 6. End tracking, clean up stale dependencies
   *
   * @returns {T} The return value of the effect function.
   */
  run(): T {
    // Already stopped, execute without tracking
    if (!this._active) {
      return this.fn();
    }

    // Cache flags and use bitwise operations to update multiple flags efficiently
    const flags = this.flag;
    // Clear DIRTY/PENDING flags and set RUNNING to block concurrent notify() calls.
    this.flag = (flags & ~(ReactiveFlags.DIRTY | ReactiveFlags.PENDING)) | EffectFlags.RUNNING;

    // Run the previous cleanup before re-executing. RUNNING is already set,
    // so a reactive write inside the cleanup cannot re-enter run(); the
    // cleanup itself executes untracked (see _runCleanup).
    this._runCleanup();

    // Start dependency tracking
    const prevSub = startTracking(this);

    // Whether fn threw — the finally must not undo the catch's DIRTY restore.
    let threw = false;

    try {
      // Execute the effect function
      const result = this.fn();

      // The effect function may return a cleanup function, invoked exactly
      // once before the next run or on stop(). Consumers whose fn returns
      // data (e.g. watch getters) opt out via `captureCleanup: false`.
      if (this.options?.captureCleanup !== false && isFunction(result)) {
        this._cleanup = result as () => void;
      }

      return result;
    } catch (error) {
      // Execution error, restore dirty flag
      this.flag |= ReactiveFlags.DIRTY;
      threw = true;

      throw error;
    } finally {
      // Clear RUNNING flag
      this.flag &= ~EffectFlags.RUNNING;
      // End tracking, clean up stale dependencies
      endTracking(this, prevSub);

      // Any write notification that arrived while RUNNING was set left stale
      // PENDING/RECURSED bits behind (and DIRTY, if a dep was re-read
      // afterwards): propagate() marked us, but notify() ignored the call
      // because RUNNING was set. Left in place, those bits make later
      // propagations take the "already notified" branch and the effect goes
      // permanently silent. Clearing them here (plus DIRTY below) means EVERY
      // notification delivered during this run — self-writes and external
      // writes alike — is deliberately discarded for this round.
      clearPropagationFlags(this);
      if (!threw) {
        this.flag &= ~ReactiveFlags.DIRTY;
      }

      // stop() was called from inside fn: any reads after that point
      // re-linked dependencies through activeSub, and stop() ran too early
      // to see the cleanup fn just returned. Run that cleanup and sever the
      // re-created links so the stopped effect holds no live subscriptions.
      if (!this._active) {
        this._runCleanup();
        this._unlinkDeps();
      }
    }
  }

  private _job?: () => void;

  /**
   * Run the effect only if it is still eligible.
   *
   * A scheduled flush or queued job may fire after stop()/pause() — skip
   * stale runs. A skipped paused run keeps its DIRTY flag, so resume() can
   * catch up.
   *
   * @returns {void}
   */
  private _guardedRun(): void {
    if (this._active && !(this.flag & EffectFlags.PAUSED)) {
      this.run();
    }
  }

  /**
   * Get or create the job function for this effect.
   *
   * @returns {() => void} The job function.
   */
  private getJob(): () => void {
    if (!this._job) {
      this._job = () => this._guardedRun();
    }
    return this._job;
  }

  /**
   * Invoke the cleanup returned by the previous run, exactly once.
   *
   * The reference is cleared before invocation so a re-entrant call
   * (e.g. stop() inside the cleanup) cannot run it twice. Runs untracked
   * so reactive reads inside the cleanup never register as dependencies.
   * Errors are reported without interrupting the caller.
   *
   * @returns {void}
   */
  private _runCleanup(): void {
    const cleanup = this._cleanup;
    if (cleanup) {
      this._cleanup = undefined;
      const prevSub = setActiveSub(undefined);
      try {
        cleanup();
      } catch (_error) {
        if (__DEV__) {
          error('[Effect] cleanup handler threw:', _error);
        }
      } finally {
        setActiveSub(prevSub);
      }
    }
  }

  /**
   * Disconnect all dependency links.
   *
   * This removes this effect from all signals/computed it depends on.
   * Shared by stop() and the post-run repair for stop()-inside-fn.
   *
   * @returns {void}
   */
  private _unlinkDeps(): void {
    let dep = this.depLink;
    while (dep) {
      dep = unlinkReactiveNode(dep, this);
    }
    this.depLinkTail = undefined;
  }

  /**
   * Dispatch a run through the configured scheduling strategy.
   *
   * Shared by notify() and resume() so a resume honors the same
   * scheduler/batch semantics as a regular dependency notification.
   *
   * @returns {void}
   */
  private _scheduleRun(): void {
    const scheduler = this._scheduler;
    if (scheduler) {
      if (isFunction(scheduler)) {
        scheduler(this);
      } else {
        this._flushScheduler?.();
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
   * Notify that the Effect needs to execute.
   *
   * Called by dependent reactive values.
   * Decides whether to execute immediately or defer based on scheduling strategy.
   *
   * @returns {void}
   */
  notify(): void {
    // Cache flags for efficient checking
    const flags = this.flag;

    // Early exit: already stopped, currently running, or already dirty—ignore notification.
    if (!this._active || flags & (EffectFlags.RUNNING | ReactiveFlags.DIRTY)) {
      return;
    }

    // Paused: record the missed update so resume() can catch up, but don't run.
    if (flags & EffectFlags.PAUSED) {
      this.flag = flags | ReactiveFlags.DIRTY;
      return;
    }

    // Mark as dirty
    this.flag = flags | ReactiveFlags.DIRTY;

    // Trigger callback
    if (__DEV__ && this.options?.onTrigger) {
      this.options.onTrigger({
        effect: this,
        target: {},
        type: 'set',
      });
    }

    // Use scheduler or decide execution method based on batch state
    this._scheduleRun();
  }

  /**
   * Stop the Effect.
   *
   * After stopping:
   * - No longer responds to dependency changes.
   * - Disconnects all dependency links.
   * - Clears cached job function.
   * - Calls onStop callback.
   * - Verifies complete cleanup in development mode.
   *
   * @returns {void}
   */
  stop(): void {
    if (!this._active) {
      return;
    }

    this._active = false;
    releaseDisposable(this);

    // Run the pending cleanup from the last execution.
    // Skipped while RUNNING: stop() is being called from inside fn, so the
    // cleanup that fn is about to return hasn't been captured yet — run()'s
    // finally block handles it instead.
    if (!(this.flag & EffectFlags.RUNNING)) {
      this._runCleanup();
    }

    // Disconnect all dependency links
    // This removes this effect from all signals/computed it depends on
    this._unlinkDeps();

    // Disconnect all subscription links
    // This removes any subscribers that depend on this effect (rare but possible)
    let sub = this.subLink;
    while (sub) {
      sub = unlinkReactiveNode(sub);
    }

    // Clear cached job function to free memory
    this._job = undefined;
    this._flushScheduler = undefined;

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
    if (this.options?.onStop) {
      this.options.onStop();
    }
  }
}

/**
 * Create and immediately execute an Effect.
 *
 * @param fn - The effect function.
 * @param options - Configuration options.
 * @returns {EffectRunner<T>} Effect runner.
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

  /**
   * Runs the wrapped effect.
   */
  const runner: any = () => effectInstance.run();
  runner.effect = effectInstance;
  runner.stop = () => effectInstance.stop();

  return runner as EffectRunner<T>;
}

/**
 * Stop Effect execution.
 *
 * @param runner - The effect runner to stop.
 * @returns {void}
 */
export function stop(runner: EffectRunner): void {
  runner.effect.stop();
}

/**
 * Type guard - Check if value is an Effect instance.
 *
 * @param value - The value to check.
 * @returns {boolean} True if value is an Effect instance.
 */
export function isEffect(value: any): value is EffectImpl {
  return !!(value && value[SignalFlags.IS_EFFECT]);
}

/**
 * Memoized effect function type
 *
 * @template T - State type
 * @param prevState - State from previous execution
 * @returns New state
 */
export type MemoEffectFn<T> = (prevState: T) => T;

/**
 * Create a memoized Effect.
 *
 * A memoized effect remembers the return value from the previous execution
 * and passes it as a parameter on the next execution.
 *
 * @param fn - The memoized function.
 * @param initialState - Initial state.
 * @param options - Configuration options.
 * @returns {EffectRunner<void>} Effect runner.
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

  /**
   * Executes the effect callback.
   */
  const effectFn = () => {
    // Pass current state each time
    // fn may modify the passed object, so the return value is the update state
    const result = fn(currentState);
    currentState = result;
  };

  return effect(effectFn, options);
}
