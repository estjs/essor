import { isReactive, shallowReactive, unReactive, useEffect, useReactive, useSignal } from '../src';

describe('useReactive', () => {
  it('should work with property with initial value', () => {
    const state = useReactive({
      count: 5,
    });

    const mockFn = vi.fn(() => {
      // do nothing
      state.count;
    });
    useEffect(mockFn);
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(state.count).toBe(5);
    state.count++;
    expect(mockFn).toHaveBeenCalledTimes(2);
    expect(state.count).toBe(6);
  });

  it('should work with add new property', () => {
    const state = useReactive<Partial<Record<string, any>>>({});

    const mockFn = vi.fn(() => {
      // do nothing
      state.count;
    });
    useEffect(mockFn);
    expect(mockFn).toHaveBeenCalledTimes(1);

    state.count = 5;
    expect(state.count).toBe(5);
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should work with multiple properties', () => {
    const state = useReactive({
      count: 0,
      text: 'Hello',
      isEnabled: true,
    });

    expect(state.count).toBe(0);
    expect(state.text).toBe('Hello');
    expect(state.isEnabled).toBe(true);

    state.text = 'Hi';
    expect(state.text).toBe('Hi');
  });

  it('should work with nested objects', () => {
    const state = useReactive({
      user: {
        name: 'John',
        age: 30,
      },
    });

    expect(state.user.name).toBe('John');
    expect(state.user.age).toBe(30);

    state.user.age++;
    expect(state.user.age).toBe(31);
  });

  it('should work with nested arrays', () => {
    const state = useReactive({
      items: [1, 2, 3],
    });

    expect(state.items.length).toBe(3);
    expect(state.items[1]).toBe(2);

    state.items.push(4);
    expect(state.items.length).toBe(4);
  });

  it('should work with function in state', () => {
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

  it('should work with should work with reactive deep object', () => {
    const state: any = useReactive({ a: { b: { c: { d: 1 } } } });

    const mockFn = vi.fn();
    useEffect(() => {
      state.a.b?.c?.d;
      mockFn();
    });
    expect(state.a.b.c.d).toBe(1);
    expect(mockFn).toBeCalledTimes(1);

    state.a.b.c.d++;
    expect(state.a.b.c.d).toBe(2);
    expect(mockFn).toBeCalledTimes(2);

    state.a.b = { e: 3 };
    expect(state.a.b.e).toBe(3);
    expect(mockFn).toBeCalledTimes(3);
  });

  it('should work with shallow reactive with object', () => {
    const state: any = shallowReactive({ a: { b: { c: { d: 1 } } } });

    const mockFn = vi.fn();
    useEffect(() => {
      state.a.b?.c?.d;
      mockFn();
    });
    expect(mockFn).toBeCalledTimes(1);

    state.a.b.c.d++;
    expect(mockFn).toBeCalledTimes(1);

    state.a = { b: { c: { d: 2 } } };
    expect(mockFn).toBeCalledTimes(2);

    state.a.b = { e: 3 };
    expect(mockFn).toBeCalledTimes(2);

    state.a.b.c = { f: 4 };
    expect(mockFn).toBeCalledTimes(2);
  });

  it('should work with shallow reactive with array', () => {
    const state = shallowReactive<Array<Record<string, number>>>([{ a: 1 }, { b: 2 }]);

    const mockFn = vi.fn();
    useEffect(() => {
      state[1];
      mockFn();
    });
    expect(mockFn).toBeCalledTimes(1);

    state[0].a!++;
    expect(mockFn).toBeCalledTimes(1);

    state.push({ c: 3 });
    expect(mockFn).toBeCalledTimes(1);

    state[1] = { d: 4 };
    expect(mockFn).toBeCalledTimes(2);
  });
  it('should not work with not object type', () => {
    // @ts-ignore
    const state = useReactive(1);
    expect(state).toBe(1);

    // @ts-ignore
    const state2 = shallowReactive(false);
    expect(state2).toBe(false);

    // @ts-ignore
    const state3 = shallowReactive(null);
    expect(state3).toBe(null);

    // @ts-ignore
    const state4 = shallowReactive(undefined);
    expect(state4).toBe(undefined);

    const symbol = Symbol();
    // @ts-ignore
    const state5 = shallowReactive(symbol);
    expect(state5).toBe(symbol);

    // @ts-ignore
    const state6 = shallowReactive('');
    expect(state6).toBe('');
  });

  it('should not work with reactive proxy', () => {
    const state = useReactive({ count: 0 });
    const state2 = useReactive(state);

    expect(state).toEqual(state2);
  });

  it('should work with exclude', () => {
    const state = useReactive({ count: 0, count2: 0 }, ['count']);

    const effectFn = vi.fn(() => {
      state.count;
      state.count2;
    });
    useEffect(() => {
      effectFn();
    });
    expect(effectFn).toBeCalledTimes(1);

    state.count++;
    expect(effectFn).toBeCalledTimes(1);
    state.count2++;
    expect(effectFn).toBeCalledTimes(2);
  });

  it('should work with reactive set signal value', () => {
    const state = useReactive<Record<string, any>>({ count: 0 });

    const effectFn = vi.fn(() => {
      state.count;
    });
    useEffect(() => {
      effectFn();
    });
    expect(effectFn).toBeCalledTimes(1);
    state.count = useSignal(2);
    expect(state.count).toBe(2);
    expect(effectFn).toBeCalledTimes(2);
  });

  it('should work with reactive deleteProperty', () => {
    const state = useReactive({ count: 0 });

    const effectFn = vi.fn(() => {
      state.count;
    });
    useEffect(() => {
      effectFn();
    });
    expect(effectFn).toBeCalledTimes(1);
    //@ts-ignore
    delete state.count;
    expect(state.count).toBe(undefined);
    expect(effectFn).toBeCalledTimes(2);
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

describe('unReactive', () => {
  it('should return primitive values directly', () => {
    const num = 42;
    // @ts-ignore
    const result = unReactive(num);
    expect(result).toBe(num);
  });

  it('should return non-reactive objects as-is', () => {
    const obj = { a: 1, b: { c: 2 } };
    const result = unReactive(obj);
    expect(result).toBe(obj);
  });

  it('should remove reactivity from a reactive object', () => {
    const reactiveObj = useReactive({ a: 1, b: { c: 2 } });
    const result = unReactive(reactiveObj);

    expect(result).toEqual({ a: 1, b: { c: 2 } });
    expect(isReactive(result)).toBe(false);
  });

  it('should remove reactivity from nested reactive objects', () => {
    const reactiveObj = useReactive({ a: 1, b: useReactive({ c: 2 }) });
    const result = unReactive(reactiveObj);

    expect(result).toEqual({ a: 1, b: { c: 2 } });
    expect(isReactive(result.b)).toBe(false);
  });

  it('should work with arrays', () => {
    const reactiveArray = useReactive([1, { a: 2 }, 3]);
    const result = unReactive(reactiveArray);

    expect(result).toEqual([1, { a: 2 }, 3]);
    expect(isReactive(result[1])).toBe(false);
  });

  it('should unwrap signals in objects', () => {
    const signal = useSignal(10);
    const reactiveObj = useReactive({ a: signal, b: { c: signal } });
    const result = unReactive(reactiveObj);

    expect(result).toEqual({ a: 10, b: { c: 10 } });
    expect(isReactive(result.b)).toBe(false);
  });

  it('should unwrap signals in arrays', () => {
    const signal = useSignal(10);
    const reactiveArray = useReactive([signal, { a: signal }]);
    const result = unReactive(reactiveArray);

    expect(result).toEqual([10, { a: 10 }]);
    expect(isReactive(result[1])).toBe(false);
  });

  it('should handle shallow reactive objects', () => {
    const shallowObj = shallowReactive({ a: 1, b: { c: 2 } });
    const result = unReactive(shallowObj);

    expect(result).toEqual({ a: 1, b: { c: 2 } });
    expect(isReactive(result)).toBe(false);
    expect(isReactive(result.b)).toBe(false);
  });

  it('should handle mixed reactive and non-reactive properties', () => {
    const reactiveObj = useReactive({ a: 1, b: useReactive({ c: 2 }), d: 3 });
    const result = unReactive(reactiveObj);

    expect(result).toEqual({ a: 1, b: { c: 2 }, d: 3 });
    expect(isReactive(result.b)).toBe(false);
  });
});
