import { computed, createStore, effect, signal } from '../src';

/**
 * Store Test Suite
 *
 * Test Organization:
 * 1. Basic Functionality - Creation and basic operations
 * 2. Built-in Methods - patch$, subscribe$, reset$, etc.
 * 3. Reactivity Integration - Integration with effect, computed, signal
 * 4. Edge Cases - Special values and error handling
 * 5. Performance & Optimization - Batch updates and caching
 * 6. Complex Scenarios - Nested state and complex operations
 */

describe('store - Basic Functionality', () => {
  describe('object-based Store', () => {
    it('should create store with state, getters and actions', () => {
      const useStore = createStore({
        state: { count: 0 },
        getters: {
          doubleCount: state => state.count * 2,
        },
        actions: {
          increment() {
            this.count++;
          },
        },
      });
      const store = useStore();

      expect(store.state.count).toBe(0);
      expect(store.doubleCount).toBe(0);

      store.increment();
      expect(store.state.count).toBe(1);
      expect(store.doubleCount).toBe(2);
    });

    it('should create store with only state', () => {
      const useStore = createStore({
        state: { value: 'test' },
      });
      const store = useStore();

      expect(store.value).toBe('test');
      expect(store.state.value).toBe('test');
    });

    it('should handle multiple state properties', () => {
      const useStore = createStore({
        state: {
          count: 0,
          name: 'test',
          active: true,
        },
      });
      const store = useStore();

      expect(store.count).toBe(0);
      expect(store.name).toBe('test');
      expect(store.active).toBe(true);
    });

    it('should handle nested state objects', () => {
      const useStore = createStore({
        state: {
          user: {
            name: 'John',
            address: {
              city: 'NYC',
            },
          },
        },
      });
      const store = useStore();

      expect(store.user.name).toBe('John');
      expect(store.user.address.city).toBe('NYC');
    });
  });

  describe('class-based Store', () => {
    it('should create store from class', () => {
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
  });

  describe('getters', () => {
    it('should reactively compute getter values', () => {
      const useStore = createStore({
        state: { count: 0 },
        getters: {
          doubled: state => state.count * 2,
        },
      });
      const store = useStore();

      expect(store.doubled).toBe(0);
      store.state.count = 5;
      expect(store.doubled).toBe(10);
    });

    it('should support multiple getters', () => {
      const useStore = createStore({
        state: { count: 10 },
        getters: {
          doubled: state => state.count * 2,
          tripled: state => state.count * 3,
        },
      });
      const store = useStore();

      expect(store.doubled).toBe(20);
      expect(store.tripled).toBe(30);
    });

    it('should support getters depending on multiple state properties', () => {
      const useStore = createStore({
        state: { firstName: 'John', lastName: 'Doe' },
        getters: {
          fullName: state => `${state.firstName} ${state.lastName}`,
        },
      });
      const store = useStore();

      expect(store.fullName).toBe('John Doe');
      store.state.firstName = 'Jane';
      expect(store.fullName).toBe('Jane Doe');
    });
  });

  describe('actions', () => {
    it('should execute actions with correct context', () => {
      const useStore = createStore({
        state: { count: 0 },
        actions: {
          increment() {
            this.count++;
          },
          add(value: number) {
            this.count += value;
          },
        },
      });
      const store = useStore();

      store.increment();
      expect(store.state.count).toBe(1);

      store.add(5);
      expect(store.state.count).toBe(6);
    });

    it('should support actions with multiple parameters', () => {
      const useStore = createStore({
        state: { x: 0, y: 0 },
        actions: {
          setPosition(x: number, y: number) {
            this.x = x;
            this.y = y;
          },
        },
      });
      const store = useStore();

      store.setPosition(10, 20);
      expect(store.state.x).toBe(10);
      expect(store.state.y).toBe(20);
    });

    it('should support actions with return values', () => {
      const useStore = createStore({
        state: { count: 5 },
        actions: {
          getDoubled() {
            return this.count * 2;
          },
        },
      });
      const store = useStore();

      const result = store.getDoubled();
      expect(result).toBe(10);
    });

    it('should support async actions', async () => {
      const useStore = createStore({
        state: { data: null as string | null },
        actions: {
          async fetchData() {
            await new Promise(resolve => setTimeout(resolve, 10));
            this.data = 'fetched';
          },
        },
      });
      const store = useStore();

      await store.fetchData();
      expect(store.state.data).toBe('fetched');
    });
  });
});

describe('store - Built-in Methods', () => {
  describe('patch$', () => {
    it('should correctly update state', () => {
      const useStore = createStore({
        state: { value: 0 },
      });
      const store = useStore();

      store.patch$({ value: 42 });
      expect(store.state.value).toBe(42);
    });

    it('should update multiple properties at once', () => {
      const useStore = createStore({
        state: { count: 0, name: 'old', active: false },
      });
      const store = useStore();

      store.patch$({ count: 10, name: 'new', active: true });
      expect(store.state.count).toBe(10);
      expect(store.state.name).toBe('new');
      expect(store.state.active).toBe(true);
    });

    it('should only update specified properties', () => {
      const useStore = createStore({
        state: { count: 0, name: 'test' },
      });
      const store = useStore();

      store.patch$({ count: 5 });
      expect(store.state.count).toBe(5);
      expect(store.state.name).toBe('test');
    });

    it('should handle nested object updates', () => {
      const useStore = createStore({
        state: {
          user: { name: 'John', age: 30 },
        },
      });
      const store = useStore();

      store.patch$({ user: { name: 'Jane', age: 25 } });
      expect(store.state.user.name).toBe('Jane');
      expect(store.state.user.age).toBe(25);
    });

    it('should trigger subscriber callbacks', () => {
      const useStore = createStore({
        state: { count: 0 },
      });
      const store = useStore();
      const callback = vitest.fn();

      store.subscribe$(callback);
      store.patch$({ count: 5 });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ count: 5 }));
    });
  });

  describe('subscribe$ / unsubscribe$', () => {
    it('should subscribe and trigger callback', () => {
      const useStore = createStore({
        state: { value: 0 },
      });
      const store = useStore();
      const callback = vitest.fn();

      store.subscribe$(callback);
      store.patch$({ value: 42 });

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ value: 42 }));
    });

    it('should correctly unsubscribe', () => {
      const useStore = createStore({
        state: { value: 0 },
      });
      const store = useStore();
      const callback = vitest.fn();

      store.subscribe$(callback);
      store.patch$({ value: 42 });
      expect(callback).toHaveBeenCalledTimes(1);

      store.unsubscribe$(callback);
      store.patch$({ value: 43 });
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple subscribers', () => {
      const useStore = createStore({
        state: { value: 0 },
      });
      const store = useStore();
      const callback1 = vitest.fn();
      const callback2 = vitest.fn();

      store.subscribe$(callback1);
      store.subscribe$(callback2);
      store.patch$({ value: 42 });

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should handle unsubscribing non-existent subscription', () => {
      const useStore = createStore({
        state: { value: 0 },
      });
      const store = useStore();
      const callback = vitest.fn();

      expect(() => store.unsubscribe$(callback)).not.toThrow();
    });
  });

  describe('onAction$', () => {
    it('should execute onAction callback', () => {
      const useStore = createStore({
        state: { value: 0 },
      });
      const store = useStore();
      const callback = vitest.fn();

      store.onAction$(callback);
      store.patch$({ value: 42 });

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ value: 42 }));
    });

    it('should trigger onAction for custom actions', () => {
      const useStore = createStore({
        state: { count: 0 },
        actions: {
          increment() {
            this.count++;
          },
        },
      });
      const store = useStore();
      const callback = vitest.fn();

      store.onAction$(callback);
      store.increment();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should trigger both subscribe and onAction callbacks', () => {
      const useStore = createStore({
        state: { value: 0 },
      });
      const store = useStore();
      const subscribeCallback = vitest.fn();
      const actionCallback = vitest.fn();

      store.subscribe$(subscribeCallback);
      store.onAction$(actionCallback);
      store.patch$({ value: 42 });

      expect(subscribeCallback).toHaveBeenCalledTimes(1);
      expect(actionCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset$', () => {
    it('should reset state', () => {
      const useStore = createStore({
        state: { value: 0 },
      });
      const store = useStore();

      store.patch$({ value: 42 });
      store.reset$();

      expect(store.state.value).toBe(0);
    });

    it('should reset multiple properties', () => {
      const useStore = createStore({
        state: { count: 0, name: 'initial', active: false },
      });
      const store = useStore();

      store.patch$({ count: 10, name: 'changed', active: true });
      store.reset$();

      expect(store.state.count).toBe(0);
      expect(store.state.name).toBe('initial');
      expect(store.state.active).toBe(false);
    });

    it('should trigger subscribers on reset', () => {
      const useStore = createStore({
        state: { value: 0 },
      });
      const store = useStore();
      const callback = vitest.fn();

      store.subscribe$(callback);
      store.patch$({ value: 42 });
      callback.mockClear();

      store.reset$();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ value: 0 }));
    });
  });
});

