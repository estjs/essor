import {
  type ExcludeType,
  hasChanged,
  hasOwn,
  isArray,
  isExclude,
  isMap,
  isObject,
  isPlainObject,
  isSet,
  isStringNumber,
  isWeakMap,
  isWeakSet,
  warn,
} from '@estjs/shared';
import { nextTick, queueJob, queuePreFlushCb } from './scheduler';

// Define the type for effect functions
type EffectFn = (() => void) &
  Partial<{
    init: boolean;
    active: boolean;
  }>;

// Global variables to track active effects and computed values
let activeEffect: EffectFn | null = null;
const activeComputed: EffectFn | null = null;

// Type definition for the trigger map
type TriggerMap = Map<string | symbol, Set<EffectFn>>;

// WeakMaps to store dependencies and reactive objects
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

// batch queue
let inBatch = false;
const batchQueue: Set<EffectFn> = new Set();

// Define types that can be made reactive
type ReactiveTypes =
  | Record<string | symbol | number, unknown>
  | Array<unknown>
  | Set<unknown>
  | Map<object, unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>;

export function track(target: object, key: string | symbol) {
  if (!activeEffect && !activeComputed) return;
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
  if (activeEffect) dep.add(activeEffect);
}
function trigger(target: object, key: string | symbol) {
  const depsMap = triggerMap.get(target);
  if (!depsMap) return;
  const dep = depsMap.get(key);
  if (dep) {
    dep.forEach(effect => {
      if (hasOwn(effect, 'active') && !effect.active) {
        dep.delete(effect);
        return;
      }
      if (inBatch) {
        batchQueue.add(effect);
      } else {
        effect();
      }
    });
  }
}

/**
 * Signal class represents a reactive value.
 * @template T The type of the value held by the Signal.
 * @example
 * const count = new Signal(0);
 * console.log(count.value); // 0
 * count.value = 1;
 * console.log(count.value); // 1
 */
export class Signal<T> {
  private _value: T;
  private _shallow: boolean;

  // is should be read
  //@ts-ignore
  private readonly __signal = true;

  /**
   * Creates a new Signal instance.
   * @param {T} value - The initial value of the Signal.
   * @param {boolean} [shallow] - Whether to create a shallow Signal.
   */
  constructor(value: T, shallow: boolean = false) {
    this._shallow = shallow;
    this._value = value;
  }

  /**
   * Gets the current value of the Signal.
   * @returns {T} The current value.
   */
  get value(): T {
    track(this, SignalValueKey);
    if (isObject(this._value) && !this._shallow) {
      return useReactive(this._value) as T;
    }
    return this._value;
  }

  /**
   * Sets a new value for the Signal.
   * @param {T} newValue - The new value to set.
   */
  set value(newValue: T) {
    if (isSignal(newValue)) {
      newValue = newValue.peek() as T;
    }

    if (hasChanged(newValue, this._value)) {
      this._value = newValue;
      trigger(this, SignalValueKey);
    }
  }

  /**
   * Returns the current value without triggering reactivity.
   * @returns {T} The current value.
   */
  peek(): T {
    return this._value;
  }
}

/**
 * Creates a new Signal object.
 * @template T The type of the value held by the Signal.
 * @param {T} [value] - The initial value of the Signal.
 * @returns {Signal<T>} A new Signal instance.
 * @example
 * const count = useSignal(0);
 * console.log(count.value); // 0
 * count.value++;
 * console.log(count.value); // 1
 */
export function useSignal<T>(value?: T): Signal<T> {
  if (isSignal(value)) {
    return value as Signal<T>;
  }
  return new Signal<T>(value as T);
}

/**
 * Creates a shallow Signal object.
 * @template T The type of the value held by the Signal.
 * @param {T} [value] - The initial value of the Signal.
 * @returns {Signal<T>} A new shallow Signal instance.
 * @example
 * const obj = useShallowSignal({ nested: { count: 0 } });
 * // Changes to obj.value.nested will not trigger reactivity
 * obj.value.nested.count = 1;
 */
