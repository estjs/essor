import { computed, effect, isReactive, reactive, shallowReactive, toRaw } from '../src';

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
});
describe('reactive - nested objects and arrays', () => {
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

    state.user = { e: 3 } as any;

    expect(state.user.e).toBe(3);
    expect(mockFn).toHaveBeenCalledTimes(3);
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

    expect((state.a.b as any).e).toBe(3);
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
    const result = computed(() => (array as any).toReversed());
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
    result = computed(() => (shallow as any).toSorted((a, b) => a.val - b.val));
    expect(result.value.map(x => x.val)).toStrictEqual([1, 2, 3]);
    expect(isReactive(result.value[0])).toBe(true);

    shallow[0].val = 4;
    expect(result.value.map(x => x.val)).toStrictEqual([1, 4, 3]);

    shallow.pop();
    expect(result.value.map(x => x.val)).toStrictEqual([1, 4]);

    const deep = reactive([{ val: 2 }, { val: 1 }, { val: 3 }]);
    result = computed(() => (deep as any).toSorted((a, b) => a.val - b.val));
    expect(result.value.map(x => x.val)).toStrictEqual([1, 2, 3]);
    expect(isReactive(result.value[0])).toBe(true);

    deep[0].val = 4;
    expect(result.value.map(x => x.val)).toStrictEqual([1, 4, 3]);
  });

  // Node 20+
  // @ts-expect-error tests are not limited to es2016
  it.skipIf(!Array.prototype.toSpliced)('toSpliced should return reactive array', () => {
    const array = reactive([1, 2, 3]);
    const result = computed(() => (array as any).toSpliced(1, 1, -2));
    expect(result.value).toStrictEqual([1, -2, 3]);

    // Now modify the original array
    array[0] = 0;
    // The result should be updated with the new value at index 0
    expect(result.value).toStrictEqual([0, -2, 3]);
  });

  it('values', () => {
    const shallow = shallowReactive([{ val: 1 }, { val: 2 }]);
    const result = computed(() => Array.from(shallow.values()));
    expect(result.value).toStrictEqual([{ val: 1 }, { val: 2 }]);
    expect(isReactive(result.value[0])).toBe(true);

    shallow.pop();
    expect(result.value).toStrictEqual([{ val: 1 }]);

    const deep = reactive([{ val: 1 }, { val: 2 }]);
    const firstItem = Array.from(deep.values())[0];
    expect(isReactive(firstItem)).toBe(true);
  });
});
describe('shallowReactive - shallow reactivity behavior', () => {
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

    expect(mockFn).toHaveBeenCalledTimes(2);

    state[1] = { d: 4 };

    expect(mockFn).toHaveBeenCalledTimes(3);
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
describe('reactive & shallowReactive - Non-object and primitive values', () => {
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
describe('reactive Arrays with Effects', () => {
  let state: any;
  let effectFn;

  beforeEach(() => {
    state = reactive([1, 2, 3]);
    effectFn = vi.fn(() => {
      state[0];
    });
    effect(effectFn, { flush: 'sync' });
  });

  it('should handle add array item trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);
    state[3] = 4;
    expect(state).toEqual([1, 2, 3, 4]);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });
  it('should handle push and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);
    state.push(4);
    expect(state).toEqual([1, 2, 3, 4]);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle pop and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.pop();
    expect(state).toEqual([1, 2]);
    expect(effectFn).toHaveBeenCalledTimes(2);
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

  it('should handle splice and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.splice(1, 1);
    expect(state).toEqual([1, 3]);
    expect(effectFn).toHaveBeenCalledTimes(2);
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
describe('reactive Set with Effects', () => {
  let state: Set<number>;
  let effectFn;

  beforeEach(() => {
    state = reactive(new Set([1, 2, 3]));
    effectFn = vi.fn(() => {
      state.has(1);
    });
    effect(effectFn, { flush: 'sync' });
  });

  it('should handle add and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.add(4);
    expect(state.has(4)).toBe(true);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle delete and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.delete(2);
    expect(state.has(2)).toBe(false);
    expect(effectFn).toHaveBeenCalledTimes(2);
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

    state.add(2);

    expect(sum).toBe(6);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle has and not trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    const hasValue = state.has(2);
    expect(hasValue).toBe(true);
    expect(effectFn).toHaveBeenCalledTimes(1); // has shouldn't trigger effect
  });

  it('should handle size and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    expect(state.size).toBe(3);

    expect(effectFn).toHaveBeenCalledTimes(1);

    state.add(4);
    expect(state.size).toBe(4);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle values and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    let values = Array.from(state.values());
    expect(values).toEqual([1, 2, 3]);
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.add(4);
    values = Array.from(state.values());
    expect(values).toEqual([1, 2, 3, 4]);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle keys and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    let keys = Array.from(state.keys());
    expect(keys).toEqual([1, 2, 3]);
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.add(4);
    keys = Array.from(state.keys());
    expect(keys).toEqual([1, 2, 3, 4]);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });
  it('should handle entries and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    let entries = Array.from(state.entries());
    expect(entries).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.add(4);
    entries = Array.from(state.entries());
    expect(entries).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });
});
describe('reactive Map with Effects', () => {
  let state: Map<string, number>;
  let effectFn;

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
    effect(effectFn, { flush: 'sync' });
  });

  it('should handle set and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.set('key4', 4);
    expect(state.get('key4')).toBe(4);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle delete and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.delete('key2');
    expect(state.has('key2')).toBe(false);
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
});
describe('reactive WeakSet with Effects', () => {
  let state: WeakSet<object>;
  let effectFn;
  const obj1 = {};
  const obj2 = {};

  beforeEach(() => {
    state = reactive(new WeakSet([obj1, obj2]));
    effectFn = vi.fn(() => {
      state.has(obj1);
    });
    effect(effectFn, { flush: 'sync' });
  });

  it('should handle add and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    const obj3 = {};
    state.add(obj3);
    expect(state.has(obj3)).toBe(true);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle delete and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.delete(obj2);
    expect(state.has(obj2)).toBe(false);
    expect(effectFn).toHaveBeenCalledTimes(2);
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
    effect(effectFn, { flush: 'sync' });
  });

  it('should handle set and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    const obj3 = {};
    state.set(obj3, 3);
    expect(state.get(obj3)).toBe(3);
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it('should handle delete and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.delete(obj2);
    expect(state.has(obj2)).toBe(false);
    expect(effectFn).toHaveBeenCalledTimes(2);
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
});

describe('isReactive', () => {
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
