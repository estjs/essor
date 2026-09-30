// Array instrumentations forward `arguments` to keep the native arity.
/* eslint-disable prefer-rest-params */
import {
  extend,
  hasChanged,
  hasOwn,
  isArray,
  isIntegerKey,
  isMap,
  isObject,
  isSymbol,
  makeMap,
  toRawType,
  warn,
} from '@estjs/shared';
import {
  type Target,
  isProxy,
  isShallow,
  reactive,
  reactiveMap,
  shallowReactiveMap,
  toRaw,
  toReactive,
} from './reactive';
import { TrackOpTypes, TriggerOpTypes, signalsFlags } from './constants';
import { ARRAY_ITERATE_KEY, ITERATE_KEY, MAP_KEY_ITERATE_KEY, track, trigger } from './dep';
import { isSignal } from './signal';
import { endBatch, setActiveSub, startBatch } from './graph';
const isNonTrackableKeys = /*@__PURE__*/ makeMap(`__proto__`);

const builtInSymbols = new Set(
  /*@__PURE__*/
  Object.getOwnPropertyNames(Symbol)
    // ios10.x Object.getOwnPropertyNames(Symbol) can enumerate 'arguments' and 'caller'
    // but accessing them on Symbol leads to TypeError because Symbol is a strict mode
    // function
    .filter((key) => key !== 'arguments' && key !== 'caller')
    .map((key) => Symbol[key as keyof SymbolConstructor])
    .filter(isSymbol),
);

function hasOwnProperty(this: object, key: unknown) {
  // #10455 hasOwnProperty may be called with non-string values
  if (!isSymbol(key)) key = String(key);
  const obj = toRaw(this);
  track(obj, TrackOpTypes.HAS, key);
  return obj.hasOwnProperty(key as string);
}

class BaseReactiveHandler implements ProxyHandler<Target> {
  constructor(protected readonly _isShallow = false) {}

  get(target: Target, key: string | symbol, receiver: object): any {
    if (key === signalsFlags.SKIP) return target[signalsFlags.SKIP];

    const isShallow = this._isShallow;
    if (key === signalsFlags.IS_REACTIVE) {
      return true;
    } else if (key === signalsFlags.IS_SHALLOW) {
      return isShallow;
    } else if (key === signalsFlags.RAW) {
      if (
        receiver === (isShallow ? shallowReactiveMap : reactiveMap).get(target) ||
        // receiver is not the reactive proxy, but has the same prototype
        // this means the receiver is a user proxy of the reactive proxy
        Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)
      ) {
        return target;
      }
      // early return undefined
      return;
    }

    const targetIsArray = isArray(target);

    let fn: Function | undefined;
    if (targetIsArray && (fn = arrayInstrumentations[key])) {
      return fn;
    }
    if (key === 'hasOwnProperty') {
      return hasOwnProperty;
    }

    const wasRef = isSignal(target);
    const res = Reflect.get(
      target,
      key,
      // if this is a proxy wrapping a ref, return methods using the raw ref
      // as receiver so that we don't have to call `toRaw` on the ref in all
      // its class methods
      wasRef ? target : receiver,
    );

    if (wasRef && key !== 'value') {
      return res;
    }

    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      return res;
    }

    track(target, TrackOpTypes.GET, key);

    if (isShallow) {
      return res;
    }

    if (isSignal(res)) {
      // ref unwrapping - skip unwrap for Array + integer key.
      return targetIsArray && isIntegerKey(key) ? res : res.value;
    }

    if (isObject(res)) {
      // Convert returned value into a proxy as well. we do the isObject check
      // here to avoid invalid value warning.
      return reactive(res);
    }

    return res;
  }
}

class MutableReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow = false) {
    super(isShallow);
  }

  set(
    target: Record<string | symbol, unknown>,
    key: string | symbol,
    value: unknown,
    receiver: object,
  ): boolean {
    let oldValue = target[key];
    const isArrayWithIntegerKey = isArray(target) && isIntegerKey(key);
    if (!this._isShallow) {
      if (!isShallow(value)) {
        oldValue = toRaw(oldValue);
        value = toRaw(value);
      }
      if (!isArrayWithIntegerKey && isSignal(oldValue) && !isSignal(value)) {
        oldValue.value = value;
        return true;
      }
    } else {
      // in shallow mode, objects are set as-is regardless of reactive or not
    }

    const hadKey = isArrayWithIntegerKey ? Number(key) < target.length : hasOwn(target, key);
    const result = Reflect.set(target, key, value, isSignal(target) ? target : receiver);
    // don't trigger if target is something up in the prototype chain of original
    if (target === toRaw(receiver) && result) {
      if (!hadKey) {
        trigger(target, TriggerOpTypes.ADD, key, value);
      } else if (hasChanged(value, oldValue)) {
        trigger(target, TriggerOpTypes.SET, key, value);
      }
    }
    return result;
  }

  deleteProperty(target: Record<string | symbol, unknown>, key: string | symbol): boolean {
    const hadKey = hasOwn(target, key);
    const result = Reflect.deleteProperty(target, key);
    if (result && hadKey) {
      trigger(target, TriggerOpTypes.DELETE, key, undefined);
    }
    return result;
  }

  has(target: Record<string | symbol, unknown>, key: string | symbol): boolean {
    const result = Reflect.has(target, key);
    if (!isSymbol(key) || !builtInSymbols.has(key)) {
      track(target, TrackOpTypes.HAS, key);
    }
    return result;
  }

  ownKeys(target: Record<string | symbol, unknown>): (string | symbol)[] {
    track(target, TrackOpTypes.ITERATE, isArray(target) ? 'length' : ITERATE_KEY);
    return Reflect.ownKeys(target);
  }
}

export const mutableHandlers: ProxyHandler<object> = /*@__PURE__*/ new MutableReactiveHandler();

export const shallowReactiveHandlers: MutableReactiveHandler =
  /*@__PURE__*/ new MutableReactiveHandler(true);

/**
 * Track array iteration and return:
 * - if input is reactive: a cloned raw array with reactive values
 * - if input is raw or shallow: the original raw array
 */
export function reactiveReadArray<T>(array: T[]): T[] {
  const raw = toRaw(array);
  if (raw === array) return raw;
  track(raw, TrackOpTypes.ITERATE, ARRAY_ITERATE_KEY);
  if (isShallow(array)) return raw;
  return raw.map(toReactive);
}

/**
 * Track array iteration and return raw array
 */
export function shallowReadArray<T>(arr: T[]): T[] {
  track((arr = toRaw(arr)), TrackOpTypes.ITERATE, ARRAY_ITERATE_KEY);
  return arr;
}

function toWrapped(target: unknown, item: unknown) {
  return toReactive(item);
}

