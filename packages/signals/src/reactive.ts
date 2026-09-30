import { def, hasOwn, isObject, toRawType, warn } from '@estjs/shared';
import { signalsFlags } from './constants';
import {
  mutableCollectionHandlers,
  mutableHandlers,
  shallowCollectionHandlers,
  shallowReactiveHandlers,
} from './handlers';
import type { RawSymbol, Signal, UnwrapSignalSimple } from './signal';

type Primitive = string | number | boolean | bigint | symbol | undefined | null;
export type Builtin = Primitive | Function | Date | Error | RegExp;

export interface Target {
  [signalsFlags.SKIP]?: boolean;
  [signalsFlags.IS_REACTIVE]?: boolean;
  [signalsFlags.IS_SHALLOW]?: boolean;
  [signalsFlags.RAW]?: any;
}

export const reactiveMap: WeakMap<Target, any> = new WeakMap<Target, any>();
export const shallowReactiveMap: WeakMap<Target, any> = new WeakMap<Target, any>();

enum TargetType {
  INVALID = 0,
  COMMON = 1,
  COLLECTION = 2,
}

function targetTypeMap(rawType: string) {
  switch (rawType) {
    case 'Object':
    case 'Array':
      return TargetType.COMMON;
    case 'Map':
    case 'Set':
    case 'WeakMap':
    case 'WeakSet':
      return TargetType.COLLECTION;
    default:
      return TargetType.INVALID;
  }
}

// only unwrap nested ref
export type UnwrapNestedRefs<T> = T extends Signal ? T : UnwrapSignalSimple<T>;

declare const ReactiveMarkerSymbol: unique symbol;

export interface ReactiveMarker {
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  [ReactiveMarkerSymbol]?: void;
}

export type Reactive<T> = UnwrapNestedRefs<T> & (T extends readonly any[] ? ReactiveMarker : {});

/**
 * Returns a reactive proxy of the object.
 *
 * The reactive conversion is "deep": it affects all nested properties. A
 * reactive object also deeply unwraps any properties that are refs while
 * maintaining reactivity.
 *
 * @example
 * ```js
 * const obj = reactive({ count: 0 })
 * ```
 *
 * @param target - The source object.
 */
export function reactive<T extends object>(target: T): Reactive<T>;
/*@__NO_SIDE_EFFECTS__*/
export function reactive(target: object) {
  return createReactiveObject(target, mutableHandlers, mutableCollectionHandlers, reactiveMap);
}

// Use a private class brand instead of a marker property so shallow-reactive
// types remain distinguishable in `UnwrapRef` without leaking the brand into
// `keyof`/indexed access types or requiring the property for plain assignment.
declare class ShallowReactiveBrandClass {
  private __shallowReactiveBrand?: never;
}

export type ShallowReactiveBrand = ShallowReactiveBrandClass;

export type ShallowReactive<T> = T & ShallowReactiveBrand;

/**
 * Shallow version of {@link reactive}.
 *
 * Unlike {@link reactive}, there is no deep conversion: only root-level
 * properties are reactive for a shallow reactive object. Property values are
 * stored and exposed as-is - this also means properties with ref values will
 * not be automatically unwrapped.
 *
 * @example
 * ```js
 * const state = shallowReactive({
 *   foo: 1,
 *   nested: {
 *     bar: 2
 *   }
 * })
 *
 * // mutating state's own properties is reactive
 * state.foo++
 *
 * // ...but does not convert nested objects
 * isReactive(state.nested) // false
 *
 * // NOT reactive
 * state.nested.bar++
 * ```
 *
 * @param target - The source object.
 */
/*@__NO_SIDE_EFFECTS__*/
export function shallowReactive<T extends object>(target: T): ShallowReactive<T> {
  return createReactiveObject(
    target,
    shallowReactiveHandlers,
    shallowCollectionHandlers,
    shallowReactiveMap,
  );
}