export function useShallowSignal<T>(value?: T): Signal<T> {
  return new Signal<T>(value as T, true);
}

/**
 * Alias for useShallowSignal.
 * @template T The type of the value held by the Signal.
 * @param {T} [value] - The initial value of the Signal.
 * @returns {Signal<T>} A new shallow Signal instance.
 * @example
 * const obj = shallowSignal({ nested: { count: 0 } });
 * // Changes to obj.value.nested will not trigger reactivity
 * obj.value.nested.count = 1;
 */
export function shallowSignal<T>(value?: T): Signal<T> {
  return new Signal<T>(value as T, true);
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
export function isSignal<T>(value: any): value is Signal<T> {
  return !!(value && value?.__signal);
}

/**
 * Computed class represents a computed reactive value.
 * @template T The type of the value computed by the Computed instance.
 * @example
 * const doubleCount = useComputed(() => count.value * 2);
 * console.log(doubleCount.value); // 0
 * count.value = 1;
 * console.log(doubleCount.value); // 2
 */
export class Computed<T = unknown> {
  private _value: T;
  //@ts-ignore
  private readonly __computed = true;
  constructor(private readonly fn: () => T) {
    const prev = activeEffect;
    activeEffect = this.run.bind(this);
    this._value = this.fn();
    activeEffect = prev;
  }
  /**
   * Get the current computed value without tracking it.
   */
  peek(): T {
    return this._value;
  }
  /**
   * Run the computed function and update the value if it has changed.
   */
  run() {
    const newValue = this.fn();
    if (hasChanged(newValue, this._value)) {
      this._value = newValue;
      trigger(this, ComputedValueKey);
    }
  }

  /**
   * Get the current computed value and track its usage.
   */
  get value(): T {
    track(this, ComputedValueKey);
    return this._value;
  }
}

/**
 * Creates a new Computed instance.
 * @template T The type of the value computed by the Computed instance.
 * @param {() => T} fn - The computation function.
 * @returns {Computed<T>} A new Computed instance.
 * @example
 * const doubleCount = useComputed(() => count.value * 2);
 * console.log(doubleCount.value); // 0
 * count.value = 1;
 * console.log(doubleCount.value); // 2
 */
export function useComputed<T>(fn: () => T): Computed<T> {
  return new Computed<T>(fn);
}

/**
 * Checks if a value is a Computed instance.
 * @template T The type of the value computed by the Computed instance.
 * @param {any} value - The value to check.
 * @returns {boolean} True if the value is a Computed instance, false otherwise.
 * @example
 * const doubleCount = useComputed(() => count.value * 2);
 * console.log(isComputed(doubleCount)); // true
 * console.log(isComputed(0)); // false
 */
export function isComputed<T>(value: any): value is Computed<T> {
  return !!(value && value.__computed);
}

export interface EffectOptions {
  flush?: 'pre' | 'post' | 'sync';
  onTrack?: () => void;
  onTrigger?: () => void;
}

// Create a scheduler function for the given effect and flush type
// Example: const scheduler = createScheduler(effectFn, 'pre')
function createScheduler(effect: EffectFn, flush: 'pre' | 'post' | 'sync') {
  if (flush === 'sync') {
    return () => effect();
  } else if (flush === 'pre') {
    return () => queuePreFlushCb(effect);
  } else {
    return () => {
      nextTick(() => queueJob(effect));
    };
  }
}

/**
 * Registers an effect function to run when signals or computed properties change.
 * @param {() => void} fn - The effect function.
 * @param {EffectOptions} [options] - The options for the effect.
 * @returns {() => void} A function to stop the effect.
 */
export function useEffect(fn: () => void, options: EffectOptions = {}): () => void {
  const { flush = 'pre', onTrack, onTrigger } = options;

  function effectFn() {
    const prev = activeEffect;
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

export type SignalObject<T> = {
  [K in keyof T]: Signal<T[K]>;
};

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
 * Returns the current value of signals, signal objects, or plain objects, excluding specified keys.
 * @template T The type of the value.
 * @param {SignalObject<T> | T | Signal<T>} signal - The signal, signal object, or plain object.
 * @param {ExcludeType} [exclude] - The keys to exclude from the result.
 * @returns {T} The current value.
 * @example
 * const user = unSignal(userSignals);
 * console.log(user.name); // 'John'
 * console.log(user.age); // 30
 */
export function unSignal<T>(signal: SignalObject<T> | T | Signal<T>, exclude?: ExcludeType): T {
  if (!signal) return {} as T;

  if (isWeakMap(signal) || isMap(signal) || isSet(signal) || isWeakSet(signal)) {
    if (__DEV__) {
      warn(
        'unSignal does not support WeakMap, Map, Set or WeakSet, will return initial value!',
        signal,
      );
    }
    return signal as T;
  }
  if (isSignal(signal)) {
    return signal.peek();
  }
  if (isArray(signal)) {
    return signal.map(value => unSignal(value, exclude)) as T;
  }
  if (isPlainObject(signal)) {
    return Object.entries(signal).reduce((acc, [key, value]) => {
      if (isExclude(key, exclude)) {
        acc[key] = value;
      } else {
        acc[key] = isSignal(value) ? value.peek() : isReactive(value) ? unReactive(value) : value;
      }
      return acc;
    }, {} as T);
  }
  return signal as T;
}

// Define the Reactive type
export type Reactive<T> = T & {
  [ReactivePeekSymbol]: T;
  [ReactiveSymbol]?: true;
};

/**
 * Checks if an object is reactive.
 * @param {unknown} obj - The object to check.
 * @returns {boolean} True if the object is reactive, false otherwise.
 * @example
 * const reactiveUser = useReactive({ name: 'John', age: 30 });
 * console.log(isReactive(reactiveUser)); // true
 * console.log(isReactive({ name: 'John', age: 30 })); // false
 */
export function isReactive(obj: unknown): obj is Reactive<any> {
  return !!(obj && typeof obj === 'object' && obj[ReactiveSymbol]);
}

/**
 * Creates a reactive object.
 * @param {ReactiveTypes} initialValue - The initial value.
 * @param {ExcludeType} [exclude] - The keys to exclude from the reactive object.
 * @returns {Reactive<T>} A new reactive object.
 * @example
 * const reactiveUser = useReactive({ name: 'John', age: 30 });
 * console.log(reactiveUser.name); // 'John'
 * console.log(reactiveUser.age); // 30
 */
export function useReactive<T extends object>(initialValue: T, exclude?: ExcludeType): Reactive<T> {
  return reactive(initialValue, exclude, false) as Reactive<T>;
}

/**
 * Creates a shallow reactive object.
 * @template T The type of the initial value.
 * @param {T} initialValue - The initial value.
 * @param {ExcludeType} [exclude] - The keys to exclude from the reactive object.
 * @returns {Reactive<T>} A new shallow reactive object.
 * @example
 * const shallowReactiveUser = shallowReactive({ name: 'John', age: 30 });
 * console.log(shallowReactiveUser.name); // 'John'
 * console.log(shallowReactiveUser.age); // 30
 */
export function shallowReactive<T extends ReactiveTypes>(
  initialValue: T,
  exclude?: ExcludeType,
): Reactive<T> {
  return reactive(initialValue, exclude, true) as Reactive<T>;
}

/**
 * Creates a non-reactive copy of the target object.
 * @template T The type of the target object.
 * @param {Reactive<T>} target - The target reactive object.
 * @returns {T} A non-reactive copy of the target object.
 * @example
 * const plainUser = unReactive(reactiveUser);
 * console.log(plainUser.name); // 'John'
 * console.log(plainUser.age); // 30
 */
export function unReactive<T>(target: Reactive<T> | T): T {
  if (!isObject(target)) {
    return target;
  }

  if (!isReactive(target)) {
    return target;
  }

  return target[ReactivePeekSymbol];
}

const arrayInstrumentations = createArrayInstrumentations();

// Create special handling for array methods
function createArrayInstrumentations() {
  const instrumentations: Record<string, Function> = {};

  ['includes', 'indexOf', 'lastIndexOf'].forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = this as any[];
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

  ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin'].forEach(
    key => {
      instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
        const arr = unReactive(this) as any[];
        const res = arr[key as keyof typeof this].apply(this, args);
        trigger(arr, reactiveArrayKey);
        return res;
      };
    },
  );

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
      const arr = unReactive(this) as any[];
      track(arr, reactiveArrayKey);
      return arr[key as keyof typeof this].apply(this, args);
    };
  });

  return instrumentations;
}

