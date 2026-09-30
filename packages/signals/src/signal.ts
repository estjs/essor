import {
  type IfAny,
  hasChanged,
  isArray,
  isFunction,
  isIntegerKey,
  isObject,
  isSymbol,
} from '@estjs/shared';
import { signalsFlags } from './constants';
import { getDepFromReactive } from './dep';
import {
  type Builtin,
  type ShallowReactiveBrand,
  type Target,
  isProxy,
  isReactive,
  isShallow,
  toRaw,
  toReactive,
} from './reactive';
import {
  type Link,
  type ReactiveNode,
  ReactiveFlags as _ReactiveFlags,
  activeSub,
  batchDepth,
  flush,
  link,
  propagate,
  shallowPropagate,
} from './graph';
import type { ComputedRef, WritableComputedRef } from './computed';

export declare const RawSymbol: unique symbol;

export interface Signal<T = any, S = T> {
  get value(): T;
  set value(_: S);
  /**
   * Type differentiator only.
   * We need this to be in public d.ts but don't want it to show up in IDE
   * autocomplete, so we use a private Symbol instead.
   */
  [signalsFlags.IS_SIGNAL]: true;
}

/**
 * Checks if a value is a signal object.
 *
 * @param s - The value to inspect.
 */
export function isSignal<T>(s: Signal<T> | unknown): s is Signal<T>;
/*@__NO_SIDE_EFFECTS__*/
export function isSignal(s: any): s is Signal {
  return s ? s[signalsFlags.IS_SIGNAL] === true : false;
}

/**
 * Takes an inner value and returns a reactive and mutable signal object, which
 * has a single property `.value` that points to the inner value.
 *
 * @param value - The object to wrap in the signal.
 */
export function signal<T>(
  value: T,
): [T] extends [Signal] ? IfAny<T, Signal<T>, T> : Signal<UnwrapSignal<T>, UnwrapSignal<T> | T>;
export function signal<T = any>(): Signal<T | undefined>;
/*@__NO_SIDE_EFFECTS__*/
export function signal(value?: unknown) {
  return createSignal(value, toReactive);
}

declare const ShallowSignalMarker: unique symbol;

export type ShallowSignal<T = any, S = T> = Signal<T, S> & {
  [ShallowSignalMarker]?: true;
};

/**
 * Shallow version of {@link signal}.
 *
 * @example
 * ```js
 * const state = shallowSignal({ count: 1 })
 *
 * // does NOT trigger change
 * state.value.count = 2
 *
 * // does trigger change
 * state.value = { count: 2 }
 * ```
 *
 * @param value - The "inner value" for the shallow signal.
 */
export function shallowSignal<T>(
  value: T,
): Signal extends T
  ? T extends Signal
    ? IfAny<T, ShallowSignal<T>, T>
    : ShallowSignal<T>
  : ShallowSignal<T>;
export function shallowSignal<T = any>(): ShallowSignal<T | undefined>;
/*@__NO_SIDE_EFFECTS__*/
export function shallowSignal(value?: unknown) {
  return createSignal(value);
}

/**
 * Check if a value is a shallow signal.
 */
export function isShallowSignal(value: any): boolean {
  return isSignal(value) && !!(value as any)[signalsFlags.IS_SHALLOW];
}

function createSignal(rawValue: unknown, wrap?: <T>(v: T) => T) {
  if (isSignal(rawValue)) {
    // Check if the signal has the same "flavor" (shallow vs deep)
    const isInputShallow = !!(rawValue as any)[signalsFlags.IS_SHALLOW];
    const isOutputShallow = !wrap;

    // Only return the same signal if the flavors match
    if (isInputShallow === isOutputShallow) {
      return rawValue;
    }
    // Otherwise, wrap it in a new signal with the requested flavor
  }
  return new SignalImpl(rawValue, wrap);
}

/**
 * @internal
 */
class SignalImpl<T = any> implements ReactiveNode {
  subs: Link | undefined = undefined;
  subsTail: Link | undefined = undefined;
  flags: _ReactiveFlags = _ReactiveFlags.Mutable;

  _value: T;
  _wrap?: <T>(v: T) => T;
  private _oldValue: T;
  private _rawValue: T;

  /**
   * @internal
   */
  [signalsFlags.IS_SHALLOW]: boolean = false;

  constructor(value: T, wrap: (<T>(v: T) => T) | undefined) {
    this._oldValue = this._rawValue = wrap ? toRaw(value) : value;
    this._value = wrap ? wrap(value) : value;
    this._wrap = wrap;
    this[signalsFlags.IS_SHALLOW] = !wrap;
  }

