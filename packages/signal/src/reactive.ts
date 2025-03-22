import {
  isArray,
  isObject,
  hasOwn,
  hasChanged,
  isSet,
  isMap,
  isWeakMap,
  isWeakSet,
  isStringNumber,
} from '@estjs/shared';
import { ArrayKey, CollectionKey, SignalFlags, WeakCollectionKey } from './constants';
import { isSignal } from './signal';
import { track, trigger } from './effect';

// Cache to store already created reactive proxies for objects
const reactiveCaches = new WeakMap<object, object>();

/**
 * Returns the raw underlying value of a reactive proxy or signal.
 * If the input is an array, the function recursively converts each element.
 *
 * @template T - The type of the value.
 * @param value - The reactive or signal value.
 * @returns The raw value.
 */
export function toRaw<T>(value: T): T {
  if (!value) {
    return value as T;
  }

  if (isReactive(value)) {
    return value[SignalFlags.RAW];
  }
  if (isSignal(value)) {
    return value.peek() as T;
  }
  if (isArray(value)) {
    return (value as T[]).map(item => toRaw(item)) as T;
  }

  return value as T;
}

const arrayInstrumentations = createArrayInstrumentations();

/**
 * Creates instrumented versions of array methods that incorporate dependency tracking
 * for reactive arrays. This includes lookup, mutation, and iteration methods.
 *
 * @returns An object mapping method keys to instrumented functions.
 */
function createArrayInstrumentations() {
  const instrumentations: Record<string | symbol, Function> = {};

  // Enhance array lookup methods (e.g., 'includes', 'indexOf', 'lastIndexOf', 'find', 'findIndex').
  // These methods iterate over each element to collect dependency tracking information.
  ['includes', 'indexOf', 'lastIndexOf', 'find', 'findIndex'].forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = toRaw(this) as any[];
      // Track access for every index in the array
      for (let i = 0, l = this.length; i < l; i++) {
        track(arr, `${i}`);
      }
      const res = arr[key as keyof typeof arr](...args);
      // If the lookup fails, try again on the raw array
      if (res === -1 || res === false) {
        return arr[key as keyof typeof arr](...args);
      }
      return res;
    };
  });

  // Enhance array mutation methods (e.g., 'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin').
  // These methods trigger an update for the entire array.
  ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin'].forEach(
    key => {
      instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
        const arr = toRaw(this);
        const res = arr[key](...args);
        // Trigger change notification for the entire array
        trigger(arr, ArrayKey);
        return res;
      };
    },
  );

  // Instrument iteration methods such as 'values', 'keys', 'entries', and the default iterator.
  ['values', 'keys', 'entries', Symbol.iterator].forEach(key => {
    instrumentations[key] = function (this: unknown[]) {
      const arr = toRaw(this);
      track(arr, ArrayKey);
      const rawIterator = arr[key]();
      return {
        next() {
          const { value, done } = rawIterator.next();
          return {
            value: isObject(value) ? reactiveImpl(value) : value,
            done,
          };
        },
        [Symbol.iterator]() {
          return this;
        },
      };
    };
  });
  return instrumentations;
}

/**
 * Proxy handler for reactive arrays.
 * This handler intercepts get and set operations to perform dependency tracking and triggering.
 *
 * @param shallow - Indicates whether the reactivity should be shallow.
 * @returns An object containing get and set traps for arrays.
 */
const arrayHandlers = (shallow: boolean) => ({
  get: (target: any, key: string | symbol, receiver: any) => {
    if (key === SignalFlags.RAW) {
      return target;
    }
    if (key === SignalFlags.IS_REACTIVE) {
      return true;
    }
    if (hasOwn(arrayInstrumentations, key)) {
      return Reflect.get(arrayInstrumentations, key, receiver);
    }

    const value = Reflect.get(target, key, receiver);

    // If accessing a numeric index, track that index for reactivity.
    if (isStringNumber(key)) {
      track(target, key);
    }
    track(target, ArrayKey);

    // If the value is an object and deep reactivity is desired, return a reactive version.
    if (isObject(value) && !shallow) {
      return reactiveImpl(value);
    }
    return value;
  },
  set: (target: any, key: string | symbol, value: unknown, receiver: any) => {
    const oldValue = Reflect.get(target, key, receiver);
    const result = Reflect.set(target, key, value, receiver);
    if (hasChanged(value, oldValue)) {
      // Trigger specific index dependency if key is numeric
      if (isStringNumber(key)) {
        trigger(target, key);
      }
      // Also trigger a change for the array length or new element additions
      if (key === 'length' || !oldValue) {
        trigger(target, ArrayKey);
      }
    }
    return result;
  },
});

