import {
  deepClone,
  deepEqual,
  isArray,
  isFunction,
  isObject,
  isPrimitive,
  noop,
} from 'essor-shared';
import { warn } from '../warning';
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

// overload #1: array of multiple sources + cb
export function useWatch<
  T extends Readonly<Array<WatchSource<unknown> | object>>,
  Immediate extends Readonly<boolean> = false,
>(
  sources: T,
  cb: WatchCallback<MapSources<T>, MapOldSources<T, Immediate>>,
  options?: WatchOptions<Immediate>,
): WatchStopHandle;

// overload #2: single source + cb
export function useWatch<T, Immediate extends Readonly<boolean> = false>(
  source: WatchSource<T>,
  cb: WatchCallback<T, Immediate extends true ? T | undefined : T>,
  options?: WatchOptions<Immediate>,
): WatchStopHandle;

// overload #3: watching reactive object w/ cb
export function useWatch<T extends object, Immediate extends Readonly<boolean> = false>(
  source: T,
  cb: WatchCallback<T, Immediate extends true ? T | undefined : T>,
  options?: WatchOptions<Immediate>,
): WatchStopHandle;

// implementation
export function useWatch<T = any>(
  source: WatchSource<T> | WatchSource<T>[] | object,
  cb: WatchCallback<T>,
  options?: WatchOptions,
): WatchStopHandle {
  return doWatch(source, cb, options);
}

function doWatch(
  source: WatchSource | WatchSource[] | object,
  cb: WatchCallback | null,
  options?: WatchOptions,
): WatchStopHandle {
  let getter: () => any;
  const deep = options?.deep;

  if (isSignal(source) || isComputed(source)) {
    getter = () => source.value;
  } else if (isReactive(source)) {
    getter = () => ({ ...source });
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

  if (cb && deep) {
    const baseGetter = getter;
    getter = () => traverse(baseGetter());
  }

  let oldValue;

  const effectFn = () => {
    const newValue = deepClone(getter());

    if (!deepEqual(newValue, oldValue)) {
      cb && cb(newValue, oldValue);
      oldValue = isPrimitive(newValue) ? newValue : deepClone(newValue);
    }
  };

  const stop = useEffect(effectFn);

  if (options?.immediate) {
    effectFn();
  }

  return stop;
}

function traverse(value: unknown, seen: Set<unknown> = new Set()): unknown {
  if (!isObject(value) || seen.has(value)) return value;

  seen.add(value);
  if (isArray(value)) {
    value.forEach(item => traverse(item, seen));
  } else if (value instanceof Map) {
    value.forEach((v, k) => {
      traverse(k, seen);
      traverse(v, seen);
    });
  } else if (value instanceof Set) {
    value.forEach(v => traverse(v, seen));
  } else {
    Object.keys(value).forEach(key => {
      traverse((value as Record<string, unknown>)[key], seen);
    });
  }
  return value;
}
