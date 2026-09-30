import { describe, expect, it, vi } from 'vitest';
import { createStore, effect, effectScope } from '../src';
import { onWatcherCleanup } from '../src/watch';

it('creates independent stores with flattened state, computed getters, and batched actions', () => {
  let stateCalls = 0;
  const useCounter = createStore({
    state: () => {
      stateCalls++;
      return { count: 0 };
    },
    getters: {
      doubled: (state) => state.count * 2,
    },
    actions: {
      addTwice(value: number) {
        this.count += value;
        this.count += value;
        return this.count;
      },
    },
  });
  const first = useCounter();
  const second = useCounter();
  const seen: number[] = [];
  const stop = effect(() => seen.push(first.doubled));

  expect(first.addTwice(2)).toBe(4);
  expect(first.count).toBe(4);
  expect(first.doubled).toBe(8);
  expect(second.count).toBe(0);
  expect(seen).toEqual([0, 8]);
  expect(stateCalls).toBe(2);
  stop();
});

it('patches and resets stable state with precise mutation metadata', () => {
  let resetVersion = 0;
  const useStore = createStore({
    state: () => ({
      nested: { count: resetVersion++ },
      map: new Map([['a', 1]]),
      set: new Set([1]),
      list: [1],
    }),
  });
  const store = useStore();
  const state = store.$state;
  const mutations: Array<{ type: string; payload?: unknown }> = [];
  const unsubscribe = store.$subscribe((mutation, current) => {
    expect(current).toBe(state);
    mutations.push(mutation);
  });

  store.$patch({
    nested: { count: 2 },
    map: new Map([['b', 2]]),
    set: new Set([2]),
    list: [2, 3],
  });
  expect(store.nested.count).toBe(2);
  expect([...store.map]).toEqual([
    ['a', 1],
    ['b', 2],
  ]);
  expect([...store.set]).toEqual([1, 2]);
  expect(store.list).toEqual([2, 3]);
  expect(mutations[0]).toMatchObject({ type: 'patch object' });

  store.$patch((current) => {
    current.nested.count = 3;
    current.list.push(4);
  });
  expect(mutations[1]).toEqual({ type: 'patch function' });

  const alias = store.nested;
  alias.count = 4;
  expect(mutations[2]).toEqual({ type: 'direct' });

  const extendedState = store.$state as typeof store.$state & {
    extra?: number;
  };
  extendedState.extra = 1;
  store.$reset();
  expect(store.$state).toBe(state);
  expect(store.nested.count).toBe(1);
  expect('extra' in store.$state).toBe(false);
  expect(mutations.at(-1)).toEqual({ type: 'reset' });
  unsubscribe();
});

it('keeps flattened state properties aligned with a reset state shape', () => {
  let alternate = false;
  const useStore = createStore({
    state: (): { first?: number; second?: number } => (alternate ? { second: 2 } : { first: 1 }),
  });
  const store = useStore();

  expect(store.first).toBe(1);
  expect('second' in store).toBe(false);

  alternate = true;
  store.$reset();

  expect('first' in store).toBe(false);
  expect(store.second).toBe(2);
  expect('second' in store).toBe(true);
});

it('preserves explicit mutation metadata across reentrant subscribers', () => {
  const useStore = createStore({ state: () => ({ count: 0 }) });
  const store = useStore();
  const mutations: string[] = [];
  let reset = false;
  const stop = store.$subscribe((mutation) => {
    mutations.push(mutation.type);
    if (!reset) {
      reset = true;
      store.$reset();
    }
  });

  store.$patch({ count: 1 });

  expect(mutations).toEqual(['patch object', 'reset']);
  stop();
});

it('keeps the outer metadata for synchronously nested patches', () => {
  const useStore = createStore({ state: () => ({ count: 0 }) });
  const store = useStore();
  const mutations: string[] = [];
  const stop = store.$subscribe((mutation) => mutations.push(mutation.type));

  store.$patch(() => {
    store.$patch({ count: 1 });
  });

  expect(mutations).toEqual(['patch function']);
  stop();
});

