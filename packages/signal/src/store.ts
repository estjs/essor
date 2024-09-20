import { useComputed, useReactive } from './signal';

interface StoreOptions<S, G, A> {
  state?: S;
  getters?: G;
  actions?: A;
}
type PatchPayload = Record<string, any>;
type Callback = (value: any) => void;
export interface StoreActions {
  patch$: (payload: PatchPayload) => void;
  subscribe$: (callback: Callback) => void;
  unsubscribe$: (callback: Callback) => void;
  onAction$: (callback: Callback) => void;
  reset$: () => void;
}

let _id = 0;
const StoreMap = new Map<number, any>();

function createOptionsStore<S, G, A>(options: StoreOptions<S, G, A>) {
  const { state, getters, actions } = options as StoreOptions<
    Record<string | symbol, any>,
    Record<string, Function>,
    Record<string, Function>
  >;

  const initState = { ...(state ?? {}) };
  const reactiveState = useReactive(state ?? {});

  const subscriptions: Callback[] = [];
  const actionCallbacks: Callback[] = [];
  const default_actions: StoreActions = {
    patch$(payload: PatchPayload) {
      Object.assign(reactiveState, payload);
      subscriptions.forEach(callback => callback(reactiveState));
      actionCallbacks.forEach(callback => callback(reactiveState));
    },
    subscribe$(callback: Callback) {
      subscriptions.push(callback);
    },
    unsubscribe$(callback: Callback) {
      const index = subscriptions.indexOf(callback);
      if (index !== -1) {
        subscriptions.splice(index, 1);
      }
    },
    onAction$(callback: Callback) {
      actionCallbacks.push(callback);
    },
    reset$() {
      Object.assign(reactiveState, initState);
    },
  };

  const store = {
    state: reactiveState,
    ...default_actions,
  };

  for (const key in getters) {
    const getter = getters[key];
    if (getter) {
      Object.defineProperty(store, key, {
        get() {
          return useComputed(getter.bind(reactiveState, reactiveState)).value;
        },
        enumerable: true,
        configurable: true,
      });
    }
  }

  for (const key in actions) {
    const action = actions[key];
    if (action) {
      store[key] = action.bind(reactiveState);
    }
  }

  StoreMap.set(_id, store);
  ++_id;

  return store;
}

type Getters<S> = {
  [K in keyof S]: S[K] extends (...args: any[]) => any ? ReturnType<S[K]> : S[K];
};

/**
 * Creates a reactive store with the given options.
 *
 * The `createStore` function accepts an options object with the following properties:
 *
 * - `state`: The initial state of the store.
 * - `getters`: An object with functions that compute derived properties from the state.
 * - `actions`: An object with functions that can change the state.
 *
 * The function returns a new store function. Each time the returned function is called,
 * it returns the same store instance. The store instance is an object that contains the
 * current state, getters and actions.
 *
 * @example
 * const useCounterStore = createStore({
 *   state: { count: 0 },
 *   getters: {
 *     doubleCount(state) {
 *       return state.count * 2;
 *     },
 *   },
 *   actions: {
 *     increment() {
 *       this.count++;
 *     },
 *   },
 * });
 *
 * const counterStore = useCounterStore();
 * console.log(counterStore.state.count); // 0
 * counterStore.increment();
 * console.log(counterStore.state.count); // 1
 * console.log(counterStore.doubleCount.value); // 2
 */
export function createStore<S, G, A>(
  options: {
    state: S;
    getters?: G;
    actions?: A;
  } & ThisType<S & Getters<G> & A>,
): () => S & Getters<G> & A & StoreActions & { state: S } {
  return function () {
    if (StoreMap.has(_id)) {
      return StoreMap.get(_id)!;
    }

    return createOptionsStore<S, G, A>(options);
  };
}