// Proxy handler for Map and Set collections to intercept get operations and apply dependency tracking.
const collectionHandlers: ProxyHandler<Map<unknown, unknown> | Set<unknown>> = {
  get(target, key: string | symbol) {
    if (key === SignalFlags.IS_REACTIVE) {
      return true;
    }
    if (key === SignalFlags.RAW) {
      return target;
    }
    return Reflect.get(
      hasOwn(collectionInstrumentations, key) ? collectionInstrumentations : target,
      key,
      target,
    );
  },
};

// Proxy handler for WeakMap and WeakSet collections.
const weakCollectionHandlers: ProxyHandler<WeakMap<object, unknown> | WeakSet<object>> = {
  get(target, key: string | symbol) {
    if (key === SignalFlags.IS_REACTIVE) {
      return true;
    }
    if (key === SignalFlags.RAW) {
      return target;
    }
    return Reflect.get(
      hasOwn(weakInstrumentations, key) && key in target ? weakInstrumentations : target,
      key,
      target,
    );
  },
};

// Instrumentation for methods of Map and Set collections.
const collectionInstrumentations = {
  get(key: unknown) {
    const target = toRaw(this);
    track(target, CollectionKey);
    return target.get(key);
  },
  set(key: unknown, value: unknown) {
    const target = toRaw(this);
    const result = target.set(key, value);
    trigger(target, CollectionKey);
    return result;
  },
  add(value: unknown) {
    const target = toRaw(this);
    const result = target.add(value);
    trigger(target, CollectionKey);
    return result;
  },
  has(key: unknown) {
    const target = toRaw(this);
    track(target, CollectionKey);
    return target.has(key);
  },
  delete(key: unknown) {
    const target = toRaw(this);
    const hadKey = target.has(key);
    const result = target.delete(key);
    if (hadKey) {
      trigger(target, CollectionKey);
    }
    return result;
  },
  clear() {
    const target = toRaw(this);
    const hadItems = (target as unknown as Map<unknown, unknown>).size > 0;
    const result = target.clear();
    if (hadItems) {
      trigger(target, CollectionKey);
    }
    return result;
  },
  forEach(
    callback: (value: unknown, key: unknown, map: Map<unknown, unknown> | Set<unknown>) => void,
    thisArg?: unknown,
  ) {
    const target = toRaw(this);
    track(target, CollectionKey);
    target.forEach((value: unknown, key: unknown) => {
      callback.call(thisArg, value, key, target as unknown as Map<unknown, unknown> | Set<unknown>);
    });
  },
  [Symbol.iterator]() {
    const target = toRaw(this);
    track(target, CollectionKey);
    return target[Symbol.iterator]();
  },
  get size() {
    const target = toRaw(this);
    track(target, CollectionKey);
    return target.size;
  },
  keys() {
    const target = toRaw(this);
    track(target, CollectionKey);
    return target.keys();
  },
  values() {
    const target = toRaw(this);
    track(target, CollectionKey);
    return target.values();
  },
  entries() {
    const target = toRaw(this);
    track(target, CollectionKey);
    return target.entries();
  },
};

// Instrumentation for methods of WeakMap and WeakSet collections.
const weakInstrumentations = {
  get(key: object) {
    const target = toRaw(this);
    track(target, WeakCollectionKey);
    return target.get(key);
  },
  set(key: object, value: any) {
    const target = toRaw(this);
    const result = target.set(key, value);
    trigger(target, WeakCollectionKey);
    return result;
  },
  add(value: object) {
    const target = toRaw(this);
    const result = target.add(value);
    trigger(target, WeakCollectionKey);
    return result;
  },
  has(key: object) {
    const target = toRaw(this);
    track(target, WeakCollectionKey);
    return target.has(key);
  },
  delete(key: object) {
    const target = toRaw(this);
    const result = target.delete(key);
    trigger(target, WeakCollectionKey);
    return result;
  },
};