// Proxy handler for arrays
const ArrayHandler: ProxyHandler<unknown[]> = {
  get(target, key: string | symbol, receiver) {
    if (key === ReactiveSymbol) return true;
    if (key === ReactivePeekSymbol) return target;
    if (arrayInstrumentations.hasOwnProperty(key)) {
      return Reflect.get(arrayInstrumentations, key, receiver);
    }

    const value = Reflect.get(target, key, receiver);

    if (isStringNumber(key)) {
      track(target, key);
    }
    // hack for length, eg: const arr = reactive([1,2,3]); arr.length = 0
    track(target, 'length');

    if (isObject(value)) {
      return reactive(value);
    }
    return value;
  },
  set(target, key: string | symbol, value, receiver) {
    const oldValue = Reflect.get(target, key, receiver);
    const result = Reflect.set(target, key, value, receiver);
    if (hasChanged(value, oldValue)) {
      if (isStringNumber(key)) {
        trigger(target, key);
      }

      if (key === 'length') {
        trigger(target, 'length');
      }
    }
    return result;
  },
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
    const target = unReactive(this);
    track(target, ReactiveCollectionKey);
    return target.get(key);
  },
  set(key: unknown, value: unknown) {
    const target = unReactive(this);
    const result = target.set(key, value);
    trigger(target, ReactiveCollectionKey);
    return result;
  },
  add(value: unknown) {
    const target = unReactive(this);
    const result = target.add(value);
    trigger(target, ReactiveCollectionKey);
    return result;
  },
  has(key: unknown) {
    const target = unReactive(this);
    track(target, ReactiveCollectionKey);
    return target.has(key);
  },
  delete(key: unknown) {
    const target = unReactive(this);
    const hadKey = target.has(key);
    const result = target.delete(key);
    if (hadKey) {
      trigger(target, ReactiveCollectionKey);
    }
    return result;
  },
  clear() {
    const target = unReactive(this);
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
    const target = unReactive(this);
    track(target, ReactiveCollectionKey);
    target.forEach((value: unknown, key: unknown) => {
      callback.call(thisArg, value, key, target as unknown as Map<unknown, unknown> | Set<unknown>);
    });
  },
  get size() {
    const target = unReactive(this);
    track(target, ReactiveCollectionKey);
    return target.size;
  },
  keys() {
    const target = unReactive(this);
    track(target, ReactiveCollectionKey);
    return target.keys();
  },
  values() {
    const target = unReactive(this);
    track(target, ReactiveCollectionKey);
    return target.values();
  },
  entries() {
    const target = unReactive(this);
    track(target, ReactiveCollectionKey);
    return target.entries();
  },
  [Symbol.iterator]() {
    const target = unReactive(this);
    track(target, ReactiveCollectionKey);
    return target[Symbol.iterator]();
  },
};

