import {
  hasChanged,
  isArray,
  isFunction,
  isMap,
  isObject,
  isPlainObject,
  isSet,
  noop,
  warn,
} from '@estjs/shared';
import CloneDeep from 'lodash.clonedeep';
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
  deep?: boolean | number;
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

const INITIAL_WATCHER_VALUE = {};

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
  let isMultiSource = false;
  const { deep, immediate, flush = 'pre' } = options || {};

  // Determine the correct getter function based on the source type
  if (isSignal(source) || isComputed(source)) {
    getter = () => source.value;
  } else if (isReactive(source)) {
    getter = () => ({ ...source });
  } else if (isArray(source)) {
    isMultiSource = true;
    getter = () =>
      (source as WatchSource[]).map(s => {
        if (isSignal(s) || isComputed(s)) return s.value;
        if (isReactive(s)) return { ...s } as any;
        if (isFunction(s)) return (s as () => any)();
        return warn('Invalid source', s);
      });
  } else if (isFunction(source)) {
    getter = source as () => any;
  } else {
    warn('Invalid source type', source);
    getter = noop;
    return noop;
  }

  if (cb && deep) {
    const baseGetter = getter;
    const depth = deep === true ? Infinity : deep;
    getter = () => traverse(baseGetter(), depth);
  }

  let oldValue: any = isMultiSource
    ? Array.from({ length: (source as []).length }).fill(INITIAL_WATCHER_VALUE)
    : INITIAL_WATCHER_VALUE;

  let runCb = false;

  const effectFn = () => {
    const getterValue = getter();

    if (hasChanged(getterValue, oldValue)) {
      if (runCb && cb) {
        cb(getterValue, oldValue);
      }
      oldValue = CloneDeep(getterValue);
    }
  };
  // Register the effect with the reactive system
  const stop = useEffect(effectFn, { flush });
  runCb = true;

  // If immediate execution is requested, trigger the effect function immediately
  if (immediate) {
    effectFn();
  }

  return stop;
}

export function traverse(value: unknown, depth: number = Infinity, seen?: Set<unknown>): unknown {
  if (depth <= 0 || !isObject(value)) {
    return value;
  }

  seen = seen || new Set();
  if (seen.has(value)) {
    return value;
  }
  seen.add(value);
  depth--;
  if (isSignal(value)) {
    traverse((value as Signal<any>).value, depth, seen);
  } else if (isArray(value)) {
    for (const element of value) {
      traverse(element, depth, seen);
    }
  } else if (isSet(value) || isMap(value)) {
    (value as Set<any> | Map<any, any>).forEach((v: any) => {
      traverse(v, depth, seen);
    });
  } else if (isPlainObject(value)) {
    for (const key in value) {
      traverse(value[key], depth, seen);
    }
  }
  return value;
}
