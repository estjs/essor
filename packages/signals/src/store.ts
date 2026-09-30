import { hasOwn, isFunction, isPlainObject, isPromise } from '@estjs/shared';
import { computed } from './computed';
import { type Reactive, reactive, toRaw } from './reactive';
import { effectScope, getCurrentScope, onScopeDispose } from './effectScope';
import { watch } from './watch';
import { batch } from './graph';

// ============================================================================
// Type Definitions
// ============================================================================

/** State must be a plain object with string keys. */
export type State = Record<string, any>;

/** Getter functions that derive values from state. */
export type Getters<S extends State> = Record<string, (state: S) => any>;

/** Action functions that can mutate state. */
export type Actions = Record<string, (...args: any[]) => any>;

/** Extract only function properties from an object type. */
type ActionMethods<A extends object> = {
  [K in keyof A]: A[K] extends (...args: any[]) => any ? A[K] : never;
};

/** Preserve all properties including functions. */
type ActionDefinitions<A extends object> = {
  [K in keyof A]: A[K];
};

/** Extract computed values from getter definitions. */
export type GetterValues<G extends object> = {
  readonly [K in keyof G]: G[K] extends (...args: any[]) => infer T ? T : never;
};

/** Type for getter definitions mapping to value types. */
type GetterDefinitions<S extends object, V extends object> = {
  [K in keyof V]: (state: S) => V[K];
};

// ============================================================================
// Class-based Store Type Inference
// ============================================================================

/** Extract state properties (non-function, non-getter instance properties). */
type ExtractState<T> = {
  [K in keyof T as T[K] extends (...args: any[]) => any ? never : K]: T[K];
};

/** Extract getter properties (prototype getters). */
type ExtractGetters<T> = {
  [K in keyof T as T[K] extends (...args: any[]) => any ? never : K]: T[K];
};

/** Extract action methods (prototype methods). */
type ExtractActions<T> = {
  [K in keyof T as T[K] extends (...args: any[]) => any ? K : never]: T[K];
};

/** Infer complete store type from a class constructor. */
type InferStoreFromClass<T extends new () => any> = T extends new () => infer Instance
  ? StoreInstance<ExtractState<Instance>, ExtractGetters<Instance>, ExtractActions<Instance>>
  : never;

type PatchFunction = (...args: any[]) => any;

type AtomicPatchValue =
  | readonly unknown[]
  | Map<unknown, unknown>
  | Set<unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>
  | Date
  | RegExp
  | Error
  | PromiseLike<unknown>
  | ArrayBuffer
  | ArrayBufferView
  | PatchFunction;

type FunctionKeys<T extends object> = {
  [K in keyof T]-?: T[K] extends PatchFunction ? K : never;
}[keyof T];

export type PatchPayload<T> = T extends AtomicPatchValue
  ? T
  : T extends object
    ? FunctionKeys<T> extends never
      ? { [K in keyof T]?: PatchPayload<T[K]> }
      : T
    : T;

export type StoreMutation<S extends object> =
  | { readonly type: 'direct' }
  | { readonly type: 'patch object'; readonly payload: PatchPayload<S> }
  | { readonly type: 'patch function' }
  | { readonly type: 'reset' };

/** Options controlling how a store subscription is attached to an effect scope. */
export interface StoreSubscribeOptions {
  /** Keep the subscription alive when the current scope is disposed. */
  detached?: boolean;
}

/** Receive a store mutation descriptor and the current reactive state. */
export type StoreCallback<S extends object> = (
  mutation: StoreMutation<S>,
  state: Reactive<S>,
) => void;

/** Context supplied to action lifecycle listeners. */
export interface ActionListenerContext<TStore = unknown> {
  readonly name: string;
  readonly store: TStore;
  readonly args: readonly unknown[];
  after(callback: (result: unknown) => void): void;
  onError(callback: (error: unknown) => void): void;
}

/** Observe action invocation and register invocation-scoped lifecycle hooks. */
export type ActionCallback<TStore = unknown> = (context: ActionListenerContext<TStore>) => void;

/** Declarative state, getter, and action definitions used to create a store. */
export interface StoreOptions<S extends object, G extends object, A extends object> {
  state: () => S;
  getters?: G & {
    [K in keyof G]: G[K] extends (...args: any[]) => infer T ? (state: S) => T : never;
  } & ThisType<void>;
  actions?: A & ActionMethods<A> & ThisType<Store<S, G, A>>;
}