export const arrayInstrumentations: Record<string | symbol, Function> = <any>{
  __proto__: null,

  [Symbol.iterator]() {
    return iterator(this, Symbol.iterator, (item) => toWrapped(this, item));
  },

  concat(...args: unknown[]) {
    return reactiveReadArray(this).concat(
      ...args.map((x) => (isArray(x) ? reactiveReadArray(x) : x)),
    );
  },

  entries() {
    return iterator(this, 'entries', (value: [number, unknown]) => {
      value[1] = toWrapped(this, value[1]);
      return value;
    });
  },

  every(fn: (item: unknown, index: number, array: unknown[]) => unknown, thisArg?: unknown) {
    return apply(this, 'every', fn, thisArg, undefined, arguments);
  },

  filter(fn: (item: unknown, index: number, array: unknown[]) => unknown, thisArg?: unknown) {
    return apply(
      this,
      'filter',
      fn,
      thisArg,
      (v) => v.map((item: unknown) => toWrapped(this, item)),
      arguments,
    );
  },

  find(fn: (item: unknown, index: number, array: unknown[]) => boolean, thisArg?: unknown) {
    return apply(this, 'find', fn, thisArg, (item) => toWrapped(this, item), arguments);
  },

  findIndex(fn: (item: unknown, index: number, array: unknown[]) => boolean, thisArg?: unknown) {
    return apply(this, 'findIndex', fn, thisArg, undefined, arguments);
  },

  findLast(fn: (item: unknown, index: number, array: unknown[]) => boolean, thisArg?: unknown) {
    return apply(this, 'findLast', fn, thisArg, (item) => toWrapped(this, item), arguments);
  },

  findLastIndex(
    fn: (item: unknown, index: number, array: unknown[]) => boolean,
    thisArg?: unknown,
  ) {
    return apply(this, 'findLastIndex', fn, thisArg, undefined, arguments);
  },

  // flat, flatMap could benefit from ARRAY_ITERATE but are not straight-forward to implement

  forEach(fn: (item: unknown, index: number, array: unknown[]) => unknown, thisArg?: unknown) {
    return apply(this, 'forEach', fn, thisArg, undefined, arguments);
  },

  includes(...args: unknown[]) {
    return searchProxy(this, 'includes', args);
  },

  indexOf(...args: unknown[]) {
    return searchProxy(this, 'indexOf', args);
  },

  join(separator?: string) {
    return reactiveReadArray(this).join(separator);
  },

  // keys() iterator only reads `length`, no optimization required

  lastIndexOf(...args: unknown[]) {
    return searchProxy(this, 'lastIndexOf', args);
  },

  map(fn: (item: unknown, index: number, array: unknown[]) => unknown, thisArg?: unknown) {
    return apply(this, 'map', fn, thisArg, undefined, arguments);
  },

  pop() {
    return noTracking(this, 'pop');
  },

  push(...args: unknown[]) {
    return noTracking(this, 'push', args);
  },

  reduce(
    fn: (acc: unknown, item: unknown, index: number, array: unknown[]) => unknown,
    ...args: unknown[]
  ) {
    return reduce(this, 'reduce', fn, args);
  },

  reduceRight(
    fn: (acc: unknown, item: unknown, index: number, array: unknown[]) => unknown,
    ...args: unknown[]
  ) {
    return reduce(this, 'reduceRight', fn, args);
  },

  shift() {
    return noTracking(this, 'shift');
  },

  // slice could use ARRAY_ITERATE but also seems to beg for range tracking

  some(fn: (item: unknown, index: number, array: unknown[]) => unknown, thisArg?: unknown) {
    return apply(this, 'some', fn, thisArg, undefined, arguments);
  },

  splice(...args: unknown[]) {
    return noTracking(this, 'splice', args);
  },

  toReversed() {
    // @ts-expect-error user code may run in es2016+
    return reactiveReadArray(this).toReversed();
  },

  toSorted(comparer?: (a: unknown, b: unknown) => number) {
    // @ts-expect-error user code may run in es2016+
    return reactiveReadArray(this).toSorted(comparer);
  },

  toSpliced(...args: unknown[]) {
    // @ts-expect-error user code may run in es2016+
    return reactiveReadArray(this).toSpliced(...args);
  },

  unshift(...args: unknown[]) {
    return noTracking(this, 'unshift', args);
  },

  values() {
    return iterator(this, 'values', (item) => toWrapped(this, item));
  },
};

