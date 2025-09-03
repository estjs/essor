import { createScheduler } from './scheduler';
import { ReactiveFlags, type TrackingKey } from './constants';
import type { ReactiveNode } from './link';
import type { FlushTiming } from './scheduler';

/**
 * Configuration options for creating an effect.
 */
export interface EffectOptions {
  /**
   * Controls when the effect is executed relative to other effects.
   * - 'pre': Execute before component updates
   * - 'post': Execute after component updates (default)
   * - 'sync': Execute immediately
   */
  flush?: FlushTiming;

  /**
   * Called when dependencies are tracked.
   * Useful for debugging dependency tracking.
   */
  onTrack?: () => void;

  /**
   * Called when dependencies trigger updates.
   * Useful for debugging when effects are re-run.
   */
  onTrigger?: () => void;

  /**
   * Custom scheduler function to control effect execution.
   * If provided, this overrides the flush option.
   */
  scheduler?: () => void;
}

/**
 * An effect function with additional metadata.
 * Effects are the core primitive of the reactivity system.
 */
export interface EffectFn extends ReactiveNode {
  (): void;
  /** Whether the effect is currently active */
  active?: boolean;
  /** Set of dependency sets this effect belongs to */
  deps?: Set<Set<EffectFn>>;
  /** Optional scheduler for controlling when the effect runs */
  scheduler?: () => void;
  /** Notify method for triggering the effect */
  notify?: () => void;
}

/** Currently active effect during tracking */
export let activeEffect: EffectFn | null = null;

/** Stack of nested effects being executed */
const effectStack: EffectFn[] = [];

/** Map tracking dependencies for each reactive object */
const triggerMap = new WeakMap<object, Map<string | symbol, Set<EffectFn>>>();

/** Whether we're currently in batch update mode */
let inBatch = false;

/** Whether we're currently in untrack mode */
let inUnTrack = false;

/** Queue of effects to run in batch */
const batchQueue: Set<EffectFn> = new Set();

/**
 * Tracks that an effect depends on a property of a reactive object.
 * This creates a connection between the effect and the dependency.
 *
 * @param target - The reactive object being accessed
 * @param key - The property key being accessed
 *
 * @internal
 */
export function track(target: object, key: string | symbol | TrackingKey): void {
  if (!activeEffect) {
    return;
  }

  // Get or create the dependency map for this target
  let depsMap = triggerMap.get(target);
  if (!depsMap) {
    depsMap = new Map();
    triggerMap.set(target, depsMap);
  }

  // Get or create the dependency set for this key
  let dep = depsMap.get(key);
  if (!dep) {
    dep = new Set();
    depsMap.set(key, dep);
  }

  // Add the active effect to the dependency set if it's not already there
  if (!dep.has(activeEffect)) {
    dep.add(activeEffect);
    activeEffect.deps?.add(dep);
  }
}

/**
 * Triggers updates for effects that depend on a property of a reactive object.
 * This notifies all dependent effects that they need to re-run.
 *
 * @param target - The reactive object being modified
 * @param key - The property key being modified
 *
 * @internal
 */
export function trigger(target: object, key: string | symbol | TrackingKey): void {
  const depsMap = triggerMap.get(target);
  if (!depsMap) {
    return;
  }

  const dep = depsMap.get(key);
  if (!dep) {
    return;
  }

  // Create a new set to avoid modification during iteration
  const effects = new Set(dep);

  for (const effect of effects) {
    if (!effect.active) {
      dep.delete(effect);
      continue;
    }

    if (inUnTrack) {
      continue;
    }

    if (inBatch) {
      batchQueue.add(effect);
      continue;
    }

    if (effect.scheduler) {
      effect.scheduler();
    } else {
      effect();
    }
  }
}

/**
 * Cleans up an effect's dependencies.
 * This removes the effect from all dependency sets it belongs to.
 *
 * @param effect - The effect to clean up
 * @internal
 */
function cleanupEffect(effect: EffectFn): void {
  if (!effect.deps) {
    return;
  }

  // Use Array.from to avoid concurrent modification
  for (const dep of Array.from(effect.deps)) {
    dep.delete(effect);
  }
  effect.deps.clear();
}

/**
 * Creates a reactive effect that automatically tracks its dependencies
 * and re-runs when those dependencies change.
 *
 * @param fn - The function to run reactively
 * @param options - Configuration options for the effect
 * @returns A function to stop the effect
 *
 * @example
 * ```ts
 * const count = signal(0);
 *
 * // Create an effect that logs when count changes
 * const stop = effect(() => {
 *   console.log('Count is:', count.value);
 * });
 *
 * // Later, stop the effect
 * stop();
 * ```
 */
