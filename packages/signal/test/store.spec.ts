import { createStore } from '../src';

describe('createStore', () => {
  it('create store with state, getters, and actions', () => {
    const useStore = createStore({
      state: { count: 0 },
      getters: {
        doubleCount: state => {
          return state.count * 2;
        },
        thirdCount: state => {
          return state.count * 3;
        },
      },
      actions: {
        increment() {
          this.count++;
        },
        decrement() {
          this.count--;
        },

        addDoubleCount() {
          this.count += 2;
        },
      },
    });
    const store = useStore();
    expect(store.state.count).toBe(0);
    expect(store.doubleCount).toBe(0);
    expect(store.thirdCount).toBe(0);
    store.increment();
    expect(store.state.count).toBe(1);
    expect(store.doubleCount).toBe(2);
    expect(store.thirdCount).toBe(3);

    store.decrement();
    expect(store.state.count).toBe(0);
    expect(store.doubleCount).toBe(0);
    expect(store.thirdCount).toBe(0);

    store.addDoubleCount();
    expect(store.state.count).toBe(2);
    expect(store.doubleCount).toBe(4);
    expect(store.thirdCount).toBe(6);
  });
});
describe('store Methods', () => {
  it('should correctly patch the state', () => {
    const useTestStore = createStore({
      state: { value: 0 },
    });
    const store = useTestStore();

    store.patch$({ value: 42 });
    expect(store.state.value).toBe(42);
  });

  it('should subscribe and trigger callbacks', () => {
    const useTestStore = createStore({
      state: { value: 0 },
    });
    const store = useTestStore();
    let callbackCalled = false;
    const callback = () => {
      callbackCalled = true;
    };
    store.subscribe$(callback);
    store.patch$({ value: 42 });
    expect(callbackCalled).toBe(true);
  });

  it('should execute onAction callbacks', () => {
    const useTestStore = createStore({
      state: { value: 0 },
    });
    const store = useTestStore();
    let callbackCalled = false;
    const callback = () => {
      callbackCalled = true;
    };
    store.onAction$(callback);
    store.patch$({ value: 42 });
    expect(callbackCalled).toBe(true);
  });

  it('should  correctly', () => {
    const useTestStore = createStore({
      state: { value: 0 },
    });
    const store = useTestStore();
    const callback = vitest.fn();
    store.subscribe$(callback);
    store.patch$({ value: 42 });
    expect(callback).toHaveBeenCalled();

    store.unsubscribe$(callback);
    store.patch$({ value: 43 });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should reset the state', () => {
    const useTestStore = createStore({
      state: { value: 0 },
    });
    const store = useTestStore();
    store.patch$({ value: 42 });
    store.reset$();
    expect(store.state.value).toBe(0);
  });
});
