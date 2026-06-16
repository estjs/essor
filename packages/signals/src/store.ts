import { isFunction, warn } from '@estjs/shared';
import { batch, computed, reactive } from '.';

/**
 * Represents a store's state object.
 * Must be a plain object containing the store's reactive state.
 */
export type State = Record<string, any>;

/**
 * Represents a store's getters object.
 * Each getter is a function that receives the state and returns a computed value.
 */
export type Getters<S extends State> = Record<string, (state: S) => any>;

/**
 * Represents a store's actions object.
 * Each action is a function that can modify the store's state.
 */
export type Actions = Record<string, (...args: any[]) => any>;

/**
 * Configuration options for creating a store.
 *
 * @template S - The type of the store's state
 * @template G - The type of the store's getters
 * @template A - The type of the store's actions
 */
export interface StoreOptions<S extends State, G extends Getters<S>, A extends Actions> {
  /** The initial state of the store */
  state: S;
  /** Computed values derived from the state */
  getters?: G;
  /** Methods that can modify the store's state */
  actions?: A;
}

/**
 * Payload for patching store state.
 * Must be a partial object matching the store's state shape.
 */
export type PatchPayload<S> = Partial<S>;

/**
 * Callback function for store subscriptions and action notifications.
 */
export type StoreCallback<S> = (state: S) => void;

/**
 * Built-in actions available on all stores.
 *
 * @template S - The type of the store's state
 */
export interface StoreActions<S extends State> {
  /**
   * Updates multiple state properties at once.
   * Triggers a single update notification.
   *
   * @param payload - Object containing state updates
   */
  $patch: (payload: PatchPayload<S>) => void;

  /**
   * Subscribes to state changes.
   * The callback is called whenever the state changes.
   *
   * @param callback - Function to call on state changes
   * @returns Cleanup function that unsubscribes the callback
   */
  $subscribe: (callback: StoreCallback<S>) => () => void;

  /**
   * Unsubscribes from state changes.
   *
   * @param callback - The callback to remove
   */
  $unsubscribe: (callback: StoreCallback<S>) => void;

  /**
   * Subscribes to action executions.
   * The callback is called whenever an action is executed.
   *
   * @param callback - Function to call on action execution
   * @returns Cleanup function that removes the callback
   */
  $onAction: (callback: StoreCallback<S>) => () => void;

  /**
   * Removes a previously registered action callback.
   *
   * @param callback - The callback to remove.
   */
  $offAction: (callback: StoreCallback<S>) => void;

  /**
   * Resets the store state to its initial values.
   */
  $reset: () => void;
}

/**
 * Computed values from getters.
 *
 * @template G - The type of the store's getters
 */
type GetterValues<G extends Getters<any>> = {
  [K in keyof G]: ReturnType<G[K]>;
};

