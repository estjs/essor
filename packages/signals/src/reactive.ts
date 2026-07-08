import {
  hasChanged,
  hasOwn,
  isArray,
  isMap,
  isObject,
  isSet,
  isStringNumber,
  isUndefined,
  isWeakMap,
  isWeakSet,
} from '@estjs/shared';
import {
  ARRAY_ITERATE_KEY,
  ARRAY_KEY,
  COLLECTION_KEY,
  ITERATE_KEY,
  ReactiveFlags,
  SignalFlags,
  TriggerOpTypes,
  WEAK_COLLECTION_KEY,
} from './constants';
import {
  type Link,
  type ReactiveNode,
  activeSub,
  track,
  trackNode,
  trigger,
  triggerNode,
} from './system';
import { isSignal } from './signal';

/**
 * ReactiveProperty — per-property reactive signal for reactive proxy objects.
 *
 * Each ReactiveProperty is a ReactiveNode with its own depLink/subLink/flag,
 * enabling direct track/trigger without the targetMap → Map → Dep indirection.
 *
 * This gives VitarX-style per-property signal granularity on top of Essor's
 * alien-signals infrastructure.
 *
 * The value is NOT cached here — it is read live from the target object. The
 * DIRTY coordination lives in {@link triggerNode}, which force-marks computed
 * subscribers dirty so derivations stay glitch-free (see triggerNode's docs).
 *
 * @internal
 */
export class ReactiveProperty implements ReactiveNode {
  // ── ReactiveNode interface ────────────────────────────────────────────
  depLink?: Link;
  subLink?: Link;
  depLinkTail?: Link;
  subLinkTail?: Link;
  flag: ReactiveFlags = ReactiveFlags.MUTABLE;
  onTrack?: never;
  onTrigger?: never;

  constructor(
    private _target: object,
    private _key: string | symbol,
  ) {}

  /**
   * Read the property value and track the dependency.
   *
   * Uses trackNode(this) — bypasses targetMap/Dep. The ReactiveProperty itself
   * IS the depNode, so linkReactiveNode connects the active subscriber directly
   * to this node's subLink chain.
   *
   * Nested proxy wrapping and signal auto-unwrapping are handled by the caller
   * (the reactive proxy get trap), keeping this method self-contained and free
   * of a circular dependency on the rest of reactive.ts.
   */
  getValue(): any {
    trackNode(this);
    return (this._target as any)[this._key];
  }

  /**
   * Update the property value and notify subscribers.
   *
   * Uses triggerNode(this) — directly walks the subLink chain, bypassing
   * targetMap + collectTriggeredEffects.
   *
   * @param rawValue - The new (already unrawed) value.
   * @param oldValue - The previous value, read BEFORE Reflect.set.
   */
  setValue(rawValue: any, oldValue: any): void {
    if (Object.is(oldValue, rawValue)) {
      return;
    }
    triggerNode(this);
  }

  /**
   * Invalidate this property (called on delete).
   * Notifies subscribers that the value is gone.
   */
  invalidate(): void {
    triggerNode(this);
  }
}

// Use separate WeakMaps so deep and shallow wrappers for the same raw object
// cannot accidentally reuse each other.
const reactiveCaches = new WeakMap<object, object>();
const shallowReactiveCaches = new WeakMap<object, object>();

/**
 * Return the raw underlying value of a reactive proxy or signal.
 * Recursively unwraps nested reactive objects and arrays.
 *
 * @param value - Reactive or signal value.
 * @returns {T} Raw value without any reactive wrapping.
 */