function createReactiveObject(
  target: Target,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>,
  proxyMap: WeakMap<Target, any>,
) {
  if (!isObject(target)) {
    if (__DEV__) {
      warn(`value cannot be made reactive: ${String(target)}`);
    }
    return target;
  }
  // target is already a Proxy, return it.
  if (target[signalsFlags.RAW]) {
    return target;
  }
  // only specific value types can be observed.
  if (target[signalsFlags.SKIP] || !Object.isExtensible(target)) {
    return target;
  }
  // target already has corresponding Proxy
  const existingProxy = proxyMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }
  const targetType = targetTypeMap(toRawType(target));
  if (targetType === TargetType.INVALID) {
    return target;
  }
  const proxy = new Proxy(
    target,
    targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers,
  );
  proxyMap.set(target, proxy);
  return proxy;
}

/**
 * Checks if an object is a proxy created by {@link reactive} or
 * {@link shallowReactive} (or {@link ref} in some cases).
 *
 * @example
 * ```js
 * isReactive(reactive({}))            // => true
 * isReactive(readonly(reactive({})))  // => true
 * isReactive(ref({}).value)           // => true
 * isReactive(readonly(ref({})).value) // => true
 * isReactive(ref(true))               // => false
 * isReactive(shallowRef({}).value)    // => false
 * isReactive(shallowReactive({}))     // => true
 * ```
 *
 * @param value - The value to check.
 */
/*@__NO_SIDE_EFFECTS__*/
export function isReactive(value: unknown): boolean {
  return !!(value && (value as Target)[signalsFlags.IS_REACTIVE]);
}

/*@__NO_SIDE_EFFECTS__*/
export function isShallow(value: unknown): boolean {
  return !!(value && (value as Target)[signalsFlags.IS_SHALLOW]);
}

/**
 * Checks if an object is a proxy created by {@link reactive},
 * {@link readonly}, {@link shallowReactive} or {@link shallowReadonly}.
 *
 * @param value - The value to check.
 */
/*@__NO_SIDE_EFFECTS__*/
export function isProxy(value: any): boolean {
  return value ? !!value[signalsFlags.RAW] : false;
}

/**
 * Returns the raw, original object of a reactive proxy.
 *
 * `toRaw()` can return the original object from proxies created by
 * {@link reactive}, {@link readonly}, {@link shallowReactive} or
 * {@link shallowReadonly}.
 *
 * This is an escape hatch that can be used to temporarily read without
 * incurring proxy access / tracking overhead or write without triggering
 * changes. It is **not** recommended to hold a persistent reference to the
 * original object. Use with caution.
 *
 * @example
 * ```js
 * const foo = {}
 * const reactiveFoo = reactive(foo)
 *
 * console.log(toRaw(reactiveFoo) === foo) // true
 * ```
 *
 * @param observed - The object for which the "raw" value is requested.
 */
/*@__NO_SIDE_EFFECTS__*/
export function toRaw<T>(observed: T): T {
  const raw = observed && (observed as Target)[signalsFlags.RAW];
  return raw ? toRaw(raw) : observed;
}

export type Raw<T> = T & { [RawSymbol]?: true };

/**
 * Marks an object so that it will never be converted to a proxy. Returns the
 * object itself.
 *
 * @example
 * ```js
 * const foo = markRaw({})
 * console.log(isReactive(reactive(foo))) // false
 *
 * // also works when nested inside other reactive objects
 * const bar = reactive({ foo })
 * console.log(isReactive(bar.foo)) // false
 * ```
 *
 * **Warning:** `markRaw()` together with the shallow APIs such as
 * {@link shallowReactive} allow you to selectively opt-out of the default
 * deep reactive/readonly conversion and embed raw, non-proxied objects in your
 * state graph.
 *
 * @param value - The object to be marked as "raw".
 */
export function markRaw<T extends object>(value: T): Raw<T> {
  if (!hasOwn(value, signalsFlags.SKIP) && Object.isExtensible(value)) {
    def(value, signalsFlags.SKIP, true);
  }
  return value;
}

/**
 * Returns a reactive proxy of the given value (if possible).
 *
 * If the given value is not an object, the original value itself is returned.
 *
 * @param value - The value for which a reactive proxy shall be created.
 */
export const toReactive = <T extends unknown>(value: T): T =>
  isObject(value) ? reactive(value) : value;
