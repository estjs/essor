import {
  type ExcludeType,
  hasChanged,
  hasOwn,
  isArray,
  isExclude,
  isHTMLElement,
  isMap,
  isObject,
  isPlainObject,
  isSet,
  isStringNumber,
  isWeakMap,
  isWeakSet,
  warn,
} from '@estjs/shared';
import { createScheduler } from './scheduler';

// Define the type for useEffect functions
export type EffectFn = (() => void) &
  Partial<{
    init: boolean;
    active: boolean;
  }>;

// Global variables to track active effects and useComputed values
let activeEffect: EffectFn | null = null;

// Type definition for the trigger map
type TriggerMap = Map<string | symbol, Set<EffectFn>>;

// WeakMaps to store dependencies and useReactive objects
const triggerMap = new WeakMap<object, TriggerMap>();
const reactiveMap = new WeakMap<object, object>();

const ReactiveSymbol = Symbol(__DEV__ ? 'ReactiveSymbol' : '');
const ReactivePeekSymbol = Symbol(__DEV__ ? '__raw' : '');

// trigger key
const SignalValueKey = Symbol(__DEV__ ? 'SignalValueKey' : '');
const ComputedValueKey = Symbol(__DEV__ ? 'ComputedValueKey' : '');
const reactiveArrayKey = Symbol(__DEV__ ? 'ReactiveArrayKey' : '');
const ReactiveCollectionKey = Symbol(__DEV__ ? 'ReactiveCollectionKey' : '');
const ReactiveWeakCollectionKey = Symbol(__DEV__ ? 'ReactiveWeakCollectionKey' : '');

// batch queue flag
let inBatch = false;
// untrack flag
let inUnTack = false;
const batchQueue: Set<EffectFn> = new Set();

export type SignalObject<T> = {
  [K in keyof T]: SignalImpl<T[K]>;
};

// Define the Reactive type
export type Reactive<T> = T & {
  [ReactivePeekSymbol]: T;
  [ReactiveSymbol]?: true;
};
// Define types that can be made useReactive
type ReactiveTypes =
  | Record<string | symbol | number, unknown>
  | Array<unknown>
  | Set<unknown>
  | Map<object, unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>;

/**
 * Tracks the dependency of the current active useEffect or useComputed value.
 *
 * @param target The useReactive object.
 * @param key The key of the useReactive object.
 *
 */
export function track(target: object, key: string | symbol) {
  if (!activeEffect) return;
  let depsMap = triggerMap.get(target);
  if (!depsMap) {
    depsMap = new Map();
    triggerMap.set(target, depsMap);
  }
  let dep = depsMap.get(key);
  if (!dep) {
    dep = new Set();
    depsMap.set(key, dep);
  }
  dep.add(activeEffect);
}
/**
 * Triggers all the effects that depend on the specified key of the useReactive object.
 * If the useEffect is inactive, it will be removed from the dependency set.
 * If the useEffect is active and in the batch queue, it will be added to the batch queue.
 * If the useEffect is active and not in the batch queue, it will be called immediately.
 *
 * @param target The useReactive object.
 * @param key The key of the useReactive object.
 */

function trigger(target: object, key: string | symbol) {
  const depsMap = triggerMap.get(target);
  if (!depsMap) return;
  const dep = depsMap.get(key);
  if (dep) {
    dep.forEach(useEffect => {
      if (hasOwn(useEffect, 'active') && !useEffect.active) {
        dep.delete(useEffect);
        return;
      }
      if (inUnTack) return;
      inBatch ? batchQueue.add(useEffect) : useEffect();
    });
  }
}

/**
 * Signal class represents a useReactive value.
 * @template T The type of the value held by the Signal.
 * @example
 * const count = new Signal(0);
 * console.log(count.value); // 0
 * count.value = 1;
 * console.log(count.value); // 1
 */
export class SignalImpl<T> {
  private __value: T;
  private __shallow: boolean;

  // is should be read
  //@ts-expect-error
  private readonly __signal = true;

  /**
   * Creates a new Signal instance.
   * @param {T} value - The initial value of the Signal.
   * @param {boolean} [shallow] - Whether to create a shallow Signal.
   */
  constructor(value: T, shallow: boolean = false) {
    this.__shallow = shallow;
    this.__value = value;
  }

