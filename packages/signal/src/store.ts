import { isFunction } from "@essor/shared";
import { useComputed, useReactive } from './signal';
import type { Computed } from './signal';

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
  const reactiveState = useReactive(state ?? {}, val => {
    return isFunction(val);
  });

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
      store[key] = useComputed(getter.bind(reactiveState, reactiveState));
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
  [K in keyof S]: S[K] extends (...args: any[]) => any ? Computed<ReturnType<S[K]>> : S[K];
};

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