export interface StoreBuiltins<S extends object, TStore> {
  readonly $state: S;
  $patch(payload: PatchPayload<S> | ((state: S) => void)): void;
  $reset(): void;
  $subscribe(callback: StoreCallback<S>, options?: StoreSubscribeOptions): () => void;
  $onAction(callback: ActionCallback<TStore>, options?: StoreSubscribeOptions): () => void;
  $dispose(): void;
}

type StoreInstance<S extends object, V extends object, A extends object> = S &
  Readonly<V> &
  ActionMethods<A> &
  StoreBuiltins<S, StoreInstance<S, V, A>>;

type ActionThis<S extends object, V extends object, A extends object> = S &
  Readonly<V> &
  ActionDefinitions<A> &
  StoreBuiltins<S, S & Readonly<V> & ActionDefinitions<A>>;

export type Store<S extends object, G extends object, A extends object> = StoreInstance<
  S,
  GetterValues<G>,
  A
>;

interface InferredStoreOptions<S extends object, V extends object, A extends object> {
  state: () => S;
  getters?: GetterDefinitions<S, V> & ThisType<void>;
  actions?: ActionDefinitions<A> & ThisType<ActionThis<NoInfer<S>, NoInfer<V>, A>>;
}

interface SubscriberEntry<S extends object> {
  callback?: StoreCallback<S>;
  release(): void;
}

interface ActionEntry<TStore> {
  callback?: ActionCallback<TStore>;
  release(): void;
}

interface Failure {
  readonly failed: boolean;
  readonly value: unknown;
}

// ============================================================================
// Constants
// ============================================================================

const NO_FAILURE: Failure = { failed: false, value: undefined };
const DIRECT_MUTATION = { type: 'direct' } as const;
const BUILTIN_NAMES = new Set([
  '$dispose',
  '$onAction',
  '$patch',
  '$reset',
  '$state',
  '$subscribe',
]);
const objectToString = Object.prototype.toString;

// ============================================================================
// Public API
// ============================================================================

/**
 * Creates a factory for independent reactive store instances.
 *
 * Inspired by Pinia's design:
 * - State is a reactive proxy (single source of truth)
 * - Getters are computed properties (cached, auto-track dependencies)
 * - Actions are methods with `this` bound to the store
 * - All side effects managed in one effectScope for clean disposal
 *
 * @param options - State factory, computed getters, and action definitions.
 * @returns A hook function that returns a new reactive store instance.
 *
 * @example
 * const useCounter = createStore({
 *   state: () => ({ count: 0 }),
 *   getters: {
 *     doubled: (state) => state.count * 2
 *   },
 *   actions: {
 *     increment() { this.count++ }
 *   }
 * });
 *
 * const store = useCounter();
 * store.increment();
 * console.log(store.doubled); // 2
 */
/**
 * Create a store factory from options object with full type inference.
 */
export function createStore<S extends object, V extends object = {}, A extends object = {}>(
  options: InferredStoreOptions<S, V, A>,
): () => StoreInstance<S, V, A>;

/**
 * Create a store factory from a class with proper type inference.
 */
export function createStore<T extends new () => any>(StoreClass: T): () => InferStoreFromClass<T>;

/**
 * Implementation - handles both options and class-based definitions.
 */
export function createStore(optionsOrClass: any): () => Store<any, any, any> {
  if (!optionsOrClass) {
    throw new TypeError('Store definition is required');
  }

  // Class-based store
  if (typeof optionsOrClass === 'function') {
    const options = classToStoreOptions(optionsOrClass);
    return () => createStoreInstance(options);
  }

  // Options-based store
  if (typeof optionsOrClass.state !== 'function') {
    throw new TypeError('Store state must be a function');
  }
  return () => createStoreInstance(optionsOrClass);
}

/**
 * Transform a class definition into store options.
 *
 * Extracts:
 * - Instance properties → state
 * - Prototype getters → computed getters
 * - Prototype methods → actions
 *
 * @param StoreClass - The class constructor
 * @returns Store options compatible with createStoreInstance
 * @internal
 */
