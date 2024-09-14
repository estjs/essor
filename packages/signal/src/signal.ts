import {
  type ExcludeType,
  hasChanged,
  hasOwn,
  isArray,
  isExclude,
  isHTMLElement,
  isMap,
  isObject,
  isPrimitive,
  isSet,
  isWeakMap,
  isWeakSet,
  warn,
} from '@estjs/shared';
import { nextTick, queueJob, queuePreFlushCb } from './scheduler';

type EffectFn = (() => void) &
  Partial<{
    init: boolean;
    active: boolean;
  }>;

let activeEffect: EffectFn | null = null;
let activeComputed: EffectFn | null = null;

type TriggerMap = Map<string | symbol, Set<EffectFn>>;

const triggerMap = new WeakMap<object, TriggerMap>();
const reactiveMap = new WeakMap<object, object>();
const arrayMethods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];

/**
 * Tracks dependencies for reactive properties.
 * @param target - The target object being tracked.
 * @param key - The key on the target object.
 */
function track(target: object, key: string | symbol) {
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
  if (activeComputed) dep.add(activeComputed);
}
/**
 * Trigger function to notify all effects and computed functions
 * that are dependent on a specific target key.
 * @param target - The target object.
 * @param key - The key on the target object.
 */
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
      effect();
    });
  }
}
/**
 * Signal class representing a reactive value.
 * Signals can be used to track and respond to changes in state.
 */
/**
 * Signal class representing a reactive value.
 * Signals can be used to track and respond to changes in state.
 */
export class Signal<T> {
  private _value: T;
  private _shallow: boolean;

  //@ts-ignore
  private readonly __signal = true;

  constructor(value: T, shallow: boolean = false) {
    this._value = value;
    this._shallow = shallow;
  }
  /**
   * Get the current value of the Signal and track its usage.
   */
  get value(): T {
    track(this, '_sv');
    this.__triggerObject();
    return this._value;
  }
  /**
   * Trigger reactivity for non-primitive and non-HTMLElement values.
   * Recursively applies reactivity to nested objects.
   */
  private __triggerObject() {
    if (!isPrimitive(this._value) && !isHTMLElement(this._value) && !this._shallow) {
      useReactive(this._value as object);
    }
  }
  /**
   * Set a new value to the Signal and trigger updates if the value has changed.
   */
  set value(newValue: T) {
    if (isSignal(newValue)) {
      if (__DEV__) {
        console.warn(
          'Do not set the signal as a signal, the original value of the signal will be used!',
        );
      }
      newValue = newValue.peek() as T;
    }

    if (hasChanged(newValue, this._value)) {
      this._value = newValue;
      if (!isPrimitive(this._value) && !isHTMLElement(this._value)) {
        this.__triggerObject();
      }
      trigger(this, '_sv');
    }
  }
  /**
   * Peek at the current value of the Signal without tracking it.
   */
  peek(): T {
    return this._value;
  }
}
/**
 * Creates a Signal object.
 * @param value - The initial value for the Signal.
 * @returns A Signal object.
 */
export function useSignal<T>(value?: T): Signal<T> {
  if (isSignal(value)) {
    return value as Signal<T>;
  }
  return new Signal<T>(value as T);
}

/**
 * Creates a shallow Signal that does not recursively track the value.
 * Shallow signals are useful for performance optimization when the value
 * is an object or an array that is not expected to change.
 * @param value - The initial value for the Signal.
 * @returns A shallow Signal object.
 */
export function shallowSignal<T>(value?: T): Signal<T> {
  return new Signal<T>(value as T, true);
}
/**
 * Checks if a value is a Signal.
 * @param value - The value to check.
 * @returns True if the value is a Signal, otherwise false.
 */
export function isSignal<T>(value: any): value is Signal<T> {
  return !!(value && value.__signal);
}

/**
 * Computed class representing a computed reactive value.
 * Computed values automatically update when their dependencies change.
 */
export class Computed<T = unknown> {
  private _value: T;
  //@ts-ignore
  private readonly __computed = true;
  constructor(private readonly fn: () => T) {
    // Track dependencies when the Computed is created
    const prev = activeComputed;
    activeComputed = this.run.bind(this);
    this._value = this.fn();
    activeComputed = prev;
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
      trigger(this, '_cv');
    }
  }

  /**
   * Get the current computed value and track its usage.
   */
  get value(): T {
    track(this, '_cv');
    return this._value;
  }
}

