import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computed,
  effect,
  isProxy,
  isReactive,
  isShallow,
  isSignal,
  reactive,
  shallowReactive,
  shallowSignal,
  signal,
  toRaw,
} from '../src';
import { signalsFlags } from '../src/constants';
import { targetMap } from '../src/dep';
import { markRaw } from '../src/reactive';

/**
 * The reactive suite is organized by observable behavior: object/property
 * traps come first, followed by arrays, collection adapters, and finally
 * proxy-invariant and runtime-isolation edge cases. Tests assert public
 * behavior only, so implementation-only dependency-list details do not make
 * future kernel refactors unnecessarily brittle.
 */
describe('reactive - basic reactivity tests', () => {
  it('should initialize with provided properties', () => {
    const state = reactive({ count: 0, name: 'John' });
    expect(state.count).toBe(0);
    expect(state.name).toBe('John');
  });

  it('should update the value reactively', () => {
    const state = reactive({ count: 0 });
    const mockFn = vi.fn(() => state.count);
    effect(mockFn);

    expect(state.count).toBe(0);
    expect(mockFn).toHaveBeenCalledTimes(1);

    state.count = 10;
    expect(state.count).toBe(10);

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should add new properties reactively', () => {
    const state = reactive<any>({});
    const mockFn = vi.fn(() => state.newProp);
    effect(mockFn);

    state.newProp = 'new value';
    expect(state.newProp).toBe('new value');

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should delete properties reactively', () => {
    const state = reactive({ count: 5 });
    const mockFn = vi.fn(() => state.count);
    effect(mockFn);

    expect(state.count).toBe(5);
    expect(mockFn).toHaveBeenCalledTimes(1);

    // @ts-ignore
    state.count = undefined;
    expect(state.count).toBe(undefined);

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should support state manipulation through functions', () => {
    const state = reactive({
      count: 0,
      increment() {
        this.count++;
      },
    });

    expect(state.count).toBe(0);
    state.increment();
    expect(state.count).toBe(1);
  });

  it('should handle multiple properties reactively', () => {
    const state = reactive({ count: 0, text: 'hello' });
    const mockFn = vi.fn(() => state.text);
    effect(mockFn);

    state.text = 'world';
    expect(state.text).toBe('world');

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should not make primitive types reactive', () => {
    // @ts-ignore
    const reactiveNumber = reactive(1);
    expect(isReactive(reactiveNumber)).toBe(false);
    expect(reactiveNumber).toBe(1);

    // @ts-ignore
    const reactiveString = reactive('test');
    expect(isReactive(reactiveString)).toBe(false);
    expect(reactiveString).toBe('test');
  });

  it('should not create a new proxy when passed a reactive object', () => {
    const state = reactive({ count: 0 });
    const state2 = reactive(state);
    expect(state).toBe(state2);
  });

  it('should return the raw object with toRaw', () => {
    const reactiveObj = reactive({ name: 'John', age: 30 });
    const rawObj = toRaw(reactiveObj);
    expect(isReactive(rawObj)).toBe(false);

    reactiveObj.name = 'Doe';
    expect(rawObj.name).toBe('Doe'); // change proxy object to synchronize to original object
  });

  it('should not trigger when assigning the same nested object through its proxy', () => {
    const rawChild = { name: 'Alice' };
    const state = reactive({ child: rawChild });
    const mockFn = vi.fn(() => state.child);
    effect(mockFn);

    const child = state.child;
    state.child = child;

    expect(toRaw(state.child)).toBe(rawChild);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  describe('own getters track via receiver (SIG-08)', () => {
    it('re-runs an effect when a getter dependency changes', () => {
      const state = reactive({
        first: 'a',
        last: 'b',
        get full() {
          return `${this.first} ${this.last}`;
        },
      });

      let seen = '';
      let runs = 0;
      effect(
        () => {
          runs++;
          seen = state.full;
        },
        { flush: 'sync' },
      );
      expect(seen).toBe('a b');
      expect(runs).toBe(1);

      state.first = 'x';
      expect(seen).toBe('x b');
      expect(runs).toBe(2);
    });

    it('tracks getter deps inside computed', () => {
      const state = reactive({
        n: 1,
        get double() {
          return this.n * 2;
        },
      });
      const c = computed(() => state.double);
      expect(c.value).toBe(2);
      state.n = 3;
      expect(c.value).toBe(6);
    });
  });

  describe('exotic objects are not proxied (SIG-17)', () => {
    it('returns Date instances as-is', () => {
      const d = new Date();
      const state = reactive({ d });
      // Reading through the proxy must return a working Date (not a proxy
      // whose method calls throw "incompatible receiver").
      expect(() => state.d.getTime()).not.toThrow();
      expect(state.d.getTime()).toBe(d.getTime());
      expect(reactive(d)).toBe(d);
    });

    it('returns Promise instances as-is', async () => {
      const p = Promise.resolve(42);
      const state = reactive({ p });
      // .then on a proxied promise breaks the internal-slot check.
      await expect(state.p).resolves.toBe(42);
      expect(reactive(p)).toBe(p);
    });

    it('returns RegExp instances as-is', () => {
      const r = /x/g;
      expect(reactive(r)).toBe(r);
    });

    it('returns non-extensible objects as-is', () => {
      const frozen = Object.freeze({ a: 1 });
      expect(reactive(frozen)).toBe(frozen);
      const sealed = Object.seal({ a: 1 });
      expect(reactive(sealed)).toBe(sealed);
    });

    it('does not break frozen objects stored inside reactive state', () => {
      const frozen = Object.freeze({ a: 1 });
      const state = reactive<{ f: { a: number } }>({ f: frozen });
      // Reading a frozen nested object must not create a proxy that violates
      // the Proxy invariant for non-configurable/non-writable properties.
      expect(() => state.f.a).not.toThrow();
      expect(state.f.a).toBe(1);
    });
  });

  describe('failed sets do not notify (SIG-19)', () => {
    it('does not re-run effects when assignment to a frozen nested target fails', () => {
      const inner = { a: 1 };
      const state = reactive({ inner });
      Object.freeze(inner);

      let runs = 0;
      effect(
        () => {
          runs++;
          void state.inner.a;
        },
        { flush: 'sync' },
      );
      expect(runs).toBe(1);

      try {
        state.inner.a = 2; // Reflect.set fails on the frozen raw target
      } catch {
        // strict-mode TypeError is acceptable; silence is too
      }
      expect(runs).toBe(1);
    });
  });
});
describe('reactive collection and shape regressions', () => {
  it('notifies length and removed-index readers when an array is truncated', () => {
    const values = reactive([1, 2, 3]);
    const seenLengths: number[] = [];
    const seenThird: Array<number | undefined> = [];
    const lengthRunner = effect(() => seenLengths.push(values.length));
    const indexRunner = effect(() => seenThird.push(values[2]));

    values.length = 1;

    expect(seenLengths).toEqual([3, 1]);
    expect(seenThird).toEqual([3, undefined]);
    lengthRunner();
    indexRunner();
  });

  it('notifies iteration when adding an undefined property', () => {
    const value = reactive<Record<string, unknown>>({ existing: 1 });
    const seen: string[][] = [];
    const runner = effect(() => seen.push(Object.keys(value)));

    value.added = undefined;

    expect(seen).toEqual([['existing'], ['existing', 'added']]);
    runner();
  });

  it('tracks membership checks on plain objects', () => {
    const value = reactive<Record<string, unknown>>({});
    const seen: boolean[] = [];
    const runner = effect(() => seen.push('key' in value));

    value.key = 1;
    delete value.key;

    expect(seen).toEqual([false, true, false]);
    runner();
  });
});
describe('reactive - nested object and array behavior', () => {
  // Nested object reactivity
  it('should work with nested objects', () => {
    const state: any = reactive({
      user: {
        name: 'John',
        age: 30,
      },
    });

    const mockFn = vi.fn(() => state.user.age);
    effect(mockFn);

    expect(state.user.name).toBe('John');
    expect(state.user.age).toBe(30);
    expect(mockFn).toHaveBeenCalledTimes(1);

    state.user.age++;

    expect(state.user.age).toBe(31);
    expect(mockFn).toHaveBeenCalledTimes(2);

    state.user = { e: 3 };

    expect(state.user.e).toBe(3);
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should work with Array', () => {
    const state = reactive([1, 2, 3]);

    const mockFn = vi.fn(() => state.length);
    effect(mockFn);

    expect(state.length).toBe(3);
    expect(state[1]).toBe(2);
    expect(mockFn).toHaveBeenCalledTimes(1);

    state.push(4);
    expect(state.length).toBe(4);
    expect(state[3]).toBe(4);

    expect(mockFn).toHaveBeenCalledTimes(2);

    state.pop();
    expect(state.length).toBe(3);
    expect(mockFn).toHaveBeenCalledTimes(3);

    state.shift();
    expect(state.length).toBe(2);
    expect(mockFn).toHaveBeenCalledTimes(4);

    state[1] = 5;
    expect(state.length).toBe(2);
    expect(state[1]).toBe(5);
    // Per-index granularity: setting an EXISTING index does not change the
    // length, so a length-only effect is not re-run .
    expect(mockFn).toHaveBeenCalledTimes(4);
  });
  // Nested arrays reactivity
  it('should work with nested arrays', () => {
    const state = reactive({
      items: [1, 2, 3],
    });

    const mockFn = vi.fn(() => state.items.length);
    effect(mockFn);

    expect(state.items.length).toBe(3);
    expect(state.items[1]).toBe(2);
    expect(mockFn).toHaveBeenCalledTimes(1);

    state.items.push(4);
    expect(state.items.length).toBe(4);
    expect(state.items[3]).toBe(4);

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  // Deeply nested object reactivity
  it('should work with deeply nested objects', () => {
    const state = reactive<any>({ a: { b: { c: { d: 1 } } } });

    const mockFn = vi.fn(() => state.a.b?.c?.d);
    effect(mockFn);

    expect(state.a.b.c.d).toBe(1);
    expect(mockFn).toHaveBeenCalledTimes(1);

    state.a.b.c.d++;

    expect(state.a.b.c.d).toBe(2);
    expect(mockFn).toHaveBeenCalledTimes(2);

    state.a.b = { e: 3 };

    expect(state.a.b.e).toBe(3);
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  // Arrays of objects reactivity
  it('should work with arrays of objects', () => {
    const state = reactive({
      users: [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 },
      ],
    });

    expect(state.users.length).toBe(2);
    expect(state.users[0].name).toBe('Alice');

    state.users[1].age++;
    expect(state.users[1].age).toBe(31);
  });

  // Reactivity with array methods
  it('should handle array methods reactively', () => {
    const state = reactive([1, 2, 3]);

    state.push(4);
    expect(state.length).toBe(4);
    expect(state[3]).toBe(4);

    state.pop();
    expect(state.length).toBe(3);

    state.shift();
    expect(state.length).toBe(2);
    expect(state[0]).toBe(2);
  });

  it('should support includes/indexOf/lastIndexOf with reactive elements', () => {
    const raw = { id: 1 };
    const state = reactive([raw]);

    const proxy = state[0];

    expect(state.includes(proxy)).toBe(true);
    expect(state.indexOf(proxy)).toBe(0);
    expect(state.lastIndexOf(proxy)).toBe(0);

    expect(state.includes(raw)).toBe(true);
  });

  it('should not trigger when assigning the same array element through its proxy', () => {
    const raw = { id: 1 };
    const state = reactive([raw]);
    const mockFn = vi.fn(() => state[0]);
    effect(mockFn);

    const first = state[0];
    state[0] = first;

    expect(toRaw(state[0])).toBe(raw);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should return reactive elements from find in deep reactive arrays', () => {
    const state = reactive([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
      { id: 3, label: 'c' },
    ]);

    const found = computed(() => state.find((item) => item.id === 2));
    const value = found.value!;

    expect(value.label).toBe('b');
    expect(isReactive(value)).toBe(true);

    state[1].label = 'bb';
    expect(value.label).toBe('bb');
  });

  // Node 20+
  // @ts-expect-error tests are not limited to es2016
  it.skipIf(!Array.prototype.findLast)(
    'should return reactive elements from findLast in deep reactive arrays',
    () => {
      const state = reactive([
        { id: 1, label: 'a' },
        { id: 2, label: 'b' },
        { id: 3, label: 'c' },
      ]);

      // @ts-ignore - findLast is not in the type definition
      const found = computed(() => state.findLast((item: any) => item.id > 1));
      const value = found.value!;

      expect(value.id).toBe(3);
      expect(isReactive(value)).toBe(true);
    },
  );

  it('should return raw elements from find in shallow reactive arrays', () => {
    const state = shallowReactive([{ id: 1 }, { id: 2 }]);
    const found = state.find((item) => item.id === 2);

    expect(found?.id).toBe(2);
    expect(isReactive(found)).toBe(false);
  });

  // Reactivity with nested arrays of objects
  it('should work with nested arrays of objects', () => {
    const state = reactive<any>({
      users: [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30, addresses: [{ city: 'New York' }] },
      ],
    });

    expect(state.users[1].addresses[0].city).toBe('New York');

    state.users[1].addresses[0].city = 'Los Angeles';
    expect(state.users[1].addresses[0].city).toBe('Los Angeles');
  });
  // Node 20+
  // @ts-expect-error tests are not limited to es2016
  it.skipIf(!Array.prototype.toReversed)('toReversed should return reactive array', () => {
    const array = reactive([1, { val: 2 }]);
    // @ts-ignore - toReversed is not in the type definition
    const result = computed(() => array.toReversed());
    expect(result.value).toStrictEqual([{ val: 2 }, 1]);
    expect(isReactive(result.value[0])).toBe(true);

    array.splice(1, 1, 2);
    expect(result.value).toStrictEqual([2, 1]);
  });

  // Node 20+
  // @ts-expect-error tests are not limited to es2016
  it.skipIf(!Array.prototype.toSorted)('toSorted should return reactive array', () => {
    // No comparer
    // @ts-expect-error
    expect(shallowReactive([2, 1, 3] as number[]).toSorted()).toStrictEqual([1, 2, 3]);

    const shallow = shallowReactive([{ val: 2 }, { val: 1 }, { val: 3 }]);
    let result;
    // @ts-ignore - toSorted is not in the type definition
    result = computed(() => shallow.toSorted((a, b) => a.val - b.val));
    expect(result.value.map((x) => x.val)).toStrictEqual([1, 2, 3]);
    expect(isReactive(result.value[0])).toBe(false);

    shallow[0].val = 4;
    expect(result.value.map((x) => x.val)).toStrictEqual([1, 4, 3]);

    shallow.pop();
    expect(result.value.map((x) => x.val)).toStrictEqual([1, 4]);

    const deep = reactive([{ val: 2 }, { val: 1 }, { val: 3 }]);
    // @ts-ignore - toSorted is not in the type definition
    result = computed(() => deep.toSorted((a, b) => a.val - b.val));
    expect(result.value.map((x) => x.val)).toStrictEqual([1, 2, 3]);
    expect(isReactive(result.value[0])).toBe(true);

    deep[0].val = 4;
    // The comparator observes reactive elements (SIG-11), so `val` is tracked
    // and the computed re-sorts with the updated values: [4,1,3] → [1,3,4].
    expect(result.value.map((x) => x.val)).toStrictEqual([1, 3, 4]);
  });

  // Node 20+
  // @ts-expect-error tests are not limited to es2016
  it.skipIf(!Array.prototype.toSpliced)('toSpliced should return reactive array', () => {
    const array = reactive([1, 2, 3]);
    // @ts-ignore - toSpliced is not in the type definition
    const result = computed(() => array.toSpliced(1, 1, -2));
    expect(result.value).toStrictEqual([1, -2, 3]);

    // Now modify the original array
    array[0] = 0;
    // The result should be update with the new value at index 0
    expect(result.value).toStrictEqual([0, -2, 3]);
  });

  it('values', () => {
    const shallow = shallowReactive([{ val: 1 }, { val: 2 }]);
    const result = computed(() => Array.from(shallow.values()));
    expect(result.value).toStrictEqual([{ val: 1 }, { val: 2 }]);
    expect(isReactive(result.value[0])).toBe(false);

    shallow.pop();
    expect(result.value).toStrictEqual([{ val: 1 }]);

    const deep = reactive([{ val: 1 }, { val: 2 }]);
    const firstItem = Array.from(deep.values())[0];
    expect(isReactive(firstItem)).toBe(true);
  });
});
describe('shallowReactive - shallow reactivity behavior', () => {
  it('should keep separate proxy caches for deep and shallow modes', () => {
    const shallowFirstRaw = { nested: { count: 1 } };
    const shallowFirst = shallowReactive(shallowFirstRaw);
    const deepSecond = reactive(shallowFirstRaw);

    expect(shallowFirst).not.toBe(deepSecond);
    expect(isReactive(shallowFirst.nested)).toBe(false);
    expect(isReactive(deepSecond.nested)).toBe(true);

    const deepFirstRaw = { nested: { count: 1 } };
    const deepFirst = reactive(deepFirstRaw);
    const shallowSecond = shallowReactive(deepFirstRaw);

    expect(deepFirst).not.toBe(shallowSecond);
    expect(isReactive(deepFirst.nested)).toBe(true);
    expect(isReactive(shallowSecond.nested)).toBe(false);
  });

  it('should preserve shallow collection semantics', () => {
    const rawValue = { count: 1 };
    const rawMap = new Map<string, { count: number }>([['value', rawValue]]);
    const shallowMap = shallowReactive(rawMap);
    const deepMap = reactive(rawMap);

    expect(isReactive(shallowMap.get('value'))).toBe(false);
    expect(isReactive(deepMap.get('value'))).toBe(true);
  });

  // Shallow object reactivity
  it('should work with shallow reactivity in objects', () => {
    const state = shallowReactive<any>({ a: { b: { c: { d: 1 } } } });

    const mockFn = vi.fn(() => state.a?.b?.c?.d);
    effect(mockFn);

    expect(mockFn).toHaveBeenCalledTimes(1);

    state.a.b.c.d++;

    expect(mockFn).toHaveBeenCalledTimes(1); // no deep reactivity, should not trigger reactivity on deep change

    state.a = { b: { c: { d: 2 } } };
    expect(state.a.b.c.d).toBe(2);

    expect(mockFn).toHaveBeenCalledTimes(2);

    state.a.b = { e: 3 };
    expect(state.a.b.e).toBe(3);

    expect(mockFn).toHaveBeenCalledTimes(2); // no deep reactivity
  });

  // Shallow array reactivity
  it('should work with shallow reactivity in arrays', () => {
    const state = shallowReactive<any>([{ a: 1 }, { b: 2 }]);

    const mockFn = vi.fn(() => state[1]);
    effect(mockFn);

    expect(mockFn).toHaveBeenCalledTimes(1);

    // deep change value not reactive
    state[0].a++;

    expect(mockFn).toHaveBeenCalledTimes(1);

    state.push({ c: 3 });

    // Per-index granularity: a pure append only notifies the new slot,
    // length, and iteration readers — state[1] is untouched.
    expect(mockFn).toHaveBeenCalledTimes(1);

    state[1] = { d: 4 };

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  // Shallow reactivity with added properties
  it('should handle added properties shallowly', () => {
    const state = shallowReactive<any>({ count: 1 });

    state.newProp = 42; // shallowReactive should track new properties on root object
    expect(state.newProp).toBe(42);

    const mockFn = vi.fn(() => state.count);
    effect(mockFn);

    state.count++;
    expect(state.count).toBe(2);

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  // Shallow reactivity in nested arrays of objects
  it('should work with shallow nested arrays of objects', () => {
    const state = shallowReactive<any>({
      users: [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30, addresses: [{ city: 'New York' }] },
      ],
    });

    state.users[1].addresses[0].city = 'Los Angeles';
    expect(state.users[1].addresses[0].city).toBe('Los Angeles'); // should not track inner changes
  });
});
describe('reactive - primitive and non-object inputs', () => {
  // Handling numbers
  it('should not work with primitive numbers', () => {
    // @ts-ignore
    const state = reactive(1);
    expect(state).toBe(1);

    // @ts-ignore
    const shallowState = shallowReactive(1);
    expect(shallowState).toBe(1);
  });

  // Handling strings
  it('should not work with primitive strings', () => {
    // @ts-ignore
    const state = reactive('hello');
    expect(state).toBe('hello');

    // @ts-ignore
    const shallowState = shallowReactive('world');
    expect(shallowState).toBe('world');
  });

  // Handling booleans
  it('should not work with primitive booleans', () => {
    // @ts-ignore
    const state = reactive(true);
    expect(state).toBe(true);

    // @ts-ignore
    const shallowState = shallowReactive(false);
    expect(shallowState).toBe(false);
  });

  // Handling null
  it('should not work with null', () => {
    // @ts-ignore
    const state = reactive(null);
    expect(state).toBe(null);

    // @ts-ignore
    const shallowState = shallowReactive(null);
    expect(shallowState).toBe(null);
  });

  // Handling undefined
  it('should not work with undefined', () => {
    // @ts-ignore
    const state = reactive(undefined);
    expect(state).toBe(undefined);

    // @ts-ignore
    const shallowState = shallowReactive(undefined);
    expect(shallowState).toBe(undefined);
  });

  // Handling symbols
  it('should not work with symbols', () => {
    const symbol = Symbol('test');
    // @ts-ignore
    const state = reactive(symbol);
    expect(state).toBe(symbol);

    // @ts-ignore
    const shallowState = shallowReactive(symbol);
    expect(shallowState).toBe(symbol);
  });

  // Handling functions
  it('should not work with functions', () => {
    const func = () => {};
    // @ts-ignore
    const state = reactive(func);
    expect(state).toBe(func);

    // @ts-ignore
    const shallowState = shallowReactive(func);
    expect(shallowState).toBe(func);
  });
});

// Identity

describe('isReactive', () => {
  it('uses signalsFlags for reactive and shallow type guards', () => {
    const flaggedReactive = { [signalsFlags.IS_REACTIVE]: true };
    const flaggedShallow = { [signalsFlags.IS_SHALLOW]: true };

    expect(isReactive(flaggedReactive)).toBe(true);
    expect(isShallow(flaggedShallow)).toBe(true);
  });

  it('exposes raw, reactive, and shallow state through signalsFlags', () => {
    const raw = { nested: { value: 1 } };
    const deep = reactive(raw) as unknown as Record<PropertyKey, unknown>;
    const shallow = shallowReactive(raw) as unknown as Record<PropertyKey, unknown>;

    expect(deep[signalsFlags.IS_REACTIVE]).toBe(true);
    expect(deep[signalsFlags.IS_SHALLOW]).toBe(false);
    expect(deep[signalsFlags.RAW]).toBe(raw);
    expect(shallow[signalsFlags.IS_REACTIVE]).toBe(true);
    expect(shallow[signalsFlags.IS_SHALLOW]).toBe(true);
    expect(shallow[signalsFlags.RAW]).toBe(raw);
    expect(isShallow(shallow)).toBe(true);
    expect(isShallow(deep)).toBe(false);
    expect(toRaw(deep)).toBe(raw);
    expect(toRaw(shallow)).toBe(raw);
  });

  it('should work with check if object is reactive', () => {
    const state = reactive({ count: 0 });
    expect(isReactive(state)).toBe(true);
  });

  it('should work with check if object is not reactive', () => {
    const obj = { count: 0 };

    expect(isReactive(obj)).toBe(false);
  });
});

describe('toRaw', () => {
  it('should return primitive values directly', () => {
    const num = 42;
    // @ts-ignore
    const result = toRaw(num);
    expect(result).toStrictEqual(num);
    //@ts-ignore
    expect(isReactive(result)).toBe(false);
  });

  it('should return non-reactive objects as-is', () => {
    const obj = { a: 1, b: { c: 2 } };
    const result = toRaw(obj);
    expect(result).toStrictEqual(obj);
    expect(isReactive(result)).toBe(false);
  });

  it('should remove reactivity from a reactive object', () => {
    const reactiveObj = reactive({ a: 1, b: { c: 2 } });
    const result = toRaw(reactiveObj);

    expect(result).toStrictEqual({ a: 1, b: { c: 2 } });
    expect(isReactive(result)).toBe(false);
  });

  it('should work with arrays', () => {
    const reactiveArray = reactive([1, { a: 2 }, 3] as const);
    const result = toRaw(reactiveArray);

    expect(result).toStrictEqual([1, { a: 2 }, 3]);
    expect(isReactive(result[1])).toBe(false);
  });

  it('should handle shallow reactive objects', () => {
    const shallowObj = shallowReactive({ a: 1, b: { c: 2 } });
    const result = toRaw(shallowObj);

    expect(result).toStrictEqual({ a: 1, b: { c: 2 } });
    expect(isReactive(result)).toBe(false);
    expect(isReactive(result.b)).toBe(false);
  });
});

// Feature: code-quality-improvement, Task 12.1: Edge case tests for reactive function

// Objects

describe('reactive object contracts', () => {
  it('tracks membership for a user-defined symbol', () => {
    const token = Symbol('token');
    const state = reactive({} as Record<symbol, number>);
    const seen: boolean[] = [];
    const runner = effect(() => {
      seen.push(token in state);
    });

    state[token] = 1;
    delete state[token];

    expect(seen).toEqual([false, true, false]);
    runner();
  });

  it('reads reactive identity from inherited signalsFlags', () => {
    const parent = reactive({ value: 0 });
    const rawChild = Object.create(parent) as { value: number };

    expect(isReactive(rawChild)).toBe(true);
    expect(toRaw(rawChild)).toBe(rawChild);

    const child = reactive(rawChild);

    expect(child).not.toBe(rawChild);
    expect(isReactive(child)).toBe(true);
    expect(toRaw(child)).toBe(rawChild);
  });

  it('preserves a reactive value assigned to a shallow object', () => {
    const proxy = reactive({ id: 1 });
    const state = shallowReactive<{ value: object }>({ value: {} });

    state.value = proxy;

    expect(toRaw(state).value).toBe(proxy);
  });
});

// Property descriptors

describe('reactive defineProperty tracking', () => {
  it('does not re-notify when the same data descriptor is reapplied', () => {
    const state = reactive({ text: 'a' });
    const spy = vi.fn();
    effect(() => spy(state.text));
    expect(spy).toHaveBeenCalledTimes(1);

    Object.defineProperty(state, 'text', {
      value: 'a',
      writable: true,
      enumerable: true,
      configurable: true,
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('notifies once for assignment (no double fire with defineProperty path)', () => {
    const state = reactive({ text: 'a' });
    const spy = vi.fn();
    effect(() => spy(state.text));
    expect(spy).toHaveBeenCalledTimes(1);

    state.text = 'b';
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith('b');
  });
});

describe('reactive branding', () => {
  it('does not treat spoofed string fields as reactive markers', () => {
    const fake = { _IS_REACTIVE: true, _RAW: { n: 1 }, n: 2 };
    expect(isReactive(fake)).toBe(false);
    expect(toRaw(fake)).toBe(fake);
    expect(toRaw(fake)._RAW).toEqual({ n: 1 });
  });

  it('preserves user _RAW field inside reactive state', () => {
    const state = reactive({ _RAW: { secret: 1 }, count: 0 });
    expect(state._RAW).toEqual({ secret: 1 });
    expect(toRaw(state)).toEqual({ _RAW: { secret: 1 }, count: 0 });
    expect(toRaw(state)._RAW).toEqual({ secret: 1 });
  });

  it('structuredClone of toRaw reactive payload keeps user brand-like fields', () => {
    const payload = { _IS_REACTIVE: true, _RAW: 9, list: [1] };
    const state = reactive(payload);
    const cloned = structuredClone(toRaw(state));
    expect(cloned).toEqual(payload);
  });
});

// Arrays

describe('reactive array contracts', () => {
  it('tracks membership for a user-defined symbol', () => {
    const token = Symbol('token');
    const list = reactive<number[]>([]);
    const seen: boolean[] = [];
    const runner = effect(() => {
      seen.push(token in list);
    });

    Reflect.set(list, token, 1);
    Reflect.deleteProperty(list, token);

    expect(seen).toEqual([false, true, false]);
    runner();
  });

  it.each(['-1', '-0', '01', '1.0', 'NaN', 'Infinity'])(
    'treats %s as an ordinary property without changing length',
    (key) => {
      const list = reactive<number[]>([]);
      const lengths: number[] = [];
      const runner = effect(() => {
        lengths.push(list.length);
      });

      (list as unknown as Record<string, number>)[key] = 1;

      expect(list.length).toBe(0);
      expect(lengths).toEqual([0]);
      runner();
    },
  );

  it.each([
    ['0', 1],
    ['1', 2],
  ] as const)('treats %s as a canonical array index', (key, expectedLength) => {
    const list = reactive<number[]>([]);
    const lengths: number[] = [];
    const runner = effect(() => {
      lengths.push(list.length);
    });

    (list as unknown as Record<string, number>)[key] = 1;

    expect(list.length).toBe(expectedLength);
    expect(lengths).toEqual([0, expectedLength]);
    runner();
  });

  it('tracks a canonical array index by its own key', () => {
    const list = reactive<number[]>([]);
    const seen: boolean[] = [];
    const runner = effect(() => {
      seen.push(0 in list);
    });

    list[0] = 1;

    expect(seen).toEqual([false, true]);
    runner();
  });

  it('tracks index membership without coupling it to length growth', () => {
    const list = reactive<number[]>([]);
    const seen: boolean[] = [];
    const runner = effect(() => {
      seen.push(0 in list);
    });

    list.length = 1;
    list[0] = 1;
    delete list[0];

    expect(seen).toEqual([false, true, false]);
    runner();
  });

  it('invalidates present index membership when length truncates the slot', () => {
    const list = reactive([1, 2]);
    const seen: boolean[] = [];
    const runner = effect(() => {
      seen.push(1 in list);
    });

    list.length = 1;

    expect(seen).toEqual([true, false]);
    runner();
  });

  it('treats 4294967294 as the maximum array index', () => {
    const list = reactive<number[]>([]);
    const seen: number[] = [];
    const runner = effect(() => {
      seen.push(list.length);
    });

    list[4294967294] = 1;

    expect(list.length).toBe(4294967295);
    expect(seen).toEqual([0, 4294967295]);
    runner();
  });

  it('does not notify a prototype array for an inherited receiver write', () => {
    const parent = reactive<number[]>([0]);
    const rawChild: number[] = [];
    Object.setPrototypeOf(rawChild, parent);
    const child = reactive(rawChild);
    const seen: number[] = [];
    const runner = effect(() => {
      seen.push(parent[0]);
    });

    child[0] = 1;

    expect(parent[0]).toBe(0);
    expect(child[0]).toBe(1);
    expect(seen).toEqual([0]);
    runner();
  });

  it('preserves values written into a shallow array', () => {
    const proxy = reactive({ id: 1 });
    const list = shallowReactive<object[]>([]);

    list[0] = proxy;
    list.push(proxy);

    expect(toRaw(list)[0]).toBe(proxy);
    expect(toRaw(list)[1]).toBe(proxy);
  });

  it('preserves a passed proxy in shallow callbacks, copies, and iterators', () => {
    const proxy = reactive({ id: 1 });
    const list = shallowReactive([proxy]);
    let callbackValue: object | undefined;

    list.find((value) => {
      callbackValue = value;
      return true;
    });

    expect(callbackValue).toBe(proxy);
    expect(list.slice()[0]).toBe(proxy);
    expect(list.toSorted()[0]).toBe(proxy);
    expect(list.values().next().value).toBe(proxy);
    expect([...list][0]).toBe(proxy);
  });

  it('returns raw values from shallow array copies and iterators', () => {
    const raw = { id: 1 };
    const list = shallowReactive([raw]);

    const fromValues = list.values().next().value;
    const fromSpread = [...list][0];
    const fromSorted = list.toSorted((a, b) => a.id - b.id)[0];

    expect(fromValues).toBe(raw);
    expect(fromSpread).toBe(raw);
    expect(fromSorted).toBe(raw);
    expect(isReactive(fromValues)).toBe(false);
  });

  it('calls an Array subclass mutator override with the reactive receiver', () => {
    let calls = 0;
    class DoubledArray extends Array<number> {
      override push(...values: number[]): number {
        calls++;
        expect(isReactive(this)).toBe(true);
        return super.push(...values.map((value) => value * 2));
      }
    }
    const list = reactive(new DoubledArray());

    list.push(2);

    expect(calls).toBe(1);
    expect([...list]).toEqual([4]);
  });

  it.each([
    ['push', [1, 2], [3], [1, 2, 3], 3, false],
    ['pop', [1, 2], [], [1], 2, false],
    ['splice', [1, 2, 3], [1, 1, 4], [1, 4, 3], [2], false],
    ['sort', [3, 1, 2], [(a: number, b: number) => a - b], [1, 2, 3], undefined, true],
    ['reverse', [1, 2, 3], [], [3, 2, 1], undefined, true],
    ['fill', [1, 2, 3], [0, 1, 3], [1, 0, 0], undefined, true],
    ['copyWithin', [1, 2, 3], [0, 1, 2], [2, 2, 3], undefined, true],
  ] as const)(
    'calls an Array subclass %s override exactly once with native behavior',
    (methodName, initial, args, expected, expectedResult, returnsReceiver) => {
      let calls = 0;
      let receivedThis: unknown;
      class CustomArray extends Array<number> {}
      Object.defineProperty(CustomArray.prototype, methodName, {
        configurable: true,
        value(this: number[], ...methodArgs: unknown[]) {
          calls++;
          receivedThis = this;
          return Reflect.apply(Array.prototype[methodName], this, methodArgs);
        },
      });
      const list = reactive(new CustomArray(...initial));

      const result = Reflect.apply(
        list[methodName] as (...values: unknown[]) => unknown,
        list,
        args,
      );

      expect(calls).toBe(1);
      expect(receivedThis).toBe(list);
      expect([...list]).toEqual(expected);
      if (returnsReceiver) {
        expect(result).toBe(list);
      } else if (methodName === 'splice') {
        expect([...(result as number[])]).toEqual(expectedResult);
      } else {
        expect(result).toBe(expectedResult);
      }
    },
  );

  it('notifies a subclass index reader once per direct assignment', () => {
    class CustomArray extends Array<number> {}
    const raw = new CustomArray();
    raw[0] = 0;
    const list = reactive(raw);
    const seen: number[] = [];
    const runner = effect(() => {
      seen.push(list[0] + [...list].length);
    });

    list[0] = 1;

    expect(seen).toEqual([1, 2]);
    runner();
  });

  it('calls an Array subclass read override with the reactive receiver', () => {
    let calls = 0;
    class CustomArray extends Array<number> {
      override map<U>(callback: (value: number, index: number, array: number[]) => U): U[] {
        calls++;
        expect(isReactive(this)).toBe(true);
        return super.map(callback);
      }
    }
    const list = reactive(new CustomArray(1, 2));

    expect(list.map((value) => value * 2)).toEqual([2, 4]);
    expect(calls).toBe(1);
  });

  it('calls an Array subclass find override with the reactive receiver', () => {
    let calls = 0;
    const expectedPredicate = (value: number) => value === 2;
    const thisArg = {};
    class CustomArray extends Array<number> {
      override find(
        predicate: (value: number, index: number, obj: number[]) => unknown,
        receivedThisArg?: unknown,
      ): number | undefined {
        calls++;
        expect(isReactive(this)).toBe(true);
        expect(predicate).toBe(expectedPredicate);
        expect(receivedThisArg).toBe(thisArg);
        return Reflect.apply(Array.prototype.find, this, [predicate, receivedThisArg]);
      }
    }
    const list = reactive(new CustomArray(1, 2));

    expect(Reflect.apply(list.find, list, [expectedPredicate, thisArg])).toBe(2);
    expect(calls).toBe(1);
  });

  it('preserves the native array iterator prototype', () => {
    const raw = { id: 1 };
    const list = reactive([raw]);
    const iterator = list.values();
    const nativeIterator = [raw].values();

    expect(Object.getPrototypeOf(iterator)).toBe(Object.getPrototypeOf(nativeIterator));
    expect(isReactive(iterator.next().value)).toBe(true);
  });

  it.each([false, true])('passes shallow=%s find callbacks the reactive receiver', (shallow) => {
    const raw = { id: 1 };
    const list = shallow ? shallowReactive([raw]) : reactive([raw]);
    let receivedItem: object | undefined;
    let receivedArray: Array<{ id: number }> | undefined;

    list.find((item, _index, array) => {
      receivedItem = item;
      receivedArray = array;
      return true;
    });

    expect(receivedArray).toBe(list);
    expect(receivedItem).toBe(shallow ? raw : list[0]);
    expect(isReactive(receivedItem)).toBe(!shallow);
  });

  it('preserves native sparse callback semantics', () => {
    const raw: Array<{ id: number }> = [];
    raw.length = 3;
    raw[1] = { id: 1 };
    const list = reactive(raw);
    const mappedIndexes: number[] = [];
    const findIndexes: number[] = [];

    const mapped = list.map((_item, index, array) => {
      expect(array).toBe(list);
      mappedIndexes.push(index);
      return index;
    });
    list.find((_item, index, array) => {
      expect(array).toBe(list);
      findIndexes.push(index);
      return false;
    });

    expect(mappedIndexes).toEqual([1]);
    expect(0 in mapped).toBe(false);
    expect(mapped[1]).toBe(1);
    expect(2 in mapped).toBe(false);
    expect(findIndexes).toEqual([0, 1, 2]);
  });

  it('batches a sync-scheduled effect across one splice', () => {
    const list = reactive([1, 2, 3]);
    const seen: number[][] = [];
    const runner = effect(
      () => {
        seen.push([...list]);
      },
      { flush: 'sync' },
    );

    list.splice(0, 2, 4, 5);

    expect(seen).toEqual([
      [1, 2, 3],
      [4, 5, 3],
    ]);
    runner();
  });
});

// Legacy array coverage

describe('reactive Arrays with Effects', () => {
  let state: any;
  let effectFn;
  let runner: ReturnType<typeof effect>;

  beforeEach(() => {
    state = reactive([1, 2, 3]);
    effectFn = vi.fn(() => {
      state[0];
    });
    runner = effect(effectFn, { flush: 'sync' });
  });

  afterEach(() => {
    runner();
  });

  it('should not re-run an index reader when appending via index set', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);
    state[3] = 4;
    expect(state).toEqual([1, 2, 3, 4]);
    // Per-index granularity: appending state[3] does not touch state[0].
    expect(effectFn).toHaveBeenCalledTimes(1);
    state[0] = 10;
    expect(effectFn).toHaveBeenCalledTimes(2);
  });
  it('should not re-run an index reader on push', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);
    state.push(4);
    expect(state).toEqual([1, 2, 3, 4]);
    // A pure append only notifies appended slots + length + iteration.
    expect(effectFn).toHaveBeenCalledTimes(1);
  });

  it('should not re-run an untouched index reader on pop', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.pop();
    expect(state).toEqual([1, 2]);
    // pop removes the tail slot; state[0] is untouched.
    expect(effectFn).toHaveBeenCalledTimes(1);
  });

  it('should handle shift and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.shift();
    expect(state).toEqual([2, 3]);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle unshift and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.unshift(0);
    expect(state).toEqual([0, 1, 2, 3]);

    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should not re-run an untouched index reader on splice', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.splice(1, 1);
    expect(state).toEqual([1, 3]);
    expect(effectFn).toHaveBeenCalledTimes(1);
  });

  it('should handle sort and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.sort((a: number, b: number) => b - a);
    expect(state).toEqual([3, 2, 1]);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle reverse and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.reverse();
    expect(state).toEqual([3, 2, 1]);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle map and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    const mapped = state.map((n: number) => n * 2);
    expect(mapped).toEqual([2, 4, 6]);
    expect(effectFn).toHaveBeenCalledTimes(1);
    state[0] = 2;

    expect(mapped).toEqual([2, 4, 6]);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle filter and trigger effect', () => {
    let filtered;
    const effectFn = vi.fn(() => {
      filtered = state.filter((n: number) => n > 1);
    });

    effect(effectFn, { flush: 'sync' });

    expect(effectFn).toHaveBeenCalledTimes(1);
    expect(filtered).toEqual([2, 3]);
    expect(effectFn).toHaveBeenCalledTimes(1);

    state[0] = 2;
    expect(filtered).toEqual([2, 2, 3]);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle concat and not trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    const concatenated = state.concat([4, 5]);
    expect(concatenated).toEqual([1, 2, 3, 4, 5]);
    expect(effectFn).toHaveBeenCalledTimes(1);
  });

  it('should handle slice and not trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    const sliced = state.slice(1, 2);
    expect(sliced).toEqual([2]);
    expect(effectFn).toHaveBeenCalledTimes(1);
  });

  it('should handle forEach and not trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    let sum = 0;
    state.forEach((n: number) => (sum += n));
    expect(sum).toBe(6);
    expect(effectFn).toHaveBeenCalledTimes(1);
    state[0] = 2;
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle indexOf and not trigger effect', () => {
    let index;
    const effectFn = vi.fn(() => {
      index = state.indexOf(2);
    });
    effect(effectFn, { flush: 'sync' });
    expect(index).toBe(1);
    expect(effectFn).toHaveBeenCalledTimes(1);

    state[0] = 2;
    expect(index).toBe(0);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle includes and not trigger effect', () => {
    let includes;

    const effectFn = vi.fn(() => {
      includes = state.includes(2);
    });

    effect(effectFn, { flush: 'sync' });

    expect(includes).toBe(true);
    expect(effectFn).toHaveBeenCalledTimes(1);

    state[1] = 1;
    expect(includes).toBe(false);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });
  it('should handle fill and not trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    const filled = state.fill(0);
    expect(filled).toEqual([0, 0, 0]);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });
});

describe('reactive Arrays - element identity after non-mutating methods', () => {
  // Regression: slice/concat/filter/map/flatMap/flat must preserve reactive
  // item identity. Previously they applied on the raw array, silently
  // returning non-reactive items and breaking downstream mutation tracking.
  it('slice returns an array whose object items are still reactive proxies', () => {
    const items = [{ n: 1 }, { n: 2 }];
    const state = reactive(items);
    const sliced = state.slice();

    expect(sliced).toHaveLength(2);
    expect(isReactive(sliced[0])).toBe(true);
    expect(isReactive(sliced[1])).toBe(true);
  });

  it('mutating an item obtained via slice triggers effects subscribed to that item', () => {
    const state = reactive([{ label: 'a' }, { label: 'b' }]);
    const spy = vi.fn(() => state[0].label);
    effect(spy);
    expect(spy).toHaveBeenCalledTimes(1);

    const sliced = state.slice();
    sliced[0].label = 'A';

    expect(spy).toHaveBeenCalledTimes(2);
    expect(state[0].label).toBe('A');
  });

  it('filter preserves reactive item identity', () => {
    const state = reactive([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const filtered = state.filter((item) => item.id > 1);

    expect(filtered).toHaveLength(2);
    expect(isReactive(filtered[0])).toBe(true);
    expect(toRaw(filtered[0])).toBe(toRaw(state[1]));
  });

  it('map yields reactive items to its callback', () => {
    const state = reactive([{ n: 1 }, { n: 2 }]);
    const seen: boolean[] = [];
    state.map((item) => seen.push(isReactive(item)));

    expect(seen).toEqual([true, true]);
  });

  it('concat yields reactive items for elements from the source array', () => {
    const state = reactive([{ n: 1 }]);
    const result = state.concat([{ n: 2 }]);

    expect(isReactive(result[0])).toBe(true);
    // The appended element is freshly supplied by the caller and is not
    // auto-wrapped — that matches native concat semantics.
  });
});

describe('reactive Arrays - raw/proxy identity (SIG-10/11)', () => {
  it('does not leak proxies into raw storage via push', () => {
    const item = reactive({ id: 1 });
    const list = reactive<Array<{ id: number }>>([]);
    list.push(item);

    const raw = toRaw(list);
    // The stored element must be the raw object, not the proxy.
    expect(raw[0]).toBe(toRaw(item));
  });

  it('sort/reverse return the receiver so chaining stays reactive', () => {
    const list = reactive([3, 1, 2]);
    expect(list.sort()).toBe(list);
    expect(list.reverse()).toBe(list);
  });

  it('find callback receives reactive elements', () => {
    const list = reactive([{ id: 1, tag: 'a' }]);
    let sawReactive = false;
    list.find((el) => {
      // Mutating through the callback element must trigger effects.
      sawReactive = el === list[0];
      return el.id === 1;
    });
    expect(sawReactive).toBe(true);

    let runs = 0;
    effect(
      () => {
        runs++;
        void list[0].tag;
      },
      { flush: 'sync' },
    );
    expect(runs).toBe(1);

    list.find((el) => {
      el.tag = 'b';
      return true;
    });
    expect(runs).toBe(2);
  });

  it('toSorted comparator receives reactive elements and result items are reactive', () => {
    const list = reactive([{ n: 2 }, { n: 1 }]);
    const sorted = list.toSorted((a, b) => a.n - b.n);
    expect(sorted.map((e) => e.n)).toEqual([1, 2]);

    let runs = 0;
    effect(
      () => {
        runs++;
        void sorted[0].n;
      },
      { flush: 'sync' },
    );
    expect(runs).toBe(1);
    // Mutating via the returned wrapper must notify (elements are proxies
    // of the same raw objects).
    sorted[0].n = 10;
    expect(runs).toBe(2);
    expect(list.find((e) => e.n === 10)).toBeTruthy();
  });
});
describe('reactive Arrays - has/delete/ownKeys traps', () => {
  it('re-runs an effect that uses `index in array` when the index is deleted', () => {
    const state = reactive([1, 2, 3]);
    const spy = vi.fn(() => 2 in state);
    effect(spy);
    expect(spy).toHaveBeenCalledTimes(1);

    delete state[2];

    expect(spy).toHaveBeenCalledTimes(2);
    expect(2 in state).toBe(false);
  });

  it('triggers effects reading an index when that index is deleted', () => {
    const state = reactive([10, 20, 30]);
    const spy = vi.fn(() => state[1]);
    effect(spy);
    expect(spy).toHaveBeenCalledTimes(1);

    delete state[1];

    expect(spy).toHaveBeenCalledTimes(2);
    expect(state[1]).toBeUndefined();
  });

  it('re-runs an effect iterating keys when the array shape changes', () => {
    const state = reactive([1, 2]);
    const spy = vi.fn(() => Object.keys(state).length);
    effect(spy);
    expect(spy).toHaveBeenCalledTimes(1);

    state.push(3);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(Object.keys(state)).toEqual(['0', '1', '2']);
  });
});

// Collections

describe('reactive collection contracts', () => {
  it('triggers a Map dependency whose key is undefined', () => {
    const map = reactive(new Map<undefined, number>([[undefined, 0]]));
    const seen: number[] = [];
    const runner = effect(() => {
      seen.push(map.get(undefined)!);
    });

    map.set(undefined, 1);
    map.set(undefined, 2);

    expect(seen).toEqual([0, 1, 2]);
    runner();
  });

  it('does not trigger an undefined-key reader when another Map key changes', () => {
    const map = reactive(
      new Map<unknown, number>([
        [undefined, 0],
        ['other', 0],
      ]),
    );
    let runs = 0;
    const runner = effect(() => {
      runs++;
      void map.get(undefined);
    });

    map.set('other', 1);

    expect(runs).toBe(1);
    runner();
  });

  it('preserves values written into shallow collections', () => {
    const key = {};
    const proxy = reactive({ id: 1 });
    const map = shallowReactive(new Map<object, object>());
    const set = shallowReactive(new Set<object>());
    const weakMap = shallowReactive(new WeakMap<object, object>());

    map.set(key, proxy);
    set.add(proxy);
    weakMap.set(key, proxy);

    expect(toRaw(map).get(key)).toBe(proxy);
    expect(toRaw(set).has(proxy)).toBe(true);
    expect(toRaw(weakMap).get(key)).toBe(proxy);
  });

  it('does not duplicate a raw Set member in deep mode', () => {
    const rawValue = {};
    const proxyValue = reactive(rawValue);
    const rawSet = new Set<object>([rawValue]);
    const set = reactive(rawSet);

    set.add(proxyValue);

    expect(rawSet.size).toBe(1);
    expect(rawSet.has(rawValue)).toBe(true);
    expect(rawSet.has(proxyValue)).toBe(false);
  });

  it('preserves native iterator helpers while wrapping deep values', () => {
    const map = reactive(new Map([['item', { id: 1 }]]));
    const iterator = map.values() as IterableIterator<{ id: number }> & {
      map<U>(mapper: (value: { id: number }) => U): { toArray(): U[] };
    };

    expect(iterator.map((value) => value.id).toArray()).toEqual([1]);
  });

  it('preserves exact stored proxy values in shallow reads and iterators', () => {
    const proxy = reactive({ id: 1 });
    const map = shallowReactive(new Map([['item', proxy]]));
    const set = shallowReactive(new Set([proxy]));

    expect(map.get('item')).toBe(proxy);
    expect(map.values().next().value).toBe(proxy);
    expect(set.values().next().value).toBe(proxy);
  });

  it('falls back from a proxy Map key to its stored raw key for every operation', () => {
    const rawKey = {};
    const proxyKey = reactive(rawKey);
    const rawMap = new Map<object, string>([[rawKey, 'before']]);
    const map = reactive(rawMap);

    expect(map.get(proxyKey)).toBe('before');
    map.set(proxyKey, 'after');
    expect(rawMap.size).toBe(1);
    expect(rawMap.get(rawKey)).toBe('after');
    expect(map.delete(proxyKey)).toBe(true);
    expect(rawMap.has(rawKey)).toBe(false);
  });

  it('deletes the exact proxy Map key before falling back to the raw key', () => {
    const rawKey = {};
    const proxyKey = reactive(rawKey);
    const rawMap = new Map<object, string>([
      [rawKey, 'raw'],
      [proxyKey, 'proxy'],
    ]);
    const map = reactive(rawMap);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      expect(map.delete(proxyKey)).toBe(true);
      expect(rawMap.has(proxyKey)).toBe(false);
      expect(rawMap.has(rawKey)).toBe(true);
      expect(map.delete(proxyKey)).toBe(true);
      expect(rawMap.has(rawKey)).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('updates an existing proxy-only Map key without creating a raw-key entry', () => {
    const rawKey = {};
    const proxyKey = reactive(rawKey);
    const rawMap = new Map<object, string>([[proxyKey, 'before']]);
    const map = reactive(rawMap);

    map.set(proxyKey, 'after');

    expect(rawMap.size).toBe(1);
    expect(rawMap.get(proxyKey)).toBe('after');
    expect(rawMap.has(rawKey)).toBe(false);
  });

  it('updates an existing proxy-only WeakMap key without creating a raw-key entry', () => {
    const rawKey = {};
    const proxyKey = reactive(rawKey);
    const rawMap = new WeakMap<object, string>([[proxyKey, 'before']]);
    const map = reactive(rawMap);

    map.set(proxyKey, 'after');

    expect(rawMap.get(proxyKey)).toBe('after');
    expect(rawMap.has(rawKey)).toBe(false);
  });

  it('does not duplicate a proxy-only Set member', () => {
    const rawValue = {};
    const proxyValue = reactive(rawValue);
    const rawSet = new Set<object>([proxyValue]);
    const set = reactive(rawSet);

    set.add(proxyValue);

    expect(rawSet.size).toBe(1);
    expect(rawSet.has(proxyValue)).toBe(true);
    expect(rawSet.has(rawValue)).toBe(false);
  });

  it('warns and updates the exact key when raw and proxy Map keys coexist', () => {
    const rawKey = {};
    const proxyKey = reactive(rawKey);
    const rawMap = new Map<object, string>([
      [rawKey, 'raw'],
      [proxyKey, 'proxy'],
    ]);
    const map = reactive(rawMap);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      map.set(proxyKey, 'next');

      expect(rawMap.get(rawKey)).toBe('raw');
      expect(rawMap.get(proxyKey)).toBe('next');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.join(' ')).toMatch(/raw.*reactive/i);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// Legacy collection coverage

describe('reactive Set with Effects', () => {
  let state: Set<number>;
  let effectFn;
  let runner: ReturnType<typeof effect>;

  beforeEach(() => {
    state = reactive(new Set([1, 2, 3]));
    effectFn = vi.fn(() => {
      state.has(1);
    });
    runner = effect(effectFn, { flush: 'sync' });
  });

  afterEach(() => {
    runner();
  });

  it('should not re-run a has(1) reader when adding an unrelated value', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.add(4);
    expect(state.has(4)).toBe(true);
    // Per-key granularity: has(1) does not depend on membership of 4.
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.delete(1);
    // The tracked key changed — now it fires.
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should not trigger effect when adding an existing Set value', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.add(2);

    expect(state.has(2)).toBe(true);
    expect(effectFn).toHaveBeenCalledTimes(1);
  });

  it('should not re-run a has(1) reader when deleting an unrelated value', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.delete(2);
    expect(state.has(2)).toBe(false);
    // Per-key granularity: has(1) does not depend on membership of 2.
    expect(effectFn).toHaveBeenCalledTimes(1);
  });

  it('should handle clear and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.clear();
    expect(state.size).toBe(0);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle Set forEach and not trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    let sum = 0;
    state.forEach((val: number) => (sum += val));
    expect(sum).toBe(6);
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.add(4);

    expect(sum).toBe(6);
    // Per-key granularity: the effect reads has(1), which membership of 4
    // does not affect.
    expect(effectFn).toHaveBeenCalledTimes(1);
  });

  it('should handle has and not trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    const hasValue = state.has(2);
    expect(hasValue).toBe(true);
    expect(effectFn).toHaveBeenCalledTimes(1); // has shouldn't trigger effect
  });

  it('should handle size and trigger effect', () => {
    const sizeFn = vi.fn(() => state.size);
    const sizeRunner = effect(sizeFn, { flush: 'sync' });
    expect(sizeFn).toHaveBeenCalledTimes(1);

    expect(state.size).toBe(3);

    expect(sizeFn).toHaveBeenCalledTimes(1);

    state.add(4);
    expect(state.size).toBe(4);
    // size is an iteration dependency — membership changes re-run it.
    expect(sizeFn).toHaveBeenCalledTimes(2);
    sizeRunner();
  });

  it('preserves the native collection constructor', () => {
    expect(reactive(new Set()).constructor).toBe(Set);
    expect(reactive(new Map()).constructor).toBe(Map);
  });

  it('should handle values and trigger effect', () => {
    let values: number[] = [];
    const valuesFn = vi.fn(() => {
      values = Array.from(state.values());
    });
    const valuesRunner = effect(valuesFn, { flush: 'sync' });
    expect(valuesFn).toHaveBeenCalledTimes(1);
    expect(values).toEqual([1, 2, 3]);

    state.add(4);
    // Iteration readers re-run when membership changes.
    expect(valuesFn).toHaveBeenCalledTimes(2);
    expect(values).toEqual([1, 2, 3, 4]);
    valuesRunner();
  });

  it('should handle keys and trigger effect', () => {
    let keys: number[] = [];
    const keysFn = vi.fn(() => {
      keys = Array.from(state.keys());
    });
    const keysRunner = effect(keysFn, { flush: 'sync' });
    expect(keysFn).toHaveBeenCalledTimes(1);
    expect(keys).toEqual([1, 2, 3]);

    state.add(4);
    expect(keysFn).toHaveBeenCalledTimes(2);
    expect(keys).toEqual([1, 2, 3, 4]);
    keysRunner();
  });
  it('should handle entries and trigger effect', () => {
    let entries: Array<[number, number]> = [];
    const entriesFn = vi.fn(() => {
      entries = Array.from(state.entries());
    });
    const entriesRunner = effect(entriesFn, { flush: 'sync' });
    expect(entriesFn).toHaveBeenCalledTimes(1);
    expect(entries).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);

    state.add(4);
    expect(entriesFn).toHaveBeenCalledTimes(2);
    expect(entries).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
    entriesRunner();
  });
});
describe('reactive Map with Effects', () => {
  let state: Map<string, number>;
  let effectFn;
  let runner: ReturnType<typeof effect>;

  beforeEach(() => {
    state = reactive(
      new Map([
        ['key1', 1],
        ['key2', 2],
        ['key3', 3],
      ]),
    );
    effectFn = vi.fn(() => {
      state.get('key1');
    });
    runner = effect(effectFn, { flush: 'sync' });
  });

  afterEach(() => {
    runner();
  });

  it('should not re-run a get(key1) reader when setting an unrelated key', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.set('key4', 4);
    expect(state.get('key4')).toBe(4);
    // Per-key granularity: get('key1') does not depend on key4.
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.set('key1', 100);
    // The tracked key changed — now it fires.
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should not re-run a get(key1) reader when deleting an unrelated key', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.delete('key2');
    expect(state.has('key2')).toBe(false);
    // Per-key granularity: get('key1') does not depend on key2.
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.delete('key1');
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle clear and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.clear();
    expect(state.size).toBe(0);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle forEach and not trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    let sum = 0;
    state.forEach((val: number) => (sum += val));
    expect(sum).toBe(6);
    expect(effectFn).toHaveBeenCalledTimes(1); // forEach shouldn't trigger effect
  });

  it('should handle get and not trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    const value = state.get('key2');
    expect(value).toBe(2);
    expect(effectFn).toHaveBeenCalledTimes(1); // get shouldn't trigger effect
  });

  it('should handle size and not trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    const size = state.size;
    expect(size).toBe(3);
    expect(effectFn).toHaveBeenCalledTimes(1); // size shouldn't trigger effect
  });

  it('should wrap object keys and values when iterating Map entries', () => {
    const rawKey = { id: 1 };
    const rawValue = { label: 'entry' };
    const map = reactive(new Map([[rawKey, rawValue]]));
    const [[entryKey, entryValue]] = Array.from(map.entries());

    expect(isReactive(entryKey)).toBe(true);
    expect(isReactive(entryValue)).toBe(true);

    entryValue.label = 'updated';
    expect(rawValue.label).toBe('updated');
  });

  it('should normalize reactive object keys for Map lookups', () => {
    const rawKey = { id: 1 };
    const proxyKey = reactive(rawKey);
    const map = reactive(new Map<object, { count: number }>([[rawKey, { count: 1 }]]));

    const value = map.get(proxyKey);

    expect(value).toBeDefined();
    expect(isReactive(value)).toBe(true);
    expect(value?.count).toBe(1);
  });

  it('should preserve a proxy-key entry that stores undefined', () => {
    const rawKey = { id: 1 };
    const proxyKey = reactive(rawKey);
    const map = reactive(new Map<object, string | undefined>([[rawKey, 'raw']]));

    toRaw(map).set(proxyKey, undefined);

    expect(map.get(proxyKey)).toBeUndefined();
    expect(map.get(rawKey)).toBe('raw');
  });

  it('should normalize reactive object keys when setting Map entries', () => {
    const rawKey = { id: 1 };
    const proxyKey = reactive(rawKey);
    const map = reactive(new Map<object, string>([[rawKey, 'old']]));

    map.set(proxyKey, 'new');

    expect(map.size).toBe(1);
    expect(map.get(rawKey)).toBe('new');
    expect(map.get(proxyKey)).toBe('new');
  });
});
describe('reactive WeakSet with Effects', () => {
  let state: WeakSet<object>;
  let effectFn;
  let runner: ReturnType<typeof effect>;
  const obj1 = {};
  const obj2 = {};

  beforeEach(() => {
    state = reactive(new WeakSet([obj1, obj2]));
    effectFn = vi.fn(() => {
      state.has(obj1);
    });
    runner = effect(effectFn, { flush: 'sync' });
  });

  afterEach(() => {
    runner();
  });

  it('should not re-run a has(obj1) reader when adding an unrelated value', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    const obj3 = {};
    state.add(obj3);
    expect(state.has(obj3)).toBe(true);
    // Per-key granularity: has(obj1) does not depend on obj3.
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.delete(obj1);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should not re-run a has(obj1) reader when deleting an unrelated value', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.delete(obj2);
    expect(state.has(obj2)).toBe(false);
    // Per-key granularity: has(obj1) does not depend on obj2.
    expect(effectFn).toHaveBeenCalledTimes(1);
  });

  it('should handle has and not trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    const hasValue = state.has(obj2);
    expect(hasValue).toBe(true);
    expect(effectFn).toHaveBeenCalledTimes(1); // has shouldn't trigger effect
  });
});
describe('reactive WeakMap with Effects', () => {
  let state: WeakMap<object, number>;
  let effectFn;
  let runner: ReturnType<typeof effect>;
  const obj1 = {};
  const obj2 = {};

  beforeEach(() => {
    state = reactive(
      new WeakMap([
        [obj1, 1],
        [obj2, 2],
      ]),
    );
    effectFn = vi.fn(() => {
      state.get(obj1);
    });
    runner = effect(effectFn, { flush: 'sync' });
  });

  afterEach(() => {
    runner();
  });

  it('should not re-run a get(obj1) reader when setting an unrelated key', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    const obj3 = {};
    state.set(obj3, 3);
    expect(state.get(obj3)).toBe(3);
    // Per-key granularity: get(obj1) does not depend on obj3.
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.set(obj1, 100);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should not re-run a get(obj1) reader when deleting an unrelated key', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.delete(obj2);
    expect(state.has(obj2)).toBe(false);
    // Per-key granularity: get(obj1) does not depend on obj2.
    expect(effectFn).toHaveBeenCalledTimes(1);
  });

  it('should handle get and not trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    const value = state.get(obj2);
    expect(value).toBe(2);
    expect(effectFn).toHaveBeenCalledTimes(1); // get shouldn't trigger effect
  });

  it('should handle has and not trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    const hasValue = state.has(obj2);
    expect(hasValue).toBe(true);
    expect(effectFn).toHaveBeenCalledTimes(1); // has shouldn't trigger effect
  });

  it('should normalize reactive keys for WeakMap lookups and deletes', () => {
    const rawKey = {};
    const proxyKey = reactive(rawKey);
    const map = reactive(new WeakMap<object, { count: number }>([[rawKey, { count: 1 }]]));

    const value = map.get(proxyKey);

    expect(value).toBeDefined();
    expect(isReactive(value)).toBe(true);
    expect(value?.count).toBe(1);
    expect(map.has(proxyKey)).toBe(true);
    expect(map.delete(proxyKey)).toBe(true);
    expect(map.has(rawKey)).toBe(false);
  });

  it('should preserve a proxy-key entry that stores undefined', () => {
    const rawKey = {};
    const proxyKey = reactive(rawKey);
    const map = reactive(new WeakMap<object, string | undefined>([[rawKey, 'raw']]));

    toRaw(map).set(proxyKey, undefined);

    expect(map.get(proxyKey)).toBeUndefined();
    expect(map.get(rawKey)).toBe('raw');
  });
});

