import { isSignal, shallowSignal, toRaw, useEffect, useSignal } from '../src';
import { signalObject } from '../src/signal';

describe('useSignal', () => {
  it('should initialize with the correct value', () => {
    const testSignal = useSignal(10);
    expect(testSignal.value).toBe(10);
    expect(testSignal.peek()).toBe(10);

    testSignal.value = 20;

    expect(testSignal.value).toBe(20);
    expect(testSignal.peek()).toBe(20);
  });

  it('should update with object', () => {
    const testSignal = useSignal<Record<string, any> | null>({ a: 1, b: 2 });
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
    const testSignal = useSignal<number[] | null>([]);
    expect(testSignal.value).toEqual([]);
    expect(testSignal.peek()).toEqual([]);

    testSignal.value = [1, 2, 3];
    expect(testSignal.value).toEqual([1, 2, 3]);
    expect(testSignal.peek()).toEqual([1, 2, 3]);

    testSignal.value[0] = 10;
    expect(testSignal.value).toEqual([10, 2, 3]);
    expect(testSignal.peek()).toEqual([10, 2, 3]);

    testSignal.value[1] = 20;
    expect(testSignal.value).toEqual([10, 20, 3]);
    expect(testSignal.peek()).toEqual([10, 20, 3]);

    testSignal.value[2] = 30;
    expect(testSignal.value).toEqual([10, 20, 30]);
    expect(testSignal.peek()).toEqual([10, 20, 30]);

    testSignal.value = null;
    expect(testSignal.value).toBeNull();
    expect(testSignal.peek()).toBeNull();
  });

  it('should work with array method', () => {
    const testSignal = useSignal<number[]>([]);
    const effectFn = vitest.fn(() => {
      // trigger
      testSignal.value;
    });

    useEffect(effectFn);
    expect(effectFn).toHaveBeenCalledTimes(1);

    testSignal.value?.push(1);
    expect(testSignal.value).toEqual([1]);
    expect(effectFn).toHaveBeenCalledTimes(2);

    testSignal.value?.push(2);
    expect(testSignal.value).toEqual([1, 2]);
    expect(effectFn).toHaveBeenCalledTimes(3);

    testSignal.value?.shift();
    expect(testSignal.value).toEqual([2]);
    expect(effectFn).toHaveBeenCalledTimes(4);

    testSignal.value?.unshift(3);
    expect(testSignal.value).toEqual([3, 2]);
    expect(effectFn).toHaveBeenCalledTimes(5);

    testSignal.value?.pop();
    expect(testSignal.value).toEqual([3]);
    expect(effectFn).toHaveBeenCalledTimes(6);

    testSignal.value?.push(...[1, 4, 2, 6, 8, 7, 5]);
    testSignal.value?.sort();
    expect(testSignal.value).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(effectFn).toHaveBeenCalledTimes(8);

    testSignal.value = [1, 3, 2, 4, 8, 5, 7, 6];
    expect(testSignal.value).toEqual([1, 3, 2, 4, 8, 5, 7, 6]);
    expect(effectFn).toHaveBeenCalledTimes(9);

    testSignal.value?.pop();
    expect(testSignal.value).toEqual([1, 3, 2, 4, 8, 5, 7]);
    expect(effectFn).toHaveBeenCalledTimes(10);
  });

  it('should work with Set', () => {
    const testSignal = useSignal<Set<number>>(new Set([1, 2, 3]));
    const effectFn = vitest.fn(() => {
      // trigger
      testSignal.value;
    });

    useEffect(effectFn);
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
    const testSignal = useSignal<WeakSet<object> | null>(new WeakSet([obj1, obj2, obj3]));
    const effectFn = vitest.fn(() => {
      // trigger
      testSignal.value;
    });

    useEffect(effectFn);
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
    const testSignal = useSignal<Map<string, number> | null>(
      new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]),
    );
    const effectFn = vitest.fn(() => {
      // trigger
      testSignal.value;
    });

    useEffect(effectFn);
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
    const testSignal = useSignal<WeakMap<object, number>>(
      new WeakMap([
        [key1, 1],
        [key2, 2],
        [key3, 3],
      ]),
    );
    const effectFn = vitest.fn(() => {
      // trigger
      testSignal.value;
    });

    useEffect(effectFn);
    expect(effectFn).toHaveBeenCalledTimes(1);
    expect(testSignal.value?.get(key1)).toBe(1);
    expect(testSignal.value?.get(key2)).toBe(2);
    expect(testSignal.value?.get(key3)).toBe(3);

    const key4 = { id: 4 };
    testSignal.value?.set(key4, 4);
    expect(testSignal.value?.get(key4)).toBe(4);
    expect(effectFn).toHaveBeenCalledTimes(2);

    testSignal.value?.delete(key2);
    expect(testSignal.value?.has(key2)).toBe(false);
    expect(effectFn).toHaveBeenCalledTimes(3);
  });
  it('should work with deep object', () => {
    const testSignal = useSignal<any>({
      one: {
        two: {
          three: [],
        },
      },
    });

    const fn = vitest.fn(() => {
      testSignal.value;
    });
    useEffect(fn);

    testSignal.value.one.two.three.push(1);

    expect(fn).toHaveBeenCalled();
    expect(testSignal.value.one.two.three).toEqual([1]);
  });

  it('should work with shallow signal array', () => {
    const testSignal = shallowSignal([1, 2, 3]);

    const fn = vitest.fn(() => {
      testSignal.value;
    });
    useEffect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    testSignal.value.push(4);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(testSignal.value).toEqual([1, 2, 3, 4]);

    testSignal.value = [2, 3, 4];
    expect(fn).toHaveBeenCalledTimes(2);
    expect(testSignal.value).toEqual([2, 3, 4]);
  });

  it('should work with shallow signal object', () => {
    const testSignal = shallowSignal<Record<string, number>>({ a: 1, b: 2, c: 3 });

    const fn = vitest.fn(() => {
      testSignal.value;
    });
    useEffect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    testSignal.value.d = 4;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(testSignal.value).toEqual({ a: 1, b: 2, c: 3, d: 4 });
    testSignal.value = { a: 2, b: 3, c: 4, d: 5 };
    expect(fn).toHaveBeenCalledTimes(2);
    expect(testSignal.value).toEqual({ a: 2, b: 3, c: 4, d: 5 });
  });

  it('should work with set signal value to original value', () => {
    const value1 = useSignal<any>(1);
    const value2 = useSignal({});
    const value3 = useSignal<any>([1, 2, 3]);

    value1.value = useSignal(2);
    value2.value = useSignal({ a: 'b' });
    value3.value = useSignal([2, 3, 4]);

    expect(value1.value).toBe(2);
    expect(value2.value).toEqual({ a: 'b' });
    expect(value3.value).toEqual([2, 3, 4]);
  });

  it('should work use signal is signal value', () => {
    const value1 = useSignal<any>(useSignal(1));
    const value2 = useSignal<any>(useSignal({ a: 'b' }));
    const value3 = useSignal<any>(useSignal([1, 2, 3]));

    expect(value1.value).toBe(1);
    expect(value2.value).toEqual({ a: 'b' });
    expect(value3.value).toEqual([1, 2, 3]);
  });
});

