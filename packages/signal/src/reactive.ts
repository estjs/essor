import {
  hasChanged,
  hasOwn,
  isArray,
  isMap,
  isObject,
  isSet,
  isStringNumber,
  isWeakMap,
  isWeakSet,
} from '@estjs/shared';
import {
  ARRAY_ITERATE_KEY,
  ARRAY_KEY,
  COLLECTION_KEY,
  SignalFlags,
  TriggerOpTypes,
  WEAK_COLLECTION_KEY,
} from './constants';
import { isSignal } from './signal';
import { track, trigger } from './effect';

// Use WeakMap to cache created reactive proxies to avoid duplicate creation.
const reactiveCaches = new WeakMap<object, object>();

/**
 * Return the raw underlying value of a reactive proxy or signal.
 * If the input is an array, recursively convert each element.
 *
 * @param value - Reactive or signal value.
 * @returns Raw value.
 */
export function toRaw<T>(value: T): T {
  // If value is not an object, return directly.
  if (!value || !isObject(value)) {
    return value as T;
  }

  // If it's a reactive object, return its raw object.
  if (isReactive(value)) {
    return value[SignalFlags.RAW];
  }
  // If it's a signal, return its current value (without triggering dependencies).
  if (isSignal(value)) {
    return value.peek() as T;
  }
  // If it's an array, iterate through each element.
  if (isArray(value)) {
    const result = Array.from({ length: value.length });
    for (const [i, element] of value.entries()) {
      result[i] = toRaw(element);
    }
    return result as T;
  }

  // Return directly in other cases.
  return value as T;
}

const arrayInstrumentations = createArrayInstrumentations();

/**
 * Create enhanced versions of array methods that include dependency tracking.
 * Includes search, modification, and iteration methods.
 *
 * @returns An object that maps method keys to enhanced functions.
 */