// instrument iterators to take ARRAY_ITERATE dependency
function iterator(
  self: unknown[],
  method: keyof Array<unknown>,
  wrapValue: (value: any) => unknown,
) {
  // note that taking ARRAY_ITERATE dependency here is not strictly equivalent
  // to calling iterate on the proxied array.
  // creating the iterator does not access any array property:
  // it is only when .next() is called that length and indexes are accessed.
  // pushed to the extreme, an iterator could be created in one effect scope,
  // partially iterated in another, then iterated more in yet another.
  // given that JS iterator can only be read once, this doesn't seem like
  // a plausible use-case, so this tracking simplification seems ok.
  const arr = shallowReadArray(self);
  const iter = (arr[method] as any)() as IterableIterator<unknown> & {
    _next: IterableIterator<unknown>['next'];
  };
  if (arr !== self && !isShallow(self)) {
    iter._next = iter.next;
    iter.next = () => {
      const result = iter._next();
      if (!result.done) {
        result.value = wrapValue(result.value);
      }
      return result;
    };
  }
  return iter;
}

// in the codebase we enforce es2016, but user code may run in environments
// higher than that
type ArrayMethods = keyof Array<any> | 'findLast' | 'findLastIndex';

const arrayProto = Array.prototype;
// instrument functions that read (potentially) all items
// to take ARRAY_ITERATE dependency
function apply(
  self: unknown[],
  method: ArrayMethods,
  fn: (item: unknown, index: number, array: unknown[]) => unknown,
  thisArg?: unknown,
  wrappedRetFn?: (result: any) => unknown,
  args?: IArguments,
) {
  const arr = shallowReadArray(self);
  const needsWrap = arr !== self && !isShallow(self);
  const methodFn = arr[method];

  // #11759
  // If the method being called is from a user-extended Array, the arguments will be unknown
  // (unknown order and unknown parameter types). In this case, we skip the shallowReadArray
  // handling and directly call apply with self.
  if (methodFn !== arrayProto[method]) {
    const result = methodFn.apply(self, args);
    return needsWrap ? toReactive(result) : result;
  }

  let wrappedFn = fn;
  if (arr !== self) {
    if (needsWrap) {
      wrappedFn = function (this: unknown, item, index) {
        return fn.call(this, toWrapped(self, item), index, self);
      };
    } else if (fn.length > 2) {
      wrappedFn = function (this: unknown, item, index) {
        return fn.call(this, item, index, self);
      };
    }
  }
  const result = methodFn.call(arr, wrappedFn, thisArg);
  return needsWrap && wrappedRetFn ? wrappedRetFn(result) : result;
}

// instrument reduce and reduceRight to take ARRAY_ITERATE dependency
function reduce(
  self: unknown[],
  method: keyof Array<any>,
  fn: (acc: unknown, item: unknown, index: number, array: unknown[]) => unknown,
  args: unknown[],
) {
  const arr = shallowReadArray(self);
  const needsWrap = arr !== self && !isShallow(self);
  let wrappedFn = fn;
  let wrapInitialAccumulator = false;
  if (arr !== self) {
    if (needsWrap) {
      wrapInitialAccumulator = args.length === 0;
      wrappedFn = function (this: unknown, acc, item, index) {
        if (wrapInitialAccumulator) {
          wrapInitialAccumulator = false;
          acc = toWrapped(self, acc);
        }
        return fn.call(this, acc, toWrapped(self, item), index, self);
      };
    } else if (fn.length > 3) {
      wrappedFn = function (this: unknown, acc, item, index) {
        return fn.call(this, acc, item, index, self);
      };
    }
  }
  const result = (arr[method] as any)(wrappedFn, ...args);
  return wrapInitialAccumulator ? toWrapped(self, result) : result;
}

// instrument identity-sensitive methods to account for reactive proxies
function searchProxy(self: unknown[], method: keyof Array<any>, args: unknown[]) {
  const arr = toRaw(self) as any;
  track(arr, TrackOpTypes.ITERATE, ARRAY_ITERATE_KEY);
  // we run the method using the original args first (which may be reactive)
  const res = arr[method](...args);

  // if that didn't work, run it again using raw values.
  if ((res === -1 || res === false) && isProxy(args[0])) {
    args[0] = toRaw(args[0]);
    return arr[method](...args);
  }

  return res;
}

