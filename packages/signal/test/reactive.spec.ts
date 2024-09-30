import { isReactive, shallowReactive, useEffect, useReactive } from '../src';
import { clearReactive, toRaw } from '../src/signal';

describe('useReactive - basic reactivity tests', () => {
  it('should initialize with provided properties', () => {
    const state = useReactive({ count: 0, name: 'John' });
    expect(state.count).toBe(0);
    expect(state.name).toBe('John');
  });

  it('should update the value reactively', () => {
    const state = useReactive({ count: 0 });
    const mockFn = vi.fn(() => state.count);
    useEffect(mockFn);

    expect(state.count).toBe(0);
    expect(mockFn).toHaveBeenCalledTimes(1);

    state.count = 10;
    expect(state.count).toBe(10);
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should add new properties reactively', () => {
    const state = useReactive<any>({});
    const mockFn = vi.fn(() => state.newProp);
    useEffect(mockFn);

    state.newProp = 'new value';
    expect(state.newProp).toBe('new value');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should delete properties reactively', () => {
    const state = useReactive({ count: 5 });
    const mockFn = vi.fn(() => state.count);
    useEffect(mockFn);

    expect(state.count).toBe(5);
    expect(mockFn).toHaveBeenCalledTimes(1);

    // @ts-ignore
    delete state.count;
    expect(state.count).toBe(undefined);
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should support state manipulation through functions', () => {
    const state = useReactive({
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
    const state = useReactive({ count: 0, text: 'hello' });
    const mockFn = vi.fn(() => state.text);
    useEffect(mockFn);

    state.text = 'world';
    expect(state.text).toBe('world');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should not make primitive types reactive', () => {
    // @ts-ignore
    const reactiveNumber = useReactive(1);
    expect(isReactive(reactiveNumber)).toBe(false);
    expect(reactiveNumber).toBe(1);

    // @ts-ignore
    const reactiveString = useReactive('test');
    expect(isReactive(reactiveString)).toBe(false);
    expect(reactiveString).toBe('test');
  });

  it('should not create a new proxy when passed a reactive object', () => {
    const state = useReactive({ count: 0 });
    const state2 = useReactive(state);
    expect(state).toBe(state2);
  });

  it('should return the raw object with toRaw', () => {
    const reactiveObj = useReactive({ name: 'John', age: 30 });
    const rawObj = toRaw(reactiveObj);
    expect(isReactive(rawObj)).toBe(false);

    reactiveObj.name = 'Doe';
    expect(rawObj.name).toBe('Doe'); // change proxy object to synchronize to original object
  });
});
describe('useReactive - nested objects and arrays', () => {
  // Nested object reactivity
  it('should work with nested objects', () => {
    const state = useReactive({
      user: {
        name: 'John',
        age: 30,
      },
    });

    const mockFn = vi.fn(() => state.user.age);
    useEffect(mockFn);

    expect(state.user.name).toBe('John');
    expect(state.user.age).toBe(30);
    expect(mockFn).toHaveBeenCalledTimes(1);

    state.user.age++;
    expect(state.user.age).toBe(31);
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  // Nested arrays reactivity
  it('should work with nested arrays', () => {
    const state = useReactive({
      items: [1, 2, 3],
    });

    const mockFn = vi.fn(() => state.items);
    useEffect(mockFn);

    expect(state.items.length).toBe(3);
    expect(state.items[1]).toBe(2);
    expect(mockFn).toHaveBeenCalledTimes(1);

    state.items.push(4);
    expect(state.items.length).toBe(4);
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  // Deeply nested object reactivity
  it('should work with deeply nested objects', () => {
    const state = useReactive<any>({ a: { b: { c: { d: 1 } } } });

    const mockFn = vi.fn(() => state.a.b?.c?.d);
    useEffect(mockFn);

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
    const state = useReactive({
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
    const state = useReactive([1, 2, 3]);

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
    const state = useReactive<any>({
      users: [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30, addresses: [{ city: 'New York' }] },
      ],
    });

    expect(state.users[1].addresses[0].city).toBe('New York');

    state.users[1].addresses[0].city = 'Los Angeles';
    expect(state.users[1].addresses[0].city).toBe('Los Angeles');
  });
});
describe('shallowReactive - shallow reactivity behavior', () => {
  // Shallow object reactivity
  it('should work with shallow reactivity in objects', () => {
    const state = shallowReactive<any>({ a: { b: { c: { d: 1 } } } });

    const mockFn = vi.fn(() => state.a?.b?.c?.d);
    useEffect(mockFn);

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
    useEffect(mockFn);

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
    useEffect(mockFn);

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
describe('useReactive & shallowReactive - Non-object and primitive values', () => {
  // Handling numbers
  it('should not work with primitive numbers', () => {
    // @ts-ignore
    const state = useReactive(1);
    expect(state).toBe(1);

    // @ts-ignore
    const shallowState = shallowReactive(1);
    expect(shallowState).toBe(1);
  });

  // Handling strings
  it('should not work with primitive strings', () => {
    // @ts-ignore
    const state = useReactive('hello');
    expect(state).toBe('hello');

    // @ts-ignore
    const shallowState = shallowReactive('world');
    expect(shallowState).toBe('world');
  });

  // Handling booleans
  it('should not work with primitive booleans', () => {
    // @ts-ignore
    const state = useReactive(true);
    expect(state).toBe(true);

    // @ts-ignore
    const shallowState = shallowReactive(false);
    expect(shallowState).toBe(false);
  });

  // Handling null
  it('should not work with null', () => {
    // @ts-ignore
    const state = useReactive(null);
    expect(state).toBe(null);

    // @ts-ignore
    const shallowState = shallowReactive(null);
    expect(shallowState).toBe(null);
  });

  // Handling undefined
  it('should not work with undefined', () => {
    // @ts-ignore
    const state = useReactive(undefined);
    expect(state).toBe(undefined);

    // @ts-ignore
    const shallowState = shallowReactive(undefined);
    expect(shallowState).toBe(undefined);
  });

  // Handling symbols
  it('should not work with symbols', () => {
    const symbol = Symbol('test');
    // @ts-ignore
    const state = useReactive(symbol);
    expect(state).toBe(symbol);

    // @ts-ignore
    const shallowState = shallowReactive(symbol);
    expect(shallowState).toBe(symbol);
  });

  // Handling functions
  it('should not work with functions', () => {
    const func = () => {};
    // @ts-ignore
    const state = useReactive(func);
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
    state = useReactive([1, 2, 3]);
    effectFn = vi.fn(() => {
      state[0];
    });
    useEffect(effectFn);
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
    //because shift is changed arr[0],it will be trigger two times
    expect(effectFn).toHaveBeenCalledTimes(3);
  });

  it('should handle unshift and trigger effect', () => {
    expect(effectFn).toHaveBeenCalledTimes(1);

    state.unshift(0);
    expect(state).toEqual([0, 1, 2, 3]);

    //because unshift is changed arr[0],it will be trigger two times
    expect(effectFn).toHaveBeenCalledTimes(3);
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

    useEffect(effectFn);

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
    useEffect(effectFn);
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

    useEffect(effectFn);

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
    state = useReactive(new Set([1, 2, 3]));
    effectFn = vi.fn(() => {
      state.has(1);
    });
    useEffect(effectFn);
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
    state = useReactive(
      new Map([
        ['key1', 1],
        ['key2', 2],
        ['key3', 3],
      ]),
    );
    effectFn = vi.fn(() => {
      state.get('key1');
    });
    useEffect(effectFn);
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
    state = useReactive(new WeakSet([obj1, obj2]));
    effectFn = vi.fn(() => {
      state.has(obj1);
    });
    useEffect(effectFn);
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
    state = useReactive(
      new WeakMap([
        [obj1, 1],
        [obj2, 2],
      ]),
    );
    effectFn = vi.fn(() => {
      state.get(obj1);
    });
    useEffect(effectFn);
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
  it('should work with check if object is useReactive', () => {
    const state = useReactive({ count: 0 });
    expect(isReactive(state)).toBe(true);
  });

  it('should work with check if object is not useReactive', () => {
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
    expect(isReactive(result)).toBe(false);
  });

  it('should return non-useReactive objects as-is', () => {
    const obj = { a: 1, b: { c: 2 } };
    const result = toRaw(obj);
    expect(result).toStrictEqual(obj);
    expect(isReactive(result)).toBe(false);
  });

  it('should remove reactivity from a useReactive object', () => {
    const reactiveObj = useReactive({ a: 1, b: { c: 2 } });
    const result = toRaw(reactiveObj);

    expect(result).toStrictEqual({ a: 1, b: { c: 2 } });
    expect(isReactive(result)).toBe(false);
  });

  it('should work with arrays', () => {
    const reactiveArray = useReactive([1, { a: 2 }, 3]);
    const result = toRaw(reactiveArray);

    expect(result).toStrictEqual([1, { a: 2 }, 3]);
    expect(isReactive(result[1])).toBe(false);
  });

  it('should handle shallow useReactive objects', () => {
    const shallowObj = shallowReactive({ a: 1, b: { c: 2 } });
    const result = toRaw(shallowObj);

    expect(result).toStrictEqual({ a: 1, b: { c: 2 } });
    expect(isReactive(result)).toBe(false);
    expect(isReactive(result.b)).toBe(false);
  });
});

describe('clearReactive', () => {
  it('should clear the reactive object values', () => {
    const obj = useReactive({ a: 1, b: 2 });
    clearReactive(obj);
    expect(obj).toEqual({});
  });

  it('should clear the reactive array', () => {
    const arr = useReactive([1, 2, 3]);
    clearReactive(arr);
    expect(arr).toEqual([]);
  });

  it('should clear the reactive Set', () => {
    const set = useReactive(new Set([1, 2, 3]));
    clearReactive(set);
    expect(set.size).toBe(0);
  });

  it('should clear the reactive Map', () => {
    const map = useReactive(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
    clearReactive(map);
    expect(map.size).toBe(0);
  });

  it('should trigger effect', () => {
    const obj = useReactive({ a: 1 });
    const effectFn = vi.fn();
    useEffect(() => {
      effectFn(obj.a);
    });

    clearReactive(obj);
    expect(effectFn).toHaveBeenCalledTimes(2);

    const arr = useReactive([1, 2, 3]);
    const effectFn2 = vi.fn();
    useEffect(() => {
      effectFn2(arr.length);
    });

    clearReactive(arr);
    expect(effectFn2).toHaveBeenCalledTimes(2);

    const set = useReactive(new Set([1, 2, 3]));
    const effectFn3 = vi.fn();
    useEffect(() => {
      effectFn3(set.size);
    });

    clearReactive(set);
    expect(effectFn3).toHaveBeenCalledTimes(2);

    const map = useReactive(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
    const effectFn4 = vi.fn();
    useEffect(() => {
      effectFn4(map.size);
    });
  });

  it('should warn for non-reactive objects', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    clearReactive({} as any);
    expect(warnSpy).toHaveBeenCalledWith(
      '[Essor warn]: clearReactive: argument must be a reactive object',
    );
    warnSpy.mockRestore();
  });
});