function classToStoreOptions<T extends new () => any>(StoreClass: T): StoreOptions<any, any, any> {
  const extractedState: Record<string, any> = {};
  const getters: Record<string, (state: any) => any> = {};
  const actions: Record<string, (...args: any[]) => any> = {};

  // Instantiate to extract initial state values
  const instance = new StoreClass();

  // Extract instance properties (state)
  const instanceKeys = Object.getOwnPropertyNames(instance);
  for (const key of instanceKeys) {
    extractedState[key] = (instance as any)[key];
  }

  // Extract prototype getters and methods
  const proto = Object.getPrototypeOf(instance);
  const protoKeys = Object.getOwnPropertyNames(proto);

  for (const key of protoKeys) {
    if (key === 'constructor') continue;

    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (!descriptor) continue;

    // Getter accessor → computed getter
    if (descriptor.get) {
      const getter = descriptor.get;
      getters[key] = (state: any) => getter.call(state);
    }
    // Method → action
    else if (typeof descriptor.value === 'function') {
      actions[key] = descriptor.value;
    }
  }

  return {
    state: () => ({ ...extractedState }),
    getters: Object.keys(getters).length > 0 ? getters : undefined,
    actions: Object.keys(actions).length > 0 ? actions : undefined,
  };
}

// ============================================================================
// Store Instance Creation
// ============================================================================

/**
 * Build one reactive store instance from validated options.
 *
 * Architecture (following Pinia):
 * 1. Create reactive state (single source of truth)
 * 2. Setup computed getters (auto-track state dependencies)
 * 3. Bind actions to store context
 * 4. Expose utility methods ($patch, $reset, etc.)
 * 5. Manage all effects in one effectScope
 */
