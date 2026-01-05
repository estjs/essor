import { effect, shallowSignal, signal } from '../src';

describe('signal', () => {
  it('should initialize signal with the correct value', () => {
    const testSignal = signal(10);
    expect(testSignal.value).toBe(10);
    expect(testSignal.peek()).toBe(10);

    testSignal.value = 20;

    expect(testSignal.value).toBe(20);
    expect(testSignal.peek()).toBe(20);
  });

  it('should update with object', () => {
    const testSignal = signal<Record<string, any> | null>({ a: 1, b: 2 });
    expect(testSignal.value).toEqual({ a: 1, b: 2 });
    expect(testSignal.peek()).toEqual({ a: 1, b: 2 });

    testSignal.value = { a: 10, b: 20 };
    expect(testSignal.value).toEqual({ a: 10, b: 20 });
    expect(testSignal.peek()).toEqual({ a: 10, b: 20 });

    testSignal.value.a = 30;
    expect(testSignal.value).toEqual({ a: 30, b: 20 });
    expect(testSignal.peek()).toEqual({ a: 30, b: 20 });

    testSignal.value.b = 40;
    expect(testSignal.value).toEqual({ a: 30, b: 40 });
    expect(testSignal.peek()).toEqual({ a: 30, b: 40 });

    testSignal.value = null;
    expect(testSignal.value).toBeNull();
    expect(testSignal.peek()).toBeNull();
  });

  it('should work with array', () => {
    const testSignal = signal<number[]>([]);

    let effectCount = 0;
    effect(() => {
      // trigger
      testSignal.value?.length;
      effectCount++;
    });

    expect(effectCount).toBe(1);

    expect(testSignal.value).toEqual([]);
    expect(testSignal.peek()).toEqual([]);

    testSignal.value = [1, 2, 3];
    expect(effectCount).toBe(2);

    expect(testSignal.value).toEqual([1, 2, 3]);
    expect(testSignal.peek()).toEqual([1, 2, 3]);

    testSignal.value[0] = 10;
    expect(effectCount).toBe(3);
    expect(testSignal.value).toEqual([10, 2, 3]);
    expect(testSignal.peek()).toEqual([10, 2, 3]);

    testSignal.value[1] = 20;
    expect(effectCount).toBe(4);
    expect(testSignal.value).toEqual([10, 20, 3]);
    expect(testSignal.peek()).toEqual([10, 20, 3]);

    testSignal.value[2] = 30;
    expect(effectCount).toBe(5);
    expect(testSignal.value).toEqual([10, 20, 30]);
    expect(testSignal.peek()).toEqual([10, 20, 30]);

    (testSignal.value as any) = null;
    expect(effectCount).toBe(6);
    expect(testSignal.value).toBeNull();
    expect(testSignal.peek()).toBeNull();
  });

  it('should work with array method', () => {
    const testSignal = signal<number[]>([]);
    let effectCount = 0;
    effect(() => {
      // trigger
      testSignal.value.length;
      effectCount++;
    });

    expect(effectCount).toBe(1);

    testSignal.value?.push(1);
    expect(testSignal.value).toEqual([1]);

    expect(effectCount).toBe(2);

    testSignal.value?.push(2);
    expect(testSignal.value).toEqual([1, 2]);

    expect(effectCount).toBe(3);

    testSignal.value?.shift();
    expect(testSignal.value).toEqual([2]);

    expect(effectCount).toBe(4);

    testSignal.value?.unshift(3);
    expect(testSignal.value).toEqual([3, 2]);

    expect(effectCount).toBe(5);

    testSignal.value?.pop();
    expect(testSignal.value).toEqual([3]);

    expect(effectCount).toBe(6);

    testSignal.value?.push(...[1, 4, 2, 6, 8, 7, 5]);

    expect(effectCount).toBe(7);
    testSignal.value?.sort();
    expect(testSignal.value).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    expect(effectCount).toBe(8);

    testSignal.value = [1, 3, 2, 4, 8, 5, 7, 6];

    expect(testSignal.value).toEqual([1, 3, 2, 4, 8, 5, 7, 6]);

    expect(effectCount).toBe(9);

    testSignal.value?.pop();
    expect(testSignal.value).toEqual([1, 3, 2, 4, 8, 5, 7]);

    expect(effectCount).toBe(10);
  });

  it('should work with Set', () => {
    const testSignal = signal<Set<number>>(new Set([1, 2, 3]));
    const effectFn = vitest.fn(() => {
      // trigger
      testSignal.value.has(1);
    });

    effect(effectFn, { flush: 'sync' });
    expect(effectFn).toHaveBeenCalledTimes(1);
    expect(Array.from(testSignal.value)).toEqual([1, 2, 3]);

    testSignal.value?.add(4);
    expect(Array.from(testSignal.value)).toEqual([1, 2, 3, 4]);
    expect(effectFn).toHaveBeenCalledTimes(2);

    testSignal.value?.delete(2);
    expect(Array.from(testSignal.value)).toEqual([1, 3, 4]);
    expect(effectFn).toHaveBeenCalledTimes(3);
  });

  it('should work with WeakSet', () => {
    const obj1 = { id: 1 };
    const obj2 = { id: 2 };
    const obj3 = { id: 3 };
    const testSignal = signal<WeakSet<object> | null>(new WeakSet([obj1, obj2, obj3]));
    const effectFn = vitest.fn(() => {
      // trigger
      testSignal.value?.has(obj1);
    });

    effect(effectFn, { flush: 'sync' });
    expect(effectFn).toHaveBeenCalledTimes(1);
    expect(testSignal.value?.has(obj1)).toBe(true);
    expect(testSignal.value?.has(obj2)).toBe(true);
    expect(testSignal.value?.has(obj3)).toBe(true);

    const obj4 = { id: 4 };
    testSignal.value?.add(obj4);
    expect(testSignal.value?.has(obj4)).toBe(true);
    expect(effectFn).toHaveBeenCalledTimes(2);

    testSignal.value?.delete(obj2);
    expect(testSignal.value?.has(obj2)).toBe(false);
    expect(effectFn).toHaveBeenCalledTimes(3);
  });

  it('should work with Map', () => {
    const testSignal = signal<Map<string, number> | null>(
      new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]),
    );
    const effectFn = vitest.fn(() => {
      // trigger
      testSignal.value?.has('a');
    });

    effect(effectFn, { flush: 'sync' });
    expect(effectFn).toHaveBeenCalledTimes(1);
    expect(Array.from(testSignal.value ?? new Map())).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);

    testSignal.value?.set('d', 4);
    expect(Array.from(testSignal.value ?? new Map())).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ]);
    expect(effectFn).toHaveBeenCalledTimes(2);

    testSignal.value?.delete('b');
    expect(Array.from(testSignal.value ?? new Map())).toEqual([
      ['a', 1],
      ['c', 3],
      ['d', 4],
    ]);
    expect(effectFn).toHaveBeenCalledTimes(3);
  });

  it('should work with WeakMap', () => {
    const key1 = { id: 1 };
    const key2 = { id: 2 };
    const key3 = { id: 3 };
    const testSignal = signal<WeakMap<object, number>>(
      new WeakMap([
        [key1, 1],
        [key2, 2],
        [key3, 3],
      ]),
    );
    const effectFn = vitest.fn(() => {
      const map = testSignal.value;
      // Track WeakMap operations
      map?.has(key1);
    });

    effect(effectFn, { flush: 'sync' });
    expect(effectFn).toHaveBeenCalledTimes(1);

    const key4 = { id: 4 };
    testSignal.value?.set(key4, 4);
    expect(testSignal.value?.get(key4)).toBe(4);
    expect(effectFn).toHaveBeenCalledTimes(2);

    testSignal.value?.delete(key2);
    expect(testSignal.value?.has(key2)).toBe(false);
    expect(effectFn).toHaveBeenCalledTimes(3);
  });
  it('should work with deep object', () => {
    const testSignal = signal<Record<string, any>>({
      one: {
        two: {
          three: [],
        },
      },
    });

    const fn = vitest.fn(() => {
      testSignal.value;
    });
    effect(fn, { flush: 'sync' });

    testSignal.value.one.two.three.push(1);

    expect(fn).toHaveBeenCalled();
    expect(testSignal.value.one.two.three).toEqual([1]);
  });

  it('should work with shallow signal array', () => {
    const testSignal = shallowSignal([1, 2, 3]);

    const fn = vitest.fn(() => {
      testSignal.value.length;
    });
    effect(fn, { flush: 'sync' });
    expect(fn).toHaveBeenCalledTimes(1);
    testSignal.value.push(4);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(testSignal.value).toEqual([1, 2, 3, 4]);

    testSignal.value = [2, 3, 4];
    expect(fn).toHaveBeenCalledTimes(3);
    expect(testSignal.value).toEqual([2, 3, 4]);
  });

  it('should work with shallow signal object', () => {
    const testSignal = shallowSignal<Record<string, number>>({ a: 1, b: 2, c: 3 });

    const fn = vitest.fn(() => {
      testSignal.value;
    });
    effect(fn, { flush: 'sync' });
    expect(fn).toHaveBeenCalledTimes(1);
    testSignal.value.d = 4;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(testSignal.value).toEqual({ a: 1, b: 2, c: 3, d: 4 });
    testSignal.value = { a: 2, b: 3, c: 4, d: 5 };
    expect(fn).toHaveBeenCalledTimes(2);
    expect(testSignal.value).toEqual({ a: 2, b: 3, c: 4, d: 5 });
  });

  it('should work with set signal value to original value', () => {
    const value1 = signal(1);
    const value2 = signal({});
    const value3 = signal([1, 2, 3]);

    // @ts-ignore
    value1.value = signal(2);
    value2.value = signal({ a: 'b' });
    // @ts-ignore
    value3.value = signal([2, 3, 4]);

    expect(value1.value).toBe(2);
    expect(value2.value).toEqual({ a: 'b' });
    expect(value3.value).toEqual([2, 3, 4]);
  });

  it('should work use signal is signal value', () => {
    const value1 = signal(signal(1));
    const value2 = signal(signal({ a: 'b' }));
    const value3 = signal(signal([1, 2, 3]));

    expect(value1.value).toBe(1);
    expect(value2.value).toEqual({ a: 'b' });
    expect(value3.value).toEqual([1, 2, 3]);
  });
});

