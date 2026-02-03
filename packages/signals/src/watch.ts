import { hasChanged, isFunction, isMap, isObject, isSet } from '@estjs/shared';
import { queueJob } from './scheduler';
import { isSignal } from './signal';
import { isReactive } from './reactive';
import { isComputed } from './computed';
import { effect } from './effect';
import type { Effect } from './propagation';

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

// Use WeakMap to store cleanup functions for each effect.
const cleanupMap = new WeakMap<Effect, (() => void)[]>();

/**
 * Recursively traverse a value, accessing all its properties to trigger dependency tracking.
 * @param value - The value to traverse.
 * @param seen - Set used to prevent circular references.
 * @returns The original value.
 */
function traverse(value: any, seen = new Set()) {
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
    Object.keys(value).forEach(key => {
      traverse(value[key], seen);
    });
  }

  return value;
}

/**
 * Create a deep clone of a value for comparison purposes.
 * Handles plain objects, arrays, Map, Set, and primitives.
 * @param value - The value to clone.
 * @returns A deep clone of the value.
 */
function cloneValue<T>(value: T): T {
  if (!isObject(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => cloneValue(item)) as unknown as T;
  }

  if (isMap(value)) {
    const cloned = new Map();
    value.forEach((v, k) => {
      cloned.set(k, cloneValue(v));
    });
    return cloned as unknown as T;
  }

  if (isSet(value)) {
    const cloned = new Set();
    value.forEach(v => {
      cloned.add(cloneValue(v));
    });
    return cloned as unknown as T;
  }

  // Plain object
  const cloned: any = {};
  for (const key of Object.keys(value as object)) {
    cloned[key] = cloneValue(value[key]);
  }
  return cloned as T;
}

/**
 * Resolve watch sources of various forms into a standard getter function.
 * @param source - The watch source passed by the user.
 * @returns A getter function that returns the current source value.
 */
function resolveSource<T>(source: WatchSource<T>): () => T {
  // If source is an array, return a getter that traverses the array and unwraps each element.
  if (Array.isArray(source)) {
    return () =>
      source.map(s => {
        if (isSignal(s) || isComputed(s)) {
          return s.value;
        }
        if (isReactive(s)) {
          return traverse(s);
        }
        if (isFunction(s)) {
          return s();
        }
        return s;
      }) as unknown as T;
  }

  // If source is a function, use it directly as getter.
  if (isFunction(source)) {
    return source as () => T;
  }

  // If source is a signal, return a getter that reads its .value.
  if (isSignal(source)) {
    return () => source.value as unknown as T;
  }

  // If source is a ref-like object, return a getter that reads its .value.
  if (isObject(source) && 'value' in source) {
    return () => source.value as T;
  }

  // If source is a reactive object, return a getter that deeply traverses it.
  if (isReactive(source)) {
    return () => traverse(source) as unknown as T;
  }

  // Otherwise, source is a plain value, return a getter that directly returns the value.
  return () => source as T;
}

/**
 * Watch one or more reactive data sources and execute callback when sources change.
 * @param source - The source(s) to watch.
 * @param callback - The callback function to execute when source changes.
 * @param options - Configuration options like immediate and deep.
 * @returns A function to stop watching.
 */
export function watch<T = any>(
  source: WatchSource<T>,
  callback: WatchCallback<T>,
  options: WatchOptions = {},
): () => void {
  const { immediate = false, deep = false } = options;
  // Initialize oldValue as a special object to determine if it's the first execution.
  let oldValue: any = INITIAL_WATCHER_VALUE;
  let cleanup: (() => void) | undefined;

  // Resolve source to a getter function.
  const getter = resolveSource(source);

  // job is the function that actually executes the callback, called by the scheduler.
  const job = () => {
    const currentEffect = runner.effect;
    if (!currentEffect.run) {
      return;
    }

    // Run effect to get new value.
    const newValue = currentEffect.run();

    // Execute the previously registered cleanup function before calling callback.
    if (cleanup) {
      cleanup();
    }

    // If value has changed, execute callback.
    if (hasChanged(newValue, oldValue)) {
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
    // Execute cleanup function if exists.
    if (cleanup) {
      cleanup();
    }
    // Clean up all cleanup functions associated with this effect.
    const cleanups = cleanupMap.get(runner.effect);
    if (cleanups) {
      cleanups.forEach(fn => fn());
      cleanupMap.delete(runner.effect);
    }
  };
}
