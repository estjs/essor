import { noop } from '@estjs/shared';
import { computed, reactive, signal, useWatch } from '../src';
import { nextTick } from '../src/scheduler';
import { resolveSource, traverse } from '../src/watch';

describe('useWatch', () => {
  it('should watch a signal and trigger callback on change', async () => {
    const signalValue = signal(1);
    const callback = vi.fn();

    const stop = useWatch(signalValue, callback);

    signalValue.value = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledWith(2, 1);

    stop();
  });

  it('should watch a computed value and trigger callback on change', async () => {
    const signalValue = signal(1);
    const computedValue = computed(() => signalValue.value * 2);
    const callback = vi.fn();

    const stop = useWatch(computedValue, callback);

    signalValue.value = 2;
    await nextTick();
    expect(callback).toHaveBeenCalledWith(4, 2);

    stop();
  });

  it('should watch a reactive object and trigger callback on change', async () => {
    const obj = reactive({ count: 1 });
    const callback = vi.fn();

    const stop = useWatch(obj, callback);

    obj.count = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledWith({ count: 2 }, { count: 1 });

    stop();
  });

  it('should watch multiple sources and trigger callback on change', async () => {
    const signal1 = signal(1);
    const signal2 = signal(2);
    const computedValue = computed(() => signal1.value * 2 + signal2.value * 2);
    const callback = vi.fn();

    const stop = useWatch([signal1, signal2, computedValue], callback);

    signal1.value = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith([2, 2, 8], [1, 2, 6]);

    signal2.value = 3;

    await nextTick();
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith([2, 3, 10], [2, 2, 8]);

    stop();
  });

  it('should watch a function source and trigger callback on change', async () => {
    const signalValue = signal(1);
    const callback = vi.fn();

    const stop = useWatch(() => signalValue.value * 2, callback);

    signalValue.value = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledWith(4, 2);

    stop();
  });

  it('should watch an array of sources and trigger callback on change', async () => {
    const signalValue = signal(1);
    const computedValue = computed(() => signalValue.value * 2);
    const callback = vi.fn();

    const stop = useWatch([signalValue, computedValue], callback);

    signalValue.value = 2;
    await nextTick();
    expect(callback).toHaveBeenCalledWith([2, 4], [1, 2]);

    stop();
  });

  it('should handle deep watching of nested objects correctly', async () => {
    const obj = reactive({ nested: { count: 1 } });
    const callback = vi.fn();

    const stop = useWatch(obj, callback, { deep: true });

    obj.nested.count = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ nested: { count: 2 } }, { nested: { count: 2 } });

    stop();
  });

  it('should trigger the callback immediately when immediate option is true', async () => {
    const signalValue = signal(1);
    const callback = vi.fn();

    const stop = useWatch(signalValue, callback, { immediate: true });
    await nextTick();
    expect(callback).toHaveBeenCalledWith(1, undefined);

    signalValue.value = 2;
    await nextTick();
    expect(callback).toHaveBeenCalledWith(2, 1);

    stop();
  });

  it('should not trigger callback if value does not change', async () => {
    const signalValue = signal(1);
    const callback = vi.fn();

    const stop = useWatch(signalValue, callback);

    signalValue.value = 1; // not change
    await nextTick();
    expect(callback).not.toHaveBeenCalled();

    signalValue.value = 2; // change
    await nextTick();
    expect(callback).toHaveBeenCalledTimes(1);

    stop();
  });

  it('should work with collection objects like Map, Set', async () => {
    const map = new Map();
    const set = new Set();
    const reactiveObj = reactive({ map, set });
    const callback = vi.fn();

    const stop = useWatch(reactiveObj, callback);

    reactiveObj.map.set('key', 'value');
    await nextTick();
    expect(callback).toHaveBeenCalledTimes(1);

    reactiveObj.set.add('value');
    await nextTick();
    expect(callback).toHaveBeenCalledTimes(2);

    stop();
  });

  it('should watch an array of signals and reactive objects', async () => {
    const signalValue = signal(1);
    const obj = reactive({ count: 1 });
    const callback = vi.fn();

    const stop = useWatch([signalValue, obj], callback);

    signalValue.value = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledWith([2, { count: 1 }], [1, { count: 1 }]);

    obj.count = 3;

    await nextTick();
    expect(callback).toHaveBeenCalledWith([2, { count: 3 }], [2, { count: 1 }]);

    stop();
  });

  it('should not trigger callback for invalid source', async () => {
    const obj = { invalid: [1, 2, 3] };
    const callback = vi.fn();

    const stop = useWatch(obj, callback);

    obj.invalid = [4, 5, 6];

    await nextTick();
    expect(callback).not.toHaveBeenCalled();

    stop();
  });

  it('should batch changes and trigger callback once', async () => {
    const signal1 = signal(1);
    const signal2 = signal(2);
    const callback = vi.fn();

    const stop = useWatch([signal1, signal2], callback);

    signal1.value = 3;
    signal2.value = 4;

    await nextTick();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith([3, 4], [1, 2]);

    stop();
  });
});

const mockWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
const mockFunction = (value: any) => vi.fn(() => value);
describe('resolveSource', () => {
  it('should return the value if it is a Signal', () => {
    const signal1 = signal(42);
    expect(resolveSource(signal1)).toBe(42);
  });

  it('should return the value if it is a Computed', () => {
    const computed1 = computed(() => 'computedValue');
    expect(resolveSource(computed1)).toBe('computedValue');
  });

  it('should return a shallow copy if it is a Reactive object', () => {
    const reactiveObj = reactive({ a: 1 });
    const result = resolveSource(reactiveObj);
    expect(result).toEqual({ a: 1 });
    expect(result).not.toBe(reactiveObj);
  });

  it('should call the function and return its result if it is a Function', () => {
    const func = mockFunction('functionResult');
    expect(resolveSource(func)).toBe('functionResult');
    expect(func).toHaveBeenCalled();
  });

  it('should warn and return noop for an invalid source', () => {
    const invalidSource = 123;
    //@ts-ignore
    const result = resolveSource(invalidSource);
    expect(mockWarn).toHaveBeenCalledWith('[Essor warn]: Invalid source', invalidSource);
    expect(result).toBe(noop);
  });

  afterEach(() => {
    mockWarn.mockClear();
  });
});

const signalFn = signal;

describe('traverse', () => {
  it('should return the value if depth is 0', () => {
    const value = { a: 1 };
    expect(traverse(value, 0)).toBe(value);
  });

  it('should return the value if it is not an object', () => {
    expect(traverse(42)).toBe(42);
    expect(traverse('string')).toBe('string');
  });

  it('should traverse through Signals and fetch their values', () => {
    const signal = signalFn(42);
    expect(traverse(signal)).toBe(signal);
  });

  it('should traverse arrays and apply depth limits', () => {
    const arr = [1, [2, [3]]];
    expect(traverse(arr, 1)).toEqual([1, [2, [3]]]);
    expect(traverse(arr, 2)).toEqual([1, [2, [3]]]);
  });

  it('should handle circular references', () => {
    const obj: any = {};
    obj.self = obj;
    expect(traverse(obj)).toBe(obj);
  });

  it('should traverse Set and Map structures', () => {
    const set = new Set([1, new Set([2, 3])]);
    expect(traverse(set, 2)).toBe(set);
  });

  it('should traverse plain objects with depth limits', () => {
    const obj = { a: { b: { c: 'end' } } };
    expect(traverse(obj, 2)).toEqual({ a: { b: { c: 'end' } } });
  });
});
