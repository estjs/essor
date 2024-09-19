import { useComputed, useReactive, useSignal, useWatch } from '../src';
import { nextTick } from '../src/scheduler';

describe('useWatch', () => {
  it('should watch a signal and trigger callback on change', async () => {
    const signal = useSignal(1);
    const callback = vi.fn();

    const stop = useWatch(signal, callback);

    signal.value = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledWith(2, 1);

    stop();
  });

  it('should watch a computed value and trigger callback on change', async () => {
    const signal = useSignal(1);
    const computed = useComputed(() => signal.value * 2);
    const callback = vi.fn();

    const stop = useWatch(computed, callback);

    signal.value = 2;
    await nextTick();
    expect(callback).toHaveBeenCalledWith(4, 2);

    stop();
  });

  it('should watch a reactive object and trigger callback on change', async () => {
    const obj = useReactive({ count: 1 });
    const callback = vi.fn();

    const stop = useWatch(obj, callback);

    obj.count = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledWith({ count: 2 }, { count: 1 });

    stop();
  });

  it('should watch multiple sources and trigger callback on change', async () => {
    const signal1 = useSignal(1);
    const signal2 = useSignal(2);
    const computed = useComputed(() => signal1.value * 2 + signal2.value * 2);
    const callback = vi.fn();

    const stop = useWatch([signal1, signal2, computed], callback);

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
    const signal = useSignal(1);
    const callback = vi.fn();

    const stop = useWatch(() => signal.value * 2, callback);

    signal.value = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledWith(4, 2);

    stop();
  });

  it('should watch an array of sources and trigger callback on change', async () => {
    const signal = useSignal(1);
    const computed = useComputed(() => signal.value * 2);
    const callback = vi.fn();

    const stop = useWatch([signal, computed], callback);

    signal.value = 2;
    await nextTick();
    expect(callback).toHaveBeenCalledWith([2, 4], [1, 2]);

    stop();
  });

  it('should handle deep watching of nested objects correctly', async () => {
    const obj = useReactive({ nested: { count: 1 } });
    const callback = vi.fn();

    const stop = useWatch(obj, callback, { deep: true });

    obj.nested.count = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ nested: { count: 2 } }, { nested: { count: 2 } });

    stop();
  });

  it('should trigger the callback immediately when immediate option is true', async () => {
    const signal = useSignal(1);
    const callback = vi.fn();

    const stop = useWatch(signal, callback, { immediate: true });
    await nextTick();
    expect(callback).toHaveBeenCalledWith(1, undefined);

    signal.value = 2;
    await nextTick();
    expect(callback).toHaveBeenCalledWith(2, 1);

    stop();
  });

  it('should not trigger callback if value does not change', async () => {
    const signal = useSignal(1);
    const callback = vi.fn();

    const stop = useWatch(signal, callback);

    signal.value = 1; // not change
    await nextTick();
    expect(callback).not.toHaveBeenCalled();

    signal.value = 2; // change
    await nextTick();
    expect(callback).toHaveBeenCalledTimes(1);

    stop();
  });

  it('should work with collection objects like Map, Set', async () => {
    const map = new Map();
    const set = new Set();
    const reactiveObj = useReactive({ map, set });
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
    const signal = useSignal(1);
    const obj = useReactive({ count: 1 });
    const callback = vi.fn();

    const stop = useWatch([signal, obj], callback);

    signal.value = 2;

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
    const signal1 = useSignal(1);
    const signal2 = useSignal(2);
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
