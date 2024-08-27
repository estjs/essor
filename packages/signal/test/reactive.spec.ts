import { isReactive, unReactive, useEffect, useReactive } from '../src';

describe('useReactive', () => {
  it('property with initial value', () => {
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

  it('multiple properties', () => {
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

  it('nested objects', () => {
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

  it('nested arrays', () => {
    const state = useReactive({
      items: [1, 2, 3],
    });

    expect(state.items.length).toBe(3);
    expect(state.items[1]).toBe(2);

    state.items.push(4);
    expect(state.items.length).toBe(4);
  });

  it('function in state', () => {
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

  it('arrays of objects', () => {
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

  it('should work with reactive deep object', () => {
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
});

describe('isReactive', () => {
  it('check if object is useReactive', () => {
    const state = useReactive({ count: 0 });
    expect(isReactive(state)).toBe(true);
  });

  it('check if object is not useReactive', () => {
    const obj = { count: 0 };

    expect(isReactive(obj)).toBe(false);
  });
});

describe('unReactive', () => {
  it('unReactive - obtain original object from useReactive proxy', () => {
    const originalObj = { count: 0 };
    const state = useReactive(originalObj);

    const unreactiveObj = unReactive(state);
    expect(unreactiveObj).toEqual(originalObj);
  });

  it('unReactive - obtain original object from non-useReactive object', () => {
    const obj = { count: 0 };

    const unreactiveObj = unReactive(obj);
    expect(unreactiveObj).toEqual(obj);
  });
});