  /**
   * Gets the current value of the Signal.
   * @returns {T} The current value.
   */
  get value(): T {
    track(this, SignalValueKey);
    if (isObject(this.__value) && !isHTMLElement(this.__value)) {
      // shallow it should wrap the first level
      return ReactiveImpl(this.__value, this.__shallow) as T;
    }

    return this.__value;
  }

  /**
   * Sets a new value for the Signal.
   * @param {T} newValue - The new value to set.
   */
  set value(newValue: T) {
    if (isSignal(newValue)) {
      newValue = newValue.peek() as T;
    }

    if (hasChanged(newValue, this.__value)) {
      this.__value = newValue;
      trigger(this, SignalValueKey);
    }
  }
  /**
   * Returns the current value without triggering reactivity.
   * @returns {T} The current value.
   */
  peek(): T {
    return this.__value;
  }

  // call set value
  // it equals to this.value = value
  set(value: T) {
    this.value = value;
  }

  // call update
  // it equals to this.value = new value
  update(fn: (value: T) => T): void {
    this.set(fn(this.peek()));
  }
}

/**
 * Creates a new Signal object.
 * @template T The type of the value held by the Signal.
 * @param {T} [value] - The initial value of the Signal.
 * @returns {SignalImpl<T>} A new Signal instance.
 * @example
 * const count = useSignal(0);
 * console.log(count.value); // 0
 * count.value++;
 * console.log(count.value); // 1
 */
export function useSignal<T>(value?: T): SignalImpl<T> {
  if (isSignal(value)) {
    return value as SignalImpl<T>;
  }
  return new SignalImpl<T>(value as T);
}

/**
 * Alias for useShallowSignal.
 * @template T The type of the value held by the Signal.
 * @param {T} [value] - The initial value of the Signal.
 * @returns {SignalImpl<T>} A new shallow Signal instance.
 * @example
 * const obj = shallowSignal({ nested: { count: 0 } });
 * // Changes to obj.value.nested will not trigger reactivity
 * obj.value.nested.count = 1;
 */
export function shallowSignal<T>(value?: T): SignalImpl<T> {
  return new SignalImpl<T>(value as T, true);
}

/**
 * Checks if a value is a Signal.
 * @template T The type of the value held by the Signal.
 * @param {any} value - The value to check.
 * @returns {boolean} True if the value is a Signal, false otherwise.
 * @example
 * const count = useSignal(0);
 * console.log(isSignal(count)); // true
 * console.log(isSignal(0)); // false
 */
export function isSignal<T>(value: any): value is SignalImpl<T> {
  return !!(value && value?.__signal);
}

/**
 * Computed class represents a useComputed useReactive value.
 * @template T The type of the value useComputed by the Computed instance.
 * @example
 * const doubleCount = useComputed(() => count.value * 2);
 * console.log(doubleCount.value); // 0
 * count.value = 1;
 * console.log(doubleCount.value); // 2
 */
export class ComputedImpl<T = unknown> {
  private __value: T;
  //@ts-expect-error
  private readonly __computed = true;
  constructor(private readonly fn: () => T) {
    const prev = activeEffect;
    activeEffect = this.run.bind(this);
    this.__value = this.fn();
    activeEffect = prev;
  }
  /**
   * Get the current useComputed value without tracking it.
   */
  peek(): T {
    return this.__value;
  }
  /**
   * Run the useComputed function and update the value if it has changed.
   */
  run() {
    const newValue = this.fn();
    if (hasChanged(newValue, this.__value)) {
      this.__value = newValue;
      trigger(this, ComputedValueKey);
    }
  }

  /**
   * Get the current useComputed value and track its usage.
   */
  get value(): T {
    track(this, ComputedValueKey);
    return this.__value;
  }
}

/**
 * Creates a new Computed instance.
 * @template T The type of the value useComputed by the Computed instance.
 * @param {() => T} fn - The computation function.
 * @returns {ComputedImpl<T>} A new Computed instance.
 * @example
 * const doubleCount = useComputed(() => count.value * 2);
 * console.log(doubleCount.value); // 0
 * count.value = 1;
 * console.log(doubleCount.value); // 2
 */
export function useComputed<T>(fn: () => T): ComputedImpl<T> {
  return new ComputedImpl<T>(fn);
}