function createStoreInstance<S extends object, G extends object, A extends object>(
  options: StoreOptions<S, G, A>,
): Store<S, G, A> {
  // ----------------------------------------
  // 1. Initialize reactive state
  // ---------------------------------------

  const initialState = options.state();
  assertState(initialState);

  // This is the single source of truth - all getters read from this
  const state = reactive(initialState);

  const getters = options.getters ?? ({} as G);
  const actions = options.actions ?? ({} as A);
  const stateKeys = enumerableKeys(initialState);
  const getterKeys = enumerableKeys(getters);
  const actionKeys = enumerableKeys(actions);

  // Validate all names are unique and not reserved
  validateNames(stateKeys, getterKeys, actionKeys);
  validateFunctions(getters, getterKeys, 'getter');
  validateFunctions(actions, actionKeys, 'action');

  // ----------------------------------------
  // 2. Setup store object
  // ----------------------------------------
  const target = {} as any;
  const store = target as Store<S, G, A>;
  let flattenedStateKeys = new Set<PropertyKey>();

  // Single scope for all store effects (Pinia pattern)
  const storeScope = effectScope(true);

  // Subscription management
  const subscribers = new Set<SubscriberEntry<S>>();
  const actionListeners = new Set<ActionEntry<Store<S, G, A>>>();
  let pendingMutation: StoreMutation<S> | undefined;
  let stopWatch: (() => void) | undefined;
  let disposed = false;

  // 3. Helper functions
  // ----------------------------------------

  /**
   * Guard: Ensure store is still active (not disposed).
   * @throws {Error} If store has been disposed
   */
  const assertActive = (): void => {
    if (disposed) throw new Error('Store has been disposed');
  };

  /**
   * Notify all subscribers about a state change.
   * Takes a snapshot to handle concurrent modifications safely.
   * Collects errors and throws the first one after all callbacks complete.
   */
  const dispatchSubscribers = (): void => {
    const mutation = pendingMutation ?? DIRECT_MUTATION;
    pendingMutation = undefined;

    // Take a snapshot to avoid issues with concurrent modifications
    const snapshot: StoreCallback<S>[] = [];
    for (const entry of subscribers) {
      if (entry.callback) snapshot.push(entry.callback);
    }

    let failed = false;
    let firstError: unknown;
    for (const callback of snapshot) {
      try {
        callback(mutation, state);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
    if (failed) throw firstError;
  };

  /**
   * Start watching state changes (lazy initialization).
   */
  const ensureWatch = (): void => {
    if (stopWatch) return;
    // watch() links its WatcherEffect to the active scope before the first run.
    // Run it in a child scope so a failed initial traversal can be fully rolled back.
    const watchScope = storeScope.run(() => effectScope())!;
    try {
      watchScope.run(() => watch(state, dispatchSubscribers));
    } catch (error) {
      watchScope.stop();
      throw error;
    }
    stopWatch = () => watchScope.stop();
  };

  /**
   * Stop watching when no subscribers remain.
   */
  const stopSharedWatch = (): void => {
    if (subscribers.size || !stopWatch) return;
    const stop = stopWatch;
    stopWatch = undefined;
    stop();
    pendingMutation = undefined;
  };

  /**
   * Synchronize state properties on the store object.
   * Creates getters/setters that proxy to the reactive state.
   */
  const syncStateProperties = (keys: PropertyKey[]): void => {
    const nextKeys = new Set(keys);

    // Remove old keys
    for (const key of flattenedStateKeys) {
      if (!nextKeys.has(key)) Reflect.deleteProperty(target, key);
    }

    // Add new keys
    for (const key of keys) {
      if (flattenedStateKeys.has(key)) continue;
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: true,
        get: () => Reflect.get(state, key),
        set: (value) => Reflect.set(state, key, value),
      });
    }

    flattenedStateKeys = nextKeys;
  };

  /**
   * Execute a state mutation within a batch, tracking mutation metadata.
   * Ensures subscribers receive the correct mutation type descriptor.
   */
  const withMutation = <T>(mutation: StoreMutation<S>, fn: () => T): T => {
    const activeWatch = stopWatch;
    const shouldTag = !!activeWatch && subscribers.size > 0 && pendingMutation === undefined;
    if (shouldTag) pendingMutation = mutation;
    try {
      return batch(fn);
    } finally {
      if (shouldTag && pendingMutation === mutation) {
        pendingMutation = undefined;
      }
      if (!stopWatch || subscribers.size === 0) pendingMutation = undefined;
    }
  };

  // ----------------------------------------
  // 4. Public API Methods
  // ----------------------------------------

  /**
   * Apply partial state updates.
   * Supports both object patches and mutator functions (Pinia API).
   */
  const patch = (payloadOrMutator: PatchPayload<S> | ((state: S) => void)): void => {
    assertActive();
    if (isFunction(payloadOrMutator)) {
      withMutation({ type: 'patch function' }, () => payloadOrMutator(state as S));
      return;
    }
    if (!isPlainObject(payloadOrMutator)) {
      throw new TypeError('Store patch must be a plain object or function');
    }
    withMutation({ type: 'patch object', payload: payloadOrMutator }, () =>
      mergePatch(state, payloadOrMutator),
    );
  };

  /**
   * Reset state to initial values.
   * Creates a fresh state object from the factory.
   */
  const reset = (): void => {
    assertActive();
    const nextState = options.state();
    assertState(nextState);
    const nextStateKeys = enumerableKeys(nextState);
    validateNames(nextStateKeys, getterKeys, actionKeys);

    withMutation({ type: 'reset' }, () => {
      syncStateProperties(nextStateKeys);

      // Remove deleted keys
      for (const key of enumerableKeys(state)) {
        if (!hasOwn(nextState, key)) Reflect.deleteProperty(state, key);
      }

      // Set new values
      for (const key of enumerableKeys(nextState)) {
        Reflect.set(state, key, Reflect.get(nextState, key));
      }
    });
  };

  /**
   * Subscribe to state mutations (Pinia API).
   */
  const subscribe = (
    callback: StoreCallback<S>,
    subscribeOptions: StoreSubscribeOptions = {},
  ): (() => void) => {
    assertActive();
    const entry = {} as SubscriberEntry<S>;
    let owner: Set<SubscriberEntry<S>> | undefined = subscribers;
    entry.callback = callback;
    entry.release = () => {
      owner = undefined;
      entry.callback = undefined;
    };
    subscribers.add(entry);

    try {
      ensureWatch();
    } catch (error) {
      subscribers.delete(entry);
      entry.release();
      throw error;
    }

    const unsubscribe = (): void => {
      const current = owner;
      if (!current) return;
      current.delete(entry);
      entry.release();
      stopSharedWatch();
    };

    bindToCurrentScope(unsubscribe, subscribeOptions.detached);
    return unsubscribe;
  };

  /**
   * Subscribe to action calls (Pinia API).
   */
  const onAction = (
    callback: ActionCallback<Store<S, G, A>>,
    subscribeOptions: StoreSubscribeOptions = {},
  ): (() => void) => {
    assertActive();
    const entry = {} as ActionEntry<Store<S, G, A>>;
    let owner: Set<ActionEntry<Store<S, G, A>>> | undefined = actionListeners;
    entry.callback = callback;
    entry.release = () => {
      owner = undefined;
      entry.callback = undefined;
    };
    actionListeners.add(entry);

    const unsubscribe = (): void => {
      const current = owner;
      if (!current) return;
      current.delete(entry);
      entry.release();
    };

    bindToCurrentScope(unsubscribe, subscribeOptions.detached);
    return unsubscribe;
  };

  /**
   * Execute an action with lifecycle hooks.
   * Handles both sync and async actions.
   */
  const runAction = (name: string, action: (...args: any[]) => any, args: unknown[]): unknown => {
    assertActive();

    // Fast path: no listeners
    if (actionListeners.size === 0) {
      let result: unknown;
      try {
        // Assign inside the batch so the result survives a subscriber error thrown by the flush
        batch(() => (result = Reflect.apply(action, store, args)));
      } catch (error) {
        observeDetachedAction(result);
        throw error;
      }
      observeDetachedAction(result);
      return result;
    }

    // Slow path: notify listeners
    const afterHooks: Array<(result: unknown) => void> = [];
    const errorHooks: Array<(error: unknown) => void> = [];
    const context: ActionListenerContext<Store<S, G, A>> = {
      name,
      store,
      args,
      after: (hook) => afterHooks.push(hook),
      onError: (hook) => errorHooks.push(hook),
    };

    // Call before listeners
    let beforeFailed = false;
    let beforeError: unknown;
    const listeners: ActionCallback<Store<S, G, A>>[] = [];
    for (const entry of actionListeners) {
      if (entry.callback) listeners.push(entry.callback);
    }
    for (const listener of listeners) {
      try {
        listener(context);
      } catch (error) {
        if (!beforeFailed) {
          beforeFailed = true;
          beforeError = error;
        }
      }
    }
    if (beforeFailed) {
      runHooks(errorHooks, beforeError);
      throw beforeError;
    }

    // Execute action
    let result: unknown;
    try {
      // Assign inside the batch so the result survives a subscriber error thrown by the flush
      batch(() => (result = Reflect.apply(action, store, args)));
    } catch (error) {
      if (!observeActionOutcome(result, afterHooks, errorHooks)) {
        runHooks(errorHooks, error);
      }
      throw error;
    }

    // Handle async results
    let promiseLike = false;
    try {
      promiseLike = isPromise(result);
    } catch (error) {
      runHooks(errorHooks, error);
      throw error;
    }

    if (promiseLike) {
      return Promise.resolve(result).then(
        (value) => {
          const failure = runHooks(afterHooks, value);
          if (failure.failed) throw failure.value;
          return value;
        },
        (error) => {
          runHooks(errorHooks, error);
          throw error;
        },
      );
    }

    // Handle sync results
    const failure = runHooks(afterHooks, result);
    if (failure.failed) throw failure.value;
    return result;
  };

  /**
   * Dispose the store and clean up all effects.
   * Following Pinia's disposal pattern.
   */
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    let failed = false;
    let firstError: unknown;

    if (stopWatch) {
      const stop = stopWatch;
      stopWatch = undefined;
      try {
        stop();
      } catch (error) {
        failed = true;
        firstError = error;
      }
    }

    for (const entry of subscribers) entry.release();
    subscribers.clear();
    for (const entry of actionListeners) entry.release();
    actionListeners.clear();
    pendingMutation = undefined;

    try {
      storeScope.stop();
    } catch (error) {
      if (!failed) {
        failed = true;
        firstError = error;
      }
    }

    if (failed) throw firstError;
  };

  // ----------------------------------------
  // 5. Build the store object
  // ----------------------------------------

  // Flatten state properties onto store
  syncStateProperties(stateKeys);

  // Setup computed getters
  // CRITICAL: Each getter must be a computed that reads from the reactive state
  for (const key of getterKeys) {
    const getterFn = Reflect.get(getters, key) as (state: S) => unknown;

    // Create computed within the store scope
    const computedValue = storeScope.run(() =>
      computed(() => {
        assertActive();
        // The getter receives the reactive state
        // Any property access will be tracked by the computed
        return getterFn(state as S);
      }),
    )!;

    // Expose as read-only property
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: true,
      get: () => {
        assertActive();
        return computedValue.value;
      },
    });
  }

  // Setup action methods
  for (const key of actionKeys) {
    const actionFn = Reflect.get(actions, key) as (...args: any[]) => any;
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: true,
      value: (...args: unknown[]) => runAction(String(key), actionFn, args),
    });
  }

  // Setup built-in methods
  Object.defineProperties(target, {
    $dispose: { value: dispose },
    $onAction: { value: onAction },
    $patch: { value: patch },
    $reset: { value: reset },
    $state: {
      get: () => {
        assertActive();
        return state;
      },
    },
    $subscribe: { value: subscribe },
  });

  return store;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Run a list of hooks and capture the first error.
 */