export function toRaw<T>(value: T): T {
  if (!value || !isObject(value)) {
    return value as T;
  }

  const raw = value[SignalFlags.RAW];
  if (raw) {
    // Recursively unwrap in case the raw value is also reactive
    return toRaw(raw);
  }

  // Check if it's a signal and unwrap without triggering dependencies
  if (isSignal(value)) {
    return toRaw(value.peek()) as T;
  }

  // For all other cases (non-reactive objects, arrays, collections, etc.), return as-is
  // Arrays, Maps, Sets, etc. that aren't reactive proxies are already "raw"
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

  // Search methods: track array iteration and handle reactive object arguments
  ['includes', 'indexOf', 'lastIndexOf'].forEach((key) => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = toRaw(this) as any[];
      // Track iteration access to the entire array
      track(arr, ARRAY_ITERATE_KEY);

      // First try with the original arguments
      let res = arr[key as keyof typeof arr](...args);

      // If lookup fails and we have arguments, try with raw values
      // This handles cases where reactive objects are passed as search values
      if ((res === -1 || res === false) && args.length > 0) {
        const rawArgs = args.map((arg) => toRaw(arg));
        res = arr[key as keyof typeof arr](...rawArgs);
      }

      return res;
    };
  });

  // Search methods that return elements: track iteration and maintain reactivity
  ['find', 'findIndex', 'findLast', 'findLastIndex'].forEach((key) => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = toRaw(this) as any[];
      const isShallowMode = isShallow(this);

      // Track iteration access to the entire array
      track(arr, ARRAY_ITERATE_KEY);

      const res = arr[key as keyof typeof arr](...args);

      // For find/findLast, make result reactive if needed
      if ((key === 'find' || key === 'findLast') && isObject(res) && !isShallowMode) {
        return reactiveImpl(res);
      }

      return res;
    };
  });

  // Mutation methods: trigger array changes
  ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin'].forEach(
    (key) => {
      instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
        const arr = toRaw(this);
        // Call the method using Array.prototype to ensure it works correctly
        const res = Array.prototype[key].apply(arr, args);
        // Trigger both array content and iteration watchers in a single pass
        trigger(arr, TriggerOpTypes.SET, [ARRAY_KEY, ARRAY_ITERATE_KEY]);
        return res;
      };
    },
  );

  // ES2023 methods that return new arrays: track access and maintain reactivity
  ['toReversed', 'toSorted', 'toSpliced'].forEach((key) => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = toRaw(this);
      const isShallowMode = isShallow(this);

      // Track iteration access to the entire array.
      // Note: for toSpliced we previously tracked every individual index here
      // (O(n)) but ARRAY_ITERATE_KEY already establishes a full-array dependency,
      // so per-index tracking was redundant and expensive on large arrays.
      track(arr, ARRAY_ITERATE_KEY);

      // Call the native method
      const res = Array.prototype[key].apply(arr, args);

      // Return directly if result is not an array
      if (!isArray(res)) {
        return res;
      }

      // Make object elements reactive (deep or shallow based on parent mode)
      return res.map((item) => (isObject(item) ? reactiveImpl(item, isShallowMode) : item));
    };
  });

  // Methods that return new arrays but don't modify original: track and maintain reactivity.
  //
  // IMPORTANT: we `apply` on `this` (the reactive proxy), not on the raw
  // array. This way every element access inside the native implementation
  // goes through the proxy's get trap, which (for deep reactive arrays)
  // returns reactive proxies of the items. That preserves reactivity for
  // callers doing e.g. `data.value.slice()[i].label = '...'` or passing
  // the resulting array to `.set()`. Running on the raw array would leak
  // raw, non-reactive items and silently break downstream bindings.
  ['concat', 'slice', 'filter', 'map', 'flatMap', 'flat'].forEach((key) => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = toRaw(this);
      // Track iteration access
      track(arr, ARRAY_ITERATE_KEY);
      // Call the native method on the proxy (this), not the raw array, so
      // element reads go through the reactive get trap.
      return Array.prototype[key].apply(this, args);
    };
  });

  // Methods that return strings: only track, no reactivity needed
  ['join', 'toString', 'toLocaleString'].forEach((key) => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = toRaw(this);
      // Track iteration access
      track(arr, ARRAY_ITERATE_KEY);
      return Array.prototype[key].apply(arr, args);
    };
  });

  // Iterator methods: track access and maintain reactivity
  ['values', 'keys', 'entries', Symbol.iterator].forEach((key) => {
    instrumentations[key] = function (this: unknown[]) {
      const arr = toRaw(this);
      const isShallowMode = isShallow(this);

      // Track changes to the entire array
      track(arr, ARRAY_KEY);

      const rawIterator = key === Symbol.iterator ? arr[Symbol.iterator]() : arr[key]();

      return {
        /**
         * Returns the next iterator result.
         */
        next() {
          const { value, done } = rawIterator.next();

          if (done) {
            return { value, done };
          }

          // Handle entries (returns [index, value] or [value, value] for Set)
          if (isArray(value)) {
            return {
              value: value.map((v) => (isObject(v) ? reactiveImpl(v, isShallowMode) : v)),
              done,
            };
          }

          // Handle values and keys - make objects reactive
          return {
            value: isObject(value) ? reactiveImpl(value, isShallowMode) : value,
            done,
          };
        },
        /**
         * Returns an iterator for the current collection.
         */
        [Symbol.iterator]() {
          return this;
        },
      };
    };
  });

  return instrumentations;
}