/**
 * Checks if a value is a Computed instance.
 * @template T The type of the value useComputed by the Computed instance.
 * @param {any} value - The value to check.
 * @returns {boolean} True if the value is a Computed instance, false otherwise.
 * @example
 * const doubleCount = useComputed(() => count.value * 2);
 * console.log(isComputed(doubleCount)); // true
 * console.log(isComputed(0)); // false
 */
export function isComputed<T>(value: any): value is ComputedImpl<T> {
  return !!(value && value.__computed);
}

export interface EffectOptions {
  flush?: 'pre' | 'post' | 'sync';
  onTrack?: () => void;
  onTrigger?: () => void;
}

/**
 * Registers an useEffect function to run when signals or useComputed properties change.
 * @param {() => void} fn - The useEffect function.
 * @param {EffectOptions} [options] - The options for the useEffect.
 * @returns {() => void} A function to stop the useEffect.
 */
export function useEffect(fn: () => void, options: EffectOptions = {}): () => void {
  const { flush = 'pre', onTrack, onTrigger } = options;

  function effectFn() {
    const prev = activeEffect;
    // first run effect in async, then run in sync
    activeEffect = effectFn.init ? effectFn : effectFn.scheduler;
    fn();
    onTrigger && onTrigger();
    activeEffect = prev;
  }
  const scheduler = createScheduler(effectFn, flush);

  effectFn.scheduler = scheduler;
  effectFn.init = true;
  effectFn.active = true;
  onTrack && onTrack();

  effectFn();

  return () => {
    effectFn.active = false;
    activeEffect = null;
  };
}

/**
 * Creates a SignalObject from given initial values, excluding specified keys.
 * @template T The type of the initial values object.
 * @param {T} initialValues - The initial values object.
 * @param {ExcludeType} [exclude] - The keys to exclude from the SignalObject.
 * @returns {SignalObject<T>} A new SignalObject instance.
 * @example
 * const userSignals = signalObject({ name: 'John', age: 30 }, ['age']);
 * console.log(userSignals.name.value); // 'John'
 * console.log(userSignals.age); // 30
 */
export function signalObject<T extends object>(
  initialValues: T,
  exclude?: ExcludeType,
): SignalObject<T> {
  if (!initialValues || !isObject(initialValues)) {
    if (__DEV__) {
      warn('initialValues must be an object,will return initial value!', initialValues);
    }
    return initialValues;
  }
  const signals = Object.entries(initialValues).reduce((acc, [key, value]) => {
    acc[key] = isExclude(key, exclude) || isSignal(value) ? value : useSignal(value);
    return acc;
  }, {} as SignalObject<T>);

  return signals;
}

/**
 * Returns the current value of signals, useReactive, or plain objects, excluding specified keys.
 * @template T The type of the value.
 * @param {Reactive<T> | T | SignalImpl<T>} value - The useSignal, useReactive, or plain object.
 * @returns {T} The current value.
 * @example
 * const user = unSignal(userSignals);
 * console.log(user.name); // 'John'
 * console.log(user.age); // 30
 */
export function toRaw<T>(value: Reactive<T> | T | SignalImpl<T>): T {
  if (!value) return value as T;

  if (isReactive(value)) {
    return value[ReactivePeekSymbol];
  }
  if (isSignal(value)) {
    return (value as SignalImpl<T>).peek();
  }
  if (isArray(value)) {
    return (value as T[]).map(value => toRaw(value)) as T;
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [key, toRaw(value)]),
    ) as T;
  }
  return value as T;
}

/**
 * Checks if an object is useReactive.
 * @param {unknown} obj - The object to check.
 * @returns {boolean} True if the object is useReactive, false otherwise.
 * @example
 * const reactiveUser = useReactive({ name: 'John', age: 30 });
 * console.log(isReactive(reactiveUser)); // true
 * console.log(isReactive({ name: 'John', age: 30 })); // false
 */
export function isReactive(obj: unknown): obj is Reactive<any> {
  return !!(obj && typeof obj === 'object' && obj[ReactiveSymbol]);
}

/**
 * Creates a useReactive object.
 * @param {ReactiveTypes} initialValue - The initial value.
 * @param {ExcludeType} [exclude] - The keys to exclude from the useReactive object.
 * @returns {Reactive<T>} A new useReactive object.
 * @example
 * const reactiveUser = useReactive({ name: 'John', age: 30 });
 * console.log(reactiveUser.name); // 'John'
 * console.log(reactiveUser.age); // 30
 */
