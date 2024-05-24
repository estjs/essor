import { isFunction } from '../../../shared/src';

type EffectFn = () => void;

let activeEffect: EffectFn | null = null;
let activeComputed: Computed<unknown> | null = null;

const computedSet = new Set<Computed<unknown>>();
const targetMap = new WeakMap<object, Map<string | symbol, Set<EffectFn>>>();
const EffectDeps = new Set<EffectFn>();

function track(target, key) {
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

function trigger(target, key) {
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

export class Signal<T> {
  private _value: T;

  constructor(value: T) {
    this._value = value;
  }

  valueOf(): T {
    track(this, 'value');
    return this._value;
  }

  toString(): string {
    track(this, 'value');
    return String(this._value);
  }

  toJSON(): T {
    return this._value;
  }

  get value(): T {
    track(this, 'value');
    return this._value;
  }

  set value(newValue: T) {
    if (this._value !== newValue) {
      this._value = newValue;
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
export function useSignal<T>(value?: T): Signal<T> {
  if (isSignal(value)) {
    return value as Signal<T>;
  }
  return new Signal<T>(value as T);
}

export function isSignal<T>(value: any): value is Signal<T> {
  return value instanceof Signal;
}
export class Computed<T> {
  private _value: T;

  constructor(private readonly fn: () => T) {
    const prev = activeComputed;
    activeComputed = this;
    track(this, '_value');
    this._value = this.fn();
    activeComputed = prev;
  }

  peek(): T {
    return this._value;
  }

  run() {
    const newValue = this.fn();
    if (newValue !== this._value) {
      this._value = newValue;
    }
  }

  get value(): T {
    track(this, '_value');
    return this._value;
  }
}

export function useComputed<T>(fn: () => T) {
  return new Computed(fn);
}

export function isComputed<T>(value: any): value is Computed<T> {
  return value instanceof Computed;
}

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

function shouldExclude(key: string, exclude?: ((key: string) => boolean) | string[]): boolean {
  return Array.isArray(exclude)
    ? exclude.includes(key)
    : isFunction(exclude)
      ? exclude(key)
      : false;
}

export type SignalObject<T> = {
  [K in keyof T]: Signal<T[K]> | T[K];
};
/**
 * Creates a SignalObject from the given initialValues, excluding specified keys.
 *
 * @param {T extends Object} initialValues - The initial values for the SignalObject.
 * @param {(key: string) => boolean | string[]} exclude - A function that determines which keys to exclude from the SignalObject.
 * @return {SignalObject<T>} The created SignalObject.
 */
export function signalObject<T extends object>(
  initialValues: T,
  exclude?: ((key: string) => boolean) | string[],
): SignalObject<T> {
  const signals = Object.entries(initialValues).reduce((acc, [key, value]) => {
    acc[key] = shouldExclude(key, exclude) || isSignal(value) ? value : useSignal(value);
    return acc;
  }, {} as SignalObject<T>);

  return signals;
}

/**
 * Returns the current value of a signal, signal object, or plain object, excluding specified keys.
 *
 * @param {SignalObject<T> | T | Signal<T>} signal - The signal, signal object, or plain object to unwrap.
 * @param {(key: string) => boolean | string[]} [exclude] - A function that determines which keys to exclude from the unwrapped object.
 * @return {T} The unwrapped value of the signal, signal object, or plain object.
 */
export function unSignal<T>(
  signal: SignalObject<T> | T | Signal<T>,
  exclude?: ((key: string) => boolean) | string[],
): T {
  if (!signal) return {} as T;
  if (isSignal(signal)) {
    return signal.peek();
  }
  return Object.entries(signal).reduce((acc, [key, value]) => {
    if (shouldExclude(key, exclude)) {
      acc[key] = value;
    } else {
      acc[key] = isSignal(value) ? value.peek() : value;
    }
    return acc;
  }, {} as T);
}

const REACTIVE_MARKER = Symbol('reactive');

export function isReactive(obj) {
  return obj && obj[REACTIVE_MARKER] === true;
}

export function unReactive(obj) {
  if (!isReactive(obj)) {
    return obj;
  }

  const copy = Object.assign({}, obj);
  delete copy[REACTIVE_MARKER];
  return copy;
}
export function reactive(initialValue) {
  const signalObj = signalObject(initialValue);

  const handler = {
    get(target, key, receiver) {
      track(target, key);
      const value = Reflect.get(target, key, receiver);
      return isSignal(value) ? value.value : value;
    },
    set(target, key, value, receiver) {
      const oldValue = Reflect.get(target, key, receiver);
      if (oldValue !== value) {
        Reflect.set(target, key, useSignal(value), receiver);
        trigger(target, key);
      }
      return true;
    },
  };

  const reactiveProxy = new Proxy(signalObj, handler);
  reactiveProxy[REACTIVE_MARKER] = true;

  return reactiveProxy;
}