function hasStoredValueChanged(rawValue: unknown, oldValue: unknown): boolean {
  // Signal-backed properties are auto-unwrapped on read; replacing the stored
  // signal with its current value must still notify effects to refresh deps.
  const comparableOldValue = isSignal(oldValue) ? oldValue : toRaw(oldValue);
  return hasChanged(rawValue, comparableOldValue);
}

/**
 * Proxy handler for reactive arrays.
 * Intercepts get and set operations to perform dependency tracking and trigger changes.
 *
 * @param shallow - Indicates whether reactivity should be shallow.
 * @returns {any} Object containing array get and set traps.
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
    // Intercept operation to check if it's shallow.
    if (key === SignalFlags.IS_SHALLOW) {
      return shallow;
    }
    // If it's an enhanced method, return the enhanced version.
    if (hasOwn(arrayInstrumentations, key)) {
      return arrayInstrumentations[key];
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
    const rawValue = toRaw(value);
    const result = Reflect.set(target, key, rawValue, receiver);
    if (hasStoredValueChanged(rawValue, oldValue)) {
      // For numeric indices, we need to trigger multiple dependencies
      if (isStringNumber(key)) {
        trigger(target, TriggerOpTypes.SET, [key, ARRAY_ITERATE_KEY, ARRAY_KEY]);
      } else {
        // For non-numeric keys (like 'length'), just trigger that key
        trigger(target, TriggerOpTypes.SET, key);
      }
    }
    return result;
  },
  has: (target: any, key: string | symbol) => {
    const result = Reflect.has(target, key);
    // Track membership so `key in arr` / index existence checks are reactive.
    // Skip symbol keys to avoid tracking internal lookups (Symbol.iterator, etc.).
    if (typeof key !== 'symbol') {
      if (isStringNumber(key)) {
        track(target, key);
      }
      track(target, ARRAY_KEY);
    }
    return result;
  },
  deleteProperty: (target: any, key: string | symbol) => {
    const hadKey = hasOwn(target, key);
    const result = Reflect.deleteProperty(target, key);
    if (hadKey && result) {
      // `delete arr[i]` must notify index, iteration, and whole-array watchers.
      if (isStringNumber(key)) {
        trigger(target, TriggerOpTypes.DELETE, [key, ARRAY_ITERATE_KEY, ARRAY_KEY]);
      } else {
        trigger(target, TriggerOpTypes.DELETE, key);
      }
    }
    return result;
  },
  ownKeys: (target: any) => {
    // Track array iteration so Object.keys()/for…in re-run when the shape changes.
    track(target, ARRAY_ITERATE_KEY);
    return Reflect.ownKeys(target);
  },
});

const shallowArrayHandlers = arrayHandlers(true);
const deepArrayHandlers = arrayHandlers(false);

// Proxy handler for Map and Set collections.
const collectionHandlers = (
  shallow: boolean,
): ProxyHandler<Map<unknown, unknown> | Set<unknown>> => ({
  /**
   * Exposes collection proxy flags and instrumented methods.
   */
  get(target, key: string | symbol) {
    if (key === SignalFlags.IS_REACTIVE) {
      return true;
    }
    if (key === SignalFlags.RAW) {
      return target;
    }
    if (key === SignalFlags.IS_SHALLOW) {
      return shallow;
    }
    // Return enhanced method or original method.
    return Reflect.get(
      hasOwn(collectionInstrumentations, key) ? collectionInstrumentations : target,
      key,
      target,
    );
  },
});

