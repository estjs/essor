import { useComputed, useEffect, useSignal } from '../src';

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
    const testSignal = useSignal<number[] | null>([]);
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

    // if the array is assigned, the effect will not be triggered
    testSignal.value?.pop();
    expect(testSignal.value).toEqual([1, 3, 2, 4, 8, 5, 7]);
    expect(effectFn).toHaveBeenCalledTimes(9);
  });

  it('should work with Set', () => {
    const testSignal = useSignal<Set<number> | null>(new Set([1, 2, 3]));
    const effectFn = vitest.fn(() => {
      // trigger
      testSignal.value;
    });

    useEffect(effectFn);
    expect(effectFn).toHaveBeenCalledTimes(1);
    expect(Array.from(testSignal.value ?? [])).toEqual([1, 2, 3]);

    testSignal.value?.add(4);
    expect(Array.from(testSignal.value ?? [])).toEqual([1, 2, 3, 4]);
    expect(effectFn).toHaveBeenCalledTimes(2);

    testSignal.value?.delete(2);
    expect(Array.from(testSignal.value ?? [])).toEqual([1, 3, 4]);
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
    const testSignal = useSignal<WeakMap<object, number> | null>(
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
});

describe('computed', () => {
  it('should compute the correct value', () => {
    const testSignal = useSignal(10);
    const computedSignal = useComputed(() => testSignal.value * 2);
    expect(computedSignal.value).toBe(20);
    testSignal.value = 20;
    expect(computedSignal.value).toBe(40);
  });

  it('should compute the correct value with condition', () => {
    const conditionSignal = useSignal(false);
    const testSignal = useSignal(10);
    let effectTime = 0;
    const computedSignal = useComputed(() => {
      effectTime++;
      return conditionSignal.value ? 50 : testSignal.value * 2;
    });

    expect(effectTime).toBe(1);
    expect(computedSignal.peek()).toBe(20);
    testSignal.value = 20;
    expect(effectTime).toBe(2);
    conditionSignal.value = true;
    expect(effectTime).toBe(3);
    expect(computedSignal.value).toBe(50);
    conditionSignal.value = false;
    expect(effectTime).toBe(4);
    testSignal.value = 30;
    expect(effectTime).toBe(5);
    expect(computedSignal.value).toBe(60);
  });

  it('should get correct value', () => {
    const count = useSignal(0);
    const double = useComputed(() => count.value * 2);
    const triple = useComputed(() => count.value * 3);
    count.value = 1;
    expect(double.value).toBe(2);
    expect(triple.value).toBe(3);
  });

  it('should work computed in effect', () => {
    const val = useSignal(0);
    const computed = useComputed(() => {
      return 10 * val.value;
    });

    let effectTimes = 0;
    useEffect(() => {
      computed.value;
      effectTimes++;
    });
    expect(effectTimes).toBe(1);
    val.value = 1;
    expect(effectTimes).toBe(2);
  });
});

describe('effect', () => {
  it('should run the effect function', () => {
    let testValue = 0;
    useEffect(() => {
      testValue = 10;
    });
    expect(testValue).toBe(10);
  });

  it('should get correct value', () => {
    const name = useSignal('Dnt');

    let effectTimes = 0;
    const dispose = useEffect(() => {
      effectTimes++;
      name.value;
    });
    expect(effectTimes).toBe(1);
    dispose();
    name.value = 'John';
    expect(effectTimes).toBe(1);
    name.value = '';
    expect(effectTimes).toBe(1);
  });

  it('should get the value correctly', () => {
    const testSignal = useSignal([1, 2, 3]);
    let effectTimes = 0;
    useEffect(() => {
      testSignal.value;
      effectTimes++;
    });
    expect(effectTimes).toBe(1);
    testSignal.value.push(4);
    expect(effectTimes).toBe(2);
  });
});