function createArrayInstrumentations() {
  const instrumentations: Record<string | symbol, Function> = {};

  ['includes', 'indexOf', 'lastIndexOf', 'find', 'findIndex'].forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = toRaw(this) as any[];
      // Track iteration access to the entire array.
      track(arr, ARRAY_ITERATE_KEY);
      const res = arr[key as keyof typeof arr](...args);
      // If lookup fails, try again on the raw array (handling reactive object wrapping cases).
      if (res === -1 || res === false) {
        return arr[key as keyof typeof arr](...args);
      }
      return res;
    };
  });

  ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin'].forEach(
    key => {
      instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
        const arr = toRaw(this);
        const res = arr[key](...args);
        // Trigger change notification for the entire array.
        trigger(arr, TriggerOpTypes.SET, ARRAY_KEY);
        return res;
      };
    },
  );

  // Enhance ES2023 new array methods.
  ['toReversed', 'toSorted', 'toSpliced', 'join', 'concat'].forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = toRaw(this);
      const isShallowMode = isShallow(this);

      // Track iteration access to the entire array.
      track(arr, ARRAY_ITERATE_KEY);

      // Special handling for toSpliced to ensure tracking all elements.
      if (key === 'toSpliced') {
        for (let i = 0, l = arr.length; i < l; i++) {
          track(arr, `${i}`);
        }
      }

      const currentArr = toRaw(this);
      const res = Array.prototype[key].apply(currentArr, args);

      // If shallow reactive or result is primitive type, return directly.
      if (isShallowMode || !isObject(res)) {
        return res;
      }

      // If deep reactive and result is array, make each object in result reactive too.
      if (Array.isArray(res)) {
        return res.map(item => (isObject(item) ? reactiveImpl(item) : item));
      }

      // Other object types in result should also be reactive.
      return isObject(res) ? reactiveImpl(res) : res;
    };
  });

  // Properly implement iterators to ensure they can track and maintain reactivity.
  ['values', 'keys', 'entries', Symbol.iterator].forEach(key => {
    instrumentations[key] = function (this: unknown[]) {
      const arr = toRaw(this);
      // Track changes to the entire array.
      track(arr, ARRAY_KEY);
      const rawIterator = arr[key]();
      const isShallowMode = isShallow(this);

      return {
        next() {
          const { value, done } = rawIterator.next();
          if (done) {
            return { value, done };
          }

          // Handle value based on whether it's shallow reactive.
          if (Array.isArray(value)) {
            if (isShallowMode) {
              return { value, done };
            }
            // In deep reactive mode, make each child item reactive too.
            return {
              value: value.map(v => (isObject(v) ? reactiveImpl(v) : v)),
              done,
            };
          }

          if (isShallowMode) {
            return { value, done };
          }

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
 * Intercepts get and set operations to perform dependency tracking and trigger changes.
 *
 * @param shallow - Indicates whether reactivity should be shallow.
 * @returns Object containing array get and set traps.
 */
const arrayHandlers = (shallow: boolean) => ({
  get: (target: any, key: string | symbol, receiver: any) => {
    // Intercept operation to get the raw object.
    if (key === SignalFlags.RAW) {
      return target;
    }
    // Intercept operation to check if it's a reactive object.
    if (key === SignalFlags.IS_REACTIVE) {
      return true;
    }
    // If it's an enhanced method, return the enhanced version.
    if (hasOwn(arrayInstrumentations, key)) {
      return Reflect.get(arrayInstrumentations, key, receiver);
    }

    const value = Reflect.get(target, key, receiver);

    // If accessing a numeric index, track that index.
    if (isStringNumber(key)) {
      track(target, key);
    }
    // Track general access to the array.
    track(target, ARRAY_KEY);

    // If value is object and needs deep reactivity, return its reactive version.
    if (isObject(value) && !shallow) {
      return reactiveImpl(value);
    }
    return value;
  },
  set: (target: any, key: string | symbol, value: unknown, receiver: any) => {
    const oldValue = Reflect.get(target, key, receiver);
    const result = Reflect.set(target, key, value, receiver);
    if (hasChanged(value, oldValue)) {
      // If key is a numeric index, trigger dependencies for that specific index.
      if (isStringNumber(key)) {
        trigger(target, TriggerOpTypes.SET, key);
      }
      // If modifying length or adding new element, trigger general array dependencies.
      if (key === 'length' || !oldValue) {
        trigger(target, TriggerOpTypes.SET, ARRAY_KEY);
      }
    }
    return result;
  },
});

// Proxy handler for Map and Set collections.
const collectionHandlers: ProxyHandler<Map<unknown, unknown> | Set<unknown>> = {
  get(target, key: string | symbol) {
    if (key === SignalFlags.IS_REACTIVE) {
      return true;
    }
    if (key === SignalFlags.RAW) {
      return target;
    }
    // Return enhanced method or original method.
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
    // Return enhanced method or original method.
    return Reflect.get(
      hasOwn(weakInstrumentations, key) && key in target ? weakInstrumentations : target,
      key,
      target,
    );
  },
};

// Enhanced versions of Map and Set collection methods.
const collectionInstrumentations = {
  get(key: unknown) {
    const target = toRaw(this);
    track(target, COLLECTION_KEY);
    return target.get(key);
  },
  set(key: unknown, value: unknown) {
    const target = toRaw(this);
    const result = target.set(key, value);
    trigger(target, TriggerOpTypes.SET, COLLECTION_KEY);
    return result;
  },
  add(value: unknown) {
    const target = toRaw(this);
    const result = target.add(value);
    trigger(target, TriggerOpTypes.ADD, COLLECTION_KEY);
    return result;
  },
  has(key: unknown) {
    const target = toRaw(this);
    track(target, COLLECTION_KEY);
    return target.has(key);
  },
  delete(key: unknown) {
    const target = toRaw(this);
    const hadKey = target.has(key);
    const result = target.delete(key);
    if (hadKey) {
      trigger(target, TriggerOpTypes.DELETE, COLLECTION_KEY);
    }
    return result;
  },
  clear() {
    const target = toRaw(this);
    const hadItems = (target as unknown as Map<unknown, unknown>).size > 0;
    const result = target.clear();
    if (hadItems) {
      trigger(target, TriggerOpTypes.CLEAR, COLLECTION_KEY);
    }
    return result;
  },
  forEach(
    callback: (value: unknown, key: unknown, map: Map<unknown, unknown> | Set<unknown>) => void,
    thisArg?: unknown,
  ) {
    const target = toRaw(this);
    track(target, COLLECTION_KEY);
    target.forEach((value: unknown, key: unknown) => {
      callback.call(thisArg, value, key, target as unknown as Map<unknown, unknown> | Set<unknown>);
    });
  },
  [Symbol.iterator]() {
    const target = toRaw(this);
    track(target, COLLECTION_KEY);
    return target[Symbol.iterator]();
  },
  get size() {
    const target = toRaw(this);
    track(target, COLLECTION_KEY);
    return target.size;
  },
  keys() {
    const target = toRaw(this);
    track(target, COLLECTION_KEY);
    return target.keys();
  },
  values() {
    const target = toRaw(this);
    track(target, COLLECTION_KEY);
    return target.values();
  },
  entries() {
    const target = toRaw(this);
    track(target, COLLECTION_KEY);
    return target.entries();
  },
};

// Enhanced versions of WeakMap and WeakSet collection methods.
const weakInstrumentations = {
  get(key: object) {
    const target = toRaw(this);
    track(target, WEAK_COLLECTION_KEY);
    return target.get(key);
  },
  set(key: object, value: any) {
    const target = toRaw(this);
    const result = target.set(key, value);
    trigger(target, TriggerOpTypes.SET, WEAK_COLLECTION_KEY);
    return result;
  },
  add(value: object) {
    const target = toRaw(this);
    const result = target.add(value);
    trigger(target, TriggerOpTypes.ADD, WEAK_COLLECTION_KEY);
    return result;
  },
  has(key: object) {
    const target = toRaw(this);
    track(target, WEAK_COLLECTION_KEY);
    return target.has(key);
  },
  delete(key: object) {
    const target = toRaw(this);
    const result = target.delete(key);
    trigger(target, TriggerOpTypes.DELETE, WEAK_COLLECTION_KEY);
    return result;
  },
};

/**
 * Proxy handler for plain objects (non-collection types).
 * Intercepts get, set, and delete operations to manage reactivity.
 *
 * @param shallow - Indicates whether to create shallow reactive proxy.
 * @returns Object containing get, set, and delete traps.
 */
const objectHandlers = (shallow: boolean) => ({
  get(target: object, key: string | symbol, receiver: object) {
    if (key === SignalFlags.RAW) {
      return target;
    }
    if (key === SignalFlags.IS_REACTIVE) {
      return true;
    }
    if (key === SignalFlags.IS_SHALLOW) {
      return shallow;
    }

    const value = Reflect.get(target, key, receiver);

    // Auto-unwrap signals.
    const valueUnwrapped = isSignal(value) ? value.value : value;

    // Collect dependencies for accessed properties.
    track(target, key);

    // If needed, recursively wrap the value in a reactive proxy.
    if (isObject(valueUnwrapped) && !shallow) {
      return reactiveImpl(valueUnwrapped);
    }
    return valueUnwrapped;
  },
  set: (target: object, key: string | symbol, value: unknown, receiver: object) => {
    const oldValue = Reflect.get(target, key, receiver);
    // When setting value, ensure the raw value is set.
    const result = Reflect.set(target, key, toRaw(value), receiver);
    if (hasChanged(value, oldValue)) {
      trigger(target, TriggerOpTypes.SET, key, value);
    }
    return result;
  },
  deleteProperty: (target: object, key: string | symbol) => {
    const hadKey = hasOwn(target, key);
    const result = Reflect.deleteProperty(target, key);
    if (hadKey && result) {
      trigger(target, TriggerOpTypes.DELETE, key, undefined);
    }
    return result;
  },
});

/**
 * Create a reactive proxy for the given target object.
 *
 * @param target - The target object to wrap.
 * @param shallow - If true, only top-level properties are reactive.
 * @returns The reactive proxy of the target object.
 */
export function reactiveImpl<T extends object>(target: T, shallow = false): T {
  if (!isObject(target)) {
    return target;
  }

  // If target object is already reactive, return directly.
  if (isReactive(target)) {
    return target;
  }

  // Check if proxy already exists in cache.
  const existingProxy = reactiveCaches.get(target);
  if (existingProxy) {
    return existingProxy as T;
  }

  // Choose appropriate handler based on target type.
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

  // Create and cache proxy.
  const proxy = new Proxy(target, handler);
  reactiveCaches.set(target, proxy);
  return proxy;
}

/**
 * Check if the target object is reactive.
 *
 * @param target - The object to check.
 * @returns True if the object is reactive, false otherwise.
 */
export function isReactive(target: unknown): boolean {
  return !!(target && target[SignalFlags.IS_REACTIVE]);
}

/**
 * Create a reactive proxy for the given target object. If the object is already reactive, return directly.
 *
 * @param target - The object to make reactive.
 * @returns The reactive proxy of the target object.
 */
export function reactive<T extends object>(target: T): T {
  if (isReactive(target)) {
    return target;
  }
  return reactiveImpl(target);
}

/**
 * Create a shallow reactive proxy for the given object. Only root-level properties are reactive.
 *
 * @param target - The object to make shallow reactive.
 * @returns The shallow reactive proxy of the object.
 */
export function shallowReactive<T extends object>(target: T): T {
  return reactiveImpl(target, true);
}

/**
 * Check if the target object is a shallow reactive proxy.
 *
 * @param target - The object to check.
 * @returns True if the object is shallow reactive, false otherwise.
 */
export function isShallow(value: unknown): boolean {
  return !!(value && value[SignalFlags.IS_SHALLOW]);
}

/**
 * Return a reactive proxy for the given value (if possible).
 * If the given value is not an object, return the original value itself.
 *
 * @param value - The value that needs a reactive proxy created for it.
 */
export const toReactive = <T extends unknown>(value: T): T =>
  isObject(value) ? reactive(value) : value;

/**
 * Type alias representing a reactive object.
 *
 * @template T - The type of the original object.
 */
export type Reactive<T extends object> = T;