export function effect(fn: () => void, options: EffectOptions = {}): () => void {
  const { flush = 'sync', onTrack, onTrigger, scheduler } = options;

  const effectFn: EffectFn = () => {
    if (!effectFn.active) {
      return;
    }

    // Prevent infinite recursion
    if (effectStack.includes(effectFn)) {
      return;
    }

    // Cleanup old dependencies before running
    cleanupEffect(effectFn);

    // Set up the effect stack for nested effects
    activeEffect = effectFn;
    effectStack.push(activeEffect);

    try {
      fn();
      onTrigger?.();
    } catch (error) {
      if (__DEV__) {
        console.error('Error in effect:', error);
      }
      throw error;
    } finally {
      effectStack.pop();
      activeEffect = effectStack[effectStack.length - 1] || (null as EffectFn | null);
    }
  };

  // Initialize effect metadata
  effectFn.active = true;
  effectFn.deps = new Set();
  effectFn.scheduler = scheduler || createScheduler(effectFn, flush);
  effectFn.flag = ReactiveFlags.NONE;

  // Add notify method for the new link system
  effectFn.notify = () => {
    if (effectFn.active && effectFn.scheduler) {
      effectFn.scheduler();
    }
  };

  // Run the effect once to collect initial dependencies
  effectFn();
  onTrack?.();

  // Return a cleanup function
  return () => {
    effectFn.active = false;
    cleanupEffect(effectFn);
  };
}

/**
 * Runs updates in a batch, deferring all effect triggers until the batch completes.
 * This is useful for optimizing performance when making multiple reactive changes.
 *
 * @param fn - Function containing reactive updates to batch
 *
 * @example
 * ```ts
 * const count = signal(0);
 * const double = computed(() => count.value * 2);
 *
 * // Without batching: effect runs twice
 * count.value++;
 * double.value; // Triggers effect
 *
 * // With batching: effect runs once
 * useBatch(() => {
 *   count.value++;
 *   double.value; // Effect deferred
 * }); // Effect runs here
 * ```
 */
export function useBatch(fn: () => void): void {
  try {
    inBatch = true;
    fn();
  } finally {
    inBatch = false;
    runBatch();
  }
}

/**
 * Runs all queued effects in the current batch.
 *
 * @internal
 */
function runBatch(): void {
  if (batchQueue.size > 0) {
    for (const effect of Array.from(batchQueue)) {
      if (effect.scheduler) {
        effect.scheduler();
      } else {
        effect();
      }
    }
    batchQueue.clear();
  }
}

/**
 * Runs a function without tracking its dependencies.
 * This is useful when you want to access reactive values without creating dependencies.
 *
 * @param fn - Function to run without tracking
 *
 * @example
 * ```ts
 * const count = signal(0);
 *
 * effect(() => {
 *   // This creates a dependency on count
 *   console.log('Normal access:', count.value);
 *
 *   unTrack(() => {
 *     // This does not create a dependency
 *     console.log('Untracked access:', count.value);
 *   });
 * });
 * ```
 */
export function unTrack(fn: () => void): void {
  const prevUnTrack = inUnTrack;
  inUnTrack = true;
  try {
    fn();
  } finally {
    inUnTrack = prevUnTrack;
  }
}
/**
 * Memoized Effect function type
 *
 * @template T - Type of state data
 * @param prevState - Return value from previous execution (initial value on first execution)
 * @returns New state value, which will be used as parameter for next execution
 */
export type MemoizedEffectFn<T> = (prevState: T) => T;

/**
 * Creates a memoized Effect
 *
 * This function creates a special effect that remembers the return value from the previous execution,
 * and passes it as a parameter to the effect function on the next execution. This enables:
 *
 * 1. **Incremental updates**: Only execute DOM operations when values truly change
 * 2. **State persistence**: Maintain state between effect executions
 * 3. **Performance optimization**: Avoid setting the same property values repeatedly
 * 4. **Difference detection**: Easily compare current values with previous values
 *
 * @example
 * ```typescript
 * // Basic usage: Track a single value
 * const width = signal(50);
 *
 * memoizedEffect(prev => {
 *   const current = width.value;
 *   if (current !== prev.width) {
 *     element.style.width = `${current}px`;
 *     prev.width = current;
 *   }
 *   return prev;
 * }, { width: 0 });
 *
 * // Advanced usage: Track multiple values
 * const position = signal({ x: 0, y: 0 });
 * const size = signal({ width: 100, height: 100 });
 *
 * memoizedEffect(prev => {
 *   const pos = position.value;
 *   const sz = size.value;
 *
 *   // Only update when position changes
 *   if (pos.x !== prev.x || pos.y !== prev.y) {
 *     element.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
 *     prev.x = pos.x;
 *     prev.y = pos.y;
 *   }
 *
 *   // Only update when size changes
 *   if (sz.width !== prev.width || sz.height !== prev.height) {
 *     element.style.width = `${sz.width}px`;
 *     element.style.height = `${sz.height}px`;
 *     prev.width = sz.width;
 *     prev.height = sz.height;
 *   }
 *
 *   return prev;
 * }, { x: 0, y: 0, width: 0, height: 0 });
 * ```
 *
 * @template T - Type of state data
 * @param fn - Memoized effect function that receives previous state and returns new state
 * @param initialState - Initial state value
 * @param options - Configuration options
 * @returns ReactiveEffect instance that can be used to stop listening
 */
export function memoizedEffect<T>(
  fn: MemoizedEffectFn<T>,
  initialState: T,
  options?: EffectOptions,
) {
  // Container for storing state, using object to ensure reference stability
  let currentState = initialState;

  // Create underlying effect
  return effect(() => {
    // Execute user function, passing in current state
    const newState = fn(currentState);

    // Update state for next use
    currentState = newState;
  }, options);
}