/**
 * Creates a Computed object.
 * @param fn - The function to compute the value.
 * @returns A Computed object.
 */
export function useComputed<T>(fn: () => T): Computed<T> {
  return new Computed<T>(fn);
}

/**
 * Checks if a value is a Computed object.
 * @param value - The value to check.
 * @returns True if the value is a Computed object, otherwise false.
 */
export function isComputed<T>(value: any): value is Computed<T> {
  return !!(value && value.__computed);
}

export interface effectOptions {
  flush?: 'pre' | 'post' | 'sync'; // default: 'pre'
  onTrack?: () => void;
  onTrigger?: () => void;
}

/**
 * Creates a scheduler function for the given effect and flush type.
 * @param effect - The effect function to be scheduled.
 * @param flush - The flush type, one of 'pre', 'post', or 'sync'.
 * @returns A scheduler function.
 */
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
 * Registers a side-effect function to be executed when a signal or computed property changes.
 * @param fn - The side-effect function to be executed when reactive data changes.
 * @param options - The options object.
 * @param options.flush - The flush type, one of 'pre', 'post', 'sync'. Default is 'pre'.
 * @param options.onTrack - A function to be called when a dependency is tracked.
 * @param options.onTrigger - A function to be called when the side-effect is triggered.
 * @returns A function to clean up the side-effect.
 */
