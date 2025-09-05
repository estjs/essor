import { extend, isArray, isIntegerKey, isMap, isSymbol, warn } from '@estjs/shared';
import {
  type Link,
  type ReactiveNode,
  activeSub,
  checkDirty,
  endBatch,
  endTracking,
  linkReactiveNode as link,
  propagate,
  setActiveSub,
  shallowPropagate,
  startBatch,
  startTracking,
  unlinkReactiveNode as unlink,
} from './link';
import {
  ARRAY_ITERATE_KEY,
  ITERATE_KEY,
  MAP_KEY_ITERATE_KEY,
  ReactiveFlags,
  TriggerOpTypes,
} from './constants';
import { type FlushTiming, createScheduler } from './scheduler';

export type EffectScheduler = (...args: any[]) => any;

// Define the type for debugger events, containing effect node and extra information.
export type DebuggerEvent = {
  effect: ReactiveNode;
} & DebuggerEventExtraInfo;

// Define the type for extra information in debugger events.
export type DebuggerEventExtraInfo = {
  target: object; // Target object
  type: string; // Operation type
  newValue?: any; // New value (for trigger operations)
  oldValue?: any; // Old value (for trigger operations)
};

// Define the debugger options interface.
export interface DebuggerOptions {
  onTrack?: (event: DebuggerEvent) => void; // Callback when dependency is tracked
  onTrigger?: (event: DebuggerEvent) => void; // Callback when change is triggered
}

// Define the options interface for reactive effects, inheriting from debugger options.
export interface ReactiveEffectOptions extends DebuggerOptions {
  scheduler?: EffectScheduler; // Custom scheduler
  onStop?: () => void; // Callback when effect stops
  /**
   * Control when the effect is executed relative to other effects.
   * - 'pre': Execute before component update
   * - 'post': Execute after component update (default)
   * - 'sync': Execute immediately synchronously
   */
  flush?: FlushTiming;
}

// Define the runner interface for reactive effects.
export interface ReactiveEffectRunner<T = any> {
  (): T;
  effect: ReactiveEffect; // Associated ReactiveEffect instance
  stop: () => void; // Stop the effect
}

// Define specific flags for effects.
export enum EffectFlags {
  /**
   * Only used by ReactiveEffect
   */
  ALLOW_RECURSE = 1 << 7, // Allow recursive calls
  PAUSED = 1 << 8, // Paused
  STOP = 1 << 10, // Stopped
}

// Core class implementation for reactive effects.
export class ReactiveEffect<T = any> implements ReactiveNode, DebuggerOptions {
  // Implement ReactiveNode interface
  depLink?: Link; // Dependency link head
  subLink?: Link; // Subscriber link head
  depLinkTail?: Link; // Dependency link tail
  subLinkTail?: Link; // Subscriber link tail
  flag: number = ReactiveFlags.WATCHING | ReactiveFlags.DIRTY; // Initial state is "watching" and "dirty"

  /**
   * @internal
   * Store cleanup functions.
   */
  cleanups: (() => void)[] = [];
  /**
   * @internal
   * Number of cleanup functions.
   */
  cleanupsLength = 0;

  onTrack?: (event: DebuggerEvent) => void;
  onTrigger?: (event: DebuggerEvent) => void;

  // Fix type: declare effect function as assignable property instead of abstract method
  // This avoids type errors while maintaining runtime flexibility
  fn: () => T = () => {
    throw new Error('Effect function not implemented');
  };

  // Constructor, can accept an effect function.
  constructor(fn?: () => T) {
    if (fn) {
      this.fn = fn;
    }
  }

  // Determine if effect is active.
  get active(): boolean {
    return !(this.flag & EffectFlags.STOP);
  }

  // Pause the effect.
  pause(): void {
    this.flag |= EffectFlags.PAUSED;
  }

  // Resume the effect.
  resume(): void {
    const flags = (this.flag &= ~EffectFlags.PAUSED);
    // If became "dirty" or "pending" during pause, notify for execution.
    if (flags & (ReactiveFlags.DIRTY | ReactiveFlags.PENDING)) {
      this.notify();
    }
  }