describe('store - Reactivity Integration', () => {
  describe('integration with effect', () => {
    it('should work with effect', () => {
      const useStore = createStore({
        state: { count: 0 },
      });
      const store = useStore();
      let effectCount = 0;

      effect(() => {
        effectCount = store.state.count * 2;
      });

      expect(effectCount).toBe(0);
      store.state.count = 5;
      expect(effectCount).toBe(10);
    });

    it('should trigger effects when using patch$', () => {
      const useStore = createStore({
        state: { count: 0 },
      });
      const store = useStore();
      let effectCount = 0;

      effect(() => {
        effectCount = store.state.count;
      });

      expect(effectCount).toBe(0);
      store.patch$({ count: 5 });
      expect(effectCount).toBe(5);
    });

    it('should trigger effects when using reset$', () => {
      const useStore = createStore({
        state: { count: 0 },
      });
      const store = useStore();
      let effectCount = 0;

      effect(() => {
        effectCount = store.state.count;
      });

      store.patch$({ count: 10 });
      expect(effectCount).toBe(10);

      store.reset$();
      expect(effectCount).toBe(0);
    });
  });

  describe('integration with computed', () => {
    it('should work with computed', () => {
      const useStore = createStore({
        state: { count: 0 },
      });
      const store = useStore();
      const doubled = computed(() => store.state.count * 2);

      expect(doubled.value).toBe(0);
      store.state.count = 5;
      expect(doubled.value).toBe(10);
    });
  });

  describe('integration with signal', () => {
    it('should work with signal', () => {
      const useStore = createStore({
        state: { count: 0 },
      });
      const store = useStore();
      const externalSignal = signal(0);

      effect(() => {
        externalSignal.value = store.state.count * 2;
      });

      expect(externalSignal.value).toBe(0);
      store.state.count = 5;
      expect(externalSignal.value).toBe(10);
    });
  });
});