it('does not notify for empty or same-value patches', () => {
  const useStore = createStore({
    state: () => ({ count: 0, nested: { value: 1 } }),
  });
  const store = useStore();
  const subscriber = vi.fn();
  const stop = store.$subscribe(subscriber);

  store.$patch({});
  store.$patch({ count: 0, nested: { value: 1 } });
  store.$patch(() => {});

  expect(subscriber).not.toHaveBeenCalled();
  stop();
});

it('rolls back the first subscriber when deep watch initialization fails', () => {
  const traversalError = new Error('traversal failed');
  let shouldThrow = true;
  const useStore = createStore({
    state: () => ({
      count: 0,
      get unstable() {
        if (shouldThrow) throw traversalError;
        return 1;
      },
    }),
  });
  const store = useStore();
  const abandoned = vi.fn();

  expect(() => store.$subscribe(abandoned)).toThrow(traversalError);

  shouldThrow = false;
  const active = vi.fn();
  const stop = store.$subscribe(active);
  store.count++;

  expect(abandoned).not.toHaveBeenCalled();
  expect(active).toHaveBeenCalledOnce();
  stop();
});

it('uses stable callback snapshots when listeners remove siblings', () => {
  const useStore = createStore({
    state: () => ({ count: 0 }),
    actions: {
      increment() {
        this.count++;
      },
    },
  });
  const store = useStore();
  const stateOrder: string[] = [];
  const actionOrder: string[] = [];
  let stopSecondState!: () => void;
  let stopSecondAction!: () => void;
  const stopFirstState = store.$subscribe(() => {
    stateOrder.push('first');
    stopSecondState();
  });
  stopSecondState = store.$subscribe(() => stateOrder.push('second'));
  const stopFirstAction = store.$onAction(() => {
    actionOrder.push('first');
    stopSecondAction();
  });
  stopSecondAction = store.$onAction(() => actionOrder.push('second'));

  store.increment();
  expect(stateOrder).toEqual(['first', 'second']);
  expect(actionOrder).toEqual(['first', 'second']);

  store.increment();
  expect(stateOrder).toEqual(['first', 'second', 'first']);
  expect(actionOrder).toEqual(['first', 'second', 'first']);
  stopFirstState();
  stopFirstAction();
});

it('runs action listeners and outcome hooks for sync and async actions', async () => {
  const actionError = { action: 'failed' };
  const useStore = createStore({
    state: () => ({ count: 0 }),
    actions: {
      add(value: number) {
        this.count += value;
        return this.count;
      },
      fail() {
        throw actionError;
      },
      async addAsync(value: number) {
        this.count += value;
        await Promise.resolve();
        this.count += value;
        return this.count;
      },
    },
  });
  const store = useStore();
  const order: string[] = [];
  const unsubscribe = store.$onAction(({ name, args, store: current, after, onError }) => {
    expect(current).toBe(store);
    order.push(`before:${name}:${String(args[0] ?? '')}`);
    after((result) => order.push(`after:${name}:${String(result)}`));
    onError((error) => order.push(`error:${name}:${error === actionError}`));
  });

  expect(store.add(1)).toBe(1);
  await expect(store.addAsync(2)).resolves.toBe(5);
  expect(() => store.fail()).toThrow(actionError);
  expect(order).toEqual([
    'before:add:1',
    'after:add:1',
    'before:addAsync:2',
    'after:addAsync:5',
    'before:fail:',
    'error:fail:true',
  ]);
  unsubscribe();
});

it('skips an action after a before-listener error but still drains listeners and error hooks', () => {
  const listenerError = { listener: 'failed' };
  const body = vi.fn();
  const useStore = createStore({
    state: () => ({ count: 0 }),
    actions: {
      run() {
        body();
      },
    },
  });
  const store = useStore();
  const order: string[] = [];
  store.$onAction(({ onError }) => {
    order.push('first');
    onError((error) => order.push(`error:${error === listenerError}`));
    throw listenerError;
  });
  store.$onAction(() => order.push('second'));

  expect(() => store.run()).toThrow(listenerError);
  expect(body).not.toHaveBeenCalled();
  expect(order).toEqual(['first', 'second', 'error:true']);
});