  get dep(): this {
    return this;
  }

  get value(): T {
    trackSignal(this);
    return this._value;
  }

  set value(newValue) {
    const oldValue = this._rawValue;
    const useDirectValue =
      this[signalsFlags.IS_SHALLOW] || isShallow(newValue) || isSignal(newValue);
    newValue = useDirectValue ? newValue : toRaw(newValue);
    if (hasChanged(newValue, oldValue)) {
      this.flags |= _ReactiveFlags.Dirty;
      this._rawValue = newValue;
      this._value = !useDirectValue && this._wrap ? this._wrap(newValue) : newValue;
      const subs = this.subs;
      if (subs !== undefined) {
        propagate(subs);
        if (!batchDepth) {
          flush();
        }
      }
    }
  }

  /**
   * Clears Dirty and reports whether the value changed since the last read.
   * Called by `checkDirty` in graph.ts, so the name must match `Computed.update`.
   * @internal
   */
  update(): boolean {
    this.flags &= ~_ReactiveFlags.Dirty;
    return hasChanged(this._oldValue, (this._oldValue = this._rawValue));
  }
}

// Set the brand flag on the prototype
SignalImpl.prototype[signalsFlags.IS_SIGNAL] = true;

/**
 * Force trigger effects that depends on a shallow signal. This is typically used
 * after making deep mutations to the inner value of a shallow signal.
 *
 * @example
 * ```js
 * const shallow = shallowSignal({
 *   greet: 'Hello, world'
 * })
 *
 * // Logs "Hello, world" once for the first run-through
 * watchEffect(() => {
 *   console.log(shallow.value.greet)
 * })
 *
 * // This won't trigger the effect because the signal is shallow
 * shallow.value.greet = 'Hello, universe'
 *
 * // Logs "Hello, universe"
 * triggerSignal(shallow)
 * ```
 *
 * @param s - The signal whose tied effects shall be executed.
 */
export function triggerSignal(s: Signal): void {
  // Only signals participate in reactivity
  if (isSignal(s)) {
    const dep = (s as unknown as SignalImpl).dep;
    if (dep !== undefined && dep.subs !== undefined) {
      propagate(dep.subs);
      shallowPropagate(dep.subs);
      if (!batchDepth) {
        flush();
      }
    }
  }
}

function trackSignal(dep: ReactiveNode) {
  if (activeSub !== undefined) {
    link(dep, activeSub!);
  }
}

export type MaybeSignal<T = any> = T | Signal<T> | ShallowSignal<T> | WritableComputedRef<T>;

export type MaybeSignalOrGetter<T = any> = MaybeSignal<T> | ComputedRef<T> | (() => T);

/**
 * Returns the inner value if the argument is a signal, otherwise return the
 * argument itself. This is a sugar function for
 * `val = isSignal(val) ? val.value : val`.
 *
 * @example
 * ```js
 * function useFoo(x: number | Signal<number>) {
 *   const unwrapped = unSignal(x)
 *   // unwrapped is guaranteed to be number now
 * }
 * ```
 *
 * @param s - Signal or plain value to be converted into the plain value.
 */
export function unSignal<T>(s: MaybeSignal<T> | ComputedRef<T>): T {
  return isSignal(s) ? s.value : s;
}

/**
 * Normalizes values / signals / getters to values.
 * This is similar to {@link unSignal}, except that it also normalizes getters.
 * If the argument is a getter, it will be invoked and its return value will
 * be returned.
 *
 * @example
 * ```js
 * toValue(1) // 1
 * toValue(signal(1)) // 1
 *  toValue(() => 1) // 1
 * ```
 *
 * @param source - A getter, an existing signal, or a non-function value.
 */
export function toValue<T>(source: MaybeSignalOrGetter<T>): T {
  return isFunction(source) ? source() : unSignal(source);
}

const shallowUnwrapHandlers: ProxyHandler<any> = {
  get: (target, key, receiver) =>
    key === signalsFlags.RAW ? target : unSignal(Reflect.get(target, key, receiver)),
  set: (target, key, value, receiver) => {
    const oldValue = target[key];
    if (isSignal(oldValue) && !isSignal(value)) {
      oldValue.value = value;
      return true;
    } else {
      return Reflect.set(target, key, value, receiver);
    }
  },
};

/**
 * Returns a proxy for the given object that shallowly unwraps properties that
 * are signals. If the object already is reactive, it's returned as-is. If not, a
 * new reactive proxy is created.
 *
 * @param objectWithSignals - Either an already-reactive object or a simple object
 * that contains signals.
 */
