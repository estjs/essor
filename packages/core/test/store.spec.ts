import { createStore } from '../src';

describe('createStore', () => {
  it('should create a new store using options object', () => {
    const useStore = createStore({
      state: { count: 0 },
      getters: {
        doubleCount() {
          return this.count.value * 2;
        },
      },
      actions: {
        increment() {
          this.count.value++;
        },
      },
    });

    const store = useStore();
    expect(store.count).toBe(0);
    expect(store.state).toStrictEqual({ count: 0 });
    expect(store.doubleCount.value).toBe(0);
    store.increment();

    expect(store.count).toBe(1);
    expect(store.doubleCount.value).toBe(2);
    expect(store.state).toStrictEqual({ count: 1 });
  });
});
describe('store Methods', () => {
  it('should correctly patch the state', () => {
    const useTestStore = createStore({
      state: { value: 0 },
    });
    const store = useTestStore();

    store.patch$({ value: 42 });
    expect(store.value).toBe(42);
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
  });

  it('should reset the state', () => {
    const useTestStore = createStore({
      state: { value: 0 },
    });
    const store = useTestStore();
    store.patch$({ value: 42 });
    store.reset$();
    expect(store.value).toBe(0);
  });
});