it('routes a throwing then accessor through action error hooks', () => {
  const thenError = new Error('then accessor failed');
  const useStore = createStore({
    state: () => ({ count: 0 }),
    actions: {
      invalidThenable() {
        return Object.defineProperty({}, 'then', {
          get() {
            throw thenError;
          },
        }) as PromiseLike<never>;
      },
    },
  });
  const store = useStore();
  const errorHook = vi.fn();
  store.$onAction(({ onError }) => onError(errorHook));

  expect(() => store.invalidThenable()).toThrow(thenError);
  expect(errorHook).toHaveBeenCalledExactlyOnceWith(thenError);
});

it('observes an async action after a synchronous subscriber failure', async () => {
  const subscriberError = new Error('subscriber failed');
  const actionError = new Error('action failed');
  const rejected = Promise.reject(actionError);
  rejected.catch(() => {});
  const useStore = createStore({
    state: () => ({ count: 0 }),
    actions: {
      failAfterWrite() {
        this.count++;
        return rejected;
      },
    },
  });
  const store = useStore();
  const errorHook = vi.fn();
  store.$subscribe(() => {
    throw subscriberError;
  });
  store.$onAction(({ onError }) => onError(errorHook));

  expect(() => store.failAfterWrite()).toThrow(subscriberError);
  await Promise.resolve();
  await Promise.resolve();

  expect(errorHook).toHaveBeenCalledExactlyOnceWith(actionError);
});

it('binds subscriptions to the current scope unless detached', () => {
  const useStore = createStore({
    state: () => ({ count: 0 }),
    actions: {
      increment() {
        this.count++;
      },
    },
  });
  const store = useStore();
  const scopedState = vi.fn();
  const detachedState = vi.fn();
  const scopedAction = vi.fn();
  const scope = effectScope();
  let stopDetached!: () => void;
  scope.run(() => {
    store.$subscribe(scopedState);
    stopDetached = store.$subscribe(detachedState, { detached: true });
    store.$onAction(scopedAction);
  });

  scope.stop();
  store.increment();

  expect(scopedState).not.toHaveBeenCalled();
  expect(scopedAction).not.toHaveBeenCalled();
  expect(detachedState).toHaveBeenCalledOnce();
  stopDetached();
});

it('does not leave subscriptions alive in a scope stopped during run', () => {
  const useStore = createStore({
    state: () => ({ count: 0 }),
    actions: {
      increment() {
        this.count++;
      },
    },
  });
  const store = useStore();
  const stateListener = vi.fn();
  const actionListener = vi.fn();
  const scope = effectScope();

  scope.run(() => {
    scope.stop();
    store.$subscribe(stateListener);
    store.$onAction(actionListener);
  });
  store.increment();

  expect(stateListener).not.toHaveBeenCalled();
  expect(actionListener).not.toHaveBeenCalled();
});

it('disposes internals while leaving state directly readable and writable', () => {
  const useStore = createStore({
    state: () => ({ count: 0 }),
    getters: { doubled: (state) => state.count * 2 },
    actions: {
      increment() {
        this.count++;
      },
    },
  });
  const store = useStore();
  const subscriber = vi.fn();
  store.$subscribe(subscriber);

  store.$dispose();
  store.$dispose();
  store.count = 2;
  expect(store.count).toBe(2);
  expect(() => store.$state).toThrow('Store has been disposed');
  expect(subscriber).not.toHaveBeenCalled();
  expect(() => store.doubled).toThrow('Store has been disposed');
  expect(() => store.increment()).toThrow('Store has been disposed');
  expect(() => store.$patch({ count: 3 })).toThrow('Store has been disposed');
  expect(() => store.$subscribe(() => {})).toThrow('Store has been disposed');
  expect(() => store.$onAction(() => {})).toThrow('Store has been disposed');
});

it('rejects invalid state factories and conflicting public names', () => {
  expect(() => createStore({ state: null as never })).toThrow('state must be a function');
  expect(() => createStore({ state: () => [] as never })()).toThrow(
    'state factory must return a plain object',
  );
  expect(() =>
    createStore({
      state: () => ({ count: 0 }),
      getters: { count: (state) => state.count },
    })(),
  ).toThrow('Duplicate store property: count');
  expect(() =>
    createStore({
      state: () => ({ $hidden: 0 }),
    })(),
  ).toThrow('Store property names cannot start with $');
  expect(() =>
    createStore({
      state: () => ({ count: 0 }),
      getters: { invalid: 1 as never },
    })(),
  ).toThrow('Store getter invalid must be a function');
  expect(() =>
    createStore({
      state: () => ({ count: 0 }),
      actions: { invalid: 1 as never },
    })(),
  ).toThrow('Store action invalid must be a function');
});