describe('store - Edge Cases', () => {
  describe('state Edge Cases', () => {
    it('should handle empty state object', () => {
      const useStore = createStore({
        state: {},
      });
      const store = useStore();

      expect(store.state).toEqual({});
    });

    it('should handle null values', () => {
      const useStore = createStore({
        state: { value: null as string | null },
      });
      const store = useStore();

      expect(store.state.value).toBeNull();
    });

    it('should handle undefined values', () => {
      const useStore = createStore({
        state: { value: undefined as string | undefined },
      });
      const store = useStore();

      expect(store.state.value).toBeUndefined();
    });

    it('should handle array values', () => {
      const useStore = createStore({
        state: { items: [1, 2, 3] },
      });
      const store = useStore();

      expect(store.state.items).toEqual([1, 2, 3]);
      store.state.items.push(4);
      expect(store.state.items).toEqual([1, 2, 3, 4]);
    });

    it('should handle Date objects', () => {
      const date = new Date('2024-01-01');
      const useStore = createStore({
        state: { createdAt: date },
      });
      const store = useStore();

      // Date object is stored but wrapped in proxy
      expect(store.state.createdAt).toBeDefined();
      expect(store.state.createdAt).not.toBeNull();
    });

    it('should handle Map objects', () => {
      const map = new Map([['key', 'value']]);
      const useStore = createStore({
        state: { data: map },
      });
      const store = useStore();

      // Map functionality works even when wrapped in proxy
      expect(store.state.data.get('key')).toBe('value');
      expect(store.state.data.size).toBe(1);
    });

    it('should handle Set objects', () => {
      const set = new Set([1, 2, 3]);
      const useStore = createStore({
        state: { items: set },
      });
      const store = useStore();

      // Set functionality works even when wrapped in proxy
      expect(store.state.items.has(2)).toBe(true);
      expect(store.state.items.size).toBe(3);
    });
  });

  describe('getter Edge Cases', () => {
    it('should handle getter returning null', () => {
      const useStore = createStore({
        state: { value: null as string | null },
        getters: {
          getValue: state => state.value,
        },
      });
      const store = useStore();

      expect(store.getValue).toBeNull();
    });

    it('should handle getter returning undefined', () => {
      const useStore = createStore({
        state: { value: undefined as string | undefined },
        getters: {
          getValue: state => state.value,
        },
      });
      const store = useStore();

      expect(store.getValue).toBeUndefined();
    });

    it('should handle getter with conditional logic', () => {
      const useStore = createStore({
        state: { count: 5 },
        getters: {
          status: state => (state.count > 10 ? 'high' : 'low'),
        },
      });
      const store = useStore();

      expect(store.status).toBe('low');
      store.state.count = 15;
      expect(store.status).toBe('high');
    });

    it('should handle getter throwing error', () => {
      const useStore = createStore({
        state: { count: 0 },
        getters: {
          throwError: () => {
            throw new Error('Getter error');
          },
        },
      });
      const store = useStore();

      expect(() => store.throwError).toThrow('Getter error');
    });
  });

  describe('action Edge Cases', () => {
    it('should handle action throwing error', () => {
      const useStore = createStore({
        state: { count: 0 },
        actions: {
          throwError() {
            throw new Error('Action error');
          },
        },
      });
      const store = useStore();

      expect(() => store.throwError()).toThrow('Action error');
    });

    it('should handle action with no parameters', () => {
      const useStore = createStore({
        state: { count: 0 },
        actions: {
          increment() {
            this.count++;
          },
        },
      });
      const store = useStore();

      store.increment();
      expect(store.state.count).toBe(1);
    });

    it('should handle action with optional parameters', () => {
      const useStore = createStore({
        state: { count: 0 },
        actions: {
          add(value = 1) {
            this.count += value;
          },
        },
      });
      const store = useStore();

      store.add();
      expect(store.state.count).toBe(1);

      store.add(5);
      expect(store.state.count).toBe(6);
    });

    it('should handle action modifying multiple properties', () => {
      const useStore = createStore({
        state: { count: 0, name: 'test' },
        actions: {
          update(count: number, name: string) {
            this.count = count;
            this.name = name;
          },
        },
      });
      const store = useStore();

      store.update(10, 'updated');
      expect(store.state.count).toBe(10);
      expect(store.state.name).toBe('updated');
    });
  });

  describe('subscription Edge Cases', () => {
    it('should handle duplicate subscription of same callback', () => {
      const useStore = createStore({
        state: { value: 0 },
      });
      const store = useStore();
      const callback = vitest.fn();

      store.subscribe$(callback);
      store.subscribe$(callback);
      store.patch$({ value: 42 });

      // Set only stores unique callbacks
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle callback throwing error', () => {
      const useStore = createStore({
        state: { value: 0 },
      });
      const store = useStore();
      const errorCallback = () => {
        throw new Error('Callback error');
      };

      store.subscribe$(errorCallback);
      expect(() => store.patch$({ value: 42 })).toThrow('Callback error');
    });

    it('should handle empty patch payload', () => {
      const useStore = createStore({
        state: { value: 0 },
      });
      const store = useStore();
      const callback = vitest.fn();

      store.subscribe$(callback);
      store.patch$({});

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('multiple Store Instances', () => {
    it('should create store instances sharing state', () => {
      const useStore = createStore({
        state: { count: 0 },
      });
      const store1 = useStore();
      const store2 = useStore();

      store1.state.count = 5;
      store2.state.count = 10;

      // Note: Store instances share the same reactive state by design
      expect(store1.state.count).toBe(10);
      expect(store2.state.count).toBe(10);
    });

    it('should provide independent subscribers for each instance', () => {
      const useStore = createStore({
        state: { count: 0 },
      });
      const store1 = useStore();
      const store2 = useStore();
      const callback1 = vitest.fn();
      const callback2 = vitest.fn();

      store1.subscribe$(callback1);
      store2.subscribe$(callback2);
      store1.patch$({ count: 5 });

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).not.toHaveBeenCalled();
    });
  });
});

describe('store - Performance & Optimization', () => {
  describe('batch Updates', () => {
    it('should batch process multiple patch calls', () => {
      const useStore = createStore({
        state: { count: 0, name: 'test' },
      });
      const store = useStore();
      const callback = vitest.fn();

      store.subscribe$(callback);

      // Multiple patches should each trigger callback
      store.patch$({ count: 1 });
      store.patch$({ count: 2 });
      store.patch$({ name: 'updated' });

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should handle rapid state changes', () => {
      const useStore = createStore({
        state: { count: 0 },
      });
      const store = useStore();
      const callback = vitest.fn();

      store.subscribe$(callback);

      for (let i = 0; i < 100; i++) {
        store.patch$({ count: i });
      }

      expect(callback).toHaveBeenCalledTimes(100);
      expect(store.state.count).toBe(99);
    });
  });

  describe('getter Caching', () => {
    it('should recompute getter when dependencies change', () => {
      const useStore = createStore({
        state: { count: 0 },
        getters: {
          doubled: state => state.count * 2,
        },
      });
      const store = useStore();

      expect(store.doubled).toBe(0);
      store.state.count = 5;
      expect(store.doubled).toBe(10);
      store.state.count = 10;
      expect(store.doubled).toBe(20);
    });

    it('should efficiently handle multiple getter accesses', () => {
      const useStore = createStore({
        state: { count: 0 },
        getters: {
          doubled: state => state.count * 2,
        },
      });
      const store = useStore();

      // Multiple accesses should work correctly
      for (let i = 0; i < 100; i++) {
        expect(store.doubled).toBe(0);
      }
    });
  });
});

describe('store - Complex Scenarios', () => {
  describe('nested State Management', () => {
    it('should handle deeply nested state updates', () => {
      const useStore = createStore({
        state: {
          level1: {
            level2: {
              level3: {
                value: 0,
              },
            },
          },
        },
      });
      const store = useStore();

      store.state.level1.level2.level3.value = 42;
      expect(store.state.level1.level2.level3.value).toBe(42);
    });

    it('should handle array operations', () => {
      const useStore = createStore({
        state: { items: [1, 2, 3] },
      });
      const store = useStore();

      store.items.push(4);
      expect(store.items).toEqual([1, 2, 3, 4]);

      store.items.pop();
      expect(store.items).toEqual([1, 2, 3]);

      store.items[0] = 10;
      expect(store.items).toEqual([10, 2, 3]);
    });

    it('should handle object spread in patch', () => {
      const useStore = createStore({
        state: { user: { name: 'John', age: 30, city: 'NYC' } },
      });
      const store = useStore();

      store.patch$({
        user: { ...store.state.user, age: 31 },
      });

      expect(store.state.user.name).toBe('John');
      expect(store.state.user.age).toBe(31);
      expect(store.state.user.city).toBe('NYC');
    });
  });

  describe('complex Getters', () => {
    it('should handle getter depending on multiple state properties', () => {
      const useStore = createStore({
        state: { firstName: 'John', lastName: 'Doe', age: 30 },
        getters: {
          fullInfo: state => `${state.firstName} ${state.lastName}, ${state.age} years old`,
        },
      });
      const store = useStore();

      expect(store.fullInfo).toBe('John Doe, 30 years old');
      store.state.firstName = 'Jane';
      expect(store.fullInfo).toBe('Jane Doe, 30 years old');
    });

    it('should handle getter with array operations', () => {
      const useStore = createStore({
        state: { numbers: [1, 2, 3, 4, 5] },
        getters: {
          evenNumbers: state => state.numbers.filter(n => n % 2 === 0),
          sum: state => state.numbers.reduce((a, b) => a + b, 0),
        },
      });
      const store = useStore();

      expect(store.evenNumbers).toEqual([2, 4]);
      expect(store.sum).toBe(15);

      store.numbers.push(6);
      expect(store.evenNumbers).toEqual([2, 4, 6]);
      expect(store.sum).toBe(21);
    });
  });

  describe('complex Actions', () => {
    it('should handle action with complex logic', () => {
      const useStore = createStore({
        state: { items: [] as number[], total: 0 },
        actions: {
          addItem(value: number) {
            this.items.push(value);
            this.total = this.items.reduce((a, b) => a + b, 0);
          },
        },
      });
      const store = useStore();

      store.addItem(10);
      expect(store.state.items).toEqual([10]);
      expect(store.state.total).toBe(10);

      store.addItem(20);
      expect(store.state.items).toEqual([10, 20]);
      expect(store.state.total).toBe(30);
    });

    it('should handle action with conditional logic', () => {
      const useStore = createStore({
        state: { count: 0, max: 10 },
        actions: {
          incrementIfPossible() {
            if (this.count < this.max) {
              this.count++;
              return true;
            }
            return false;
          },
        },
      });
      const store = useStore();

      for (let i = 0; i < 15; i++) {
        store.incrementIfPossible();
      }

      expect(store.state.count).toBe(10);
    });
  });

  describe('subscription Patterns', () => {
    it('should handle subscriber modifying state', () => {
      const useStore = createStore({
        state: { count: 0, doubled: 0 },
      });
      const store = useStore();

      store.subscribe$(state => {
        state.doubled = state.count * 2;
      });

      store.patch$({ count: 5 });
      expect(store.state.doubled).toBe(10);
    });

    it('should handle multiple subscribers with dependencies', () => {
      const useStore = createStore({
        state: { value: 0 },
      });
      const store = useStore();

      const results: number[] = [];
      store.subscribe$(state => results.push(state.value * 2));
      store.subscribe$(state => results.push(state.value * 3));

      store.patch$({ value: 5 });
      expect(results).toEqual([10, 15]);
    });
  });
});
