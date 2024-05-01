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

export type SignalObject<T> = {
  [K in keyof T]: Signal<T[K]>;
};
export function signalObject<T extends Object>(initialValues: T): SignalObject<T> {
  const signals = Object.entries(initialValues).reduce((acc, [key, value]) => {
    acc[key] = isSignal(value) ? value : useSignal(value);
    return acc;
  }, {} as SignalObject<T>);

  return signals;
}

export function signalToObject<T>(signal: SignalObject<T> | T | Signal<T>): T {
  if (!signal) return {} as T;
  if (isSignal(signal)) {
    return signal.peek();
  }
  return Object.entries(signal).reduce((acc, [key, value]) => {
    acc[key] = isSignal(value) ? value.peek() : value;
    return acc;
  }, {} as T);
}