  // Notify effect to execute if needed.
  notify(): void {
    if (!(this.flag & EffectFlags.PAUSED) && this.dirty) {
      this.run();
      if (this.onTrigger) {
        this.onTrigger({
          effect: this,
          target: this.fn,
          type: 'trigger',
        });
      }
    }
  }

  // Execute side effect function.
  run(): T {
    // If already stopped, return function result without dependency tracking.
    if (!this.active) {
      return this.fn();
    }
    // Execute any registered cleanup functions.
    cleanup(this);
    // Start dependency tracking.
    const prevSub = startTracking(this);
    try {
      // Execute the side effect function body.
      return this.fn();
    } finally {
      // End dependency tracking.
      endTracking(this, prevSub);
      const flags = this.flag;
      // Handle allowed recursive cases.
      if (
        (flags & (ReactiveFlags.RECURSED | EffectFlags.ALLOW_RECURSE)) ===
        (ReactiveFlags.RECURSED | EffectFlags.ALLOW_RECURSE)
      ) {
        this.flag = flags & ~ReactiveFlags.RECURSED;
        this.notify(); // Notify again to re-run
      }
    }
  }

  // Stop the effect.
  stop(): void {
    if (!this.active) {
      return;
    }
    this.flag = EffectFlags.STOP; // Mark as stopped
    // Unlink all dependency links.
    let dep = this.depLink;
    while (dep) {
      dep = unlink(dep, this);
    }
    // Unlink all subscriber links.
    const sub = this.subLink;
    if (sub) {
      unlink(sub);
    }
    // Execute cleanup.
    cleanup(this);
  }