export function useReactive<T extends object>(initialValue: T, exclude?: ExcludeType): Reactive<T> {
  return ReactiveImpl(initialValue, false, exclude) as Reactive<T>;
}

/**
 * Creates a shallow useReactive object.
 * @template T The type of the initial value.
 * @param {T} initialValue - The initial value.
 * @param {ExcludeType} [exclude] - The keys to exclude from the useReactive object.
 * @returns {Reactive<T>} A new shallow useReactive object.
 * @example
 * const shallowReactiveUser = shallowReactive({ name: 'John', age: 30 });
 * console.log(shallowReactiveUser.name); // 'John'
 * console.log(shallowReactiveUser.age); // 30
 */
export function shallowReactive<T extends ReactiveTypes>(
  initialValue: T,
  exclude?: ExcludeType,
): Reactive<T> {
  return ReactiveImpl(initialValue, true, exclude) as Reactive<T>;
}

const basicHandler = (shallow, exclude): ProxyHandler<Record<string, any>> => {
  return {
    get(target, key, receiver) {
      if (key === ReactiveSymbol) return true;
      if (key === ReactivePeekSymbol) return target;

      const getValue = Reflect.get(target, key, receiver);
      const value = isSignal(getValue) ? getValue.value : getValue;

      if (exclude && isExclude(key, exclude)) {
        return value;
      }

      track(target, key);
      // deep track
      if (isObject(value) && !shallow) {
        return ReactiveImpl(value);
      }
      return value;
    },
    set(target, key, value, receiver) {
      if (exclude && isExclude(key, exclude)) {
        Reflect.set(target, key, value, receiver);
        return true;
      }
      let oldValue: SignalImpl<any> | any = Reflect.get(target, key, receiver);

      if (isSignal(oldValue)) {
        oldValue = oldValue.value;
      }
      if (isSignal(value)) {
        value = value.value;
      }
      const obj = Reflect.set(target, key, value, receiver);

      if (hasChanged(value, oldValue)) {
        trigger(target, key);
      }
      return obj;
    },
    // handle  delete
    deleteProperty(target, key) {
      const oldValue = Reflect.get(target, key);
      const result = Reflect.deleteProperty(target, key);
      if (oldValue !== undefined) {
        trigger(target, key);
      }
      return result;
    },
  };
};

const arrayInstrumentations = createArrayInstrumentations();

// Create special handling for array methods
function createArrayInstrumentations() {
  const instrumentations: Record<string, Function> = {};

  ['includes', 'indexOf', 'lastIndexOf'].forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = toRaw(this) as any[];
      for (let i = 0, l = this.length; i < l; i++) {
        track(arr, `${i}`);
      }
      const res = arr[key as keyof typeof arr](...args);
      if (res === -1 || res === false) {
        return arr[key as keyof typeof arr](...args);
      }
      return res;
    };
  });

  ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'].forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = toRaw(this) as any[];
      const res = arr[key as keyof typeof this].apply(this, args);
      trigger(arr, reactiveArrayKey);
      return res;
    };
  });

  [
    'forEach',
    'map',
    'filter',
    'reduce',
    'reduceRight',
    'some',
    'every',
    'find',
    'findIndex',
    'findLast',
    'findLastIndex',
    'entries',
    'keys',
    'values',
  ].forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = toRaw(this) as any[];
      track(arr, reactiveArrayKey);
      return arr[key as keyof typeof this].apply(this, args);
    };
  });

  return instrumentations;
}

// Proxy handler for arrays
const ArrayHandler = (shallow, exclude): ProxyHandler<unknown[]> => {
  return {
    get(target, key: string | symbol, receiver) {
      if (key === ReactiveSymbol) return true;
      if (key === ReactivePeekSymbol) return target;

      if (arrayInstrumentations.hasOwnProperty(key)) {
        return Reflect.get(arrayInstrumentations, key, receiver);
      }

      const value = Reflect.get(target, key, receiver);

      if (exclude && isExclude(key, exclude)) {
        return value;
      }
      // track arr[0]
      if (isStringNumber(key)) {
        track(target, key);
      }

      track(target, 'length');

      // deep track
      if (isObject(value) && !shallow) {
        return ReactiveImpl(value);
      }
      return value;
    },
    set(target, key: string | symbol, value, receiver) {
      const oldValue = Reflect.get(target, key, receiver);
      const result = Reflect.set(target, key, value, receiver);

      if (hasChanged(value, oldValue)) {
        // trigger arr[0]
        if (isStringNumber(key)) {
          trigger(target, key);
        }

        //  trigger arr.length = 0 or add new item
        if (key === 'length' || !oldValue) {
          trigger(target, 'length');
        }
      }
      return result;
    },
  };
};