// Overwrite methods of WeakMap/WeakSet
const weakInstrumentations = {
  get(key: object) {
    const target = unReactive(this);
    track(target, ReactiveWeakCollectionKey);
    return target.get(key);
  },
  set(key: object, value: any) {
    const target = unReactive(this);
    const result = target.set(key, value);
    trigger(target, ReactiveWeakCollectionKey);
    return result;
  },
  add(value: object) {
    const target = unReactive(this);
    const result = target.add(value);
    trigger(target, ReactiveWeakCollectionKey);
    return result;
  },
  has(key: object) {
    const target = unReactive(this);
    track(target, ReactiveWeakCollectionKey);
    return target.has(key);
  },
  delete(key: object) {
    const target = unReactive(this);
    const result = target.delete(key);
    trigger(target, ReactiveWeakCollectionKey);
    return result;
  },
};

/**
 * Creates a reactive object.
 * @param {object} initialValue - The initial value.
 * @param {ExcludeType} [exclude] - The keys to exclude from the reactive object.
 * @param {boolean} [shallow] - Whether to create a shallow reactive object.
 * @returns {Reactive<T>} A new reactive object.
 * @example
 * const reactiveUser = reactive({ name: 'John', age: 30 });
 * console.log(reactiveUser.name); // 'John'
 * console.log(reactiveUser.age); // 30
 */
