import { deepClone, deepEqual, isArray, isFunction, isPrimitive, noop, warn } from '@essor/shared';
import { type Computed, type Signal, isComputed, isReactive, isSignal, useEffect } from './signal';

export type WatchSource<T = any> = Signal<T> | Computed<T> | (() => T);

export type WatchCallback<V = any, OV = any> = (value: V, oldValue: OV) => any;

export type WatchStopHandle = () => void;

type MapSources<T> = {
  [K in keyof T]: T[K] extends WatchSource<infer V> ? V : T[K] extends object ? T[K] : never;
};

type MapOldSources<T, Immediate> = {
  [K in keyof T]: T[K] extends WatchSource<infer V>
    ? Immediate extends true
      ? V | undefined
      : V
    : T[K] extends object
      ? Immediate extends true
        ? T[K] | undefined
        : T[K]
      : never;
};

export interface WatchOptionsBase {
  flush?: 'sync' | 'pre' | 'post';
}

export interface WatchOptions<Immediate = boolean> extends WatchOptionsBase {
  immediate?: Immediate;
  deep?: boolean;
}

// Overload #1: Watching multiple sources (array of sources) + callback
export function useWatch<
  T extends Readonly<Array<WatchSource<unknown> | object>>,
  Immediate extends Readonly<boolean> = false,
>(
  sources: T,
  cb: WatchCallback<MapSources<T>, MapOldSources<T, Immediate>>,
  options?: WatchOptions<Immediate>,
): WatchStopHandle;

// Overload #2: Watching a single source + callback
export function useWatch<T, Immediate extends Readonly<boolean> = false>(
  source: WatchSource<T>,
  cb: WatchCallback<T, Immediate extends true ? T | undefined : T>,
  options?: WatchOptions<Immediate>,
): WatchStopHandle;

// Overload #3: Watching a reactive object + callback
export function useWatch<T extends object, Immediate extends Readonly<boolean> = false>(
  source: T,
  cb: WatchCallback<T, Immediate extends true ? T | undefined : T>,
  options?: WatchOptions<Immediate>,
): WatchStopHandle;

// Main implementation of useWatch
export function useWatch<T = any>(
  source: WatchSource<T> | WatchSource<T>[] | object,
  cb: WatchCallback<T>,
  options?: WatchOptions,
): WatchStopHandle {
  return doWatch(source, cb, options);
}

/**
 * Internal function to handle the actual watching logic.
 * @param source - The source to watch (can be a Signal, Computed, function, or reactive object)
 * @param cb - The callback to trigger when the watched source changes
 * @param options - Configuration options for watching (e.g., immediate execution, deep watching)
 * @returns A function to stop watching
 */
function doWatch(
  source: WatchSource | WatchSource[] | object,
  cb: WatchCallback | null,
  options?: WatchOptions,
): WatchStopHandle {
  let getter: () => any;

  // Determine the correct getter function based on the source type
  if (isSignal(source) || isComputed(source)) {
    getter = () => source.value;
  } else if (isReactive(source)) {
    getter = () => ({ ...source }); // Create a shallow copy for reactive objects
  } else if (isArray(source)) {
    getter = () =>
      source.map(s => {
        if (isSignal(s) || isComputed(s)) return s.value;
        if (isReactive(s)) return { ...s };
        if (isFunction(s)) return s();
        return warn('Invalid source', s);
      });
  } else if (isFunction(source)) {
    getter = source as () => any;
  } else {
    warn('Invalid source type', source);
    getter = noop;
  }

  let oldValue;

  // Effect function to be triggered on source changes
  const effectFn = () => {
    const newValue = deepClone(getter());

    // Check if the new value has changed compared to the old value
    if (!deepEqual(newValue, oldValue)) {
      cb && cb(newValue, oldValue);
      // Update the old value to the new value
      oldValue = isPrimitive(newValue) ? newValue : deepClone(newValue);
    }
  };

  // Register the effect with the reactive system
  const stop = useEffect(effectFn);

  // If immediate execution is requested, trigger the effect function immediately
  if (options?.immediate) {
    effectFn();
  }

  return stop;
}