export function proxySignals<T extends object>(objectWithSignals: T): ShallowUnwrapSignal<T> {
  return isReactive(objectWithSignals)
    ? (objectWithSignals as ShallowUnwrapSignal<T>)
    : new Proxy(objectWithSignals, shallowUnwrapHandlers);
}

export type CustomSignalFactory<T, S = T> = (
  track: () => void,
  trigger: () => void,
) => {
  get: () => T;
  set: (value: S) => void;
};

class CustomSignalImpl<T, S = T> implements ReactiveNode {
  public readonly [signalsFlags.IS_SIGNAL] = true;

  subs: Link | undefined = undefined;
  subsTail: Link | undefined = undefined;
  flags: _ReactiveFlags = _ReactiveFlags.None;

  private readonly _get: ReturnType<CustomSignalFactory<T, S>>['get'];
  private readonly _set: ReturnType<CustomSignalFactory<T, S>>['set'];

  public _value: T = undefined!;

  constructor(factory: CustomSignalFactory<T, S>) {
    const { get, set } = factory(
      () => trackSignal(this),
      () => triggerSignal(this as unknown as Signal),
    );
    this._get = get;
    this._set = set;
  }

  get dep() {
    return this;
  }

  get value(): T {
    return (this._value = this._get());
  }

  set value(newVal: S) {
    this._set(newVal);
  }
}

/**
 * Creates a customized signal with explicit control over its dependency tracking
 * and updates triggering.
 *
 * @param factory - The function that receives the `track` and `trigger` callbacks.
 */
export function customSignal<T, S = T>(factory: CustomSignalFactory<T, S>): Signal<T, S> {
  return new CustomSignalImpl(factory);
}

export type ToSignals<T = any> = {
  [K in keyof T]: ToSignal<T[K]>;
};

type ArrayStringKey<T> = T extends readonly any[]
  ? number extends T['length']
    ? `${number}`
    : never
  : never;

type ToSignalKey<T> = keyof T | ArrayStringKey<T>;

type ToSignalValue<T extends object, K extends ToSignalKey<T>> = K extends keyof T
  ? T[K]
  : T extends readonly (infer V)[]
    ? K extends ArrayStringKey<T>
      ? V
      : never
    : never;

/**
 * Converts a reactive object to a plain object where each property of the
 * resulting object is a signal pointing to the corresponding property of the
 * original object. Each individual signal is created using {@link toSignal}.
 *
 * @param object - Reactive object to be made into an object of linked signals.
 */
/*@__NO_SIDE_EFFECTS__*/
export function toSignals<T extends object>(object: T): ToSignals<T> {
  const ret: any = isArray(object) ? new Array(object.length) : {};
  for (const key in object) {
    ret[key] = propertyToSignal(object, key);
  }
  return ret;
}

class ObjectSignalImpl<T extends object, K extends keyof T> {
  public readonly [signalsFlags.IS_SIGNAL] = true;
  public _value: T[K] = undefined!;

  private readonly _raw: T;
  private readonly _key: K;
  private readonly _shallow: boolean;

  constructor(
    private readonly _object: T,
    key: K,
    private readonly _defaultValue?: T[K],
  ) {
    this._key = (isSymbol(key) ? key : String(key)) as K;
    this._raw = toRaw(_object);

    let shallow = true;
    let obj = _object;

    // For an array with integer key, signals are not unwrapped
    if (!isArray(_object) || isSymbol(this._key) || !isIntegerKey(this._key)) {
      // Otherwise, check each proxy layer for unwrapping
      do {
        shallow = !isProxy(obj) || isShallow(obj);
      } while (shallow && (obj = (obj as Target)[signalsFlags.RAW]));
    }

    this._shallow = shallow;
  }

  get value() {
    let val = this._object[this._key];
    if (this._shallow) {
      val = unSignal(val);
    }
    return (this._value = val === undefined ? this._defaultValue! : val);
  }

  set value(newVal) {
    if (this._shallow && isSignal(this._raw[this._key])) {
      const nestedSignal = this._object[this._key];
      if (isSignal(nestedSignal)) {
        nestedSignal.value = newVal;
        return;
      }
    }

    this._object[this._key] = newVal;
  }

  get dep(): ReactiveNode | undefined {
    return getDepFromReactive(this._raw, this._key);
  }
}

class GetterSignalImpl<T> {
  public readonly [signalsFlags.IS_SIGNAL] = true;
  public _value: T = undefined!;

  constructor(private readonly _getter: () => T) {}
  get value() {
    return (this._value = this._getter());
  }
}

export type ToSignal<T> = IfAny<T, Signal<T>, [T] extends [Signal] ? T : Signal<T>>;

