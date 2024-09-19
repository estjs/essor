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
import { type Computed, type Signal, isComputed, isReactive, isSignal, useEffect } from './signal';
import { nextTick } from './scheduler';

export type WatchSource<T = any> = Signal<T> | Computed<T> | (() => T);
export type WatchCallback<V = any, OV = any> = (value: V, oldValue: OV) => any;
export type WatchStopHandle = () => void;

type MapSources<T> = {
  [K in keyof T]: T[K] extends WatchSource<infer V> ? V : T[K];
};

type MapOldSources<T, Immediate> = {
  [K in keyof T]: Immediate extends true ? T[K] | undefined : T[K];
};

export interface WatchOptions<Immediate = boolean> {
  immediate?: Immediate;
  deep?: boolean | number;
}

// Overload signatures
export function useWatch<
  T extends Readonly<WatchSource<unknown>[] | object>,
  Immediate extends boolean = false,
>(
  sources: T,
  cb: WatchCallback<MapSources<T>, MapOldSources<T, Immediate>>,
  options?: WatchOptions<Immediate>,
): WatchStopHandle;

export function useWatch<T, Immediate extends boolean = false>(
  source: WatchSource<T>,
  cb: WatchCallback<T, Immediate extends true ? T | undefined : T>,
  options?: WatchOptions<Immediate>,
): WatchStopHandle;

export function useWatch<T extends object, Immediate extends boolean = false>(
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

const INITIAL_WATCHER_VALUE = undefined;
let watcher: Function | null;
let flushing = false;

function queueWatcher(fn: Function) {
  watcher = fn;
  if (!flushing) {
    flushing = true;
    nextTick(flushWatchers);
  }
}

function flushWatchers() {
  watcher?.();
  watcher = null;
  flushing = false;
}

function doWatch(
  source: WatchSource | WatchSource[] | object,
  cb: WatchCallback | null,
  { deep, immediate }: WatchOptions = {},
): WatchStopHandle {
  let getter: () => any;
  const isMultiSource = isArray(source);

  if (isSignal(source) || isComputed(source)) {
    getter = () => source.value;
  } else if (isReactive(source)) {
    getter = () => ({ ...source });
  } else if (isMultiSource) {
    getter = () => (source as WatchSource[]).map(s => resolveSource(s));
  } else if (isFunction(source)) {
    getter = source as () => any;
  } else {
    warn('Invalid source type', source);
    return noop;
  }

  if (cb && deep) {
    const baseGetter = getter;
    const depth = deep === true ? Infinity : deep;
    getter = () => traverse(baseGetter(), depth);
  }

  let oldValue: any = isMultiSource
    ? Array.from({ length: source.length }).fill(INITIAL_WATCHER_VALUE)
    : INITIAL_WATCHER_VALUE;
  let runCb = false;

  const effectFn = () => {
    const newValue = getter();
    if (hasChanged(newValue, oldValue)) {
      if (immediate && cb) {
        cb(newValue, oldValue);
        oldValue = newValue;
      }
      if (runCb && cb) {
        queueWatcher(() => {
          cb(newValue, oldValue);
          oldValue = newValue;
        });
      }
      !runCb && (oldValue = newValue);
    }
  };

  const stop = useEffect(effectFn, { flush: 'sync' });
  runCb = true;

  if (immediate) {
    effectFn();
  }

  return stop;
}

function resolveSource(s: WatchSource | object) {
  if (isSignal(s) || isComputed(s)) return s.value;
  if (isReactive(s)) return { ...s };
  if (isFunction(s)) return (s as Function)();
  warn('Invalid source', s);
  return noop;
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
