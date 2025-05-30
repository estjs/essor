import { computed, reactive, signal, watch } from '../src';
import { nextTick } from '../src/scheduler';

describe('watch', () => {
  it('should watch a signal and trigger callback on change', async () => {
    const signalValue = signal(1);
    const callback = vi.fn();

    const stop = watch(signalValue, callback);

    signalValue.value = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledWith(2, 1);

    stop();
  });

  it('should watch a computed value and trigger callback on change', async () => {
    const signalValue = signal(1);
    const computedValue = computed(() => signalValue.value * 2);
    const callback = vi.fn();

    const stop = watch(computedValue, callback);

    signalValue.value = 2;
    await nextTick();
    expect(callback).toHaveBeenCalledWith(4, 2);

    stop();
  });

  it('should watch a reactive object and trigger callback on change', async () => {
    const obj = reactive({ count: 1 });
    const callback = vi.fn();

    const stop = watch(obj, callback);

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

    const stop = watch([signal1, signal2, computedValue], callback);

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

    const stop = watch(() => signalValue.value * 2, callback);

    signalValue.value = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledWith(4, 2);

    stop();
  });

  it('should watch an array of sources and trigger callback on change', async () => {
    const signalValue = signal(1);
    const computedValue = computed(() => signalValue.value * 2);
    const callback = vi.fn();

    const stop = watch([signalValue, computedValue], callback);

    signalValue.value = 2;
    await nextTick();
    expect(callback).toHaveBeenCalledWith([2, 4], [1, 2]);

    stop();
  });

  it('should handle deep watching of nested objects correctly', async () => {
    const obj = reactive({ nested: { count: 1 } });
    const callback = vi.fn();

    const stop = watch(obj, callback, { deep: true });

    obj.nested.count = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ nested: { count: 2 } }, { nested: { count: 2 } });

    stop();
  });

  it('should trigger the callback immediately when immediate option is true', async () => {
    const signalValue = signal(1);
    const callback = vi.fn();

    const stop = watch(signalValue, callback, { immediate: true });
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

    const stop = watch(signalValue, callback);

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

    const stop = watch(reactiveObj, callback, { deep: true });

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

    const stop = watch([signalValue, obj], callback);

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

    const stop = watch(obj, callback);

    obj.invalid = [4, 5, 6];

    await nextTick();
    expect(callback).not.toHaveBeenCalled();

    stop();
  });

  it('should batch changes and trigger callback once', async () => {
    const signal1 = signal(1);
    const signal2 = signal(2);
    const callback = vi.fn();

    const stop = watch([signal1, signal2], callback);

    signal1.value = 3;
    signal2.value = 4;

    await nextTick();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith([3, 4], [1, 2]);

    stop();
  });
});