function cloneInitialState<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if (seen.has(value)) {
    return seen.get(value) as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags) as T;
  }

  if (value instanceof Map) {
    const clone = new Map();
    seen.set(value, clone);
    value.forEach((mapValue, mapKey) => {
      clone.set(cloneInitialState(mapKey, seen), cloneInitialState(mapValue, seen));
    });
    return clone as T;
  }

  if (value instanceof Set) {
    const clone = new Set();
    seen.set(value, clone);
    value.forEach((setValue) => {
      clone.add(cloneInitialState(setValue, seen));
    });
    return clone as T;
  }

  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    value.forEach((item, index) => {
      clone[index] = cloneInitialState(item, seen);
    });
    return clone as T;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }

  const clone = Object.create(prototype) as Record<PropertyKey, unknown>;
  seen.set(value, clone);
  for (const key of Reflect.ownKeys(value)) {
    clone[key] = cloneInitialState((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return clone as T;
}

/**
 * Creates a store from options (state, getters, and actions).
 *
 * @template S - The type of the store's state.
 * @template G - The type of the store's getters.
 * @template A - The type of the store's actions.
 * @param options - Store configuration options.
 * @returns The store instance.
 */
function createOptionsStore<S extends State, G extends Getters<S>, A extends Actions>(
  options: StoreOptions<S, G, A>,
) {
  if (__DEV__ && !options.state) {
    warn('Store state is required');
    throw new Error('Store state is required');
  }

  const { state, getters, actions } = options;
  const initState = cloneInitialState(state);
  const reactiveState = reactive(state);

  const subscriptions = new Set<StoreCallback<S>>();
  const actionCallbacks = new Set<StoreCallback<S>>();

  /** Notify every state subscriber and action callback with the current state. */
  const notify = (state: S): void => {
    subscriptions.forEach((callback) => callback(state));
    actionCallbacks.forEach((callback) => callback(state));
  };

  /**
   * Registers a callback into the given set and returns a cleanup function
   * that unsubscribes it. Shared by `$subscribe` and `$onAction`.
   */
  const addCallback = (
    set: Set<StoreCallback<S>>,
    callback: StoreCallback<S>,
    label: string,
  ): (() => void) => {
    if (__DEV__ && !callback) {
      warn(`${label} is required`);
      return () => {};
    }
    set.add(callback);
    return () => set.delete(callback);
  };

  /** Apply a mutation inside a batch, then notify subscribers once. */
  const commit = (mutate: () => void): void => {
    batch(mutate);
    notify(reactiveState);
  };

  const defaultActions: StoreActions<S> = {
    $patch(payload: PatchPayload<S>) {
      if (__DEV__ && !payload) {
        warn('Patch payload is required');
        return;
      }
      commit(() => Object.assign(reactiveState, payload));
    },

    $subscribe(callback: StoreCallback<S>) {
      return addCallback(subscriptions, callback, 'Subscribe callback');
    },

    $unsubscribe(callback: StoreCallback<S>) {
      subscriptions.delete(callback);
    },

    $onAction(callback: StoreCallback<S>) {
      return addCallback(actionCallbacks, callback, 'Action callback');
    },

    $offAction(callback: StoreCallback<S>) {
      actionCallbacks.delete(callback);
    },

    $reset() {
      commit(() => Object.assign(reactiveState, initState));
    },
  };

  const store = {} as S & GetterValues<G> & A & StoreActions<S> & { state: S };

  for (const key of Object.keys(initState) as Array<keyof S & string>) {
    Object.defineProperty(store, key, {
      get: () => reactiveState[key],
      set: (value) => {
        reactiveState[key] = value;
      },
      enumerable: true,
      configurable: true,
    });
  }

  Object.defineProperty(store, 'state', {
    value: reactiveState,
    enumerable: true,
    configurable: true,
    writable: true,
  });

  Object.assign(store, defaultActions);

  // Add getters as computed properties
  if (getters) {
    for (const key in getters) {
      const getter = getters[key];
      if (!getter) continue;
      const getterValue = computed(() => getter.call(store, reactiveState));

      Object.defineProperty(store, key, {
        get: () => getterValue.value,
        enumerable: true,
        configurable: true,
      });
    }
  }

  // Add actions with automatic notification
  if (actions) {
    for (const key in actions) {
      const action = actions[key];
      if (action) {
        (store as Record<string, any>)[key] = (...args: any[]) => {
          const result = action.apply(store, args);
          actionCallbacks.forEach((callback) => callback(reactiveState));
          return result;
        };
      }
    }
  }

  return store;
}
/**
 * Creates store options from a class definition.
 *
 * @template S - The type of the store's state.
 * @param StoreClass - The store class to use.
 * @returns Store options derived from the class.
 */
function createClassStore<S extends State>(
  StoreClass: new () => S,
): StoreOptions<
  S,
  Record<string, (...args: any[]) => any>,
  Record<string, (...args: any[]) => any>
> {
  const instance = new StoreClass();
  const state = Object.create(null);
  const getters: Record<string, (...args: any[]) => any> = {};
  const actions: Record<string, (...args: any[]) => any> = {};

  // Extract instance properties as state
  Object.getOwnPropertyNames(instance).forEach((key) => {
    state[key] = instance[key];
  });

  // Extract prototype methods and getters
  Object.getOwnPropertyNames(StoreClass.prototype).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(StoreClass.prototype, key);
    if (descriptor) {
      if (isFunction(descriptor.get)) {
        getters[key] = function (this: S) {
          return descriptor.get!.call(this);
        };
      } else if (isFunction(descriptor.value) && key !== 'constructor') {
        actions[key] = function (this: S, ...args: any[]) {
          return descriptor.value.apply(this, args);
        };
      }
    }
  });

  return {
    state,
    getters,
    actions,
  };
}

/**
 * Store definition type that can be either a class or an options object.
 */
type StoreDefinition<S extends State, G extends Getters<S>, A extends Actions> =
  | (new () => S)
  | ({
      state: S;
      getters?: G;
      actions?: A;
    } & ThisType<S & GetterValues<G> & A & StoreActions<S>>);

/**
 * Creates a new store with the given definition.
 * The store can be defined either as a class or as an options object.
 *
 * @template S - The type of the store's state.
 * @template G - The type of the store's getters.
 * @template A - The type of the store's actions.
 * @param storeDefinition - The store definition (class or options).
 * @returns A function that creates a new store instance.
 *
 * @example
 * ```ts
 * // Options-based store
 * const useCounter = createStore({
 *   state: { count: 0 },
 *   getters: {
 *     double: state => state.count * 2
 *   },
 *   actions: {
 *     increment() {
 *       this.count++;
 *     }
 *   }
 * });
 *
 * // Class-based store
 * class Counter {
 *   count = 0;
 *
 *   get double() {
 *     return this.count * 2;
 *   }
 *
 *   increment() {
 *     this.count++;
 *   }
 * }
 *
 * const useCounter = createStore(Counter);
 * ```
 */
export function createStore<S extends State, G extends Getters<S>, A extends Actions>(
  storeDefinition: StoreDefinition<S, G, A>,
): () => S & GetterValues<G> & A & StoreActions<S> & { state: S } {
  if (__DEV__ && !storeDefinition) {
    warn('Store definition is required');
    throw new Error('Store definition is required');
  }

  return () => {
    let options: StoreOptions<S, G, A>;

    if (isFunction(storeDefinition)) {
      options = createClassStore(storeDefinition) as StoreOptions<S, G, A>;
    } else {
      options = storeDefinition;
    }

    return createOptionsStore(options) as S & GetterValues<G> & A & StoreActions<S> & { state: S };
  };
}