function runHooks<T>(hooks: Array<(value: T) => void>, value: T): Failure {
  let failed = false;
  let firstError: unknown;
  for (const hook of [...hooks]) {
    try {
      hook(value);
    } catch (error) {
      if (!failed) {
        failed = true;
        firstError = error;
      }
    }
  }
  hooks.length = 0;
  return failed ? { failed: true, value: firstError } : NO_FAILURE;
}

/**
 * Bind cleanup to current effect scope.
 */
function bindToCurrentScope(dispose: () => void, detached?: boolean): void {
  if (detached) return;
  const scope = getCurrentScope();
  if (!scope) return;
  if (scope.active) onScopeDispose(dispose);
  else dispose();
}

/**
 * Observe Promise-like action results for error reporting.
 */
function observeActionOutcome(
  result: unknown,
  afterHooks: Array<(result: unknown) => void>,
  errorHooks: Array<(error: unknown) => void>,
): boolean {
  try {
    if (!isPromise(result)) return false;
  } catch (error) {
    if (__DEV__) console.error('[Essor signals] additional action error', error);
    return false;
  }

  void Promise.resolve(result).then(
    (value) => {
      const failure = runHooks(afterHooks, value);
      if (failure.failed) {
        if (__DEV__) console.error('[Essor signals] additional action error', failure.value);
      }
    },
    (error) => {
      const failure = runHooks(errorHooks, error);
      if (failure.failed) {
        if (__DEV__) console.error('[Essor signals] additional action error', failure.value);
      }
    },
  );
  return true;
}

