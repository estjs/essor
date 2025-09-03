import { createStore } from '../src';

describe('object-based store', () => {
  it('should create store with state, getters, and actions', () => {
    const useStore = createStore({
      state: { count: 0 },
      getters: {
        doubleCount: state => state.count * 2,
        thirdCount: state => state.count * 3,
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

  it('should create store with only state', () => {
    const useStore = createStore({
      state: { value: 'test' },
    });
    const store = useStore();
    expect(store.value).toBe('test');
  });
});

describe('class-based store', () => {
  it('should create store from a class', () => {
    class TestStore {
      count = 0;

      get doubleCount() {
        return this.count * 2;
      }

      increment() {
        this.count++;
      }
    }

    const useStore = createStore(TestStore);
    const store = useStore();
    expect(store.count).toBe(0);
    expect(store.doubleCount).toBe(0);
    store.increment();
    expect(store.count).toBe(1);
    expect(store.doubleCount).toBe(2);
  });

  it('should create store from a class with constructor', () => {
    class TestStore {
      count = 0;

      get doubleCount() {
        return this.count * 2;
      }

      increment() {
        this.count++;
      }

      constructor() {
        createStore(this);
      }
    }

    const store = new TestStore();
    expect(store.count).toBe(0);
    expect(store.doubleCount).toBe(0);
    store.increment();
    expect(store.count).toBe(1);
    expect(store.doubleCount).toBe(2);
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
    const callback = vitest.fn();
    store.subscribe$(callback);
    store.patch$({ value: 42 });
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ value: 42 }));
  });

  it('should execute onAction callbacks', () => {
    const useTestStore = createStore({
      state: { value: 0 },
    });
    const store = useTestStore();
    const callback = vitest.fn();
    store.onAction$(callback);
    store.patch$({ value: 42 });
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ value: 42 }));
  });

  it('should unsubscribe correctly', () => {
    const useTestStore = createStore({
      state: { value: 0 },
    });
    const store = useTestStore();
    const callback = vitest.fn();
    store.subscribe$(callback);
    store.patch$({ value: 42 });
    expect(callback).toHaveBeenCalledTimes(1);

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

  it('should handle multiple subscribers', () => {
    const useTestStore = createStore({
      state: { value: 0 },
    });
    const store = useTestStore();
    const callback1 = vitest.fn();
    const callback2 = vitest.fn();
    store.subscribe$(callback1);
    store.subscribe$(callback2);
    store.patch$({ value: 42 });
    expect(callback1).toHaveBeenCalledTimes(1);
    expect(callback2).toHaveBeenCalledTimes(1);
  });
});