// instrument length-altering mutation methods to avoid length being tracked
// which leads to infinite loops in some cases (#2137)
function noTracking(self: unknown[], method: keyof Array<any>, args: unknown[] = []) {
  startBatch();
  const prevSub = setActiveSub();
  try {
    return (toRaw(self) as any)[method].apply(self, args);
  } finally {
    setActiveSub(prevSub);
    endBatch();
  }
}

type CollectionTypes = IterableCollections | WeakCollections;

type IterableCollections = (Map<any, any> | Set<any>) & Target;
type WeakCollections = (WeakMap<any, any> | WeakSet<any>) & Target;
type MapTypes = (Map<any, any> | WeakMap<any, any>) & Target;
type SetTypes = (Set<any> | WeakSet<any>) & Target;

const toShallow = <T extends unknown>(value: T): T => value;

const getProto = <T extends CollectionTypes>(v: T): any => Reflect.getPrototypeOf(v);

function createIterableMethod(method: string | symbol, isShallow: boolean) {
  return function (
    this: IterableCollections,
    ...args: unknown[]
  ): Iterable<unknown> & Iterator<unknown> {
    const target = this[signalsFlags.RAW];
    const rawTarget = toRaw(target);
    const targetIsMap = isMap(rawTarget);
    const isPair = method === 'entries' || (method === Symbol.iterator && targetIsMap);
    const isKeyOnly = method === 'keys' && targetIsMap;
    const innerIterator = target[method](...args);
    const wrap = isShallow ? toShallow : toReactive;
    track(rawTarget, TrackOpTypes.ITERATE, isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY);
    // return a wrapped iterator which returns observed versions of the
    // values emitted from the real iterator
    return extend(
      // inheriting all iterator properties
      Object.create(innerIterator),
      {
        // iterator protocol
        next() {
          const { value, done } = innerIterator.next();
          return done
            ? { value, done }
            : {
                value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
                done,
              };
        },
      },
    );
  };
}

type Instrumentations = Record<string | symbol, Function | number>;