/**
 * Observe detached action results for unhandled rejections.
 */
function observeDetachedAction(result: unknown): void {
  try {
    if (!isPromise(result)) return;
  } catch (error) {
    if (__DEV__) console.error('[Essor signals] additional action error', error);
    return;
  }
  void Promise.resolve(result).catch((error) => {
    if (__DEV__) console.error('[Essor signals] additional action error', error);
  });
}

/**
 * Deep merge patch into target.
 * Handles plain objects, Maps, and Sets specially.
 */
function mergePatch(target: any, patch: any): void {
  for (const key of enumerableKeys(patch)) {
    const current = Reflect.get(target, key);
    const value = Reflect.get(patch, key);

    if (isPlainObject(current) && isPlainObject(value)) {
      mergePatch(current, value);
      continue;
    }

    const currentTag = objectToString.call(toRaw(current));
    const valueTag = objectToString.call(toRaw(value));

    if (currentTag === '[object Map]' && valueTag === '[object Map]') {
      for (const [entryKey, entryValue] of value) current.set(entryKey, entryValue);
    } else if (currentTag === '[object Set]' && valueTag === '[object Set]') {
      for (const entry of value) current.add(entry);
    } else {
      Reflect.set(target, key, value);
    }
  }
}

/**
 * Validate that names don't conflict with built-ins or each other.
 */
function validateNames(
  stateKeys: PropertyKey[],
  getterKeys: PropertyKey[],
  actionKeys: PropertyKey[],
): void {
  const names = new Set<PropertyKey>(BUILTIN_NAMES);
  for (const key of [...stateKeys, ...getterKeys, ...actionKeys]) {
    if (typeof key === 'string' && key.startsWith('$')) {
      throw new TypeError('Store property names cannot start with $');
    }
    if (names.has(key)) throw new TypeError(`Duplicate store property: ${String(key)}`);
    names.add(key);
  }
}

/**
 * Validate that all getters/actions are functions.
 */
function validateFunctions(values: object, keys: PropertyKey[], kind: 'action' | 'getter'): void {
  for (const key of keys) {
    if (!isFunction(Reflect.get(values, key))) {
      throw new TypeError(`Store ${kind} ${String(key)} must be a function`);
    }
  }
}

/**
 * Assert value is a plain object.
 */
function assertState(value: unknown): asserts value is State {
  if (!isPlainObject(value)) {
    throw new TypeError('Store state factory must return a plain object');
  }
}

/**
 * Get enumerable keys including symbols.
 */
function enumerableKeys(value: object): PropertyKey[] {
  return Reflect.ownKeys(value).filter((key) => {
    return Reflect.getOwnPropertyDescriptor(value, key)?.enumerable === true;
  });
}