// Proxy handler for WeakMap and WeakSet collections.
const weakCollectionHandlers = (
  shallow: boolean,
): ProxyHandler<WeakMap<object, unknown> | WeakSet<object>> => ({
  /**
   * Exposes weak-collection proxy flags and instrumented methods.
   */
  get(target, key: string | symbol) {
    if (key === SignalFlags.IS_REACTIVE) {
      return true;
    }
    if (key === SignalFlags.RAW) {
      return target;
    }
    if (key === SignalFlags.IS_SHALLOW) {
      return shallow;
    }
    // Return enhanced method or original method.
    return Reflect.get(
      hasOwn(weakInstrumentations, key) && key in target ? weakInstrumentations : target,
      key,
      target,
    );
  },
});

const shallowCollectionHandlers = collectionHandlers(true);
const deepCollectionHandlers = collectionHandlers(false);
const shallowWeakCollectionHandlers = weakCollectionHandlers(true);
const deepWeakCollectionHandlers = weakCollectionHandlers(false);

// Enhanced versions of Map and Set collection methods.
const collectionInstrumentations = {
  /**
   * Reads a Map entry with dependency tracking.
   */
  get(this: Map<unknown, unknown>, key: unknown) {
    const target = toRaw(this);
    // Track access to the collection
    track(target, COLLECTION_KEY);

    let value = target.get(key);
    if (isUndefined(value) && !target.has(key) && isReactive(key)) {
      value = target.get(toRaw(key));
    }

    // For deep reactive mode, wrap object values in reactive proxy
    if (isObject(value) && !isShallow(this)) {
      return reactiveImpl(value);
    }

    return value;
  },
  /**
   * Sets the requested value.
   */
  set(this: Map<unknown, unknown>, key: unknown, value: unknown) {
    const target = toRaw(this);
    const rawKey = toRaw(key);
    const hadKey = target.has(rawKey);
    const oldValue = target.get(rawKey);

    // Store raw value to avoid nested reactive wrapping
    const rawValue = toRaw(value);
    target.set(rawKey, rawValue);

    // Only trigger if value actually changed or key is new
    if (!hadKey || hasChanged(oldValue, rawValue)) {
      trigger(target, TriggerOpTypes.SET, COLLECTION_KEY);
    }

    return this; // Return the reactive proxy, not the raw target
  },
  /**
   * Adds the requested value.
   */
  add(this: Set<unknown>, value: unknown) {
    const target = toRaw(this);
    // Store raw value to avoid nested reactive wrapping
    const rawValue = toRaw(value);
    const hadValue = target.has(rawValue);

    target.add(rawValue);

    // Only trigger when the Set membership actually changes.
    if (!hadValue) {
      trigger(target, TriggerOpTypes.ADD, COLLECTION_KEY);
    }

    return this; // Return the reactive proxy, not the raw target
  },
  /**
   * Returns whether the requested value exists.
   */
  has(key: unknown) {
    const target = toRaw(this);
    // Track access to the collection
    track(target, COLLECTION_KEY);

    // Try with original key first, then with raw key
    // This handles reactive objects as keys
    const hasKey = target.has(key);
    if (!hasKey && isObject(key)) {
      return target.has(toRaw(key));
    }

    return hasKey;
  },
  /**
   * Deletes the requested value.
   */
  delete(key: unknown) {
    const target = toRaw(this);
    const hadKey = target.has(key);

    // Try deleting with original key first
    let result = target.delete(key);

    // If failed and key is an object, try with raw key
    if (!result && isObject(key)) {
      result = target.delete(toRaw(key));
    }

    // Only trigger if something was actually deleted
    if (hadKey || result) {
      trigger(target, TriggerOpTypes.DELETE, COLLECTION_KEY);
    }

    return result;
  },
  /**
   * Clears the current collection.
   */
  clear() {
    const target = toRaw(this);
    const hadItems = target.size > 0;
    const result = target.clear();

    // Only trigger if collection had items
    if (hadItems) {
      trigger(target, TriggerOpTypes.CLEAR, COLLECTION_KEY);
    }

    return result;
  },
  /**
   * Iterates over each collection entry.
   */
  forEach(
    this: Map<unknown, unknown> | Set<unknown>,
    callback: (value: unknown, key: unknown, map: Map<unknown, unknown> | Set<unknown>) => void,
    thisArg?: unknown,
  ) {
    const target = toRaw(this);
    const isShallowMode = isShallow(this);

    // Track access to the collection
    track(target, COLLECTION_KEY);

    // Wrap callback to provide reactive values in deep mode
    target.forEach((value: unknown, key: unknown) => {
      const wrappedValue = isShallowMode || !isObject(value) ? value : reactiveImpl(value);
      const wrappedKey = isShallowMode || !isObject(key) ? key : reactiveImpl(key);

      callback.call(thisArg, wrappedValue, wrappedKey, this);
    });
  },
  /**
   * Returns an iterator for the current collection.
   */
  [Symbol.iterator](this: Map<unknown, unknown> | Set<unknown>) {
    const target = toRaw(this);
    const isShallowMode = isShallow(this);

    // Track access to the collection
    track(target, COLLECTION_KEY);

    const rawIterator = target[Symbol.iterator]();

    return {
      /**
       * Returns the next iterator result.
       */
      next() {
        const { value, done } = rawIterator.next();

        if (done) {
          return { value, done };
        }

        // In shallow mode, return as-is
        if (isShallowMode) {
          return { value, done };
        }

        // For Map entries [key, value], wrap both if they're objects
        if (isArray(value)) {
          return {
            value: value.map((v) => (isObject(v) ? reactiveImpl(v) : v)),
            done,
          };
        }

        // For Set values, wrap if object
        return {
          value: isObject(value) ? reactiveImpl(value) : value,
          done,
        };
      },
      /**
       * Returns an iterator for the current collection.
       */
      [Symbol.iterator]() {
        return this;
      },
    };
  },
  /**
   * Returns the current collection size.
   */
  get size() {
    const target = toRaw(this);
    // Track access to size property
    track(target, COLLECTION_KEY);
    return target.size;
  },
  /**
   * Returns an iterator over the current keys.
   */
  keys(this: Map<unknown, unknown> | Set<unknown>) {
    const target = toRaw(this);
    const isShallowMode = isShallow(this);

    // Track access to the collection
    track(target, COLLECTION_KEY);

    const rawIterator = target.keys();

    return {
      /**
       * Returns the next iterator result.
       */
      next() {
        const { value, done } = rawIterator.next();

        if (done) {
          return { value, done };
        }

        // Wrap keys if they're objects and in deep mode
        return {
          value: isShallowMode || !isObject(value) ? value : reactiveImpl(value),
          done,
        };
      },
      /**
       * Returns an iterator for the current collection.
       */
      [Symbol.iterator]() {
        return this;
      },
    };
  },
  /**
   * Returns an iterator over the current values.
   */
  values(this: Map<unknown, unknown> | Set<unknown>) {
    const target = toRaw(this);
    const isShallowMode = isShallow(this);

    // Track access to the collection
    track(target, COLLECTION_KEY);

    const rawIterator = target.values();

    return {
      /**
       * Returns the next iterator result.
       */
      next() {
        const { value, done } = rawIterator.next();

        if (done) {
          return { value, done };
        }

        // Wrap values if they're objects and in deep mode
        return {
          value: isShallowMode || !isObject(value) ? value : reactiveImpl(value),
          done,
        };
      },
      /**
       * Returns an iterator for the current collection.
       */
      [Symbol.iterator]() {
        return this;
      },
    };
  },
  /**
   * Returns an iterator over the current entries.
   */
  entries(this: Map<unknown, unknown> | Set<unknown>) {
    const target = toRaw(this);
    const isShallowMode = isShallow(this);

    // Track access to the collection
    track(target, COLLECTION_KEY);

    const rawIterator = target.entries();

    return {
      /**
       * Returns the next iterator result.
       */
      next() {
        const { value, done } = rawIterator.next();

        if (done) {
          return { value, done };
        }

        // In shallow mode, return as-is
        if (isShallowMode) {
          return { value, done };
        }

        // Wrap both key and value if they're objects
        return {
          value: value.map((v: unknown) => (isObject(v) ? reactiveImpl(v) : v)),
          done,
        };
      },
      /**
       * Returns an iterator for the current collection.
       */
      [Symbol.iterator]() {
        return this;
      },
    };
  },
};