// Proxy handler for collections
const collectionHandlers: ProxyHandler<Map<unknown, unknown> | Set<unknown>> = {
  get(target, key: string | symbol) {
    if (key === ReactiveSymbol) return true;
    if (key === ReactivePeekSymbol) return target;

    if (key === Symbol.iterator || key === 'size') {
      track(target, ReactiveCollectionKey);
    }

    return Reflect.get(
      hasOwn(instrumentations, key) && key in target ? instrumentations : target,
      key,
      target,
    );
  },
};

// Proxy handler for WeakMap and WeakSet
const weakCollectionHandlers: ProxyHandler<WeakMap<object, unknown> | WeakSet<object>> = {
  get(target, key: string | symbol) {
    if (key === ReactiveSymbol) return true;
    if (key === ReactivePeekSymbol) return target;
    return Reflect.get(
      hasOwn(weakInstrumentations, key) && key in target ? weakInstrumentations : target,
      key,
      target,
    );
  },
};

// Overwrite all methods and properties of Map/Set
const instrumentations = {
  get(key: unknown) {
    const target = toRaw(this);
    track(target, ReactiveCollectionKey);
    return target.get(key);
  },
  set(key: unknown, value: unknown) {
    const target = toRaw(this);
    const result = target.set(key, value);
    trigger(target, ReactiveCollectionKey);
    return result;
  },
  add(value: unknown) {
    const target = toRaw(this);
    const result = target.add(value);
    trigger(target, ReactiveCollectionKey);
    return result;
  },
  has(key: unknown) {
    const target = toRaw(this);
    track(target, ReactiveCollectionKey);
    return target.has(key);
  },
  delete(key: unknown) {
    const target = toRaw(this);
    const hadKey = target.has(key);
    const result = target.delete(key);
    if (hadKey) {
      trigger(target, ReactiveCollectionKey);
    }
    return result;
  },
  clear() {
    const target = toRaw(this);
    const hadItems = target.size > 0;
    const result = target.clear();
    if (hadItems) {
      trigger(target, ReactiveCollectionKey);
    }
    return result;
  },
  forEach(
    callback: (value: unknown, key: unknown, map: Map<unknown, unknown> | Set<unknown>) => void,
    thisArg?: unknown,
  ) {
    const target = toRaw(this);
    track(target, ReactiveCollectionKey);
    target.forEach((value: unknown, key: unknown) => {
      callback.call(thisArg, value, key, target as unknown as Map<unknown, unknown> | Set<unknown>);
    });
  },
  get size() {
    const target = toRaw(this);
    track(target, ReactiveCollectionKey);
    return target.size;
  },
  keys() {
    const target = toRaw(this);
    track(target, ReactiveCollectionKey);
    return target.keys();
  },
  values() {
    const target = toRaw(this);
    track(target, ReactiveCollectionKey);
    return target.values();
  },
  entries() {
    const target = toRaw(this);
    track(target, ReactiveCollectionKey);
    return target.entries();
  },
  [Symbol.iterator]() {
    const target = toRaw(this);
    track(target, ReactiveCollectionKey);
    return target[Symbol.iterator]();
  },
};

// Overwrite methods of WeakMap/WeakSet
const weakInstrumentations = {
  get(key: object) {
    const target = toRaw(this);
    track(target, ReactiveWeakCollectionKey);
    return target.get(key);
  },
  set(key: object, value: any) {
    const target = toRaw(this);
    const result = target.set(key, value);
    trigger(target, ReactiveWeakCollectionKey);
    return result;
  },
  add(value: object) {
    const target = toRaw(this);
    const result = target.add(value);
    trigger(target, ReactiveWeakCollectionKey);
    return result;
  },
  has(key: object) {
    const target = toRaw(this);
    track(target, ReactiveWeakCollectionKey);
    return target.has(key);
  },
  delete(key: object) {
    const target = toRaw(this);
    const result = target.delete(key);
    trigger(target, ReactiveWeakCollectionKey);
    return result;
  },
};