describe('store action Promise-like outcomes', () => {
  it('delivers hooks for native promises and custom thenables', async () => {
    const rejected = new Error('native rejection');
    const thenableRejected = new Error('thenable rejection');
    const successThenable = {
      then(resolve: (value: number) => void) {
        resolve(7);
      },
    } as unknown as PromiseLike<number>;
    const rejectedThenable = {
      then(_resolve: (value: never) => void, reject: (reason: unknown) => void) {
        reject(thenableRejected);
      },
    } as unknown as PromiseLike<never>;
    const useStore = createStore({
      state: () => ({ calls: 0 }),
      actions: {
        nativeSuccess() {
          return Promise.resolve('native value');
        },
        thenableSuccess() {
          return successThenable;
        },
        nativeFailure() {
          return Promise.reject(rejected);
        },
        thenableFailure() {
          return rejectedThenable;
        },
      },
    });
    const store = useStore();
    const outcomes: string[] = [];
    const stop = store.$onAction(({ name, after, onError }) => {
      after((value) => outcomes.push(`after:${name}:${String(value)}`));
      onError((error) => {
        const reason =
          error === rejected ? 'native' : error === thenableRejected ? 'thenable' : 'other';
        outcomes.push(`error:${name}:${reason}`);
      });
    });

    await expect(store.nativeSuccess()).resolves.toBe('native value');
    await expect(store.thenableSuccess()).resolves.toBe(7);
    await expect(store.nativeFailure()).rejects.toBe(rejected);
    await expect(store.thenableFailure()).rejects.toBe(thenableRejected);

    expect(outcomes).toEqual([
      'after:nativeSuccess:native value',
      'after:thenableSuccess:7',
      'error:nativeFailure:native',
      'error:thenableFailure:thenable',
    ]);
    stop();
  });

  it('preserves action errors while reporting hook failures for sync and async results', async () => {
    const syncActionError = new Error('sync action failed');
    const syncAfterError = new Error('sync after failed');
    const syncOnErrorError = new Error('sync onError failed');
    const asyncAfterError = new Error('async after failed');
    const asyncActionError = new Error('async action failed');
    const asyncOnErrorError = new Error('async onError failed');
    const useStore = createStore({
      state: () => ({ calls: 0 }),
      actions: {
        syncSuccess() {
          return 1;
        },
        syncFailure() {
          throw syncActionError;
        },
        asyncSuccess() {
          return Promise.resolve(2);
        },
        asyncFailure() {
          return Promise.reject(asyncActionError);
        },
      },
    });
    const store = useStore();
    const stop = store.$onAction(({ name, after, onError }) => {
      if (name === 'syncSuccess')
        after(() => {
          throw syncAfterError;
        });
      if (name === 'syncFailure')
        onError(() => {
          throw syncOnErrorError;
        });
      if (name === 'asyncSuccess')
        after(() => {
          throw asyncAfterError;
        });
      if (name === 'asyncFailure')
        onError(() => {
          throw asyncOnErrorError;
        });
    });

    expect(() => store.syncSuccess()).toThrow(syncAfterError);
    expect(() => store.syncFailure()).toThrow(syncActionError);
    await expect(store.asyncSuccess()).rejects.toBe(asyncAfterError);
    // An error hook cannot replace the original rejection of an async action.
    await expect(store.asyncFailure()).rejects.toBe(asyncActionError);
    stop();
  });

  it('runs every failing action listener while preserving the first listener error', () => {
    const firstError = new Error('first listener failed');
    const secondError = new Error('second listener failed');
    const body = vi.fn();
    const useStore = createStore({
      state: () => ({ count: 0 }),
      actions: {
        run() {
          body();
        },
      },
    });
    const store = useStore();
    const seen: string[] = [];
    store.$onAction(({ onError }) => {
      seen.push('before:first');
      onError((error) => seen.push(`error:first:${error === firstError}`));
      throw firstError;
    });
    store.$onAction(({ onError }) => {
      seen.push('before:second');
      onError((error) => seen.push(`error:second:${error === firstError}`));
      throw secondError;
    });

    expect(() => store.run()).toThrow(firstError);
    expect(body).not.toHaveBeenCalled();
    expect(seen).toEqual([
      'before:first',
      'before:second',
      'error:first:true',
      'error:second:true',
    ]);
  });

  it('runs every failing outcome hook while preserving the first hook error', () => {
    const firstError = new Error('first after hook failed');
    const secondError = new Error('second after hook failed');
    const hooks: string[] = [];
    const useStore = createStore({
      state: () => ({ count: 0 }),
      actions: {
        run() {
          return 'done';
        },
      },
    });
    const store = useStore();
    store.$onAction(({ after }) => {
      after(() => {
        hooks.push('first');
        throw firstError;
      });
      after(() => {
        hooks.push('second');
        throw secondError;
      });
    });

    expect(() => store.run()).toThrow(firstError);
    expect(hooks).toEqual(['first', 'second']);
  });

  it('passes rejected actions through when no action listeners are registered', async () => {
    const rejected = new Error('detached rejection');
    const useStore = createStore({
      state: () => ({ count: 0 }),
      actions: {
        reject() {
          return Promise.reject(rejected);
        },
      },
    });
    const store = useStore();

    await expect(store.reject()).rejects.toBe(rejected);
  });

  it('observes a rejected result when a synchronous subscriber aborts an action', async () => {
    const subscriberError = new Error('subscriber failed');
    const rejected = new Error('action rejected after write');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const useStore = createStore({
      state: () => ({ count: 0 }),
      actions: {
        writeThenReject() {
          this.count++;
          return Promise.reject(rejected);
        },
      },
    });
    const store = useStore();
    store.$subscribe(() => {
      throw subscriberError;
    });

    expect(() => store.writeThenReject()).toThrow(subscriberError);
    await Promise.resolve();
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      '[Essor signals] additional action error',
      rejected,
    );
  });

  it('preserves a synchronous subscriber error for a detached non-Promise result', () => {
    const subscriberError = new Error('subscriber failed');
    const useStore = createStore({
      state: () => ({ count: 0 }),
      actions: {
        writeThenReturn() {
          this.count++;
          return 1;
        },
      },
    });
    const store = useStore();
    store.$subscribe(() => {
      throw subscriberError;
    });

    expect(() => store.writeThenReturn()).toThrow(subscriberError);
  });

  it('reports secondary thenable and after-hook failures without masking the subscriber error', async () => {
    const subscriberError = new Error('subscriber failed');
    const thenError = new Error('then accessor failed');
    const afterError = new Error('after hook failed');
    const rejectedHookError = new Error('rejected hook failed');
    const invalidThenable = Object.defineProperty({}, 'then', {
      get() {
        throw thenError;
      },
    }) as PromiseLike<never>;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const createFailingStore = () =>
      createStore({
        state: () => ({ count: 0 }),
        actions: {
          writeThenInvalid() {
            this.count++;
            return invalidThenable;
          },
          writeThenResolve() {
            this.count++;
            return Promise.resolve('resolved');
          },
          writeThenResolveWithoutHook() {
            this.count++;
            return Promise.resolve('resolved without hook');
          },
          writeThenRejectWithFailingHook() {
            this.count++;
            return Promise.reject(new Error('rejected result'));
          },
        },
      })();

    const detachedStore = createFailingStore();
    detachedStore.$subscribe(() => {
      throw subscriberError;
    });
    expect(() => detachedStore.writeThenInvalid()).toThrow(subscriberError);

    const observedStore = createFailingStore();
    observedStore.$subscribe(() => {
      throw subscriberError;
    });
    observedStore.$onAction(({ name, after, onError }) => {
      if (name === 'writeThenResolve')
        after(() => {
          throw afterError;
        });
      if (name === 'writeThenRejectWithFailingHook')
        onError(() => {
          throw rejectedHookError;
        });
    });
    expect(() => observedStore.writeThenInvalid()).toThrow(subscriberError);
    expect(() => observedStore.writeThenResolve()).toThrow(subscriberError);
    expect(() => observedStore.writeThenResolveWithoutHook()).toThrow(subscriberError);
    expect(() => observedStore.writeThenRejectWithFailingHook()).toThrow(subscriberError);
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).toHaveBeenCalledWith('[Essor signals] additional action error', thenError);
    expect(consoleError).toHaveBeenCalledWith(
      '[Essor signals] additional action error',
      afterError,
    );
    expect(consoleError).toHaveBeenCalledWith(
      '[Essor signals] additional action error',
      rejectedHookError,
    );
    expect(consoleError.mock.calls.filter(([, error]) => error === thenError)).toHaveLength(2);
    expect(consoleError).toHaveBeenCalledTimes(4);
  });
});

