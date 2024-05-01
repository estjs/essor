import {
  type Signal,
  type SignalObject,
  signalObject,
  signalToObject,
  useComputed,
  useSignal,
} from './signal';

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
  const { state, getters, actions } = options as StoreOptions<any, any, any>;

  const initState = { ...(state ?? {}) };
  const signalState: SignalObject<S> = signalObject(state ?? {});

  const subscriptions: Callback[] = [];
  const actionCallbacks: Callback[] = [];
  const default_actions: StoreActions = {
    patch$(payload: PatchPayload) {
      Object.assign(signalState, signalObject(payload));
      subscriptions.forEach(callback => callback(signalToObject(signalState)));
      actionCallbacks.forEach(callback => callback(signalToObject(signalState)));
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
      default_actions.patch$(initState);
    },
  };
  const states = {
    _id: `store_${_id}`,
  };
  for (const key in getters) {
    const getter = getters[key];
    if (getter) {
      states[key] = useComputed(() => {
        return getter.call(signalState);
      });
    }
  }

  for (const key in actions) {
    const action = actions[key];
    if (action) {
      states[key] = action.bind(signalState);
    }
  }

  StoreMap.set(_id, useSignal);
  ++_id;

  return new Proxy(
    {},
    {
      get(_, key) {
        if (key === 'state') {
          return signalToObject(signalState);
        }
        if (key in states) {
          return states[key];
        }
        if (key in default_actions) {
          return default_actions[key];
        }
        return signalState[key].value;
      },
    },
  );
}

type Getters<S> = {
  [K in keyof S]: S[K] extends (...args: any[]) => any ? Signal<ReturnType<S[K]>> : Signal<S[K]>;
};

export function createStore<S, G, A>(
  options: {
    state: S;
    getters?: G;
    actions?: A;
  } & ThisType<SignalObject<S> & Getters<G> & A>,
): () => S & Getters<G> & A & StoreActions & { state: S } {
  return function () {
    if (StoreMap.has(_id)) {
      return StoreMap.get(_id)!;
    }

    return createOptionsStore<S, G, A>(options);
  };
}