// Edge cases

describe('reactive - deep and exotic edge cases', () => {
  describe('deeply nested objects', () => {
    it('should handle very deeply nested objects (10+ levels)', () => {
      const deepObj: any = { level: 0 };
      let current = deepObj;

      // Create 15 levels of nesting
      for (let i = 1; i <= 15; i++) {
        current.nested = { level: i };
        current = current.nested;
      }

      const state = reactive(deepObj);
      const mockFn = vi.fn(() => {
        let curr = state;
        for (let i = 0; i < 15; i++) {
          curr = curr.nested;
        }
        return curr.level;
      });

      effect(mockFn);
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Modify deeply nested value
      let curr: any = state;
      for (let i = 0; i < 15; i++) {
        curr = curr.nested;
      }
      curr.level = 999;

      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should handle deeply nested arrays within objects', () => {
      const state = reactive({
        level1: {
          level2: {
            level3: {
              items: [1, 2, 3],
            },
          },
        },
      });

      const mockFn = vi.fn(() => state.level1.level2.level3.items.length);
      effect(mockFn);

      expect(mockFn).toHaveBeenCalledTimes(1);

      // Modify nested array by pushing
      state.level1.level2.level3.items.push(4);

      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(state.level1.level2.level3.items.length).toBe(4);
    });

    it('should handle mixed deeply nested structures', () => {
      const state = reactive({
        users: [
          {
            name: 'Alice',
            posts: [{ title: 'Post 1', comments: [{ text: 'Comment 1' }] }],
          },
        ],
      });

      const mockFn = vi.fn(() => state.users[0].posts[0].comments[0].text);
      effect(mockFn);

      expect(mockFn).toHaveBeenCalledTimes(1);

      state.users[0].posts[0].comments[0].text = 'Updated Comment';

      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(state.users[0].posts[0].comments[0].text).toBe('Updated Comment');
    });
  });

  describe('circular references', () => {
    it('should handle circular references in objects', () => {
      const obj: any = { name: 'root' };
      obj.self = obj; // Circular reference

      const state = reactive(obj);

      expect(state.name).toBe('root');
      expect(state.self).toBe(state); // Should reference the same reactive proxy
      expect(isReactive(state.self)).toBe(true);
    });

    it('should handle circular references with effects', () => {
      const obj: any = { value: 1 };
      obj.circular = obj;

      const state = reactive(obj);
      const mockFn = vi.fn(() => state.value);
      effect(mockFn);

      expect(mockFn).toHaveBeenCalledTimes(1);

      state.value = 2;
      expect(mockFn).toHaveBeenCalledTimes(2);

      // Access through circular reference
      state.circular.value = 3;
      expect(mockFn).toHaveBeenCalledTimes(3);
      expect(state.value).toBe(3);
    });

    it('should handle circular references in arrays', () => {
      const arr: any[] = [1, 2, 3];
      arr.push(arr); // Circular reference

      const state = reactive(arr);

      expect(state[0]).toBe(1);
      expect(state[3]).toBe(state); // Should reference the same reactive proxy
      expect(isReactive(state[3])).toBe(true);
    });

    it('should handle mutual circular references', () => {
      const objA: any = { name: 'A' };
      const objB: any = { name: 'B' };
      objA.ref = objB;
      objB.ref = objA;

      const stateA = reactive(objA);

      expect(stateA.name).toBe('A');
      expect(stateA.ref.name).toBe('B');
      expect(stateA.ref.ref).toBe(stateA);
      expect(isReactive(stateA.ref)).toBe(true);
      expect(isReactive(stateA.ref.ref)).toBe(true);
    });

    it('should handle complex circular structures', () => {
      const parent: any = { type: 'parent', children: [] };
      const child1: any = { type: 'child1', parent };
      const child2: any = { type: 'child2', parent };
      parent.children.push(child1, child2);

      const state = reactive(parent);

      expect(state.children[0].parent).toBe(state);
      expect(state.children[1].parent).toBe(state);
      expect(isReactive(state.children[0])).toBe(true);
    });
  });

  describe('special object types', () => {
    it('should handle Date objects', () => {
      const date = new Date('2024-01-01');
      const state = reactive({ date, timestamp: date.getTime() });

      // Dates stay raw so methods keep working through reactive parents
      expect(state.date).toBeInstanceOf(Date);
      expect(state.date).toBe(date);
      expect(isReactive(state.date)).toBe(false);
      expect(state.date.toISOString()).toBe(date.toISOString());

      // Changing the date reference should trigger effects
      const mockFn = vi.fn(() => state.timestamp);
      effect(mockFn);
      expect(mockFn).toHaveBeenCalledTimes(1);

      const newDate = new Date('2024-12-31');
      state.date = newDate;
      state.timestamp = newDate.getTime();
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(state.date.toISOString()).toBe(newDate.toISOString());
    });

    it('should handle RegExp objects', () => {
      const regex = /test/gi;
      const state = reactive({ pattern: regex, source: regex.source });

      // RegExp stays raw so methods keep working
      expect(state.pattern).toBeInstanceOf(RegExp);
      expect(state.pattern).toBe(regex);
      expect(isReactive(state.pattern)).toBe(false);
      expect(state.pattern.test('TEST')).toBe(true);

      // Changing the regex reference should trigger effects
      const mockFn = vi.fn(() => state.source);
      effect(mockFn);
      expect(mockFn).toHaveBeenCalledTimes(1);

      const newRegex = /new/i;
      state.pattern = newRegex;
      state.source = newRegex.source;
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should handle Error objects', () => {
      const error = new Error('Test error');
      const state = reactive({ error });

      expect(state.error).toBeInstanceOf(Error);
      expect(state.error.message).toBe('Test error');

      const mockFn = vi.fn(() => state.error);
      effect(mockFn);
      expect(mockFn).toHaveBeenCalledTimes(1);

      state.error = new Error('New error');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should handle Promise objects', () => {
      const promise = Promise.resolve(42);
      const state = reactive({ promise, status: 'pending' });

      // Promise objects become reactive proxies
      expect(state.promise).toBeInstanceOf(Promise);

      // Changing the promise reference should trigger effects
      const mockFn = vi.fn(() => state.status);
      effect(mockFn);
      expect(mockFn).toHaveBeenCalledTimes(1);

      state.promise = Promise.resolve(100);
      state.status = 'resolved';
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should handle typed arrays', () => {
      const uint8 = new Uint8Array([1, 2, 3]);
      const state = reactive({ buffer: uint8 });

      expect(state.buffer).toBeInstanceOf(Uint8Array);
      expect(state.buffer[0]).toBe(1);

      const mockFn = vi.fn(() => state.buffer);
      effect(mockFn);
      expect(mockFn).toHaveBeenCalledTimes(1);

      state.buffer = new Uint8Array([4, 5, 6]);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should handle ArrayBuffer objects', () => {
      const buffer = new ArrayBuffer(8);
      const state = reactive({ buffer, size: buffer.byteLength });

      // ArrayBuffer objects become reactive proxies
      expect(state.buffer).toBeInstanceOf(ArrayBuffer);

      // Changing the buffer reference should trigger effects
      const mockFn = vi.fn(() => state.size);
      effect(mockFn);
      expect(mockFn).toHaveBeenCalledTimes(1);

      const newBuffer = new ArrayBuffer(16);
      state.buffer = newBuffer;
      state.size = newBuffer.byteLength;
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(state.size).toBe(16);
    });

    it('should handle objects with null prototype', () => {
      const obj = Object.create(null);
      obj.key = 'value';

      const state = reactive(obj);

      expect(state.key).toBe('value');
      expect(isReactive(state)).toBe(true);

      const mockFn = vi.fn(() => state.key);
      effect(mockFn);
      expect(mockFn).toHaveBeenCalledTimes(1);

      state.key = 'updated';
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should handle frozen objects', () => {
      const frozen: Readonly<{ value: number }> = Object.freeze({ value: 1 });
      const state = reactive({ frozen });

      // The frozen object itself cannot be modified
      expect(() => {
        // @ts-ignore - testing frozen object
        state.frozen.value = 2;
      }).toThrow();

      // But the reference to it can be changed
      const mockFn = vi.fn(() => state.frozen);
      effect(mockFn);
      expect(mockFn).toHaveBeenCalledTimes(1);

      state.frozen = Object.freeze({ value: 3 });
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should handle sealed objects', () => {
      const sealed = Object.seal({ value: 1 });
      const state = reactive({ sealed });

      // Can modify existing properties
      state.sealed.value = 2;
      expect(state.sealed.value).toBe(2);

      // Cannot add new properties
      expect(() => {
        // @ts-ignore - testing sealed object
        state.sealed.newProp = 3;
      }).toThrow();
    });

    it('should handle objects with symbols as keys', () => {
      const sym1 = Symbol('key1');
      const sym2 = Symbol('key2');
      const obj = {
        [sym1]: 'value1',
        [sym2]: 'value2',
        regular: 'regular',
      };

      const state = reactive(obj);

      expect(state[sym1]).toBe('value1');
      expect(state[sym2]).toBe('value2');
      expect(state.regular).toBe('regular');

      const mockFn = vi.fn(() => state[sym1]);
      effect(mockFn);
      expect(mockFn).toHaveBeenCalledTimes(1);

      state[sym1] = 'updated';
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should handle objects with getters and setters', () => {
      let internalValue = 10;
      const obj = {
        get value() {
          return internalValue;
        },
        set value(val: number) {
          internalValue = val;
        },
      };

      const state = reactive(obj);

      expect(state.value).toBe(10);

      const mockFn = vi.fn(() => state.value);
      effect(mockFn);
      expect(mockFn).toHaveBeenCalledTimes(1);

      state.value = 20;
      expect(state.value).toBe(20);
      expect(internalValue).toBe(20);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should handle empty objects and arrays', () => {
      const emptyObj = reactive({});
      const emptyArr = reactive<number[]>([]);

      expect(isReactive(emptyObj)).toBe(true);
      expect(isReactive(emptyArr)).toBe(true);

      // Should be able to add properties
      // @ts-ignore - testing dynamic property addition
      emptyObj.newProp = 'value';
      // @ts-ignore - testing dynamic property addition
      expect(emptyObj.newProp).toBe('value');

      emptyArr.push(1);
      expect(emptyArr[0]).toBe(1);
    });

    it('should handle objects with non-enumerable properties', () => {
      const obj = {};
      Object.defineProperty(obj, 'hidden', {
        value: 'secret',
        enumerable: false,
        writable: true,
        configurable: true,
      });

      const state = reactive(obj);

      // @ts-ignore - testing hidden property
      expect(state.hidden).toBe('secret');
      // @ts-ignore - testing hidden property
      const mockFn = vi.fn(() => state.hidden);
      effect(mockFn);
      expect(mockFn).toHaveBeenCalledTimes(1);

      // @ts-ignore - testing hidden property
      state.hidden = 'updated';
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });
});

describe('reactivity fixes', () => {
  describe('per-property reactive tracking', () => {
    it('a computed derived through a reactive property recomputes on change', () => {
      const state = reactive({ n: 1 });
      const double = computed(() => state.n * 2);
      const spy = vi.fn();
      effect(() => spy(double.value));
      expect(spy).toHaveBeenLastCalledWith(2);

      state.n = 5;
      expect(double.value).toBe(10);
      expect(spy).toHaveBeenLastCalledWith(10);
    });

    it('is glitch-free with a direct effect and a computed on the same property', () => {
      const state = reactive({ n: 1 });
      const eff = vi.fn();
      effect(() => eff(state.n));

      const c = computed(() => state.n + 100);
      const cEff = vi.fn();
      effect(() => cEff(c.value));

      state.n = 2;
      expect(eff).toHaveBeenLastCalledWith(2);
      // Even though the direct effect reads the property first, the computed's
      // downstream effect must observe the fresh derived value (no glitch).
      expect(cEff).toHaveBeenLastCalledWith(102);
    });

    it('notifies subscribers when an own property is deleted', () => {
      const state = reactive<{ a?: number }>({ a: 1 });
      const spy = vi.fn();
      effect(() => spy(state.a));
      expect(spy).toHaveBeenLastCalledWith(1);

      delete state.a;
      expect(spy).toHaveBeenLastCalledWith(undefined);
    });

    // SIG-06: delete dispatches each subscriber exactly once even when the
    // effect is subscribed via both the per-property node and the targetMap Dep.
    it('runs a sync effect once per property delete (SIG-06)', () => {
      const state = reactive<{ a?: number }>({ a: 1 });
      let runs = 0;
      effect(
        () => {
          runs++;
          void state.a;
        },
        { flush: 'sync' },
      );
      expect(runs).toBe(1);

      delete state.a;
      expect(runs).toBe(2);
    });

    it('runs a sync effect once when it reads both the key and Object.keys() (SIG-06)', () => {
      const state = reactive<{ a?: number; b: number }>({ a: 1, b: 2 });
      let runs = 0;
      effect(
        () => {
          runs++;
          void state.a;
          void Object.keys(state);
        },
        { flush: 'sync' },
      );
      expect(runs).toBe(1);

      delete state.a;
      expect(runs).toBe(2);
    });

    it('does not re-run when setting a property to an equal value', () => {
      const state = reactive({ n: 1 });
      const spy = vi.fn();
      effect(() => spy(state.n));
      expect(spy).toHaveBeenCalledTimes(1);

      state.n = 1;
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('dependency index (isValidLink) correctness', () => {
    it('handles branch switching without stale or missed updates', () => {
      const use = signal(true);
      const a = signal(1);
      const b = signal(2);
      const spy = vi.fn();
      const c = computed(() => (use.value ? a.value : b.value));
      effect(() => spy(c.value));
      expect(spy).toHaveBeenLastCalledWith(1);

      // Switch the branch — `a` should be dropped as a dep, `b` picked up.
      use.value = false;
      expect(spy).toHaveBeenLastCalledWith(2);

      // Mutating the now-unused `a` must NOT re-run the effect.
      const callsAfterSwitch = spy.mock.calls.length;
      a.value = 100;
      expect(spy).toHaveBeenCalledTimes(callsAfterSwitch);

      // Mutating the active `b` must re-run.
      b.value = 20;
      expect(spy).toHaveBeenLastCalledWith(20);

      // Switch back — `a` is re-linked and `b` dropped.
      use.value = true;
      expect(spy).toHaveBeenLastCalledWith(100);
      const callsBack = spy.mock.calls.length;
      b.value = 999;
      expect(spy).toHaveBeenCalledTimes(callsBack);
    });
  });
});

// Runtime isolation

describe('reactive runtime isolation', () => {
  it('keeps cold Computed invalidation local to one runtime', async () => {
    const raw = { count: 0 };
    const firstRuntime = await import('../src');
    const firstProxy = firstRuntime.reactive(raw);

    vi.resetModules();
    const secondRuntime = await import('../src');
    const secondProxy = secondRuntime.reactive(raw);
    const doubled = secondRuntime.computed(() => secondProxy.count * 2);

    expect(doubled.value).toBe(0);

    firstProxy.count = 1;

    expect(doubled.value).toBe(0);

    secondProxy.count = 2;
    expect(doubled.value).toBe(4);
  });
});

describe('reactive objects', () => {
  it('caches deep proxies and tracks nested properties', () => {
    const raw = { nested: { count: 0 } };
    const state = reactive(raw);
    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(state.nested.count);
    });

    expect(reactive(raw)).toBe(state);
    expect(isReactive(state)).toBe(true);
    expect(isReactive(state.nested)).toBe(true);
    expect(toRaw(state)).toBe(raw);
    state.nested.count++;
    expect(seen).toEqual([0, 1]);
    stop();
  });

  it('keeps shallow nested values raw', () => {
    const nested = { count: 0 };
    const state = shallowReactive({ nested });
    const run = vi.fn(() => state.nested);
    const stop = effect(run);

    expect(state.nested).toBe(nested);
    expect(isReactive(state.nested)).toBe(false);
    nested.count++;
    expect(run).toHaveBeenCalledOnce();
    state.nested = { count: 2 };
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it('runs accessors with the proxy receiver', () => {
    const state = reactive({
      count: 1,
      get doubled() {
        return this.count * 2;
      },
    });
    const seen: number[] = [];
    const stop = effect(() => seen.push(state.doubled));
    state.count = 2;
    expect(seen).toEqual([2, 4]);
    stop();
  });

  it('does not proxy exotic or non-extensible objects', () => {
    const date = new Date();
    const frozen = Object.freeze({ count: 0 });
    expect(reactive(date)).toBe(date);
    expect(reactive(frozen)).toBe(frozen);
  });
});

describe('reactive arrays', () => {
  it('tracks indexes, length, iteration, and truncation', () => {
    const list = reactive([1, 2, 3]);
    const seen: string[] = [];
    const stop = effect(() => {
      seen.push(`${list.length}:${[...list].join(',')}`);
    });

    list.push(4);
    list[1] = 5;
    list.length = 1;
    expect(seen).toEqual(['3:1,2,3', '4:1,2,3,4', '4:1,5,3,4', '1:1']);
    stop();
  });

  it('batches a mutator into one Effect run', () => {
    const list = reactive<number[]>([]);
    const run = vi.fn(() => `${list.length}:${list[0] ?? ''}`);
    const stop = effect(run);
    list.unshift(1, 2, 3);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it('matches raw and reactive identities in lookup methods', () => {
    const raw = { id: 1 };
    const proxy = reactive(raw);
    const list = reactive([raw]);
    expect(list.includes(raw)).toBe(true);
    expect(list.includes(proxy)).toBe(true);
    expect(list.indexOf(proxy)).toBe(0);
  });
});

describe('reactive collections', () => {
  it('normalizes raw and reactive Map keys', () => {
    const raw = { id: 1 };
    const key = reactive(raw);
    const map = reactive(new Map<object, string>());
    map.set(key, 'value');
    expect(map.get(raw)).toBe('value');
    expect(map.has(key)).toBe(true);
    expect(toRaw(map).has(raw)).toBe(true);
  });

  it('tracks Set membership and iteration', () => {
    const set = reactive(new Set<number>());
    const seen: string[] = [];
    const stop = effect(() => seen.push(`${set.has(1)}:${[...set].join(',')}`));
    set.add(1);
    set.add(1);
    set.delete(1);
    expect(seen).toEqual(['false:', 'true:1', 'false:']);
    stop();
  });

  it('supports WeakMap and WeakSet without retaining keys in adapter state', () => {
    const key = {};
    const weakMap = reactive(new WeakMap<object, number>());
    const weakSet = reactive(new WeakSet<object>());
    const seen: string[] = [];
    const stop = effect(() => seen.push(`${weakMap.get(key) ?? 0}:${weakSet.has(key)}`));

    weakMap.set(key, 1);
    weakSet.add(key);
    weakMap.delete(key);
    weakSet.delete(key);

    expect(seen).toEqual(['0:false', '1:false', '1:true', '0:true', '0:false']);
    stop();
  });

  it('invalidates every observed key on clear', () => {
    const map = reactive(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
    const seen: string[] = [];
    const stop = effect(() => seen.push(`${map.get('a')}:${map.get('b')}:${map.size}`));
    map.clear();
    expect(seen).toEqual(['1:2:2', 'undefined:undefined:0']);
    stop();
  });
});

describe('reactive - proxy and collection edge cases', () => {
  it('preserves the mode of an existing reactive proxy', () => {
    const deep = reactive({ nested: {} });
    const shallow = shallowReactive({ nested: {} });

    expect(shallowReactive(deep)).toBe(deep);
    expect(reactive(shallow)).toBe(shallow);
    expect(isReactive(deep.nested)).toBe(true);
    expect(isReactive(shallow.nested)).toBe(false);
  });

  it('does not add descriptor inspections to stable primitive reads', () => {
    let descriptorReads = 0;
    const raw = new Proxy(
      { value: 1 },
      {
        getOwnPropertyDescriptor(target, key) {
          descriptorReads++;
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    const state = reactive(raw);
    descriptorReads = 0;

    for (let index = 0; index < 100; index++) state.value;

    // Reflect.get with the outer reactive receiver accounts for one proxy
    // descriptor lookup. The reactive handler must not perform a second one.
    expect(descriptorReads).toBe(100);
  });

  it('preserves the reactive receiver when assigning through a user proxy', () => {
    let seenReceiver: unknown;
    const raw = new Proxy(
      { value: 1 },
      {
        set(target, key, value, receiver) {
          seenReceiver = receiver;
          return Reflect.set(target, key, value, receiver);
        },
      },
    );
    const state = reactive(raw);

    state.value = 2;

    expect(seenReceiver).toBe(state);
    expect(raw.value).toBe(2);
  });

  it('compares shallow writes by exact identity', () => {
    const raw = { id: 1 };
    const proxy = reactive(raw);
    const object = shallowReactive({ value: proxy as object });
    const list = shallowReactive<object[]>([proxy]);
    const map = shallowReactive(new Map([['value', proxy as object]]));
    const seen: unknown[] = [];
    const stops = [
      effect(() => seen.push(object.value)),
      effect(() => seen.push(list[0])),
      effect(() => seen.push(map.get('value'))),
    ];

    object.value = raw;
    list[0] = raw;
    map.set('value', raw);

    expect(seen).toEqual([proxy, proxy, proxy, raw, raw, raw]);
    stops.forEach((stop) => stop());
  });

  it('updates an existing deep collection proxy key without duplicating it', () => {
    const rawKey = { id: 1 };
    const proxyKey = reactive(rawKey);
    const map = reactive(new Map<object, number>([[proxyKey, 1]]));
    const seen: Array<number | undefined> = [];
    const stop = effect(() => seen.push(map.get(proxyKey)));

    map.set(proxyKey, 2);

    expect(map.size).toBe(1);
    expect(map.get(proxyKey)).toBe(2);
    expect(seen).toEqual([1, 2]);
    stop();
  });

  it('notifies an inherited accessor whose setter changes its getter value', () => {
    let value = 1;
    const parent = reactive(
      Object.defineProperty({}, 'value', {
        configurable: true,
        get: () => value,
        set: (next) => {
          value = next;
        },
      }),
    ) as { value: number };
    const child = reactive(Object.create(parent) as { value: number });
    const seen: number[] = [];
    const stop = effect(() => seen.push(child.value));

    child.value = 2;

    expect(seen).toEqual([1, 2]);
    stop();
  });

  it('does not notify value readers for descriptor flag-only changes', () => {
    const state = reactive({ value: 1 });
    const run = vi.fn(() => state.value);
    const stop = effect(run);
    Object.defineProperty(state, 'value', { writable: false });
    expect(run).toHaveBeenCalledOnce();
    stop();
  });

  it('does not notify a prototype target for an inherited receiver write', () => {
    const parent = reactive({ value: 1 });
    const child = reactive(Object.create(parent) as { value: number });
    const parentRun = vi.fn(() => parent.value);
    const childRun = vi.fn(() => child.value);
    const stops = [effect(parentRun), effect(childRun)];

    child.value = 2;
    expect(parentRun).toHaveBeenCalledOnce();
    expect(childRun).toHaveBeenCalledTimes(2);
    stops.forEach((stop) => stop());
  });

  it('honors an Array subclass mutator override', () => {
    class Numbers extends Array<number> {
      calls = 0;
      override push(...items: number[]): number {
        this.calls++;
        return super.push(...items);
      }
    }

    const list = reactive(new Numbers());
    list.push(1);
    expect(list.calls).toBe(1);
    expect([...list]).toEqual([1]);
  });

  it('preserves exact values written through shallow containers', () => {
    const raw = { id: 1 };
    const proxy = reactive(raw);
    const object = shallowReactive<{ value?: object }>({});
    const array = shallowReactive<object[]>([]);
    const map = shallowReactive(new Map<string, object>());
    const set = shallowReactive(new Set<object>());

    object.value = proxy;
    array.push(proxy);
    map.set('value', proxy);
    set.add(proxy);

    expect(object.value).toBe(proxy);
    expect(array[0]).toBe(proxy);
    expect(map.get('value')).toBe(proxy);
    expect(set.has(proxy)).toBe(true);
    expect(set.has(raw)).toBe(false);
  });

  it('does not wake collection readers for unrelated keys', () => {
    const map = reactive(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
    const set = reactive(new Set([1, 2]));
    const mapRun = vi.fn(() => map.get('a'));
    const setRun = vi.fn(() => set.has(1));
    const stops = [effect(mapRun), effect(setRun)];

    map.set('b', 3);
    set.add(3);
    set.delete(2);
    expect(mapRun).toHaveBeenCalledOnce();
    expect(setRun).toHaveBeenCalledOnce();
    stops.forEach((stop) => stop());
  });

  it('shares canonical collection dependencies across deep and shallow proxies', () => {
    const rawKey = { id: 1 };
    const proxyKey = reactive(rawKey);
    const rawMap = new Map<object, number>();
    const rawSet = new Set<object>();
    const rawWeakMap = new WeakMap<object, number>();
    const deepMap = reactive(rawMap);
    const shallowMap = shallowReactive(rawMap);
    const deepSet = reactive(rawSet);
    const shallowSet = shallowReactive(rawSet);
    const deepWeakMap = reactive(rawWeakMap);
    const shallowWeakMap = shallowReactive(rawWeakMap);
    const seen: unknown[] = [];
    const stops = [
      effect(() => seen.push(deepMap.get(proxyKey))),
      effect(() => seen.push(deepSet.has(proxyKey))),
      effect(() => seen.push(deepWeakMap.get(proxyKey))),
    ];

    shallowMap.set(proxyKey, 1);
    shallowSet.add(proxyKey);
    shallowWeakMap.set(proxyKey, 1);

    expect(seen).toEqual([undefined, false, undefined, 1, true, 1]);
    stops.forEach((stop) => stop());
  });

  it('batches an overridden Array mutator into one final-state publication', () => {
    class Numbers extends Array<number> {
      override push(...items: number[]): number {
        return super.push(...items);
      }
    }

    const list = reactive(new Numbers());
    const seen: string[] = [];
    const stop = effect(() => seen.push(`${list.length}:${[...list].join(',')}`));

    list.push(1, 2);

    expect(seen).toEqual(['0:', '2:1,2']);
    stop();
  });

  it('notifies a closure accessor inherited from a raw prototype', () => {
    let value = 1;
    const prototype = Object.defineProperty({}, 'value', {
      configurable: true,
      get: () => value,
      set: (next) => {
        value = next;
      },
    });
    const state = reactive(Object.create(prototype) as { value: number });
    const seen: number[] = [];
    const stop = effect(() => seen.push(state.value));

    state.value = 2;

    expect(seen).toEqual([1, 2]);
    stop();
  });

  it('tracks every valid WeakMap and WeakSet key category', () => {
    const fn = () => {};
    const symbol = Symbol('weak key');
    const map = reactive(new WeakMap<any, number>());
    const set = reactive(new WeakSet<any>());
    const seen: string[] = [];
    const stop = effect(() => seen.push(`${map.get(fn) ?? 0}:${set.has(symbol)}`));

    map.set(fn, 1);
    set.add(symbol);
    map.delete(fn);
    set.delete(symbol);

    expect(seen).toEqual(['0:false', '1:false', '1:true', '0:true', '0:false']);
    stop();
  });
});
describe('reactive public edge behavior', () => {
  it('proxies ordinary records and class instances without changing identity semantics', () => {
    class Counter {
      value = 1;
    }
    const instance = new Counter();
    const prototype = { inherited: 1 };
    const record = Object.create(prototype) as { inherited: number };

    const reactiveInstance = reactive(instance);
    expect(isReactive(reactiveInstance)).toBe(true);
    expect(reactiveInstance.value).toBe(1);
    expect(isReactive(reactive(record))).toBe(true);
  });

  it('does not allocate dependency state for untracked collection reads', () => {
    const map = reactive(new Map([['value', 1]]));
    const set = reactive(new Set([1]));

    expect(map.get('value')).toBe(1);
    expect(map.has('value')).toBe(true);
    expect([...map.values()]).toEqual([1]);
    expect(set.has(1)).toBe(true);
    expect([...set]).toEqual([1]);
  });

  it('handles non-object WeakMap and WeakSet keys without tracking them', () => {
    const map = reactive(new WeakMap<object, number>()) as WeakMap<object, number> & {
      get(key: unknown): number | undefined;
    };
    const set = reactive(new WeakSet<object>()) as WeakSet<object> & {
      has(value: unknown): boolean;
    };
    const seen: Array<number | boolean | undefined> = [];
    const stop = effect(() => {
      seen.push(map.get('invalid'), set.has('invalid'));
    });

    expect(seen).toEqual([undefined, false]);
    stop();
  });

  it('treats clearing an empty collection as a no-op', () => {
    const map = reactive(new Map());
    const set = reactive(new Set());

    expect(map.clear()).toBeUndefined();
    expect(set.clear()).toBeUndefined();
    expect(map.size).toBe(0);
    expect(set.size).toBe(0);
  });

  it('invokes collection forEach with wrapped values and the supplied thisArg', () => {
    const rawValue = { id: 1 };
    const map = reactive(new Map([['value', rawValue]]));
    const context = { calls: 0 };
    let received: unknown;

    // The second argument is part of Map#forEach's public thisArg contract.

    map.forEach(function (value, key, receiver) {
      this.calls++;
      received = [value, key, receiver];
      // eslint-disable-next-line unicorn/no-array-method-this-argument
    }, context);

    expect(context.calls).toBe(1);
    expect((received as [object])[0]).toBe(reactive(rawValue));
    expect((received as [unknown, string])[1]).toBe('value');
    expect((received as [unknown, unknown, Map])[2]).toBe(map);
  });

  it('returns stable iterator shapes for Map keys, values, and entries', () => {
    const key = { id: 1 };
    const map = reactive(new Map([[key, { value: 2 }]]));

    const keys = [...map.keys()];
    const values = [...map.values()];
    const entries = [...map.entries()];

    expect(keys[0]).toBe(reactive(key));
    expect(values[0]).toEqual({ value: 2 });
    expect(isReactive(values[0])).toBe(true);
    expect(entries[0][0]).toBe(keys[0]);
    expect(entries[0][1]).toBe(values[0]);
  });

  it('does not notify for failed deletion and still tracks later writes', () => {
    const raw = Object.defineProperty({ value: 1 }, 'value', {
      configurable: false,
      writable: true,
      enumerable: true,
    });
    const state = reactive(raw);
    const seen: number[] = [];
    const stop = effect(() => seen.push(state.value));

    expect(Reflect.deleteProperty(state, 'value')).toBe(false);
    expect(seen).toEqual([1]);
    state.value = 2;
    expect(seen).toEqual([1, 2]);
    stop();
  });

  it('does not notify when a defineProperty request fails', () => {
    const raw = Object.preventExtensions({ value: 1 });
    const state = reactive(raw);
    const run = vi.fn(() => state.value);
    const stop = effect(run);

    expect(Reflect.defineProperty(state, 'other', { value: 2 })).toBe(false);
    expect(run).toHaveBeenCalledOnce();
    stop();
  });

  it('preserves raw identity in shallow arrays and collections', () => {
    const raw = { id: 1 };
    const proxy = reactive(raw);
    const array = shallowReactive<object[]>([proxy]);
    const map = shallowReactive(new Map([['value', proxy]]));
    const set = shallowReactive(new Set([proxy]));

    expect(array[0]).toBe(proxy);
    expect(map.get('value')).toBe(proxy);
    expect([...set][0]).toBe(proxy);
    expect(toRaw(array)[0]).toBe(proxy);
  });
});
describe('reactive public coverage edges', () => {
  it('notifies an array iterator when its first indexed element is added', () => {
    const list = reactive<number[]>([]);
    const seen: number[][] = [];
    const stop = effect(() => seen.push([...list]));

    list[0] = 1;

    expect(seen).toEqual([[], [1]]);
    stop();
  });

  it('notifies own-key readers when an array gains its first indexed element', () => {
    const list = reactive<number[]>([]);
    const seen: string[][] = [];
    const stop = effect(() => seen.push(Object.keys(list)));

    list[0] = 1;

    expect(seen).toEqual([[], ['0']]);
    stop();
  });

  it('clears non-empty collections even when no reader is tracking them', () => {
    const map = reactive(new Map([['key', 1]]));
    const set = reactive(new Set([1]));

    expect(map.clear()).toBeUndefined();
    expect(set.clear()).toBeUndefined();
    expect(map.size).toBe(0);
    expect(set.size).toBe(0);
  });

  it('preserves a setter exception through the reactive set trap', () => {
    const failure = new Error('setter failed');
    const raw = Object.defineProperty({}, 'value', {
      configurable: true,
      set() {
        throw failure;
      },
    }) as { value: number };
    const state = reactive(raw);

    expect(() => {
      state.value = 1;
    }).toThrow(failure);
  });

  it('notifies a size-only map reader when a new entry is added', () => {
    const map = reactive(new Map<string, number>());
    const sizes: number[] = [];
    const stop = effect(() => sizes.push(map.size));

    map.set('key', 1);

    expect(sizes).toEqual([0, 1]);
    stop();
  });

  it('wraps nested values read from a reactive map', () => {
    const map = reactive(new Map([['key', { value: 1 }]]));
    const seen: number[] = [];
    const stop = effect(() => seen.push(map.get('key')?.value ?? -1));

    map.get('key')!.value = 2;

    expect(seen).toEqual([1, 2]);
    stop();
  });

  it('proxies sparse array iteration through numeric prototype accessors', () => {
    const prototype: number[] = [];
    Object.defineProperty(prototype, '1', {
      configurable: true,
      get: () => 42,
    });
    const raw: number[] = [];
    raw.length = 2;
    Object.setPrototypeOf(raw, prototype);
    const list = reactive(raw);

    expect([...list]).toEqual([undefined, 42]);
  });

  it('wraps array entries and preserves numeric keys', () => {
    const raw = { value: 1 };
    const list = reactive([raw]);
    const entries = [...list.entries()];

    expect([...list.keys()]).toEqual([0]);
    expect(entries[0][0]).toBe(0);
    expect(entries[0][1]).toBe(reactive(raw));
  });

  it('finds a numeric accessor added to Array.prototype for sparse iteration', () => {
    const index = 10_000;
    const key = String(index);
    const previous = Object.getOwnPropertyDescriptor(Array.prototype, key);
    Object.defineProperty(Array.prototype, key, {
      configurable: true,
      get: () => 42,
    });

    try {
      const raw: number[] = [];
      raw.length = index + 1;
      const iterator = reactive(raw).values();
      let step: IteratorResult<number> | undefined;
      for (let current = 0; current <= index; current++) step = iterator.next();

      expect(step).toEqual({ done: false, value: 42 });
    } finally {
      if (previous) Object.defineProperty(Array.prototype, key, previous);
      else Reflect.deleteProperty(Array.prototype, key);
    }
  });

  it('notifies own-key readers when an array length shrinks', () => {
    const list = reactive([1, 2]);
    const keys: string[][] = [];
    const stop = effect(() => keys.push(Object.keys(list)));

    list.length = 0;

    expect(keys).toEqual([['0', '1'], []]);
    stop();
  });

  it('keeps instrumenting an own property that aliases a native array method', () => {
    const raw = [1];
    Object.defineProperty(raw, 'values', {
      configurable: true,
      writable: true,
      value: Array.prototype.values,
    });
    const list = reactive(raw);

    expect(list.values).not.toBe(Array.prototype.values);
    expect([...list.values()]).toEqual([1]);
  });

  it('deletes shallow collection keys without normalizing their identity', () => {
    const key = { id: 1 };
    const map = shallowReactive(new Map([[key, 1]]));

    expect(map.delete(key)).toBe(true);
    expect(map.has(key)).toBe(false);
  });

  it('suppresses indexed reads only for the array currently being iterated', () => {
    const outer = reactive([1]);
    const inner = reactive([2, 3]);
    const seen: number[][] = [];
    const stop = effect(() => {
      seen.push(outer.map(() => inner.length));
    });

    expect(seen).toEqual([[2]]);

    // The callback reads a different reactive array while `outer.map` is
    // active. That read must remain tracked instead of being suppressed as an
    // implementation detail of the outer array's native iterator.
    inner.push(4);

    expect(seen).toEqual([[2], [3]]);
    stop();
  });

  it('uses proxy iteration for sparse arrays with setter-only numeric accessors', () => {
    const key = '1';
    const previous = Object.getOwnPropertyDescriptor(Array.prototype, key);
    Object.defineProperty(Array.prototype, key, {
      configurable: true,
      set() {
        // A setter-only numeric accessor is observable through a sparse array
        // iterator even though reading it produces `undefined`.
      },
    });

    try {
      const list = reactive(new Array(2));
      const iterator = list.values();

      expect(iterator.next()).toEqual({ done: false, value: undefined });
      expect(iterator.next()).toEqual({ done: false, value: undefined });
      expect(iterator.next()).toEqual({ done: true, value: undefined });
    } finally {
      if (previous) Object.defineProperty(Array.prototype, key, previous);
      else Reflect.deleteProperty(Array.prototype, key);
    }
  });

  it('keeps raw iteration for sparse arrays with inherited numeric data', () => {
    const key = '1';
    const previous = Object.getOwnPropertyDescriptor(Array.prototype, key);
    Object.defineProperty(Array.prototype, key, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: 42,
    });

    try {
      const list = reactive(new Array(2));
      const iterator = list.values();

      expect(iterator.next()).toEqual({ done: false, value: undefined });
      expect(iterator.next()).toEqual({ done: false, value: 42 });
      expect(iterator.next()).toEqual({ done: true, value: undefined });
    } finally {
      if (previous) Object.defineProperty(Array.prototype, key, previous);
      else Reflect.deleteProperty(Array.prototype, key);
    }
  });

  it('keeps an already-raw object descriptor value unchanged', () => {
    const child = { id: 1 };
    const parent = reactive<Record<string, object>>({});

    Object.defineProperty(parent, 'child', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: child,
    });

    expect(toRaw(parent).child).toBe(child);
    expect(toRaw(parent.child)).toBe(child);
  });

  it('does not publish an unchanged length when a non-writable definition fails', () => {
    const raw = [1, 2];
    Object.defineProperty(raw, 'length', { writable: false });
    const list = reactive(raw);
    const seen: number[] = [];
    const stop = effect(() => seen.push(list.length));

    expect(Reflect.defineProperty(list, 'length', { value: 1 })).toBe(false);
    expect(list.length).toBe(2);
    expect(seen).toEqual([2]);
    stop();
  });

  it('delegates invalid weak keys to a permissive WeakMap subclass', () => {
    class PermissiveWeakMap extends WeakMap<any, number> {
      override set(key: any, value: number): this {
        if (typeof key !== 'object' && typeof key !== 'function' && typeof key !== 'symbol') {
          return this;
        }
        return super.set(key, value);
      }
    }

    const map = reactive(new PermissiveWeakMap()) as WeakMap<object, number> & {
      set(key: unknown, value: number): WeakMap<object, number>;
      has(key: unknown): boolean;
    };

    expect(() => map.set('invalid', 1)).not.toThrow();
    expect(map.has('invalid')).toBe(false);
  });
});

describe('reactivity/reactive', () => {
  it('object', () => {
    const original = { foo: 1 };
    const observed = reactive(original);
    expect(observed).not.toBe(original);
    expect(isReactive(observed)).toBe(true);
    expect(isReactive(original)).toBe(false);
    // get
    expect(observed.foo).toBe(1);
    // has
    expect('foo' in observed).toBe(true);
    // ownKeys
    expect(Object.keys(observed)).toEqual(['foo']);
  });

  it('proto', () => {
    const obj = {};
    const reactiveObj = reactive(obj);
    expect(isReactive(reactiveObj)).toBe(true);
    // read prop of reactiveObject will cause reactiveObj[prop] to be reactive
    // @ts-expect-error
    void reactiveObj.__proto__;
    const otherObj = { data: ['a'] };
    expect(isReactive(otherObj)).toBe(false);
    const reactiveOther = reactive(otherObj);
    expect(isReactive(reactiveOther)).toBe(true);
    expect(reactiveOther.data[0]).toBe('a');
  });

  it('nested reactives', () => {
    const original = {
      nested: {
        foo: 1,
      },
      array: [{ bar: 2 }],
    };
    const observed = reactive(original);
    expect(isReactive(observed.nested)).toBe(true);
    expect(isReactive(observed.array)).toBe(true);
    expect(isReactive(observed.array[0])).toBe(true);
  });

  it('observing subtypes of IterableCollections(Map, Set)', () => {
    // subtypes of Map
    class CustomMap extends Map {}
    const cmap = reactive(new CustomMap());

    expect(cmap).toBeInstanceOf(Map);
    expect(isReactive(cmap)).toBe(true);

    cmap.set('key', {});
    expect(isReactive(cmap.get('key'))).toBe(true);

    // subtypes of Set
    class CustomSet extends Set {}
    const cset = reactive(new CustomSet());

    expect(cset).toBeInstanceOf(Set);
    expect(isReactive(cset)).toBe(true);

    let dummy;
    effect(() => (dummy = cset.has('value')));
    expect(dummy).toBe(false);
    cset.add('value');
    expect(dummy).toBe(true);
    cset.delete('value');
    expect(dummy).toBe(false);
  });

  it('observing subtypes of WeakCollections(WeakMap, WeakSet)', () => {
    // subtypes of WeakMap
    class CustomMap extends WeakMap {}
    const cmap = reactive(new CustomMap());

    expect(cmap).toBeInstanceOf(WeakMap);
    expect(isReactive(cmap)).toBe(true);

    const key = {};
    cmap.set(key, {});
    expect(isReactive(cmap.get(key))).toBe(true);

    // subtypes of WeakSet
    class CustomSet extends WeakSet {}
    const cset = reactive(new CustomSet());

    expect(cset).toBeInstanceOf(WeakSet);
    expect(isReactive(cset)).toBe(true);

    let dummy;
    effect(() => (dummy = cset.has(key)));
    expect(dummy).toBe(false);
    cset.add(key);
    expect(dummy).toBe(true);
    cset.delete(key);
    expect(dummy).toBe(false);
  });

  // #8647
  it('observing Set with reactive initial value', () => {
    const observed = reactive({});
    const observedSet = reactive(new Set([observed]));

    expect(observedSet.has(observed)).toBe(true);
    expect(observedSet.size).toBe(1);

    // expect nothing happens
    observedSet.add(observed);
    expect(observedSet.size).toBe(1);
  });

  it('observed value should proxy mutations to original (Object)', () => {
    const original: any = { foo: 1 };
    const observed = reactive(original);
    // set
    observed.bar = 1;
    expect(observed.bar).toBe(1);
    expect(original.bar).toBe(1);
    // delete
    delete observed.foo;
    expect('foo' in observed).toBe(false);
    expect('foo' in original).toBe(false);
  });

  it('failed set operation should not trigger effects', () => {
    const original: any = {};
    Object.defineProperty(original, 'foo', {
      value: 1,
      writable: false,
      configurable: true,
    });
    const observed = reactive(original);
    let dummy;
    let run = 0;
    effect(() => {
      run++;
      dummy = observed.foo;
    });

    expect(() => {
      observed.foo = 2;
    }).toThrow(TypeError);
    expect(dummy).toBe(1);
    expect(run).toBe(1);
  });

  it('original value change should reflect in observed value (Object)', () => {
    const original: any = { foo: 1 };
    const observed = reactive(original);
    // set
    original.bar = 1;
    expect(original.bar).toBe(1);
    expect(observed.bar).toBe(1);
    // delete
    delete original.foo;
    expect('foo' in original).toBe(false);
    expect('foo' in observed).toBe(false);
  });

  it('setting a property with an unobserved value should wrap with reactive', () => {
    const observed = reactive<{ foo?: object }>({});
    const raw = {};
    observed.foo = raw;
    expect(observed.foo).not.toBe(raw);
    expect(isReactive(observed.foo)).toBe(true);
  });

  it('observing already observed value should return same Proxy', () => {
    const original = { foo: 1 };
    const observed = reactive(original);
    const observed2 = reactive(observed);
    expect(observed2).toBe(observed);
  });

  it('observing the same value multiple times should return same Proxy', () => {
    const original = { foo: 1 };
    const observed = reactive(original);
    const observed2 = reactive(original);
    expect(observed2).toBe(observed);
  });

  it('should not pollute original object with Proxies', () => {
    const original: any = { foo: 1 };
    const original2 = { bar: 2 };
    const observed = reactive(original);
    const observed2 = reactive(original2);
    observed.bar = observed2;
    expect(observed.bar).toBe(observed2);
    expect(original.bar).toBe(original2);
  });

  // #1246
  it('mutation on objects using reactive as prototype should not trigger', () => {
    const observed = reactive({ foo: 1 });
    const original = Object.create(observed);
    let dummy;
    effect(() => (dummy = original.foo));
    expect(dummy).toBe(1);
    observed.foo = 2;
    expect(dummy).toBe(2);
    original.foo = 3;
    expect(dummy).toBe(2);
    original.foo = 4;
    expect(dummy).toBe(2);
  });

  it('toRaw', () => {
    const original = { foo: 1 };
    const observed = reactive(original);
    expect(toRaw(observed)).toBe(original);
    expect(toRaw(original)).toBe(original);
  });

  it('toRaw on object using reactive as prototype', () => {
    const original = { foo: 1 };
    const observed = reactive(original);
    const inherited = Object.create(observed);
    expect(toRaw(inherited)).toBe(inherited);
  });

  it('toRaw on user Proxy wrapping reactive', () => {
    const original = {};
    const re = reactive(original);
    const obj = new Proxy(re, {});
    const raw = toRaw(obj);
    expect(raw).toBe(original);
  });

  it('should not unwrap Ref<T>', () => {
    const observedNumberRef = reactive(signal(1));
    const observedObjectRef = reactive(signal({ foo: 1 }));

    expect(isSignal(observedNumberRef)).toBe(true);
    expect(isSignal(observedObjectRef)).toBe(true);
  });

  it('should unwrap computed refs', () => {
    // readonly
    const a = computed(() => 1);
    // writable
    const b = computed({
      get: () => 1,
      set: () => {},
    });
    const obj = reactive({ a, b });
    // check type
    obj.a + 1;
    obj.b + 1;
    expect(typeof obj.a).toBe(`number`);
    expect(typeof obj.b).toBe(`number`);
  });

  it('should allow setting property from a ref to another ref', () => {
    const foo = signal(0);
    const bar = signal(1);
    const observed = reactive({ a: foo });
    const dummy = computed(() => observed.a);
    expect(dummy.value).toBe(0);

    // @ts-expect-error
    observed.a = bar;
    expect(dummy.value).toBe(1);

    bar.value++;
    expect(dummy.value).toBe(2);
  });

  it('non-observable values', () => {
    const assertValue = (value: any) => {
      reactive(value);
      expect(`value cannot be made reactive: ${String(value)}`).toHaveBeenWarnedLast();
    };

    // number
    assertValue(1);
    // string
    assertValue('foo');
    // boolean
    assertValue(false);
    // null
    assertValue(null);
    // undefined
    assertValue(undefined);
    // symbol
    const s = Symbol();
    assertValue(s);
    // bigint
    const bn = BigInt('9007199254740991');
    assertValue(bn);

    // built-ins should work and return same value
    const p = Promise.resolve();
    expect(reactive(p)).toBe(p);
    const r = /(?:)/;
    expect(reactive(r)).toBe(r);
    const d = new Date();
    expect(reactive(d)).toBe(d);
  });

  it('markRaw', () => {
    const obj = reactive({
      foo: { a: 1 },
      bar: markRaw({ b: 2 }),
    });
    expect(isReactive(obj.foo)).toBe(true);
    expect(isReactive(obj.bar)).toBe(false);
  });

  it('markRaw should skip non-extensible objects', () => {
    const obj = Object.seal({ foo: 1 });
    expect(() => markRaw(obj)).not.toThrowError();
  });

  it('markRaw should not redefine on an marked object', () => {
    const obj = markRaw({ foo: 1 });
    const raw = markRaw(obj);
    expect(raw).toBe(obj);
    expect(() => markRaw(obj)).not.toThrowError();
  });

  it('should not markRaw object as reactive', () => {
    const a = reactive({ a: 1 });
    const b = reactive({ b: 2 });
    b.a = markRaw(toRaw(a));
    expect(b.a === a).toBe(false);
  });

  it('should not observe non-extensible objects', () => {
    const obj = reactive({
      foo: Object.preventExtensions({ a: 1 }),
      // sealed or frozen objects are considered non-extensible as well
      bar: Object.freeze({ a: 1 }),
      baz: Object.seal({ a: 1 }),
    });
    expect(isReactive(obj.foo)).toBe(false);
    expect(isReactive(obj.bar)).toBe(false);
    expect(isReactive(obj.baz)).toBe(false);
  });

  it('should not observe objects with __skip__', () => {
    const original = {
      foo: 1,
      __skip__: true,
    };
    const observed = reactive(original);
    expect(isReactive(observed)).toBe(false);
  });

  it('hasOwnProperty edge case: Symbol values', () => {
    const key = Symbol();
    const obj = reactive({ [key]: 1 }) as { [key]?: 1 };
    let dummy;
    effect(() => {
      dummy = obj.hasOwnProperty(key);
    });
    expect(dummy).toBe(true);

    delete obj[key];
    expect(dummy).toBe(false);
  });

  it('hasOwnProperty edge case: non-string values', () => {
    const key = {};
    const obj = reactive({ '[object Object]': 1 }) as { '[object Object]'?: 1 };
    let dummy;
    effect(() => {
      // @ts-expect-error
      dummy = obj.hasOwnProperty(key);
    });
    expect(dummy).toBe(true);

    // @ts-expect-error
    delete obj[key];
    expect(dummy).toBe(false);
  });

  // #11696
  it('should use correct receiver on set handler for refs', () => {
    const a = reactive(signal(1));
    effect(() => a.value);
    expect(() => {
      a.value++;
    }).not.toThrow();
  });

  // #11979
  it('should release property Dep instance if it no longer has subscribers', () => {
    const obj = { x: 1 };
    const a = reactive(obj);
    const e = effect(() => a.x);
    expect(targetMap.get(obj)?.get('x')).toBeTruthy();
    e.effect.stop();
    expect(targetMap.get(obj)?.get('x')).toBeFalsy();
  });

  it('should trigger reactivity when Map key is undefined', () => {
    const map = reactive(new Map());
    const c = computed(() => map.get(void 0));

    expect(c.value).toBe(void 0);

    map.set(void 0, 1);
    expect(c.value).toBe(1);
  });

  it('should return false for non-reactive objects', () => {
    expect(isReactive(signal(true))).toBe(false);
    expect(isReactive(shallowSignal({}).value)).toBe(false);
  });
});

describe('edge cases', () => {
  it('isProxy with falsy value', () => {
    expect(isProxy(null)).toBe(false);
    expect(isProxy(0)).toBe(false);
  });

  it('reactive Map get(undefined) is tracked', () => {
    const m = reactive(new Map<any, number>());
    const fn = vi.fn();
    effect(() => fn(m.get(undefined)));
    m.set(undefined, 1);
    expect(fn).toHaveBeenLastCalledWith(1);
  });

  it('user-extended array methods are called directly', () => {
    class MyArray extends Array {
      map(fn: any): any {
        return super.map(fn);
      }
    }
    const arr = reactive(new MyArray()) as any;
    arr.push({ a: 1 });
    const result = arr.map((x: any) => x);
    expect(result.length).toBe(1);
  });

  it('shallowReactive reduce with 4-arg callback receives the proxy', () => {
    const arr = shallowReactive([1, 2, 3]);
    let last: any;
    const sum = arr.reduce((acc: number, v: number, _i: number, a: any) => {
      last = a;
      return acc + v;
    }, 0);
    expect(sum).toBe(6);
    expect(last).toBe(arr);
  });

  it('nested reactive Map get tracks missing keys', () => {
    const inner = reactive(new Map<string, number>());
    const outer = shallowReactive(inner as any) as Map<string, number>;
    const fn = vi.fn();
    effect(() => fn(outer.get('x')));
    inner.set('x', 1);
    expect(fn).toHaveBeenLastCalledWith(1);
  });
});
