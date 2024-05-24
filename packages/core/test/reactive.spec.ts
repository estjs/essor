import { isReactive, reactive, unReactive } from '../src';

describe('reactive', () => {
  it('property with initial value', () => {
    const state = reactive({
      count: 5,
    });

    expect(state.count).toBe(5);

    state.count++;
    expect(state.count).toBe(6);
  });

  it('multiple properties', () => {
    const state = reactive({
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
    const state = reactive({
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
    const state = reactive({
      items: [1, 2, 3],
    });

    expect(state.items.length).toBe(3);
    expect(state.items[1]).toBe(2);

    state.items.push(4);
    expect(state.items.length).toBe(4);
  });

  // Test Case 5: Reactive function
  it('function in state', () => {
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

  it('arrays of objects', () => {
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
});

describe('isReactive', () => {
  it('check if object is reactive', () => {
    const state = reactive({ count: 0 });
    expect(isReactive(state)).toBe(true);
  });

  it('check if object is not reactive', () => {
    const obj = { count: 0 };

    expect(isReactive(obj)).toBe(false);
  });
});

describe('unReactive', () => {
  it('unReactive - obtain original object from reactive proxy', () => {
    const originalObj = { count: 0 };
    const state = reactive(originalObj);

    const unreactiveObj = unReactive(state);
    expect(unreactiveObj).toEqual(originalObj);
  });

  it('unReactive - obtain original object from non-reactive object', () => {
    const obj = { count: 0 };

    const unreactiveObj = unReactive(obj);
    expect(unreactiveObj).toEqual(obj);
  });
});