describe('shallowSignal', () => {
  it('should work with basic types', () => {
    const value1 = shallowSignal(1);
    const value2 = shallowSignal(null);
    const value3 = shallowSignal(undefined);
    const value4 = shallowSignal('hello');
    const value5 = shallowSignal(true);

    expect(value1.value).toBe(1);
    expect(value2.value).toBe(null);
    expect(value3.value).toBe(undefined);
    expect(value4.value).toBe('hello');
    expect(value5.value).toBe(true);
  });

  it('should work with objects', () => {
    const value1 = shallowSignal<any>({ a: 1, b: 2 });
    const value2 = shallowSignal<any>({ a: null, b: 2 });
    const value3 = shallowSignal<any>({ a: undefined, b: 2 });
    const value4 = shallowSignal<any>({ a: 'hello', b: 2 });
    const value5 = shallowSignal<any>({ a: true, b: 2 });

    let triggerCount = 0;

    effect(() => {
      // trigger value
      value1.value;
      value2.value;
      value3.value;
      value4.value;
      value5.value;

      triggerCount++;
    });

    expect(value1.value).toEqual({ a: 1, b: 2 });
    expect(value2.value).toEqual({ a: null, b: 2 });
    expect(value3.value).toEqual({ a: undefined, b: 2 });
    expect(value4.value).toEqual({ a: 'hello', b: 2 });
    expect(value5.value).toEqual({ a: true, b: 2 });

    // not trigger,it shallow,just set value will be trigger
    value1.value.a = 10;
    value2.value.a = 2;
    value3.value.a = 3;
    value4.value.a = 4;
    value5.value.a = 5;

    expect(triggerCount).toBe(1);

    expect(value1.value).toEqual({ a: 10, b: 2 });
    expect(value2.value).toEqual({ a: 2, b: 2 });
    expect(value3.value).toEqual({ a: 3, b: 2 });
    expect(value4.value).toEqual({ a: 4, b: 2 });
    expect(value5.value).toEqual({ a: 5, b: 2 });

    // trigger effect
    value1.value = { a: 11, b: 2 };
    value2.value = { a: 12, b: 2 };
    value3.value = { a: 13, b: 2 };
    value4.value = { a: 14, b: 2 };
    value5.value = { a: 15, b: 2 };

    expect(triggerCount).toBe(6);

    expect(value1.value).toEqual({ a: 11, b: 2 });
    expect(value2.value).toEqual({ a: 12, b: 2 });
    expect(value3.value).toEqual({ a: 13, b: 2 });
    expect(value4.value).toEqual({ a: 14, b: 2 });
    expect(value5.value).toEqual({ a: 15, b: 2 });

    value1.value = { a: 11, b: 2 };

    value2.value = { a: 12, b: 2 };

    value3.value = { a: 13, b: 2 };

    value4.value = { a: 14, b: 2 };

    value5.value = { a: 15, b: 2 };

    expect(triggerCount).toBe(11);
  });

  it('should work with collection', () => {
    const value1 = shallowSignal(new Set([1, 2, 3]));
    const value2 = shallowSignal(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
    const value3 = shallowSignal(new WeakMap());
    const value4 = shallowSignal<WeakSet<any>>(new WeakSet([]));

    let triggerCount = 0;

    effect(() => {
      // trigger value
      value1.value.size;

      triggerCount++;
    });

    effect(() => {
      // trigger value
      value2.value.size;
      triggerCount++;
    });

    effect(() => {
      // trigger value
      value3.value.get({});
      triggerCount++;
    });

    effect(() => {
      // trigger value
      value4.value.has({});
      triggerCount++;
    });

    expect(triggerCount).toBe(4);

    value1.value.add(4);
    value2.value.set('c', 3);
    value3.value.set({}, 2);
    value4.value.add({});

    expect(triggerCount).toBe(8);

    value1.value = new Set([1]);
    value2.value = new Map([['a', 1]]);
    value3.value = new WeakMap();
    value4.value = new WeakSet([]);

    expect(triggerCount).toBe(12);
  });

  // skip this testcase because too slow
  it.skip('should work with set method ant function calls', () => {
    const value1 = shallowSignal<any>(new Set([1, 2, 3]));
    const value2 = signal<any>(1);
    const value3 = signal<any>({});

    let triggerCount = 0;

    effect(() => {
      // trigger value
      //@ts-ignore
      value1();

      //@ts-ignore
      value2();

      //@ts-ignore
      value3();

      triggerCount++;
    });

    expect(triggerCount).toBe(1);
    value1.set(1);
    value2.set(new Map([['a', 1]]));
    value3.set({ a: 2 });

    expect(triggerCount).toBe(4);

    value1.set(new Set([1, 2, 3, 4]));
    value2.set(new Map([['a', 1]]));
    value3.set({ a: 2 });

    expect(triggerCount).toBe(7);
  });

  it('should work with update', () => {
    const value1 = shallowSignal(new Set([1, 2, 3]));
    const value2 = signal<any>(1);
    const value3 = signal({});
    const value4 = signal(new Map([['a', 1]]));
    const value5 = signal(new WeakMap());
    const value6 = signal(new WeakSet([]));

    let triggerCount = 0;

    effect(
      () => {
        // trigger value
        value1.value;
        value2.value;
        value3.value;
        value4.value;
        value5.value;
        value6.value;

        triggerCount++;
      },
      { flush: 'sync' },
    );

    expect(triggerCount).toBe(1);
    value1.update(value => new Set([...value, 4]));
    value2.update(() => new Map([['a', 1]]));
    value3.update(value => ({ ...value, a: 2 }));
    value4.update(() => new Map([['a', 1]]));
    value5.update(() => new WeakMap());
    value6.update(() => new WeakSet([]));

    expect(triggerCount).toBe(7);

    value1.update(value => new Set([...value, 5]));
    value2.update(() => new Map([['a', 2]]));
    value3.update(value => ({ ...value, a: 2 }));
    value4.update(() => new Map([['a', 2]]));
    value5.update(() => new WeakMap());
    value6.update(() => new WeakSet());

    expect(triggerCount).toBe(13);
  });
});

describe('branch Switching', () => {
  it('should handle branch switching correctly', () => {
    const count = signal(0);
    const show = signal(true);
    let renderCount = 0;

    effect(() => {
      if (show.value) {
        count.value;
      }
      renderCount++;
    });

    expect(renderCount).toBe(1);

    // Unrelated updates should not trigger the effect
    count.value++;

    expect(renderCount).toBe(2);

    show.value = false;

    expect(renderCount).toBe(3);

    // Count updates should not trigger the effect since the branch is closed
    count.value++;

    expect(renderCount).toBe(3);
  });

  it('should handle nested branch switching', () => {
    const a = signal(true);
    const b = signal(true);
    const c = signal(0);
    let renderCount = 0;

    effect(() => {
      if (a.value && b.value) {
        c.value;
      }
      renderCount++;
    });

    expect(renderCount).toBe(1);

    c.value++;

    expect(renderCount).toBe(2);

    b.value = false;

    expect(renderCount).toBe(3);

    // Updates to c should not trigger the effect
    c.value++;

    expect(renderCount).toBe(3);

    a.value = false;

    expect(renderCount).toBe(4);
  });
});

describe('signal optimization - on-demand _oldValue creation', () => {
  it('should not create _oldValue property until first update', () => {
    const s = signal(10);

    // Access the internal implementation to check _oldValue property
    const impl = s as any;

    // _oldValue should not exist initially
    expect('_oldValue' in impl).toBe(false);

    // First update should create _oldValue
    s.value = 20;
    expect('_oldValue' in impl).toBe(true);
    expect(impl._oldValue).toBe(10);
  });

  it('should create _oldValue on first value change', () => {
    const s = signal({ count: 0 });
    const impl = s as any;

    // _oldValue should not exist initially
    expect('_oldValue' in impl).toBe(false);

    // Setting to a different value should create _oldValue
    s.value = { count: 1 };
    expect('_oldValue' in impl).toBe(true);
  });

  it('should not create _oldValue when setting same value', () => {
    const s = signal(10);
    const impl = s as any;

    // Setting the same value should not create _oldValue
    s.value = 10;
    expect('_oldValue' in impl).toBe(false);
  });
});

describe('signal edge cases', () => {
  it('should handle undefined value correctly', () => {
    const s = signal<number | undefined>(undefined);
    expect(s.value).toBeUndefined();
    expect(s.peek()).toBeUndefined();

    // Update to a defined value
    s.value = 42;
    expect(s.value).toBe(42);

    // Update back to undefined
    s.value = undefined;
    expect(s.value).toBeUndefined();
  });

  it('should handle null value correctly', () => {
    const s = signal<number | null>(null);
    expect(s.value).toBeNull();
    expect(s.peek()).toBeNull();

    // Update to a non-null value
    s.value = 42;
    expect(s.value).toBe(42);

    // Update back to null
    s.value = null;
    expect(s.value).toBeNull();
  });

  it('should handle NaN value correctly', () => {
    const s = signal(Number.NaN);
    expect(Number.isNaN(s.value)).toBe(true);
    expect(Number.isNaN(s.peek())).toBe(true);

    // Object.is(NaN, NaN) is true, so setting NaN again should NOT trigger update
    let effectCount = 0;
    effect(() => {
      s.value;
      effectCount++;
    });

    expect(effectCount).toBe(1);

    // Setting NaN again should NOT trigger because Object.is(NaN, NaN) === true
    s.value = Number.NaN;
    expect(effectCount).toBe(1);
    expect(Number.isNaN(s.value)).toBe(true);

    // Setting to a different value should trigger
    s.value = 42;
    expect(effectCount).toBe(2);
    expect(s.value).toBe(42);
  });

  it('should handle transition between undefined, null, and values', () => {
    const s = signal<number | null | undefined>(undefined);
    let effectCount = 0;

    effect(() => {
      s.value;
      effectCount++;
    });

    expect(effectCount).toBe(1);
    expect(s.value).toBeUndefined();

    // undefined -> null
    s.value = null;
    expect(effectCount).toBe(2);
    expect(s.value).toBeNull();

    // null -> 0
    s.value = 0;
    expect(effectCount).toBe(3);
    expect(s.value).toBe(0);

    // 0 -> undefined
    s.value = undefined;
    expect(effectCount).toBe(4);
    expect(s.value).toBeUndefined();
  });

  it('should handle empty string vs undefined', () => {
    const s = signal<string | undefined>('');
    expect(s.value).toBe('');

    s.value = undefined;
    expect(s.value).toBeUndefined();

    s.value = '';
    expect(s.value).toBe('');
  });

  it('should handle 0 vs null vs undefined', () => {
    const s = signal<number | null | undefined>(0);
    expect(s.value).toBe(0);

    s.value = null;
    expect(s.value).toBeNull();

    s.value = undefined;
    expect(s.value).toBeUndefined();

    s.value = 0;
    expect(s.value).toBe(0);
  });
});

describe('signal nested unwrapping', () => {
  it('should unwrap nested signal in constructor', () => {
    const inner = signal(42);
    const outer = signal(inner);

    // Should unwrap and get the value, not the signal itself
    expect(outer.value).toBe(42);
    expect(typeof outer.value).toBe('number');
  });

  it('should unwrap nested signal when setting value', () => {
    const s = signal(10);
    const nested = signal(20);

    // Setting a signal as value should unwrap it
    s.value = nested as any;
    expect(s.value).toBe(20);
    expect(typeof s.value).toBe('number');
  });

  it('should unwrap deeply nested signals', () => {
    const level1 = signal(100);
    const level2 = signal(level1);
    const level3 = signal(level2);

    // All levels should unwrap to the final value
    expect(level1.value).toBe(100);
    expect(level2.value).toBe(100);
    expect(level3.value).toBe(100);
  });

  it('should unwrap signal with object value', () => {
    const inner = signal({ count: 42 });
    const outer = signal(inner);

    expect(outer.value).toEqual({ count: 42 });
    expect(typeof outer.value).toBe('object');
  });

  it('should unwrap signal with array value', () => {
    const inner = signal([1, 2, 3]);
    const outer = signal(inner);

    expect(outer.value).toEqual([1, 2, 3]);
    expect(Array.isArray(outer.value)).toBe(true);
  });

  it('should unwrap signal in update function', () => {
    const s = signal(10);
    const nested = signal(20);

    // Update function returning a signal should unwrap it
    s.update(() => nested as any);
    expect(s.value).toBe(20);
  });

  it('should maintain reactivity after unwrapping', () => {
    const inner = signal(42);
    const outer = signal(inner);

    let effectCount = 0;
    effect(() => {
      outer.value;
      effectCount++;
    });

    expect(effectCount).toBe(1);

    // Updating outer should trigger effect
    outer.value = 100;
    expect(effectCount).toBe(2);
    expect(outer.value).toBe(100);
  });

  it('should handle shallow signal unwrapping', () => {
    const inner = signal({ nested: { value: 42 } });
    const outer = shallowSignal(inner);

    expect(outer.value).toEqual({ nested: { value: 42 } });
  });
});
