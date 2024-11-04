import { computed, reactive } from './signal';

interface StoreOptions<
  S extends object,
  G extends Record<string, (...args: any[]) => any>,
  A extends Record<string, (...args: any[]) => any>,
> {
  state: S;
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

type Getters<G extends Record<string, (...args: any[]) => any>> = {
  [K in keyof G]: ReturnType<G[K]>;
};

function createOptionsStore<
  S extends object,
  G extends Record<string, (...args: any[]) => any>,
  A extends Record<string, (...args: any[]) => any>,
>(options: StoreOptions<S, G, A>) {
  const { state, getters, actions } = options;

  const initState = { ...state };
  const reactiveState = reactive(state);

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
    ...reactiveState,
    state: reactiveState,
    ...default_actions,
  } as unknown as S & Getters<G> & A & StoreActions & { state: S };

  if (getters) {
    for (const key in getters) {
      const getter = getters[key];
      if (getter) {
        Object.defineProperty(store, key, {
          get() {
            return computed(() => getter.call(store, reactiveState)).value;
          },
          enumerable: true,
          configurable: true,
        });
      }
    }
  }

  if (actions) {
    for (const key in actions) {
      const action = actions[key];
      if (action) {
        (store as any)[key] = function (...args: any[]) {
          const result = action.apply(reactiveState, args);
          actionCallbacks.forEach(callback => callback(reactiveState));
          return result;
        };
      }
    }
  }

  return store;
}

type StoreDefinition<
  T extends object,
  G extends Record<string, (...args: any[]) => any>,
  A extends Record<string, (...args: any[]) => any>,
> =
  | (new () => T)
  | ({
      state: T;
      getters?: G;
      actions?: A;
    } & ThisType<T & Getters<G> & A & StoreActions>);

export function createStore<
  T extends object,
  G extends Record<string, (...args: any[]) => any>,
  A extends Record<string, (...args: any[]) => any>,
>(
  storeDefinition: StoreDefinition<T, G, A>,
): () => T & Getters<G> & A & StoreActions & { state: T } {
  return function () {
    let options: StoreOptions<T, G, A>;

    if (typeof storeDefinition === 'function') {
      options = createClassStore(storeDefinition) as StoreOptions<T, G, A>;
    } else {
      options = storeDefinition;
    }

    const store = createOptionsStore(options);

    // For class-based stores, we need to bind methods to the store
    if (typeof storeDefinition === 'function') {
      Object.keys(options.actions || {}).forEach(key => {
        (store as any)[key] = (options.actions as any)[key].bind(store);
      });
    }

    return store;
  };
}

function createClassStore<T extends object>(
  StoreClass: new () => T,
): StoreOptions<
  T,
  Record<string, (...args: any[]) => any>,
  Record<string, (...args: any[]) => any>
> {
  const instance = new StoreClass();
  const state = Object.create(null);
  const getters: Record<string, (...args: any[]) => any> = {};
  const actions: Record<string, (...args: any[]) => any> = {};

  Object.getOwnPropertyNames(instance).forEach(key => {
    state[key] = instance[key];
  });

  Object.getOwnPropertyNames(StoreClass.prototype).forEach(key => {
    const descriptor = Object.getOwnPropertyDescriptor(StoreClass.prototype, key);
    if (descriptor) {
      if (typeof descriptor.get === 'function') {
        getters[key] = function (this: T) {
          return descriptor.get!.call(this);
        };
      } else if (typeof descriptor.value === 'function' && key !== 'constructor') {
        actions[key] = function (this: T, ...args: any[]) {
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