/**
 * Creates a useReactive object.
 * @param {object} initialValue - The initial value.
 * @param {boolean} [shallow] - Whether to create a shallow useReactive object.
 * @param {ExcludeType} [exclude] - The keys to exclude from the useReactive object.
 *
 * @returns {Reactive<T>} A new useReactive object.
 * @example
 * const reactiveUser = useReactive({ name: 'John', age: 30 });
 * console.log(reactiveUser.name); // 'John'
 * console.log(reactiveUser.age); // 30
 */
function ReactiveImpl<T extends object>(
  initialValue: T,
  shallow: boolean = false,
  exclude?: ExcludeType,
): Reactive<T> {
  if (!isObject(initialValue)) {
    return initialValue as Reactive<T>;
  }
  if (isReactive(initialValue)) {
    return initialValue as Reactive<T>;
  }

  if (reactiveMap.has(initialValue)) {
    return reactiveMap.get(initialValue) as Reactive<T>;
  }

  let handler;

  if (isArray(initialValue)) {
    track(initialValue, reactiveArrayKey);
    handler = ArrayHandler(shallow, exclude) as ProxyHandler<T>;
  } else if (isSet(initialValue) || isMap(initialValue)) {
    track(initialValue, ReactiveCollectionKey);
    handler = collectionHandlers as ProxyHandler<T>;
  } else if (isWeakSet(initialValue) || isWeakMap(initialValue)) {
    track(initialValue, ReactiveWeakCollectionKey);
    handler = weakCollectionHandlers as ProxyHandler<T>;
  } else {
    handler = basicHandler(shallow, exclude);
  }

  const proxy = new Proxy(initialValue, handler) as Reactive<T>;
  reactiveMap.set(initialValue, proxy);
  return proxy;
}

/**
 * Clears the useReactive object, removing all its properties and values.
 *
 * @param reactiveObj The useReactive object to clear.
 * @example
 * const reactiveUser = useReactive({ name: 'John', age: 30 });
 * clearReactive(reactiveUser);
 * console.log(reactiveUser); // {}
 */
export function clearReactive<T extends object>(reactiveObj: T): void {
  if (!isReactive(reactiveObj)) {
    if (__DEV__) {
      warn('clearReactive: argument must be a useReactive object');
    }
    return;
  }
  // weakMap and weakSet not
  if (isWeakMap(reactiveObj) || isWeakSet(reactiveObj)) {
    if (__DEV__) {
      warn('clearReactive: WeakMap and WeakSet are not clearable');
    }

    return;
  }

  useBatch(() => {
    if (isArray(reactiveObj)) {
      reactiveObj.length = 0;
    } else if (isSet(reactiveObj) || isMap(reactiveObj)) {
      reactiveObj.clear();
    } else if (isObject(reactiveObj)) {
      Object.keys(reactiveObj).forEach(key => {
        delete reactiveObj[key];
      });
    }
  });
}

/**
 * Call the function and batch all the useReactive update operations.
 * @remarks
 * If there are multiple useReactive updates in the same tick, they will be batched together.
 * This is useful for improving performance when multiple useReactive updates are triggered in the same tick.
 * @example
 * batch(() => {
 *   reactiveState.a++;
 *   reactiveState.b++;
 * });
 * // Only one useReactive update is triggered.
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

function runBatch(): void {
  if (batchQueue.size > 0) {
    batchQueue.forEach(useEffect => useEffect());
    batchQueue.clear();
  }
}
/**
 * Creates a useReactive ref that can be used to reference a DOM node
 * or a component instance within the component function body.
 *
 * @returns a useReactive ref useSignal
 *
 * @example
 * const inputRef = useRef<HTMLInputElement>()
 *
 * <input ref={inputRef} />
 *
 * inputRef.value // input element
 */
export function useRef<T>(): SignalImpl<T | null> {
  return shallowSignal<T | null>(null);
}

export function unTrack(fn: () => void): void {
  inUnTack = true;
  fn();
  inUnTack = false;
}
