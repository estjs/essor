import { hasChanged, isFunction, isMap, isObject, isSet } from '@estjs/shared';
import { queueJob } from './scheduler';
import { isSignal } from './signal';
import { isReactive } from './reactive';
import { isComputed } from './computed';
import { effect } from './effect';

// A unique initial value used to identify if watcher is running for the first time.
const INITIAL_WATCHER_VALUE = {};

// Watch function options interface.
interface WatchOptions {
  immediate?: boolean; // Whether to execute callback immediately once
  deep?: boolean; // Whether to deeply traverse source to track nested changes
}

// Watch source type, can be value, ref/signal, getter function or array.
type WatchSource<T = any> = T | { value: T } | (() => T);
// Watch callback function type.
type WatchCallback<T = any> = (newValue: T, oldValue: T | undefined) => void;

/**
 * Module-level Set reused across all traverse() calls to avoid per-call allocation.
 * It is cleared at the start of each top-level traverse invocation.
 * NOTE: traverse must never be called recursively from outside; it always resets on entry.
 */
const _traverseSeen = new Set<any>();

/**
 * Recursively traverse a value, accessing all its properties to trigger dependency tracking.
 *
 * @param value - The value to traverse.
 * @param seen - Internal cycle-detection set.
 * @returns The original value.
 */
function traverse(value: any, seen?: Set<any>) {
  // Top-level call: reset the shared Set to avoid cross-call contamination.
  if (!seen) {
    _traverseSeen.clear();
    seen = _traverseSeen;
  }

  // If not an object or already traversed, stop.
  if (!isObject(value) || seen.has(value)) {
    return value;
  }

  seen.add(value);
  // If it's a signal or computed, traverse its .value.
  if (isSignal(value) || isComputed(value)) {
    return traverse(value.value, seen);
  }
  // If it's an array, traverse all its elements.
  if (Array.isArray(value)) {
    for (const element of value) {
      traverse(element, seen);
    }
    // If it's a Map, traverse all its values, and access keys and values to track changes.
  } else if (isMap(value)) {
    value.forEach((v: any) => {
      traverse(v, seen);
    });
    value.keys();
    value.values();
    // If it's a Set, traverse all its values to track changes.
  } else if (isSet(value)) {
    value.forEach((v: any) => {
      traverse(v, seen);
    });
    value.values();
    // If it's a plain object, traverse all its keys.
  } else {
    Object.keys(value).forEach((key) => {
      traverse(value[key], seen);
    });
  }

  return value;
}

/**
 * Create a clone of a value for comparison purposes.
 *
 * @param value - The value to clone.
 * @returns The value itself.
 */
function cloneValue<T>(value: T): T {
  // Avoid deep cloning to fix major performance bottleneck (Issue 8).
  // For primitive values or when returning the same reference, this is sufficient.
  // Vue's watch passes the same reference for newValue and oldValue when mutations occur on objects.
  return value;
}

/**
 * Resolve a single (non-array) watch source into a standard getter function.
 *
 * @param source - The watch source.
 * @returns A getter function.
 */
function resolveSingleSource<T>(source: WatchSource<T>): () => T {
  // Function source: use directly.
  if (isFunction(source)) {
    return source as () => T;
  }
  // Signal or computed: read .value.
  if (isSignal(source) || isComputed(source)) {
    return () => source.value as T;
  }
  // Reactive object: deep traverse.
  if (isReactive(source)) {
    return () => traverse(source) as unknown as T;
  }
  // Plain value: identity getter.
  return () => source as T;
}

/**
 * Resolve watch sources of various forms into a standard getter function.
 *
 * @param source - The watch source passed by the user.
 * @returns A getter function that returns the current source value.
 */
function resolveSource<T>(source: WatchSource<T>): () => T {
  if (Array.isArray(source)) {
    // Pre-build per-element getters; call sites only allocate the output array.
    const getters = (source as WatchSource[]).map((s) => resolveSingleSource(s));
    return () => getters.map((g) => g()) as unknown as T;
  }
  return resolveSingleSource(source);
}

/**
 * Watch one or more reactive data sources and execute callback when sources change.
 *
 * @param source - The source(s) to watch.
 * @param callback - The callback function to execute when source changes.
 * @param options - Configuration options like immediate and deep.
 * @returns {Function} A function to stop watching.
 */
export function watch<T = any>(
  source: WatchSource<T>,
  callback: WatchCallback<T>,
  options: WatchOptions = {},
): () => void {
  const { immediate = false, deep = false } = options;
  // Initialize oldValue as a special object to determine if it's the first execution.
  let oldValue: any = INITIAL_WATCHER_VALUE;

  // Resolve source to a getter function.
  const getter = resolveSource(source);

  /**
   * Runs the scheduled watch job.
   */
  const job = () => {
    const currentEffect = runner.effect;
    if (!currentEffect.run) {
      return;
    }

    // Run effect to get new value.
    const newValue = currentEffect.run();

    // If value has changed, or if we are deep watching / returning an object (which could have mutated)
    // we execute the callback. This matches Vue's semantics where internal object mutations
    // trigger the watcher even if the object reference remains the same.
    if (deep || isObject(newValue) || hasChanged(newValue, oldValue)) {
      callback(newValue, oldValue === INITIAL_WATCHER_VALUE ? undefined : (oldValue as T));
      // Update oldValue for next comparison (clone to snapshot current state).
      oldValue = cloneValue(newValue);
    }
  };

  // Create an effect to track getter dependencies.
  const runner = effect(
    () => {
      const value = getter();
      // If deep watching, recursively traverse value to track all nested properties.
      if (deep) {
        traverse(value);
      }
      return value;
    },
    {
      // Use scheduler to queue job, implementing async and debouncing.
      scheduler: () => queueJob(job),
    },
  );

  // If immediate is set, execute job immediately once.
  if (immediate) {
    job();
  } else {
    // Otherwise, run effect once first to collect initial value as oldValue.
    oldValue = cloneValue(runner.effect.run());
  }

  // Return a stop function.
  return () => {
    runner.stop();
  };
}
