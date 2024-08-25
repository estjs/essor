import {
  type ExcludeType,
  hasChanged,
  isArray,
  isExclude,
  isHTMLElement,
  isObject,
  isPrimitive,
  startsWith,
} from '@essor/shared';

type EffectFn = () => void;

let activeEffect: EffectFn | null = null;
let activeComputed: Computed<unknown> | null = null;

type ComputedMap = Map<string | symbol, Set<Computed<unknown>>>;
type SignalMap = Map<string | symbol, Set<EffectFn>>;

const computedMap = new WeakMap<object, ComputedMap>();
const signalMap = new WeakMap<object, SignalMap>();
const effectDeps = new WeakSet<EffectFn>();
const reactiveMap = new WeakMap<object, object>();
const arrayMethods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];

function getDepsMap<T>(
  map: WeakMap<object, Map<string | symbol, Set<T>>>,
  target: object,
  key: string | symbol,
): Set<T> {
  let depsMap = map.get(target);
  if (!depsMap) {
    depsMap = new Map();
    map.set(target, depsMap);
  }
  let dep = depsMap.get(key);
  if (!dep) {
    dep = new Set();
    depsMap.set(key, dep);
  }
  return dep;
}

function track(target: object, key: string | symbol) {
  if (activeEffect) {
    getDepsMap(signalMap, target, key).add(activeEffect);
  }
  if (activeComputed) {
    getDepsMap(computedMap, target, key).add(activeComputed);
  }
}

function trigger(target: object, key: string | symbol) {
  const effects = signalMap.get(target)?.get(key);
  if (effects) {
    effects.forEach(effect => effectDeps.has(effect) && effect());
  }

  const computeds = computedMap.get(target)?.get(key);
  if (computeds) {
    computeds.forEach(computed => computed.run());
  }
}

export class Signal<T> {
  private _value: T;

  constructor(value: T) {
    this._value = value;
  }

  private triggerObject() {
    if (!isPrimitive(this._value) && !isHTMLElement(this._value)) {
      useReactive(this._value as object);
    }
  }

  get value(): T {
    track(this, '_sv');
    this.triggerObject();
    return this._value;
  }

  set value(newValue: T) {
    if (isSignal(newValue)) {
      console.warn('Signal cannot be set to another signal, use .peek() instead');
      newValue = newValue.peek() as T;
    }

    if (hasChanged(newValue, this._value)) {
      this._value = newValue;
      this.triggerObject();
      trigger(this, '_sv');
    }
  }

  peek(): T {
    return this._value;
  }

  update(value) {
    this.value = value;
  }
}

export function useSignal<T>(value?: T): Signal<T> {
  return isSignal(value) ? (value as Signal<T>) : new Signal<T>(value as T);
}

export function isSignal<T>(value: any): value is Signal<T> {
  return value instanceof Signal;
}

export class Computed<T = unknown> {
  private _value: T;

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
      trigger(this, '_cv');
    }
  }

  get value(): T {
    track(this, '_cv');
    return this._value;
  }
}

export function useComputed<T>(fn: () => T): Computed<T> {
  return new Computed<T>(fn);
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

  effectDeps.add(effectFn);
  effectFn();

  return () => {
    effectDeps.delete(effectFn);
    activeEffect = null;
  };
}

export type SignalObject<T> = {
  [K in keyof T]: Signal<T[K]> | T[K];
};

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
      acc[key] = isExclude(key, exclude) ? value : isSignal(value) ? value.peek() : value;
      return acc;
    }, {} as T);
  }
  return signal as T;
}

const REACTIVE_MARKER = Symbol('useReactive');

export function isReactive(obj: any): boolean {
  return obj && obj[REACTIVE_MARKER] === true;
}

export function unReactive(obj: any): any {
  return isReactive(obj) ? { ...obj } : obj;
}

export function useReactive<T extends object>(initialValue: T, exclude?: ExcludeType): T {
  if (!isObject(initialValue)) return initialValue;
  if (isReactive(initialValue)) return initialValue;

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

      const value = Reflect.get(target, key, receiver);
      if (isExclude(key, exclude)) return value;

      track(target, key);

      if (isSignal(value)) {
        return value.value;
      }
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

      const getValue = Reflect.get(target, key, receiver);

      const oldValue = isSignal(getValue) ? getValue.value : getValue;
      const newValue = isSignal(value) ? value.value : value;

      const result = Reflect.set(target, key, value, receiver);
      if (hasChanged(newValue, oldValue)) {
        trigger(target, key);
      }
      return result;
    },
    deleteProperty(target, key) {
      const oldValue = Reflect.get(target, key);
      const result = Reflect.deleteProperty(target, key);
      if (oldValue !== undefined) trigger(target, key);
      return result;
    },
  };

  const proxy = new Proxy(initialValue, handler);
  reactiveMap.set(initialValue, proxy);
  return proxy;
}