// Enhanced versions of WeakMap and WeakSet collection methods.
const weakInstrumentations = {
  /**
   * Reads a WeakMap entry with dependency tracking.
   */
  get(this: WeakMap<object, unknown>, key: object) {
    const target = toRaw(this);
    // Track access to the weak collection
    track(target, WEAK_COLLECTION_KEY);

    // Try with original key first
    let value = target.get(key);

    // If not found and key is reactive, try with raw key
    if (isUndefined(value) && !target.has(key) && isReactive(key)) {
      value = target.get(toRaw(key));
    }

    // For deep reactive mode, wrap object values in reactive proxy
    if (isObject(value) && !isShallow(this)) {
      return reactiveImpl(value);
    }

    return value;
  },
  /**
   * Sets the requested value.
   */
  set(this: WeakMap<object, unknown>, key: object, value: unknown) {
    const target = toRaw(this);
    const rawKey = toRaw(key);
    const hadKey = target.has(rawKey);
    const oldValue = target.get(rawKey);

    // Store raw value to avoid nested reactive wrapping
    const rawValue = toRaw(value);
    target.set(rawKey, rawValue);

    // Only trigger if value actually changed or key is new
    if (!hadKey || hasChanged(oldValue, rawValue)) {
      trigger(target, TriggerOpTypes.SET, WEAK_COLLECTION_KEY);
    }

    return this; // Return the reactive proxy, not the raw target
  },
  /**
   * Adds the requested value.
   */
  add(this: WeakSet<object>, value: object) {
    const target = toRaw(this);
    const rawValue = toRaw(value);
    const hadValue = target.has(rawValue);

    target.add(rawValue);

    // Only trigger if value is new
    if (!hadValue) {
      trigger(target, TriggerOpTypes.ADD, WEAK_COLLECTION_KEY);
    }

    return this; // Return the reactive proxy, not the raw target
  },
  /**
   * Returns whether the requested value exists.
   */
  has(key: object) {
    const target = toRaw(this);
    // Track access to the weak collection
    track(target, WEAK_COLLECTION_KEY);

    // Try with original key first
    let hasKey = target.has(key);

    // If not found and key is reactive, try with raw key
    if (!hasKey && isReactive(key)) {
      hasKey = target.has(toRaw(key));
    }

    return hasKey;
  },
  /**
   * Deletes the requested value.
   */
  delete(key: object) {
    const target = toRaw(this);
    const rawKey = toRaw(key);
    const hadKey = target.has(rawKey);

    const result = target.delete(rawKey);

    // Only trigger if something was actually deleted
    if (hadKey || result) {
      trigger(target, TriggerOpTypes.DELETE, WEAK_COLLECTION_KEY);
    }

    return result;
  },
};