function reactive<T extends object>(
  initialValue: T,
  exclude?: ExcludeType,
  shallow: boolean = false,
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

  let handler: ProxyHandler<T> = {
    get(target, key, receiver) {
      if (key === ReactiveSymbol) return true;
      if (key === ReactivePeekSymbol) return target;

      const getValue = Reflect.get(target, key, receiver);
      const value = isSignal(getValue) ? getValue.value : getValue;

      if (isExclude(key, exclude)) {
        return value;
      }

      track(target, key);
      if (isObject(value) && !shallow) {
        return useReactive(value);
      }
      return value;
    },
    set(target, key, value, receiver) {
      if (isExclude(key, exclude)) {
        Reflect.set(target, key, value, receiver);
        return true;
      }
      let oldValue: Signal<any> | any = Reflect.get(target, key, receiver);

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
    deleteProperty(target, key) {
      const oldValue = Reflect.get(target, key);
      const result = Reflect.deleteProperty(target, key);
      if (oldValue !== undefined) {
        trigger(target, key);
      }
      return result;
    },
  };

  if (isArray(initialValue)) {
    track(initialValue, reactiveArrayKey);
    handler = ArrayHandler as ProxyHandler<T>;
  }

  if (isSet(initialValue) || isMap(initialValue)) {
    track(initialValue, ReactiveCollectionKey);
    handler = collectionHandlers as ProxyHandler<T>;
  }

  if (isWeakSet(initialValue) || isWeakMap(initialValue)) {
    track(initialValue, ReactiveWeakCollectionKey);
    handler = weakCollectionHandlers as ProxyHandler<T>;
  }

  const proxy = new Proxy(initialValue, handler) as Reactive<T>;
  reactiveMap.set(initialValue, proxy);
  return proxy;
}

/**
 * Clears the reactive object, removing all its properties and values.
 *
 * @param reactiveObj The reactive object to clear.
 * @example
 * const reactiveUser = useReactive({ name: 'John', age: 30 });
 * clearReactive(reactiveUser);
 * console.log(reactiveUser); // {}
 */
export function clearReactive<T extends object>(reactiveObj: Reactive<T>): void {
  if (!isReactive(reactiveObj)) {
    if (__DEV__) {
      warn('clearReactive: argument must be a reactive object');
    }
    return;
  }

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
 * Call the function and batch all the reactive update operations.
 * @remarks
 * If there are multiple reactive updates in the same tick, they will be batched together.
 * This is useful for improving performance when multiple reactive updates are triggered in the same tick.
 * @example
 * batch(() => {
 *   reactiveState.a++;
 *   reactiveState.b++;
 * });
 * // Only one reactive update is triggered.
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
    batchQueue.forEach(effect => effect());
    batchQueue.clear();
  }
}
