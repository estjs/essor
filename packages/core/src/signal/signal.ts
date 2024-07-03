import {
  type ExcludeType,
  hasChanged,
  isArray,
  isExclude,
  isHtmlElement,
  isObject,
  isPrimitive,
  startsWith,
} from 'essor-shared';

type EffectFn = () => void;

let activeEffect: EffectFn | null = null;
let activeComputed: Computed<unknown> | null = null;

const computedSet = new Set<Computed<unknown>>();
const targetMap = new WeakMap<object, Map<string | symbol, Set<EffectFn>>>();
const EffectDeps = new Set<EffectFn>();
const arrayMethods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];

/**
 * Tracks dependencies for reactive properties.
 * @param target - The target object being tracked.
 * @param key - The key on the target object.
 */
function track(target: object, key: string | symbol) {
  let depsMap = targetMap.get(target);
  if (!depsMap) {
    depsMap = new Map();
    targetMap.set(target, depsMap);
  }
  let dep = depsMap.get(key);
  if (!dep) {
    dep = new Set();
    depsMap.set(key, dep);
  }
  if (activeEffect) dep.add(activeEffect);
  if (activeComputed) {
    computedSet.add(activeComputed);
  }
}

/**
 * Triggers updates for reactive properties.
 * @param target - The target object being triggered.
 * @param key - The key on the target object.
 */
function trigger(target: object, key: string | symbol) {
  if (computedSet.size > 0) {
    computedSet.forEach(computedSignal => computedSignal.run());
  }

  const depsMap = targetMap.get(target);
  if (!depsMap) {
    return;
  }
  const dep = depsMap.get(key);
  if (dep) {
    dep.forEach(effect => EffectDeps.has(effect) && effect());
  }
}

/**
 * Signal class representing a reactive value.
 */
export class Signal<T> {
  private _value: T;
  // @ts-ignore
  private _reactive: T;
  // @ts-ignore
  private __activeEffect: EffectFn | null = null;

  constructor(value: T) {
    this._value = value;
  }

  valueOf(): T {
    track(this, 'value');
    this.__triggerObject();
    return this._value;
  }

  toString(): string {
    track(this, 'value');
    this.__triggerObject();
    return String(this._value);
  }

  toJSON(): T {
    return this._value;
  }

  get value(): T {
    track(this, 'value');
    this.__triggerObject();
    return this._value;
  }

  // if the value is not a primitive or an HTML element, create a reactive proxy
  __triggerObject() {
    // cache pre effect value
    if (activeEffect) {
      this.__activeEffect = activeEffect;
    }

    this._reactive =
      isPrimitive(this._value) || isHtmlElement(this._value)
        ? this._value
        : (useReactive(this._value as object) as T);
  }

  set value(newValue: T) {
    if (isSignal(newValue)) {
      console.warn('Signal cannot be set to another signal, use .peek() instead');
      newValue = newValue.peek() as T;
    }
    if (hasChanged(newValue, this._value)) {
      this._value = newValue;
      if (!isPrimitive(this._value) && !isHtmlElement(this._value) && !activeEffect) {
        activeEffect = this.__activeEffect;
        this.__triggerObject();
        activeEffect = null;
      }
      trigger(this, 'value');
    }
  }

  peek(): T {
    return this._value;
  }

  update() {
    trigger(this, 'value');
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
 * Checks if a value is a Signal.
 * @param value - The value to check.
 * @returns True if the value is a Signal, otherwise false.
 */
export function isSignal<T>(value: any): value is Signal<T> {
  return value instanceof Signal;
}

/**
 * Computed class representing a computed reactive value.
 */
export class Computed<T> {
  private _value: T;
  private _deps: Set<EffectFn> = new Set();

  constructor(private readonly fn: () => T) {
    const prev = activeComputed;
    activeComputed = this;
    this._value = this.fn();
    activeComputed = prev;
  }

  peek(): T {
    return this._value;
  }

  run() {
    const newValue = this.fn();
    if (hasChanged(newValue, this._value)) {
      this._value = newValue;
      this._deps.forEach(effect => effect());
    }
  }

  get value(): T {
    if (activeEffect) {
      this._deps.add(activeEffect);
    }
    track(this, '_value');
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

  EffectDeps.add(effectFn);
  effectFn();

  return () => {
    EffectDeps.delete(effectFn);
    activeEffect = null;
  };
}

export type SignalObject<T> = {
  [K in keyof T]: Signal<T[K]> | T[K];
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
        acc[key] = isSignal(value) ? value.peek() : value;
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
  return Object.assign({}, obj);
}

const reactiveMap = new WeakMap<object, object>();

/**
 * Creates a reactive object.
 * @param initialValue - The initial value for the reactive object.
 * @param exclude - A function or array that determines which keys to exclude from the reactive object.
 * @returns A reactive object.
 */
export function useReactive<T extends object>(initialValue: T, exclude?: ExcludeType): T {
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
    arrayMethods.forEach(method => {
      const originalMethod = initialValue[method];
      track(initialValue, 'length');

      Object.defineProperties(initialValue, {
        [method]: {
          value(...args) {
            const result = originalMethod.apply(this, args);
            trigger(initialValue, 'length');
            return result;
          },
          enumerable: false,
          configurable: true,
          writable: true,
        },
      });
    });
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
      if (isObject(value)) {
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