/**
 * Proxy handler for plain objects (non-collection types).
 * Intercepts get, set, and delete operations to manage reactivity.
 *
 * @param shallow - Indicates whether to create shallow reactive proxy.
 * @returns {any} Object containing get, set, and delete traps.
 */
/**
 * Per-target property maps for the per-property signal optimization.
 *
 * Each reactive proxy gets its own Map<key, ReactiveProperty>, keyed by the
 * raw target object.  Using a WeakMap here means the property maps are
 * automatically garbage-collected when the raw object is no longer referenced.
 */
const targetPropertyMaps = new WeakMap<object, Map<string | symbol, ReactiveProperty>>();

/**
 * Count the number of active effect subscribers on a reactive object property.
 *
 * Own-key deps live on their {@link ReactiveProperty} node inside
 * `targetPropertyMaps`; prototype / collection deps are still in the
 * standard `targetMap` (via `system.ts`), but plain-object own keys
 * always use the fast path, so checking the property map is sufficient.
 *
 * Used by tests to assert that effects are properly cleaned up.
 */
export function getTargetDepSize(target: object, key: string | symbol): number {
  // Unwrap reactive proxy to raw object so both `reactive(x)` and `x`
  // resolve to the same entry in targetPropertyMaps.
  const rawTarget = (target as any)[SignalFlags.RAW] ?? target;
  const prop = targetPropertyMaps.get(rawTarget)?.get(key);
  if (!prop?.subLink) return 0;
  let size = 0;
  for (let link: Link | undefined = prop.subLink; link; link = link.nextSubLink) size++;
  return size;
}

function getPropertyMap(target: object): Map<string | symbol, ReactiveProperty> {
  let map = targetPropertyMaps.get(target);
  if (!map) {
    map = new Map();
    targetPropertyMaps.set(target, map);
  }
  return map;
}