describe('signalObject', () => {
  it('should convert plain object properties to signals', () => {
    const initialValues = { a: 1, b: 2 };
    const signals = signalObject(initialValues);

    expect(isSignal(signals.a)).toBe(true);
    expect(isSignal(signals.b)).toBe(true);
    expect(signals.a.peek()).toBe(1);
    expect(signals.b.peek()).toBe(2);
  });

  it('should exclude properties based on exclude function', () => {
    const initialValues = { a: 1, b: 2 };
    const exclude = (key: string | symbol) => key === 'a';
    const signals = signalObject(initialValues, exclude);

    expect(isSignal(signals.a)).toBe(false); // 'a' should not be converted to a signal
    expect(isSignal(signals.b)).toBe(true); // 'b' should be converted to a signal
    expect(signals.a).toBe(1);
    expect(signals.b.peek()).toBe(2);
  });

  it('should preserve signal values if they are already signals', () => {
    const initialValues = { a: useSignal(1), b: 2 };
    const signals = signalObject(initialValues);

    expect(isSignal(signals.a)).toBe(true);
    expect(signals.a.peek()).toBe(1); // should not wrap a signal in another signal
    expect(isSignal(signals.b)).toBe(true);
    expect(signals.b.peek()).toBe(2);
  });

  it('should handle empty objects', () => {
    const initialValues = {};
    const signals = signalObject(initialValues);

    expect(signals).toEqual({});
  });
});

describe('toRaw signal', () => {
  it('should unwrap signal values', () => {
    const signal = useSignal(1);
    const unwrapped = toRaw(signal);

    expect(unwrapped).toBe(1);
  });

  it('should unwrap signal objects', () => {
    const initialValues = { a: useSignal(1), b: useSignal(2) };
    const unwrapped = toRaw(initialValues);

    expect(unwrapped).toEqual({ a: 1, b: 2 });
  });

  it('should handle arrays of signals', () => {
    const signalsArray = [useSignal(1), useSignal(2)];
    const unwrapped = toRaw(signalsArray);

    expect(unwrapped).toEqual([1, 2]);
  });

  it('should handle collections of signals', () => {
    const sets = new Set();
    const maps = new Map();
    const weakSets = new WeakSet();
    const weakMaps = new WeakMap();

    const signalsArray = [useSignal(sets), useSignal(maps), useSignal(weakMaps), toRaw(weakSets)];

    const unwrapped = toRaw(signalsArray);
    expect(unwrapped).toEqual([sets, maps, weakMaps, weakSets]);

    sets.add(1);
    maps.set(1, 2);
    weakMaps.set({}, 2);
    weakSets.add({});
    expect(unwrapped).toEqual([sets, maps, weakMaps, weakSets]);
  });

  it('should handle plain objects without signals', () => {
    const obj = { a: 1, b: 2 };
    const unwrapped = toRaw(obj);

    expect(unwrapped).toEqual(obj);
  });

  it('should return the same value if not a signal, object, or array', () => {
    expect(toRaw(42)).toBe(42);
    expect(toRaw('string')).toBe('string');
  });

  it('should handle empty objects', () => {
    const obj = {};
    const unwrapped = toRaw(obj);
    expect(unwrapped).toEqual({});
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

    useEffect(() => {
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
  });

  it('should work with collection', () => {
    const value1 = shallowSignal<any>(new Set([1, 2, 3]));
    const value2 = shallowSignal<any>(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
    const value3 = shallowSignal<any>(new WeakMap());
    const value4 = shallowSignal<any>(new WeakSet([]));

    let triggerCount = 0;

    useEffect(() => {
      // trigger value
      value1.value;
      value2.value;
      value3.value;
      value4.value;

      triggerCount++;
    });

    value1.value.add(4);
    value2.value.set('c', 3);
    value3.value.set({}, 2);
    value4.value.add({});

    expect(triggerCount).toBe(1);

    value1.value = new Set([1, 2, 3, 4]);
    value2.value = new Map([['a', 1]]);

    value3.value = new WeakMap();
    value4.value = new WeakSet([]);

    expect(triggerCount).toBe(5);
  });
});
