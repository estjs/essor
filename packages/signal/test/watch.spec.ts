import { useComputed, useReactive, useSignal, useWatch } from '../src';

describe('useWatch', () => {
  it('should watch a signal and trigger callback on change', () => {
    const signal = useSignal(1);
    const callback = vi.fn();

    const stop = useWatch(signal, callback);

    signal.value = 2;
    expect(callback).toHaveBeenCalledWith(2, 1);

    stop();
  });

  it('should watch a computed value and trigger callback on change', () => {
    const signal = useSignal(1);
    const computed = useComputed(() => signal.value * 2);
    const callback = vi.fn();

    const stop = useWatch(computed, callback);

    signal.value = 2;
    expect(callback).toHaveBeenCalledWith(4, 2);

    stop();
  });

  it('should watch a useReactive object and trigger callback on change', () => {
    const obj = useReactive({ count: 1 });
    const callback = vi.fn();

    const stop = useWatch(obj, callback);

    obj.count = 2;
    expect(callback).toHaveBeenCalledWith({ count: 2 }, { count: 1 });

    stop();
  });

  it('should watch an array of sources and trigger callback on change', () => {
    const signal = useSignal(1);
    const computed = useComputed(() => signal.value * 2);
    const obj = useReactive({ count: 1 });
    const fn = () => signal.value + obj.count + computed.value;
    const callback = vi.fn();

    const stop = useWatch([signal, computed, obj, fn], callback);

    signal.value = 2;
    // 3 called
    expect(callback).toHaveBeenLastCalledWith([2, 4, { count: 1 }, 7], [2, 2, { count: 1 }, 5]);
    obj.count = 2;
    expect(callback).toHaveBeenLastCalledWith([2, 4, { count: 2 }, 8], [2, 4, { count: 1 }, 7]);

    stop();
  });

  it('should watch a function source and trigger callback on change', () => {
    const signal = useSignal(1);
    const callback = vi.fn();

    const stop = useWatch(() => signal.value * 2, callback);

    signal.value = 2;
    expect(callback).toHaveBeenCalledWith(4, 2);

    stop();
  });
  it('should work with function return array source', () => {
    const signal = useSignal(1);
    const callback = vi.fn();
    const computed = useComputed(() => signal.value * 2);
    const arr = [signal, computed];
    const stop = useWatch(arr, callback);
    signal.value = 2;
    expect(callback).toHaveBeenCalledWith([2, 4], [2, 2]);
    stop();
  });

  it('should not trigger callback if value does not change', () => {
    const signal = useSignal(1);
    const callback = vi.fn();

    const stop = useWatch(signal, callback);

    signal.value = 1;
    // first call is triggered on creation
    expect(callback).toHaveBeenCalledTimes(1);
    signal.value = 1;
    expect(callback).toHaveBeenCalledTimes(1);
    stop();
  });

  it(
    'should work with collection',
    () => {
      const map = new Map();
      const set = new Set();
      const weakMap = new WeakMap();
      const weakSet = new WeakSet();

      const signalMap = useSignal(map);
      const signalSet = useSignal(set);
      const signalWeakMap = useSignal(weakMap);
      const signalWeakSet = useSignal(weakSet);

      const collection = useReactive({
        signalMap,
        signalSet,
        signalWeakMap,
        signalWeakSet,
      });
      const callBack = vi.fn();
      const stop = useWatch(collection, callBack);
      expect(callBack).toBeCalledTimes(1);
      signalMap.value.set(1, 1);
      expect(callBack).toBeCalledTimes(2);
      signalSet.value.add(1);
      expect(callBack).toBeCalledTimes(3);
      stop();
    },
    { skip: true },
  );

  it('should handle deep watch object correctly', () => {
    const obj = useReactive({ nested: { count: 1 } });
    const callback = vi.fn();

    const stop = useWatch(obj, callback, { deep: true });

    obj.nested.count = 2;
    expect(callback).toHaveBeenCalledWith({ nested: { count: 2 } }, undefined);

    stop();
  });

  it('should handle immediate option correctly', () => {
    const signal = useSignal(1);
    const callback = vi.fn();

    const stop = useWatch(signal, callback, { immediate: true });

    expect(callback).toHaveBeenCalledWith(1, undefined);

    signal.value = 2;
    expect(callback).toHaveBeenCalledWith(2, 1);

    stop();
  });

  it('should not work with invalid source', () => {
    const obj = { arr: [1, 2, 3] };
    const callback = vi.fn();

    const stop = useWatch(obj, callback, { immediate: true });

    expect(callback).toHaveBeenCalledTimes(0);

    obj.arr = [2, 3, 4];
    expect(callback).toHaveBeenCalledTimes(0);

    stop();
  });
});