/**
 * Track an own property through its per-property {@link ReactiveProperty} node
 * and return the raw stored value.
 *
 * The node itself is the depNode, so trackNode() links the active subscriber
 * directly to it — bypassing the targetMap → Map → Dep indirection.
 *
 * Fast exit: outside any effect (and inside untrack, where activeSub is
 * undefined) there is nothing to track, so we skip materializing the per-target
 * Map and ReactiveProperty entirely and just read the value live. This keeps
 * untracked reads — event handlers, one-off lookups — allocation-free.
 */
function trackProperty(target: object, key: string | symbol): any {
  if (!activeSub) {
    return (target as any)[key];
  }
  const pm = getPropertyMap(target);
  let prop = pm.get(key);
  if (!prop) {
    prop = new ReactiveProperty(target, key);
    pm.set(key, prop);
  }
  return prop.getValue(); // trackNode fast path
}

const objectHandlers = (shallow: boolean) => ({
  /**
   * Reads an object property, unwraps signals, and tracks the access.
   *
   * Own properties use the per-property signal fast path (trackNode),
   * which bypasses the targetMap → Map → Dep indirection.
   * Prototype-chain properties fall back to the standard track() path.
   */
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

    // ── Per-property signal fast path ─────────────────────────────────
    // Only for own (non-inherited) properties while inside an active effect.
    // Untracked reads (event handlers, one-off lookups) skip the per-property
    // machinery entirely to remain allocation-free.
    // Prototype properties (toString, hasOwnProperty, etc.) go through the standard track() path.
    if (activeSub && hasOwn(target, key)) {
      const result = trackProperty(target, key);

      // Auto-unwrap signals. Read via `.value` (not `.peek()`) so a nested
      // signal stored as a property value is also tracked — matching the
      // standard path below, which reads `value.value`.
      const unwrapped = isSignal(result) ? (result as { value: unknown }).value : result;

      // Wrap nested objects for deep reactivity (same behaviour as standard path).
      // reactiveImpl() is cached via WeakMap, so repeated accesses are fast.
      if (isObject(unwrapped) && !shallow) {
        return reactiveImpl(unwrapped);
      }
      return unwrapped;
    }

    const value = Reflect.get(target, key, receiver);

    // Auto-unwrap signals (tracking via .value getter for standard path).
    const valueUnwrapped = isSignal(value) ? value.value : value;

    // Collect dependencies for accessed properties (standard path).
    track(target, key);

    // If needed, recursively wrap the value in a reactive proxy.
    if (isObject(valueUnwrapped) && !shallow) {
      return reactiveImpl(valueUnwrapped);
    }
    return valueUnwrapped;
  },
  set: (target: object, key: string | symbol, value: unknown, receiver: object) => {
    const hadKey = hasOwn(target, key);
    const oldValue = Reflect.get(target, key, receiver);
    // When setting value, ensure the raw value is set.
    const rawValue = toRaw(value);
    const result = Reflect.set(target, key, rawValue, receiver);

    // ── Per-property signal fast path ─────────────────────────────────
    if (hadKey) {
      const pm = targetPropertyMaps.get(target);
      const prop = pm?.get(key);
      if (prop) {
        prop.setValue(rawValue, oldValue); // triggerNode fast path (oldValue from before Reflect.set)
        return result;
      }
    }

    if (hasStoredValueChanged(rawValue, oldValue)) {
      // Distinguish ADD (new property) from SET (existing property) so that
      // iteration-dependent effects (Object.keys(), for…in, etc.) are notified
      // when the key set changes.
      trigger(target, hadKey ? TriggerOpTypes.SET : TriggerOpTypes.ADD, key, rawValue);
    }
    return result;
  },
  deleteProperty: (target: object, key: string | symbol) => {
    const hadKey = hasOwn(target, key);
    const result = Reflect.deleteProperty(target, key);
    if (hadKey && result) {
      // ── Per-property signal fast path ────────────────────────────────
      const pm = targetPropertyMaps.get(target);
      const prop = pm?.get(key);
      if (prop) {
        pm!.delete(key);
        prop.invalidate();
      }
      trigger(target, TriggerOpTypes.DELETE, key, undefined);
    }
    return result;
  },
  ownKeys: (target: object) => {
    // Track ITERATE_KEY so that Object.keys(), for…in, JSON.stringify(),
    // etc. re-run when properties are added or deleted.
    track(target, ITERATE_KEY);
    return Reflect.ownKeys(target);
  },
});