describe('store disposal and invalid public operations', () => {
  it('notifies every subscriber while preserving the first subscriber error', () => {
    const firstError = new Error('first subscriber failed');
    const secondError = new Error('second subscriber failed');
    const seen: string[] = [];
    const useStore = createStore({ state: () => ({ count: 0 }) });
    const store = useStore();
    const stopFirst = store.$subscribe(() => {
      seen.push('first');
      throw firstError;
    });
    const stopSecond = store.$subscribe(() => {
      seen.push('second');
      throw secondError;
    });

    expect(() => {
      store.count++;
    }).toThrow(firstError);
    expect(seen).toEqual(['first', 'second']);
    stopFirst();
    stopSecond();
  });

  it('rejects malformed patches and reset factories, then disposes idempotently', () => {
    let malformedReset = false;
    const patchError = new Error('patch callback failed');
    const useStore = createStore<{ count: number }>({
      state: () => (malformedReset ? ([] as never) : { count: 0 }),
    });
    const store = useStore();

    expect(() => store.$patch(null as never)).toThrow('plain object or function');
    expect(() => store.$patch([] as never)).toThrow('plain object or function');
    expect(() => store.$patch(new Date() as never)).toThrow('plain object or function');
    expect(() =>
      store.$patch(() => {
        throw patchError;
      }),
    ).toThrow(patchError);
    expect(store.count).toBe(0);

    malformedReset = true;
    expect(() => store.$reset()).toThrow('state factory must return a plain object');
    expect(store.count).toBe(0);

    store.$dispose();
    expect(() => store.$dispose()).not.toThrow();
    store.count = 2;
    expect(store.count).toBe(2);
    expect(() => store.$state).toThrow('Store has been disposed');
    expect(() => store.$patch({ count: 3 })).toThrow('Store has been disposed');
    expect(() => store.$reset()).toThrow('Store has been disposed');
    expect(() => store.$subscribe(() => {})).toThrow('Store has been disposed');
    expect(() => store.$onAction(() => {})).toThrow('Store has been disposed');
  });

  it('rejects reset shapes that conflict with the store public namespace', () => {
    let invalidShape = false;
    const useStore = createStore({
      state: () => (invalidShape ? ({ $private: true } as never) : { count: 0 }),
    });
    const store = useStore();

    invalidShape = true;
    expect(() => store.$reset()).toThrow('Store property names cannot start with $');
    expect(store.count).toBe(0);
  });
});