function createInstrumentations(shallow: boolean): Instrumentations {
  const instrumentations: Instrumentations = {
    get(this: MapTypes, key: unknown) {
      const target = this[signalsFlags.RAW];
      const rawTarget = toRaw(target);
      const rawKey = toRaw(key);
      if (hasChanged(key, rawKey)) {
        track(rawTarget, TrackOpTypes.GET, key);
      }
      track(rawTarget, TrackOpTypes.GET, rawKey);
      const { has } = getProto(rawTarget);
      const wrap = shallow ? toShallow : toReactive;
      if (has.call(rawTarget, key)) {
        return wrap(target.get(key));
      } else if (has.call(rawTarget, rawKey)) {
        return wrap(target.get(rawKey));
      } else if (target !== rawTarget) {
        // ensure that the nested reactive `Map` can do tracking for itself
        target.get(key);
      }
    },
    get size() {
      const target = (this as unknown as IterableCollections)[signalsFlags.RAW];
      track(toRaw(target), TrackOpTypes.ITERATE, ITERATE_KEY);
      return target.size;
    },
    has(this: CollectionTypes, key: unknown): boolean {
      const target = this[signalsFlags.RAW];
      const rawTarget = toRaw(target);
      const rawKey = toRaw(key);
      if (hasChanged(key, rawKey)) {
        track(rawTarget, TrackOpTypes.HAS, key);
      }
      track(rawTarget, TrackOpTypes.HAS, rawKey);
      return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
    },
    forEach(this: IterableCollections, callback: Function, thisArg?: unknown) {
      const observed = this;
      const target = observed[signalsFlags.RAW];
      const rawTarget = toRaw(target);
      const wrap = shallow ? toShallow : toReactive;
      track(rawTarget, TrackOpTypes.ITERATE, ITERATE_KEY);
      return target.forEach((value: unknown, key: unknown) => {
        // important: make sure the callback is
        // 1. invoked with the reactive map as `this` and 3rd arg
        // 2. the value received should be a corresponding reactive.
        return callback.call(thisArg, wrap(value), wrap(key), observed);
      });
    },
  };

  extend(instrumentations, {
    add(this: SetTypes, value: unknown) {
      const target = toRaw(this);
      const proto = getProto(target);
      const rawValue = toRaw(value);
      const valueToAdd = !shallow && !isShallow(value) ? rawValue : value;
      const hadKey =
        proto.has.call(target, valueToAdd) ||
        (hasChanged(value, valueToAdd) && proto.has.call(target, value)) ||
        (hasChanged(rawValue, valueToAdd) && proto.has.call(target, rawValue));
      if (!hadKey) {
        target.add(valueToAdd);
        trigger(target, TriggerOpTypes.ADD, valueToAdd, valueToAdd);
      }
      return this;
    },
    set(this: MapTypes, key: unknown, value: unknown) {
      if (!shallow && !isShallow(value)) {
        value = toRaw(value);
      }
      const target = toRaw(this);
      const { has, get } = getProto(target);

      let hadKey = has.call(target, key);
      if (!hadKey) {
        key = toRaw(key);
        hadKey = has.call(target, key);
      } else if (__DEV__) {
        checkIdentityKeys(target, has, key);
      }

      const oldValue = get.call(target, key);
      target.set(key, value);
      if (!hadKey) {
        trigger(target, TriggerOpTypes.ADD, key, value);
      } else if (hasChanged(value, oldValue)) {
        trigger(target, TriggerOpTypes.SET, key, value);
      }
      return this;
    },
    delete(this: CollectionTypes, key: unknown) {
      const target = toRaw(this);
      const { has } = getProto(target);
      let hadKey = has.call(target, key);
      if (!hadKey) {
        key = toRaw(key);
        hadKey = has.call(target, key);
      } else if (__DEV__) {
        checkIdentityKeys(target, has, key);
      }

      const result = target.delete(key);
      if (hadKey) {
        trigger(target, TriggerOpTypes.DELETE, key, undefined);
      }
      return result;
    },
    clear(this: IterableCollections) {
      const target = toRaw(this);
      const hadItems = target.size !== 0;
      const result = target.clear();
      if (hadItems) {
        trigger(target, TriggerOpTypes.CLEAR, undefined, undefined);
      }
      return result;
    },
  });

  const iteratorMethods = ['keys', 'values', 'entries', Symbol.iterator] as const;

  iteratorMethods.forEach((method) => {
    instrumentations[method] = createIterableMethod(method, shallow);
  });

  return instrumentations;
}

function createInstrumentationGetter(shallow: boolean) {
  const instrumentations = createInstrumentations(shallow);

  return (target: CollectionTypes, key: string | symbol, receiver: CollectionTypes) => {
    if (key === signalsFlags.IS_REACTIVE) {
      return true;
    } else if (key === signalsFlags.RAW) {
      return target;
    }

    return Reflect.get(
      hasOwn(instrumentations, key) && key in target ? instrumentations : target,
      key,
      receiver,
    );
  };
}

export const mutableCollectionHandlers: ProxyHandler<CollectionTypes> = {
  get: /*@__PURE__*/ createInstrumentationGetter(false),
};

export const shallowCollectionHandlers: ProxyHandler<CollectionTypes> = {
  get: /*@__PURE__*/ createInstrumentationGetter(true),
};

function checkIdentityKeys(target: CollectionTypes, has: (key: unknown) => boolean, key: unknown) {
  const rawKey = toRaw(key);
  if (rawKey !== key && has.call(target, rawKey)) {
    const type = toRawType(target);
    warn(
      `Reactive ${type} contains both the raw and reactive ` +
        `versions of the same object${type === `Map` ? ` as keys` : ``}, ` +
        `which can lead to inconsistencies. ` +
        `Avoid differentiating between the raw and reactive versions ` +
        `of an object and only use the reactive version if possible.`,
    );
  }
}