// Pre-create handler objects at module load time so reactiveImpl never
// allocates a new handler on each call (Fix-3).
const shallowObjectHandlers = objectHandlers(true);
const deepObjectHandlers = objectHandlers(false);

/**
 * Creates or reuses the appropriate reactive proxy for a target.
 *
 * @param target - The object to make reactive.
 * @param shallow - Whether to create a shallow reactive proxy.
 * @returns {T} The reactive proxy of the target object.
 */
export function reactiveImpl<T extends object>(target: T, shallow = false): T {
  if (!isObject(target)) {
    return target;
  }

  // If target object is already reactive, return directly.
  if (isReactive(target)) {
    return target;
  }

  // Check if proxy already exists in the cache for this reactivity depth.
  const cache = shallow ? shallowReactiveCaches : reactiveCaches;
  const existingProxy = cache.get(target);
  if (existingProxy) {
    return existingProxy as T;
  }

  // Choose appropriate handler based on target type.
  let handler;
  if (isArray(target)) {
    handler = shallow ? shallowArrayHandlers : deepArrayHandlers;
  } else if (isSet(target) || isMap(target)) {
    handler = shallow ? shallowCollectionHandlers : deepCollectionHandlers;
  } else if (isWeakMap(target) || isWeakSet(target)) {
    handler = shallow ? shallowWeakCollectionHandlers : deepWeakCollectionHandlers;
  } else {
    handler = shallow ? shallowObjectHandlers : deepObjectHandlers;
  }

  // Create and cache proxy.
  const proxy = new Proxy(target, handler);
  cache.set(target, proxy);
  return proxy;
}

/**
 * Check if the target object is reactive.
 *
 * @param target - The object to check.
 * @returns {boolean} True if the object is reactive, false otherwise.
 */
export function isReactive(target: unknown): boolean {
  return !!(target && target[SignalFlags.IS_REACTIVE]);
}

/**
 * Create a reactive proxy for the given target object. If the object is already reactive, return directly.
 *
 * @template T - The type of the object to make reactive.
 * @param target - The object to make reactive.
 * @returns {T} The reactive proxy of the target object.
 *
 * @example
 * ```typescript
 * const state = reactive({ count: 0, nested: { value: 1 } });
 * // Both state.count and state.nested.value are reactive
 * ```
 */
export function reactive<T extends object>(target: T): T {
  //If already reactive, return directly to prevent double wrapping
  if (isReactive(target)) {
    return target;
  }

  //  If target is a signal, warn and unwrap it
  if (isSignal(target)) {
    // Return the signal as-is since signals are already reactive
    return target;
  }

  return reactiveImpl(target);
}

/**
 * Create a shallow reactive proxy for the given object. Only root-level properties are reactive.
 *
 * @template T - The type of the object to make shallow reactive.
 * @param target - The object to make shallow reactive.
 * @returns {T} The shallow reactive proxy of the object.
 *
 * @example
 * ```typescript
 * const state = shallowReactive({ count: 0, nested: { value: 1 } });
 * // Only state.count is reactive, not state.nested.value
 * ```
 */
export function shallowReactive<T extends object>(target: T): T {
  //  If already reactive, check if it's shallow
  if (isReactive(target)) {
    return target;
  }

  // If target is a signal, warn and unwrap it
  if (isSignal(target)) {
    // Return the signal as-is since signals are already reactive
    return target;
  }

  return reactiveImpl(target, true);
}

/**
 * Check if the target object is a shallow reactive proxy.
 *
 * @param value - The object to check.
 * @returns {boolean} True if the object is shallow reactive, false otherwise.
 */
export function isShallow(value: unknown): boolean {
  return !!(value && value[SignalFlags.IS_SHALLOW]);
}

/**
 * Return a reactive proxy for the given value (if possible).
 * If the given value is not an object, return the original value itself.
 *
 * @param value - The value that needs a reactive proxy created for it.
 * @returns {T} The reactive proxy of the value, or the original value.
 */
export const toReactive = <T extends unknown>(value: T): T =>
  isObject(value) ? reactive(value) : value;

/**
 * Type alias representing a reactive object.
 *
 * @template T - The type of the original object.
 */
export type Reactive<T extends object> = T;
