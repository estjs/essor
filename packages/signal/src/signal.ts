import {
  type ExcludeType,
  hasChanged,
  isArray,
  isExclude,
  isHTMLElement,
  isMap,
  isObject,
  isPrimitive,
  isSet,
  isWeakMap,
  isWeakSet,
  startsWith,
} from '@essor/shared';

type EffectFn = () => void;

// Globals to track active effects and computed functions
let activeEffect: EffectFn | null = null;
let activeComputed: Computed<unknown> | null = null;

// WeakMaps to store dependency tracking information
type ComputedMap = Map<string | symbol, Set<Computed<unknown>>>;
type SignalMap = Map<string | symbol, Set<EffectFn>>;

const computedMap = new WeakMap<object, ComputedMap>();
const signalMap = new WeakMap<object, SignalMap>();
const effectDeps = new Set<EffectFn>();
const reactiveMap = new WeakMap<object, object>();
const arrayMethods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];

/**
 * Tracks dependencies for reactive properties.
 * @param target - The target object being tracked.
 * @param key - The key on the target object.
 */
function track(target: object, key: string | symbol) {
  if (!activeEffect && !activeComputed) return;
  // Handle signal dependencies
  let depsMap = signalMap.get(target);
  if (!depsMap) {
    depsMap = new Map();
    signalMap.set(target, depsMap);
  }
  let dep = depsMap.get(key);
  if (!dep) {
    dep = new Set();
    depsMap.set(key, dep);
  }
  if (activeEffect) dep.add(activeEffect);
  // Handle computed dependencies
  let computedDepsMap = computedMap.get(target);
  if (!computedDepsMap) {
    computedDepsMap = new Map();
    computedMap.set(target, computedDepsMap);
  }
  let computedDeps = computedDepsMap.get(key);
  if (!computedDeps) {
    computedDeps = new Set();
    computedDepsMap.set(key, computedDeps);
  }
  if (activeComputed) {
    computedDeps.add(activeComputed);
  }
}
/**
 * Trigger function to notify all effects and computed functions
 * that are dependent on a specific target key.
 * @param target - The target object.
 * @param key - The key on the target object.
 */
function trigger(target: object, key: string | symbol) {
  const depsMap = signalMap.get(target);
  if (!depsMap) return;
  // Run all effects associated with the key
  const dep = depsMap.get(key);
  if (dep) {
    dep.forEach(effect => effectDeps.has(effect) && effect());
  }
  // Run all computed functions associated with the key
  const computedDepsMap = computedMap.get(target);
  if (computedDepsMap) {
    const computeds = computedDepsMap.get(key);
    if (computeds) {
      computeds.forEach(computed => computed.run());
    }
  }
}

/**
 * Signal class representing a reactive value.
 * Signals can be used to track and respond to changes in state.
 */
export class Signal<T> {
  private _value: T;
  private _shallow: boolean;

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
      console.warn('Signal cannot be set to another signal, use .peek() instead');
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
  return value instanceof Signal;
}

/**
 * Computed class representing a computed reactive value.
 * Computed values automatically update when their dependencies change.
 */
export class Computed<T = unknown> {
  private _value: T;

  constructor(private readonly fn: () => T) {
    // Track dependencies when the Computed is created
    const prev = activeComputed;
    activeComputed = this;
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
  return value instanceof Computed;
}

/**
 * Registers an effect function that runs whenever its dependencies change.
 * @param fn - The effect function to register.
 * @returns A function to unregister the effect.
 */
export function useEffect(fn: EffectFn): () => void {
  function effectFn() {
    const prev = activeEffect;
    activeEffect = effectFn;
    fn();
    activeEffect = prev;
  }

  effectDeps.add(effectFn);
  effectFn();

  return () => {
    effectDeps.delete(effectFn);
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
        acc[key] = isSignal(value) ? value.peek() : isReactive(value) ? unReactive(value) : value;
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
 * Creates a shallow copy of a reactive object.
 * @param obj - The reactive object to copy.
 * @returns A shallow copy of the reactive object.
 */
export function unReactive(obj: any): any {
  if (!isReactive(obj)) {
    return obj;
  }
  return { ...obj };
}

function createArrayProxy(initialValue: any[]) {
  arrayMethods.forEach(method => {
    const originalMethod = Array.prototype[method];
    track(initialValue, 'length');

    Object.defineProperty(initialValue, method, {
      value(...args: any[]) {
        const result = originalMethod.apply(this, args);
        if (['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'].includes(method)) {
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
  if (!isObject(initialValue)) {
    return initialValue;
  }
  if (isReactive(initialValue)) {
    return initialValue;
  }

  if (reactiveMap.has(initialValue)) {
    return reactiveMap.get(initialValue) as T;
  }
  if (Array.isArray(initialValue)) {
    createArrayProxy(initialValue);
  }
  if (
    isSet(initialValue) ||
    isMap(initialValue) ||
    isWeakSet(initialValue) ||
    isWeakMap(initialValue)
  ) {
    // not support collection
    return initialValue;
  }

  const handler: ProxyHandler<T> = {
    get(target, key, receiver) {
      if (key === REACTIVE_MARKER || startsWith(key, '_')) return true;

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
