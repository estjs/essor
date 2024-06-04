import { isArray, isFunction, isObject, isPrimitive, noop } from 'essor-shared';
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
function deepEqual(a: any, b: any): boolean {
  if (isPrimitive(a) && isPrimitive(b)) {
    return a === b;
  }
  if (a === b) {
    return true;
  }

  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  if (a.constructor !== b.constructor) {
    return false;
  }

  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      return false;
    }
    for (const [i, element] of a.entries()) {
      if (!deepEqual(element, b[i])) {
        return false;
      }
    }
    return true;
  }

  if (a instanceof Map) {
    if (a.size !== b.size) {
      return false;
    }
    for (const [key, value] of a) {
      if (!b.has(key) || !deepEqual(value, b.get(key))) {
        return false;
      }
    }
    return true;
  }

  if (a instanceof Set) {
    if (a.size !== b.size) {
      return false;
    }
    for (const value of a) {
      if (!b.has(value)) {
        return false;
      }
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
      return false;
    }
  }

  return true;
}
function deepClone(obj, hash = new WeakMap()) {
  // 判断传入的参数是否是一个对象
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  // 处理循环引用
  if (hash.has(obj)) {
    return hash.get(obj);
  }

  const cloneObj = Array.isArray(obj) ? [] : {};
  hash.set(obj, cloneObj);

  // 遍历对象的每个属性
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloneObj[key] = deepClone(obj[key], hash);
    }
  }

  return cloneObj;
}