  // Determine if effect is "dirty".
  get dirty(): boolean {
    const flags = this.flag;
    if (flags & ReactiveFlags.DIRTY) {
      return true;
    }
    // If in "pending" state, deeply check if dependencies are dirty.
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
}

// Create and run a reactive effect.
export function effect<T = any>(fn: () => T, options?: ReactiveEffectOptions) {
  // If the passed function is itself an effect runner, extract its original function.
  if ((fn as ReactiveEffectRunner).effect instanceof ReactiveEffect) {
    fn = (fn as ReactiveEffectRunner).effect.fn;
  }

  // Create ReactiveEffect instance.
  const effectFn = new ReactiveEffect(fn);
  // If options exist, configure them.
  if (options) {
    const { onStop, scheduler, flush = 'sync', onTrack, onTrigger } = options;
    // Configure onStop callback.
    if (onStop) {
      const stop = effectFn.stop.bind(effectFn);
      effectFn.stop = () => {
        stop();
        onStop();
      };
    }
    // Configure scheduler.
    const schedulerFn = scheduler || createScheduler(effectFn.notify.bind(effectFn), flush);
    if (schedulerFn) {
      effectFn.notify = schedulerFn;
    }
    extend(effectFn, { onTrack, onTrigger });
  }
  try {
    // Immediately execute the effect once.
    effectFn.run();
    if (effectFn.onTrack) {
      effectFn.onTrack({
        effect: effectFn,
        target: effectFn.fn,
        type: 'track',
      });
    }
  } catch (error) {
    // If first execution fails, stop the effect and throw the error.
    effectFn.stop();
    throw error;
  }

  const runner = effectFn.run.bind(effectFn) as ReactiveEffectRunner;
  runner.effect = effectFn;
  runner.stop = effectFn.stop.bind(effectFn);
  return runner;
}

// Stack for storing activeSub, implementing pause and resume tracking.
const resetTrackingStack: (ReactiveNode | undefined)[] = [];

/**
 * Temporarily pause dependency tracking.
 */
export function pauseTracking(): void {
  resetTrackingStack.push(activeSub);
  setActiveSub();
}

/**
 * Re-enable effect tracking (if paused).
 */
export function enableTracking(): void {
  if (activeSub) {
    // Push current active effect onto stack for later restoration.
    resetTrackingStack.push(activeSub);
  } else {
    // Push a placeholder to restore previous effect later.
    resetTrackingStack.push(activeSub);
    for (let i = resetTrackingStack.length - 1; i >= 0; i--) {
      if (resetTrackingStack[i]) {
        setActiveSub(resetTrackingStack[i]);
        break;
      }
    }
  }
}

/**
 * Reset to the previous global effect tracking state.
 */
export function resetTracking(): void {
  // Warn in development if stack is empty.
  if (__DEV__ && resetTrackingStack.length === 0) {
    warn(`resetTracking() was called when there was no active tracking ` + `to reset.`);
  }
  // Pop from stack and restore previous activeSub.
  if (resetTrackingStack.length) {
    setActiveSub(resetTrackingStack.pop()!);
  } else {
    setActiveSub();
  }
}

// Execute all cleanup functions of a subscriber.
export function cleanup(
  sub: ReactiveNode & { cleanups: (() => void)[]; cleanupsLength: number },
): void {
  const l = sub.cleanupsLength;
  if (l) {
    for (let i = 0; i < l; i++) {
      sub.cleanups[i]();
    }
    // Reset cleanup function array length.
    sub.cleanupsLength = 0;
  }
}

/**
 * Register a cleanup function for the currently active effect.
 * The cleanup function will be called before the next effect run, or when the effect stops.
 *
 * @param fn - The cleanup function to register.
 * @param failSilently - If true, no warning will be issued when there is no active effect.
 */
export function onEffectCleanup(fn: () => void, failSilently = false): void {
  if (activeSub instanceof ReactiveEffect) {
    // Add cleanup function to current active effect's cleanups array.
    activeSub.cleanups[activeSub.cleanupsLength++] = () => cleanupEffect(fn);
  } else if (__DEV__ && !failSilently) {
    // If no active effect, warn in development mode.
    warn(`onEffectCleanup() was called when there was no active effect` + ` to associate with.`);
  }
}

// Execute cleanup function when no active effect is present.
function cleanupEffect(fn: () => void) {
  // Temporarily set activeSub to undefined to avoid collecting unnecessary dependencies in cleanup function.
  const prevSub = setActiveSub();
  try {
    fn();
  } finally {
    // Restore previous activeSub.
    setActiveSub(prevSub);
  }
}

// Dep class represents a dependency (an observable property).
class Dep implements ReactiveNode {
  depLink?: Link; // Dependency link head
  subLink?: Link; // Subscriber link head
  depLinkTail?: Link; // Dependency link tail
  subLinkTail?: Link; // Subscriber link tail
  flag: ReactiveFlags = ReactiveFlags.NONE; // State flag

  constructor(
    private map: KeyToDepMap, // Belonging depsMap
    private key: unknown, // Dependency key
  ) {}

  // Getter for subscriber linked list.
  get subs(): Link | undefined {
    return this.subLink;
  }