export function useEffect(fn: () => void, options: effectOptions = {}): () => void {
  const { flush = 'pre', onTrack, onTrigger } = options;

  // 创建副作用函数
  function effectFn() {
    const prev = activeEffect;

    activeEffect = effectFn.init ? effectFn : effectFn.scheduler;

    fn();
    // work done run trigger
    onTrigger && onTrigger();

    activeEffect = prev;
  }
  const scheduler = createScheduler(effectFn, flush);

  // mark the effect as inited
  effectFn.scheduler = scheduler;
  effectFn.init = true;
  effectFn.active = true;
  // start tracking
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
 * Creates a SignalObject from the given initialValues, excluding specified keys.
 * @param initialValues - The initial values for the SignalObject.
 * @param exclude - A function or array that determines which keys to exclude from the SignalObject.
 * @returns The created SignalObject.
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
 * Returns the current value of a signal, signal object, or plain object, excluding specified keys.
 * @param signal - The signal, signal object, or plain object to unwrap.
 * @param exclude - A function or array that determines which keys to exclude from the unwrapped object.
 * @returns The unwrapped value of the signal, signal object, or plain object.
 */
export function unSignal<T>(signal: SignalObject<T> | T | Signal<T>, exclude?: ExcludeType): T {
  if (!signal) return {} as T;
  if (isSignal(signal)) {
    return signal.peek();
  }
  if (isArray(signal)) {
    return signal.map(value => unSignal(value, exclude)) as T;
  }
  if (isObject(signal)) {
    return Object.entries(signal).reduce((acc, [key, value]) => {
      if (isExclude(key, exclude)) {
        acc[key] = value;
      } else {
        acc[key] = isSignal(value)
          ? value.peek()
          : isReactive(value)
            ? unReactive(value as object)
            : value;
      }
      return acc;
    }, {} as T);
  }
  return signal as T;
}

const REACTIVE_MARKER = Symbol('useReactive');

/**
 * Checks if an object is reactive.
 * @param obj - The object to check.
 * @returns True if the object is reactive, otherwise false.
 */
export function isReactive(obj: any): boolean {
  return obj && obj[REACTIVE_MARKER] === true;
}

/**
 * Creates a reactive object.
 * @param initialValue - The initial value for the reactive object.
 * @param exclude - A function or array that determines which keys to exclude from the reactive object.
 * @returns A reactive object.
 */

export function useReactive<T extends object>(initialValue: T, exclude?: ExcludeType): T {
  return reactive(initialValue, exclude, false);
}

/**
 * Creates a shallow reactive object.
 * Only the top level properties of the object are reactive. Nested objects are not reactive.
 * @param initialValue - The initial value for the reactive object.
 * @param exclude - A function or array that determines which keys to exclude from the reactive object.
 * @returns A shallow reactive object.
 */
export function shallowReactive<T extends object>(initialValue: T, exclude?: ExcludeType): T {
  return reactive(initialValue, exclude, true);
}

/**
 * Creates a non-reactive copy of the target object.
 * This method is the opposite of `useReactive`.
 * @param target - The object to create a non-reactive copy of.
 * @returns A non-reactive copy of the target object.
 */
export function unReactive<T extends object>(target: T): T {
  if (!isObject(target)) {
    return target;
  }

  if (!isReactive(target)) {
    return target;
  }

  const unReactiveObj: T = (Array.isArray(target) ? [] : {}) as T;

  for (const key in target) {
    if (hasOwn(target, key)) {
      const value = target[key] as T[keyof T];

      if (isReactive(value)) {
        unReactiveObj[key as keyof T] = unReactive(value as T[keyof T] & object);
      } else if (isSignal(value)) {
        unReactiveObj[key as keyof T] = value.peek() as unknown as T[keyof T];
      } else {
        unReactiveObj[key as keyof T] = value;
      }
    }
  }

  return unReactiveObj;
}

function isWorkReactive(
  initialValue: unknown,
): initialValue is
  | object
  | Array<unknown>
  | Set<unknown>
  | Map<unknown, unknown>
  | WeakMap<object, unknown>
  | WeakSet<object> {
  return (
    isObject(initialValue) ||
    isArray(initialValue) ||
    isMap(initialValue) ||
    isSet(initialValue) ||
    isWeakMap(initialValue) ||
    isWeakSet(initialValue)
  );
}

function createArrayProxy(initialValue: unknown[]) {
  arrayMethods.forEach(method => {
    const originalMethod = Array.prototype[method];
    track(initialValue, 'length');

    Object.defineProperty(initialValue, method, {
      value(...args: any[]) {
        const result = originalMethod.apply(this, args);
        if (arrayMethods.includes(method)) {
          trigger(initialValue, 'length');
        }
        return result;
      },
      enumerable: false,
      writable: true,
      configurable: true,
    });
  });
}

/**
 * Creates a reactive proxy for a collection.
 * @param target - The collection to proxy.
 * @returns A reactive proxy of the collection.
 */
function createCollectionProxy<
  T extends Set<any> | Map<any, any> | WeakSet<any> | WeakMap<any, any>,
>(target: T, shallow = false): T {
  const handler: ProxyHandler<T> = {
    get(target, key, receiver) {
      if (key === REACTIVE_MARKER) return true;

      track(target, key);
      const value = Reflect.get(target, key, receiver);
      if (typeof value === 'function') {
        return function (...args: any[]) {
          const result = value.apply(target, args);
          trigger(target, key);
          return result;
        };
      }
      // 针对索引和其他访问，进行依赖追踪
      track(target, key);

      // 如果是浅层模式则返回原值，否则递归进行响应式处理
      if (!shallow && isWorkReactive(value)) {
        return useReactive(value);
      }

      return value;
    },
  };
  return new Proxy(target, handler);
}

/**
 * Creates a reactive object.
 * @param initialValue - The initial value for the reactive object.
 * @param exclude - A function or array that determines which keys to exclude from the reactive object.
 * @param shallow - If true, only the top level properties of the object are reactive. Nested objects are not reactive.
 * @returns A reactive object.
 */
function reactive<T extends object>(
  initialValue: T,
  exclude?: ExcludeType,
  shallow: boolean = false,
): T {
  if (!isWorkReactive(initialValue)) {
    return initialValue;
  }
  if (isReactive(initialValue)) {
    return initialValue;
  }

  if (reactiveMap.has(initialValue)) {
    return reactiveMap.get(initialValue) as T;
  }
  if (isArray(initialValue)) {
    createArrayProxy(initialValue);
  }
  if (
    isSet(initialValue) ||
    isMap(initialValue) ||
    isWeakSet(initialValue) ||
    isWeakMap(initialValue)
  ) {
    createCollectionProxy(initialValue);
  }

  const handler: ProxyHandler<T> = {
    get(target, key, receiver) {
      if (key === REACTIVE_MARKER) return true;

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

  const proxy = new Proxy(initialValue, handler);
  reactiveMap.set(initialValue, proxy);
  return proxy;
}