/**
 * Used to normalize values / signals / getters into signals.
 *
 * @example
 * ```js
 * // returns existing signals as-is
 * toSignal(existingSignal)
 *
 * // creates a signal that calls the getter on .value access
 * toSignal(() => props.foo)
 *
 * // creates normal signals from non-function values
 * // equivalent to signal(1)
 * toSignal(1)
 * ```
 *
 * Can also be used to create a signal for a property on a source reactive object.
 * The created signal is synced with its source property: mutating the source
 * property will update the signal, and vice-versa.
 *
 * @example
 * ```js
 * const state = reactive({
 *   foo: 1,
 *   bar: 2
 * })
 *
 * const fooSignal = toSignal(state, 'foo')
 *
 * // mutating the signal updates the original
 * fooSignal.value++
 * console.log(state.foo) // 2
 *
 * // mutating the original also updates the signal
 * state.foo++
 * console.log(fooSignal.value) // 3
 * ```
 * @param value - A getter, an existing signal, a non-function value, or a
 *                reactive object to create a property signal from.
 */
export function toSignal<T>(
  value: T,
): T extends () => infer R ? Readonly<Signal<R>> : T extends Signal ? T : Signal<UnwrapSignal<T>>;
/**
 * @param object - The reactive object.
 * @param key - Name of the property in the reactive object.
 */
export function toSignal<T extends object, K extends ToSignalKey<T>>(
  object: T,
  key: K,
): ToSignal<ToSignalValue<T, K>>;
export function toSignal<T extends object, K extends ToSignalKey<T>>(
  object: T,
  key: K,
  defaultValue: ToSignalValue<T, K>,
): ToSignal<Exclude<ToSignalValue<T, K>, undefined>>;
/*@__NO_SIDE_EFFECTS__*/
export function toSignal(
  source: Record<PropertyKey, any> | MaybeSignal,
  key?: string | number | symbol,
  defaultValue?: unknown,
): Signal {
  if (isSignal(source)) {
    return source;
  } else if (isFunction(source)) {
    return new GetterSignalImpl(source);
  } else if (isObject(source) && arguments.length > 1) {
    return propertyToSignal(source, key!, defaultValue);
  } else {
    return signal(source);
  }
}

function propertyToSignal(
  source: Record<PropertyKey, any>,
  key: string | number | symbol,
  defaultValue?: unknown,
) {
  return new ObjectSignalImpl(source, key, defaultValue);
}

/**
 * This is a special exported interface for other packages to declare
 * additional types that should bail out for signal unwrapping. For example
 * \@essor/runtime-dom can declare it like so in its d.ts:
 *
 * ``` ts
 * declare module '@essor/reactivity' {
 *   export interface SignalUnwrapBailTypes {
 *     runtimeDOMBailTypes: Node | Window
 *   }
 * }
 * ```
 */
export interface SignalUnwrapBailTypes {}

export type ShallowUnwrapSignal<T> = T extends ShallowReactiveBrand
  ? T
  : {
      [K in keyof T]: DistributeSignal<T[K]>;
    };

type DistributeSignal<T> = T extends Signal<infer V, unknown> ? V : T;

export type UnwrapSignal<T> =
  T extends ShallowSignal<infer V, unknown>
    ? V
    : T extends Signal<infer V, unknown>
      ? UnwrapSignalSimple<V>
      : UnwrapSignalSimple<T>;

export type UnwrapSignalSimple<T> = T extends
  Builtin | Signal | SignalUnwrapBailTypes[keyof SignalUnwrapBailTypes] | { [RawSymbol]?: true }
  ? T
  : T extends ShallowReactiveBrand
    ? T
    : T extends Map<infer K, infer V>
      ? Map<K, UnwrapSignalSimple<V>> & UnwrapSignal<Omit<T, keyof Map<any, any>>>
      : T extends WeakMap<infer K, infer V>
        ? WeakMap<K, UnwrapSignalSimple<V>> & UnwrapSignal<Omit<T, keyof WeakMap<any, any>>>
        : T extends Set<infer V>
          ? Set<UnwrapSignalSimple<V>> & UnwrapSignal<Omit<T, keyof Set<any>>>
          : T extends WeakSet<infer V>
            ? WeakSet<UnwrapSignalSimple<V>> & UnwrapSignal<Omit<T, keyof WeakSet<any>>>
            : T extends ReadonlyArray<any>
              ? { [K in keyof T]: UnwrapSignalSimple<T[K]> }
              : T extends object
                ? {
                    [P in keyof T]: P extends symbol ? T[P] : UnwrapSignal<T[P]>;
                  }
                : T;