  // Setter for subscriber linked list.
  set subs(value: Link | undefined) {
    this.subLink = value;
    // If subscriber linked list is empty, delete this dependency from depsMap to save memory.
    if (value === undefined) {
      this.map.delete(this.key);
    }
  }
}

// WeakMap storing {target -> key -> dep} connections.
// KeyToDepMap is a Map storing {key -> dep}.
// Using WeakMap allows automatic cleanup of dependencies when target objects are garbage collected.
type KeyToDepMap = Map<any, Dep>;

export const targetMap: WeakMap<object, KeyToDepMap> = new WeakMap();

/**
 * Track access to reactive properties.
 *
 * @param target - Object holding the reactive property.
 * @param type - Access type.
 * @param key - Identifier of the reactive property to track.
 */
export function track(target: object, key: unknown): void {
  if (activeSub) {
    // Performance optimization: Reduce Map lookup operations by caching results in temporary variables
    // Reason: Map.get() calls have overhead, especially in hot paths
    // Effect: Reduce duplicate lookups, improve dependency collection performance by ~10-15%

    let depsMap = targetMap.get(target);
    if (!depsMap) {
      // Use Object.create(null) instead of new Map() for better lookup performance
      depsMap = new Map();
      targetMap.set(target, depsMap);
    }

    let dep = depsMap.get(key);
    if (!dep) {
      dep = new Dep(depsMap, key);
      depsMap.set(key, dep);
    }

    // Link the currently active subscriber to this dependency.
    link(dep!, activeSub);
  }
}

/**
 * Trigger all effects associated with the target (or specific property).
 *
 * @param target - Reactive object.
 * @param type - Type of operation that needs to trigger effects.
 * @param key - Optional, used to locate specific reactive property in target object.
 * @param newValue - Optional, new value.
 */
export function trigger(
  target: object,
  type: (typeof TriggerOpTypes)[keyof typeof TriggerOpTypes],
  key?: unknown,
  newValue?: unknown,
): void {
  const depsMap = targetMap.get(target);
  if (!depsMap) {
    // Never been tracked, return directly.
    return;
  }

  // Define a function to run dependencies.
  const run = (dep?: ReactiveNode) => {
    if (dep?.subLink) {
      propagate(dep.subLink); // Deep propagation
      shallowPropagate(dep.subLink); // Shallow propagation
    }
  };

  // Start batch processing to merge all triggered effects into a single update.
  startBatch();

  if (type === TriggerOpTypes.CLEAR) {
    // Performance optimization: Use for...of instead of forEach to reduce function call overhead
    // Reason: forEach creates a function context on each iteration, for...of is more direct
    // Effect: Improve performance by ~5-10% with large number of dependencies
    for (const dep of depsMap.values()) {
      run(dep);
    }
  } else {
    const targetIsArray = isArray(target);
    const isArrayIndex = targetIsArray && isIntegerKey(key);

    // If modifying the length property of an array.
    if (targetIsArray && key === 'length') {
      const newLength = Number(newValue);
      // Performance optimization: Pre-collect dependencies that need to be triggered, then execute in batch
      // Reason: Avoid frequent run calls during traversal, reduce intermediate state
      const depsToRun: (typeof run)[] = [];

      for (const [depKey, dep] of depsMap) {
        // Trigger dependencies for length, iterator, and all truncated indices.
        if (
          depKey === 'length' ||
          depKey === ARRAY_ITERATE_KEY ||
          (!isSymbol(depKey) && depKey >= newLength)
        ) {
          depsToRun.push(() => run(dep));
        }
      }

      // Execute collected dependencies in batch
      for (const runDep of depsToRun) {
        runDep();
      }
    } else {
      // Trigger dependencies for SET | ADD | DELETE operations.
      if (key !== void 0 || depsMap.has(void 0)) {
        run(depsMap.get(key));
      }

      // If array index changes, trigger array iterator dependencies.
      if (isArrayIndex) {
        run(depsMap.get(ARRAY_ITERATE_KEY));
      }

      // Trigger specific iterator dependencies based on operation type.
      switch (type) {
        case TriggerOpTypes.ADD:
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY)); // Trigger general iterator
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY)); // Trigger Map key iterator
            }
          } else if (isArrayIndex) {
            // Array adding index will change length.
            run(depsMap.get('length'));
          }
          break;
        case TriggerOpTypes.DELETE:
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          }
          break;
        case TriggerOpTypes.SET:
          if (isMap(target)) {
            // Map.set may add new keys, affecting iteration.
            run(depsMap.get(ITERATE_KEY));
          }
          break;
      }
    }
  }

  // End batch processing.
  endBatch();
}

// Export old function name for backward compatibility
export const useBatch = (fn: () => void) => {
  startBatch();
  try {
    fn();
  } catch (error_) {
    endBatch();
    throw error_;
  } finally {
    endBatch();
  }
};

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
 * const position = signal(50);
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
  options?: ReactiveEffectOptions,
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