describe('edge cases', () => {
  const throwingThen = () => {
    const o: any = {};
    Object.defineProperty(o, 'then', {
      get() {
        throw new Error('then getter');
      },
    });
    return o;
  };

  const make = (ret: () => unknown) =>
    createStore({
      state: () => ({ n: 0 }),
      actions: {
        run() {
          this.n++;
          return ret();
        },
      },
    })();

  it('dispose rethrows errors from stopping the shared watcher', () => {
    const store = make(() => 1);
    store.$subscribe(() => {
      onWatcherCleanup(() => {
        throw new Error('cleanup');
      });
    });
    store.n++;
    expect(() => store.$dispose()).toThrow('cleanup');
  });

  it('detached action with throwing then getter is reported', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = make(throwingThen);
    store.run();
    expect(err).toHaveBeenCalledWith('[Essor signals] additional action error', expect.any(Error));
    err.mockRestore();
  });

  it('detached rejected action is reported when a subscriber throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = make(() => Promise.reject(new Error('rej')));
    store.$subscribe(() => {
      throw new Error('sub');
    });
    expect(() => store.run()).toThrow('sub');
    await new Promise((r) => setTimeout(r));
    expect(err).toHaveBeenCalledWith('[Essor signals] additional action error', expect.any(Error));
    err.mockRestore();
  });

  it('listener path: throwing then getter after a subscriber error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = make(throwingThen);
    store.$onAction(() => {});
    store.$subscribe(() => {
      throw new Error('sub');
    });
    expect(() => store.run()).toThrow('sub');
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('listener path: failing after/onError hooks on async result after subscriber error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const ret of [() => Promise.resolve(1), () => Promise.reject(new Error('x'))]) {
      const store = make(ret);
      store.$onAction(({ after, onError }) => {
        after(() => {
          throw new Error('after');
        });
        onError(() => {
          throw new Error('onError');
        });
      });
      store.$subscribe(() => {
        throw new Error('sub');
      });
      expect(() => store.run()).toThrow('sub');
    }
    await new Promise((r) => setTimeout(r));
    const msgs = err.mock.calls.map((c) => (c[1] as Error).message);
    expect(msgs).toContain('after');
    expect(msgs).toContain('onError');
    err.mockRestore();
  });

  it('listener path: throwing then getter on success runs onError', () => {
    const store = make(throwingThen);
    const onErr = vi.fn();
    store.$onAction(({ onError }) => onError(onErr));
    expect(() => store.run()).toThrow('then getter');
    expect(onErr).toHaveBeenCalled();
  });
});
describe('class-based Store', () => {
  it('creates store from class with state, getters, and actions', () => {
    class Counter {
      count = 0;

      get doubled() {
        return this.count * 2;
      }

      increment() {
        this.count++;
      }

      add(value: number) {
        this.count += value;
      }
    }

    const useStore = createStore(Counter);
    const store = useStore();

    expect(store.count).toBe(0);
    expect(store.doubled).toBe(0);

    store.increment();
    expect(store.count).toBe(1);
    expect(store.doubled).toBe(2);

    store.add(5);
    expect(store.count).toBe(6);
    expect(store.doubled).toBe(12);
  });

  it('supports multiple state properties in class', () => {
    class UserStore {
      name = 'John';
      age = 30;
      active = true;

      get info() {
        return `${this.name} (${this.age})`;
      }

      updateName(newName: string) {
        this.name = newName;
      }
    }

    const useStore = createStore(UserStore);
    const store = useStore();

    expect(store.name).toBe('John');
    expect(store.age).toBe(30);
    expect(store.active).toBe(true);
    expect(store.info).toBe('John (30)');

    store.updateName('Jane');
    expect(store.name).toBe('Jane');
    expect(store.info).toBe('Jane (30)');
  });

  it('supports nested objects in class state', () => {
    class ProfileStore {
      user = {
        name: 'Alice',
        address: {
          city: 'NYC',
        },
      };

      get cityName() {
        return this.user.address.city;
      }

      updateCity(city: string) {
        this.user.address.city = city;
      }
    }

    const useStore = createStore(ProfileStore);
    const store = useStore();

    expect(store.user.name).toBe('Alice');
    expect(store.user.address.city).toBe('NYC');
    expect(store.cityName).toBe('NYC');

    store.updateCity('SF');
    expect(store.cityName).toBe('SF');
  });

  it('supports arrays in class state', () => {
    class TodoStore {
      todos: string[] = [];

      get count() {
        return this.todos.length;
      }

      add(todo: string) {
        this.todos.push(todo);
      }

      clear() {
        this.todos.length = 0;
      }
    }

    const useStore = createStore(TodoStore);
    const store = useStore();

    expect(store.todos).toEqual([]);
    expect(store.count).toBe(0);

    store.add('Buy milk');
    store.add('Walk dog');
    expect(store.todos).toEqual(['Buy milk', 'Walk dog']);
    expect(store.count).toBe(2);

    store.clear();
    expect(store.count).toBe(0);
  });

  it('supports $patch with class-based stores', () => {
    class Counter {
      count = 0;
      name = 'test';

      get doubled() {
        return this.count * 2;
      }
    }

    const useStore = createStore(Counter);
    const store = useStore();

    store.$patch({ count: 5, name: 'patched' });
    expect(store.count).toBe(5);
    expect(store.name).toBe('patched');
    expect(store.doubled).toBe(10);

    store.$patch((state) => {
      state.count += 10;
    });
    expect(store.count).toBe(15);
  });

  it('supports $subscribe with class-based stores', () => {
    class Counter {
      count = 0;

      increment() {
        this.count++;
      }
    }

    const useStore = createStore(Counter);
    const store = useStore();
    const mutations: any[] = [];

    const unsubscribe = store.$subscribe((mutation, state) => {
      mutations.push({ type: mutation.type, count: state.count });
    });

    store.increment();
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({ type: 'direct', count: 1 });

    store.$patch({ count: 10 });
    expect(mutations).toHaveLength(2);
    expect(mutations[1]).toMatchObject({ type: 'patch object', count: 10 });

    unsubscribe();
    store.increment();
    expect(mutations).toHaveLength(2);
  });

  it('supports $reset with class-based stores', () => {
    class Counter {
      count = 5;
      name = 'initial';

      increment() {
        this.count++;
      }
    }

    const useStore = createStore(Counter);
    const store = useStore();

    expect(store.count).toBe(5);
    store.increment();
    store.name = 'modified';
    expect(store.count).toBe(6);
    expect(store.name).toBe('modified');

    store.$reset();
    expect(store.count).toBe(5);
    expect(store.name).toBe('initial');
  });

  it('supports $onAction with class-based stores', () => {
    class Counter {
      count = 0;

      increment() {
        this.count++;
        return this.count;
      }

      add(value: number) {
        this.count += value;
      }
    }

    const useStore = createStore(Counter);
    const store = useStore();
    const calls: string[] = [];

    store.$onAction((context) => {
      calls.push(context.name);
      context.after((result) => {
        calls.push(`after:${result}`);
      });
    });

    const result = store.increment();
    expect(result).toBe(1);
    expect(calls).toEqual(['increment', 'after:1']);

    store.add(5);
    expect(calls).toEqual(['increment', 'after:1', 'add', 'after:undefined']);
  });

  it('class-based stores are reactive in effects', () => {
    class Counter {
      count = 0;

      get doubled() {
        return this.count * 2;
      }

      increment() {
        this.count++;
      }
    }

    const useStore = createStore(Counter);
    const store = useStore();
    const seen: number[] = [];

    const stop = effect(() => {
      seen.push(store.doubled);
    });

    expect(seen).toEqual([0]);

    store.increment();
    expect(seen).toEqual([0, 2]);

    store.count = 10;
    expect(seen).toEqual([0, 2, 20]);

    stop();
  });

  it('creates independent instances from class', () => {
    class Counter {
      count = 0;

      increment() {
        this.count++;
      }
    }

    const useStore = createStore(Counter);
    const store1 = useStore();
    const store2 = useStore();

    store1.increment();
    expect(store1.count).toBe(1);
    expect(store2.count).toBe(0);

    store2.count = 5;
    expect(store1.count).toBe(1);
    expect(store2.count).toBe(5);
  });

  it('supports async actions in class-based stores', async () => {
    class AsyncStore {
      data: string | null = null;
      loading = false;

      async fetch() {
        this.loading = true;
        await new Promise((r) => setTimeout(r, 10));
        this.data = 'loaded';
        this.loading = false;
        return this.data;
      }
    }

    const useStore = createStore(AsyncStore);
    const store = useStore();

    expect(store.loading).toBe(false);
    const promise = store.fetch();
    expect(store.loading).toBe(true);

    const result = await promise;
    expect(result).toBe('loaded');
    expect(store.data).toBe('loaded');
    expect(store.loading).toBe(false);
  });

  it('batches updates in class-based store actions', () => {
    class Counter {
      count = 0;

      addTwice(value: number) {
        this.count += value;
        this.count += value;
      }
    }

    const useStore = createStore(Counter);
    const store = useStore();
    const seen: number[] = [];

    const stop = effect(() => {
      seen.push(store.count);
    });

    store.addTwice(5);
    // Should only trigger effect once due to batching
    expect(seen).toEqual([0, 10]);

    stop();
  });
});