/**
 * Proxy handler for plain objects (non-collection types).
 * Intercepts get, set, and delete operations to manage reactivity.
 *
 * @param shallow - Indicates whether to create a shallow reactive proxy (only top-level properties are reactive).
 * @returns An object containing get, set, and delete traps.
 */
const objectHandlers = (shallow: boolean) => ({
  get(target: object, key: string | symbol, receiver: object) {
    // Return the raw target if accessing the RAW flag
    if (key === SignalFlags.RAW) {
      return target;
    }
    // Return true if checking for reactivity flag
    if (key === SignalFlags.IS_REACTIVE) {
      return true;
    }

    const res = Reflect.get(target, key, receiver);

    // Automatically unwrap signals
    const value = isSignal(res) ? res.value : res;

    // Collect dependency for the accessed property
    track(target, key);

    // Recursively wrap the value in a reactive proxy if necessary
    if (isObject(value) && !shallow) {
      return reactiveImpl(value);
    }
    return value;
  },
  set(target: object, key: string | symbol, value: unknown, receiver: object) {
    let oldValue = Reflect.get(target, key, receiver);
    if (isSignal(oldValue)) {
      oldValue = oldValue.value;
    }
    if (isSignal(value)) {
      value = value.value;
    }
    const result = Reflect.set(target, key, value, receiver);
    // Trigger effects only if the value has actually changed
    if (hasChanged(value, oldValue)) {
      trigger(target, key);
    }
    return result;
  },
  deleteProperty(target: object, key: string | symbol) {
    const hadKey = hasOwn(target, key);
    const result = Reflect.deleteProperty(target, key);
    if (hadKey && result) {
      trigger(target, key);
    }
    return result;
  },
});

/**
 * Creates a reactive proxy for the given target object. It ensures that an object is only
 * wrapped once, and caches the reactive proxy for future use.
 *
 * @template T - The type of the target object.
 * @param target - The target object to wrap.
 * @param shallow - If true, only the top-level properties are reactive (shallow reactivity).
 * @returns A reactive proxy for the target object.
 */
export function reactiveImpl<T extends object>(target: T, shallow = false): T {
  if (!isObject(target)) {
    return target;
  }

  if (isReactive(target)) {
    return target;
  }

  if (reactiveCaches.has(target)) {
    return reactiveCaches.get(target) as T;
  }

  let handler;
  if (isArray(target)) {
    handler = arrayHandlers(shallow);
  } else if (isSet(target) || isMap(target)) {
    handler = collectionHandlers;
  } else if (isWeakMap(target) || isWeakSet(target)) {
    handler = weakCollectionHandlers;
  } else {
    handler = objectHandlers(shallow);
  }

  const proxy = new Proxy(target, handler);
  reactiveCaches.set(target, proxy);
  return proxy;
}

/**
 * Checks if the target object is reactive (i.e., has been wrapped in a reactive proxy).
 *
 * @template T - The target object type.
 * @param target - The object to check.
 * @returns True if the object is reactive; false otherwise.
 */
export function isReactive<T extends object>(target: T): boolean {
  return !!target?.[SignalFlags.IS_REACTIVE];
}

/**
 * Creates a reactive proxy for the given target object. If the object is already reactive,
 * it is returned as is.
 *
 * @template T - The target object type.
 * @param target - The object to make reactive.
 * @returns A reactive proxy for the target object.
 */
export function reactive<T extends object>(target: T): T {
  if (isReactive(target)) {
    return target;
  }
  return reactiveImpl(target);
}

/**
 * Creates a shallow reactive proxy for the given object. Only the root-level properties are reactive.
 *
 * @template T - The target object type.
 * @param target - The object to make shallow reactive.
 * @returns A shallow reactive proxy for the target object.
 */
export function shallowReactive<T extends object>(target: T): T {
  return reactiveImpl(target, true);
}

/**
 * A type alias representing a reactive object. In this simplified context, it is the same as the original object type.
 *
 * @template T - The type of the original object.
 */
export type Reactive<T extends object> = T;
