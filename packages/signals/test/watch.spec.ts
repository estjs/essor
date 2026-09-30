import { describe, expect, it, vi } from 'vitest';
import {
  EffectScope,
  type WatchOptions,
  batch,
  computed,
  effectScope,
  nextTick,
  reactive,
  signal,
  watch,
} from '../src';
import { signalsFlags } from '../src/constants';
import { WatchErrorCodes, getCurrentWatcher, onWatcherCleanup, traverse } from '../src/watch';
import type { Signal } from '../src/signal';

describe('watch', () => {
  it('should watch a signal and trigger callback on change', async () => {
    const signalValue = signal(1);
    const callback = vi.fn();

    const stop = watch(signalValue, callback);

    signalValue.value = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledWith(2, 1, expect.any(Function));

    stop();
  });

  it('should watch a computed value and trigger callback on change', async () => {
    const signalValue = signal(1);
    const computedValue = computed(() => signalValue.value * 2);
    const callback = vi.fn();

    const stop = watch(computedValue, callback);

    signalValue.value = 2;
    await nextTick();
    expect(callback).toHaveBeenCalledWith(4, 2, expect.any(Function));

    stop();
  });

  it('should watch a reactive object and trigger callback on change', async () => {
    const obj = reactive({ count: 1 });
    const callback = vi.fn();

    const stop = watch(obj, callback);

    obj.count = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledWith({ count: 2 }, { count: 2 }, expect.any(Function));

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
    expect(callback).toHaveBeenLastCalledWith([2, 2, 8], [1, 2, 6], expect.any(Function));

    signal2.value = 3;

    await nextTick();
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith([2, 3, 10], [2, 2, 8], expect.any(Function));

    stop();
  });

  it('should watch a function source and trigger callback on change', async () => {
    const signalValue = signal(1);
    const callback = vi.fn();

    const stop = watch(() => signalValue.value * 2, callback);

    signalValue.value = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledWith(4, 2, expect.any(Function));

    stop();
  });

  it('treats a function-valued getter result as data, not effect cleanup', async () => {
    const first = () => 1;
    const second = () => 2;
    const source = signal(first);
    const seen: Array<() => number> = [];
    const stop = watch(source, (value) => {
      seen.push(value);
    });

    source.value = second;
    await nextTick();

    expect(seen).toEqual([second]);
    expect(seen[0]()).toBe(2);
    stop();
  });

  it('should handle deep watching of nested objects correctly', async () => {
    const obj = reactive({ nested: { count: 1 } });
    const callback = vi.fn();

    const stop = watch(obj, callback, { deep: true });

    obj.nested.count = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      { nested: { count: 2 } },
      { nested: { count: 2 } },
      expect.any(Function),
    );

    stop();
  });

  it('should trigger the callback immediately when immediate option is true', async () => {
    const signalValue = signal(1);
    const callback = vi.fn();

    const stop = watch(signalValue, callback, { immediate: true });
    await nextTick();
    expect(callback).toHaveBeenCalledWith(1, undefined, expect.any(Function));

    signalValue.value = 2;
    await nextTick();
    expect(callback).toHaveBeenCalledWith(2, 1, expect.any(Function));

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

    const stop = watch([signalValue, obj], callback, { deep: true });

    signalValue.value = 2;

    await nextTick();
    expect(callback).toHaveBeenCalledWith(
      [2, { count: 1 }],
      [1, { count: 1 }],
      expect.any(Function),
    );

    obj.count = 3;

    await nextTick();
    expect(callback).toHaveBeenCalledWith(
      [2, { count: 3 }],
      [2, { count: 3 }],
      expect.any(Function),
    );

    stop();
  });

  it('should treat reactive objects with a value field as reactive sources, not ref-like sources', async () => {
    const state = reactive({ value: 1, other: 1 });
    const callback = vi.fn();

    const stop = watch(state, callback);

    state.other = 2;
    await nextTick();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      { value: 1, other: 2 },
      { value: 1, other: 2 },
      expect.any(Function),
    );

    stop();
  });

  it('should not trigger callback for invalid source', async () => {
    const obj = { invalid: [1, 2, 3] };
    const callback = vi.fn();

    const stop = watch(obj, callback);

    obj.invalid = [4, 5, 6];

    await nextTick();
    expect(callback).not.toHaveBeenCalled();
    expect('Invalid watch source').toHaveBeenWarned();

    stop();
  });

  it('should batch changes and trigger callback once', () => {
    const signal1 = signal(1);
    const signal2 = signal(2);
    const callback = vi.fn();

    const stop = watch([signal1, signal2], callback);

    batch(() => {
      signal1.value = 3;
      signal2.value = 4;
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith([3, 4], [1, 2], expect.any(Function));

    stop();
  });

  it('should stop watcher and prevent further callbacks', async () => {
    const signalValue = signal(1);
    const callback = vi.fn();

    const stop = watch(signalValue, callback);

    signalValue.value = 2;
    await nextTick();
    expect(callback).toHaveBeenCalledTimes(1);

    stop();
    signalValue.value = 3;
    await nextTick();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  describe('oldValue caveat for object/reactive sources', () => {
    // These tests lock in the documented behavior: for object sources, newValue
    // and oldValue are the SAME reference (no deep clone). See watch() JSDoc and
    // docs/{en,zh}/api/watch.md.
    it('passes the same reference as newValue and oldValue for a reactive object', async () => {
      const state = reactive({ count: 0 });
      const seen: Array<[any, any]> = [];

      const stop = watch(
        state,
        (n, o) => {
          seen.push([n, o]);
        },
        { deep: true },
      );

      state.count = 1;
      await nextTick();

      expect(seen).toHaveLength(1);
      const [n, o] = seen[0];
      // Same reference — there is no previous snapshot.
      expect(o).toBe(n);
      // Reading the "old" value yields the already-mutated value.
      expect(o.count).toBe(1);

      stop();
    });
  });

  describe('initialization runs the getter exactly once', () => {
    it('does not double-invoke on immediate setup', () => {
      const s = signal(0);
      const getter = vi.fn(() => s.value);

      const stop = watch(getter, () => {}, { immediate: true });

      expect(getter).toHaveBeenCalledTimes(1);
      stop();
    });
  });

  describe('onCleanup', () => {
    it('runs the registered cleanup before the next callback', async () => {
      const s = signal(0);
      const order: string[] = [];

      const stop = watch(s, (n, _o, onCleanup) => {
        order.push(`run:${n}`);
        onCleanup(() => order.push(`cleanup-before:${n}`));
      });

      s.value = 1;
      await nextTick();
      s.value = 2;
      await nextTick();

      // Cleanup for run 1 fires right before run 2's callback.
      expect(order).toEqual(['run:1', 'cleanup-before:1', 'run:2']);
      stop();
    });

    it('runs the latest cleanup when the watcher is stopped', async () => {
      const s = signal(0);
      const cleanup = vi.fn();

      const stop = watch(s, (_n, _o, onCleanup) => {
        onCleanup(cleanup);
      });

      s.value = 1;
      await nextTick();
      expect(cleanup).not.toHaveBeenCalled();

      stop();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('once', () => {
    it('stops the watcher after the first callback', async () => {
      const s = signal(0);
      const cb = vi.fn();

      watch(s, cb, { once: true });

      s.value = 1;
      await nextTick();
      s.value = 2;
      await nextTick();

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenLastCalledWith(1, 0, expect.any(Function));
    });

    it('fires once then stops with immediate + once', async () => {
      const s = signal(0);
      const cb = vi.fn();

      watch(s, cb, { once: true, immediate: true });
      expect(cb).toHaveBeenCalledTimes(1);

      s.value = 1;
      await nextTick();
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('synchronous delivery', () => {
    it('runs the callback synchronously on change', () => {
      const s = signal(0);
      const cb = vi.fn();

      const stop = watch(s, cb);

      s.value = 1;
      // No await — sync watchers fire immediately.
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenLastCalledWith(1, 0, expect.any(Function));

      stop();
    });

    // SIG-14: sync flush re-entrancy
    it('should expose the committed oldValue to a re-entrant sync callback', () => {
      const source = signal(0);
      const calls: Array<[number, number | undefined]> = [];

      const stop = watch(source, (newValue, oldValue) => {
        calls.push([newValue, oldValue]);
        // Re-entrant write from inside a sync callback: the inner invocation
        // must see this run's newValue as its oldValue, not the stale one.
        if (newValue === 1) {
          source.value = 2;
        }
      });

      source.value = 1;

      expect(calls).toEqual([
        [1, 0],
        [2, 1],
      ]);

      stop();
    });
  });

  describe('watch(reactiveArray) is a single deep source (SIG-15)', () => {
    it('fires when an element object is mutated in place', () => {
      const list = reactive([{ n: 1 }, { n: 2 }]);
      let calls = 0;
      watch(list, () => {
        calls++;
      });

      list[0].n = 10;
      expect(calls).toBe(1);
    });

    it('fires when elements are pushed', () => {
      const list = reactive<number[]>([1]);
      let calls = 0;
      watch(list, () => {
        calls++;
      });

      list.push(2);
      expect(calls).toBe(1);
    });
  });

  describe('traverse robustness (SIG-12/16)', () => {
    // SIG-12: no cross-watch traverse state
    it('should keep independent deep watches isolated from each other', async () => {
      // The retention bug (module-level `seen` Set pinning the last-traversed
      // graph) cannot be asserted directly without WeakRef/GC control, so this
      // is a weaker behavioral check: two deep watches created back-to-back
      // must track and fire independently, proving traverse state is per-call.
      const objA = reactive({ nested: { count: 1 } });
      const objB = reactive({ nested: { count: 10 } });
      const callbackA = vi.fn();
      const callbackB = vi.fn();

      const stopA = watch(objA, callbackA, { deep: true });
      const stopB = watch(objB, callbackB, { deep: true });

      objA.nested.count = 2;
      await nextTick();
      expect(callbackA).toHaveBeenCalledTimes(1);
      expect(callbackB).not.toHaveBeenCalled();

      objB.nested.count = 20;
      await nextTick();
      expect(callbackA).toHaveBeenCalledTimes(1);
      expect(callbackB).toHaveBeenCalledTimes(1);

      stopA();
      stopB();
    });
  });

  describe('multi-source element-wise comparison (SIG-32)', () => {
    it('should not fire a multi-source watcher when all sources are unchanged', async () => {
      const a = signal(1);
      const b = signal(2);
      const callback = vi.fn();

      const stop = watch([a, b], callback);

      // Same-value write: no observable change.
      a.value = 1;
      await nextTick();
      expect(callback).not.toHaveBeenCalled();

      // Change-and-revert within one batch: the watcher reruns, but the
      // element-wise snapshot comparison sees identical values and skips.
      batch(() => {
        a.value = 5;
        a.value = 1;
      });
      await nextTick();
      expect(callback).not.toHaveBeenCalled();

      stop();
    });

    it('should fire a multi-source watcher with element-wise correct values on real change', async () => {
      const a = signal(1);
      const b = signal(2);
      const callback = vi.fn();

      const stop = watch([a, b], callback);

      a.value = 5;
      await nextTick();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenLastCalledWith([5, 2], [1, 2], expect.any(Function));

      b.value = 7;
      await nextTick();
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith([5, 7], [5, 2], expect.any(Function));

      stop();
    });
  });
});

describe('watch scope cleanup', () => {
  it('runs callback cleanup when the owning scope stops', () => {
    const scope = effectScope();
    const source = signal(0);
    const cleaned = vi.fn();

    scope.run(() => {
      watch(source, (_value, _oldValue, onCleanup) => {
        onCleanup(cleaned);
      });
    });

    source.value = 1;
    expect(cleaned).not.toHaveBeenCalled();

    scope.stop();
    expect(cleaned).toHaveBeenCalledTimes(1);
  });
});

describe('watch contract regressions', () => {
  it('runs immediate callbacks synchronously and sync watchers at the outer batch boundary', () => {
    const source = signal(0);
    const seen: Array<[number, number | undefined]> = [];
    const stop = watch(
      source,
      (value, oldValue) => {
        seen.push([value, oldValue]);
      },
      { immediate: true },
    );

    expect(seen).toEqual([[0, undefined]]);
    batch(() => {
      source.value = 1;
      source.value = 2;
      expect(seen).toEqual([[0, undefined]]);
    });
    expect(seen).toEqual([
      [0, undefined],
      [2, 0],
    ]);
    stop();
  });

  it('treats reactive values as deep sources, both directly and inside multi sources', async () => {
    const state = reactive({ nested: { count: 0 } });
    const list = reactive([{ count: 0 }]);
    const direct = vi.fn();
    const directList = vi.fn();
    const defaultMulti = vi.fn();
    const deepMulti = vi.fn();
    const stops = [
      watch(state, direct),
      watch(list, directList),
      watch([state], defaultMulti),
      watch([state], deepMulti, { deep: true }),
    ];

    state.nested.count++;
    list[0].count++;
    await nextTick();

    expect(direct).toHaveBeenCalledOnce();
    expect(directList).toHaveBeenCalledOnce();
    expect(defaultMulti).toHaveBeenCalledOnce();
    expect(deepMulti).toHaveBeenCalledOnce();
    stops.forEach((stop) => stop());
  });

  it('uses Object.is for scalar and multi-source comparison', () => {
    const value = signal(Number.NaN);
    const left = signal(0);
    const right = signal(0);
    const scalar = vi.fn();
    const multi = vi.fn();
    const stable = {};
    const trigger = signal(0);
    const stableObject = vi.fn();
    const stops = [
      watch(value, scalar),
      watch([left, right], multi),
      watch(() => {
        trigger.value;
        return stable;
      }, stableObject),
    ];

    value.value = Number.NaN;
    value.value = -0;
    batch(() => {
      left.value = 1;
      left.value = 0;
    });
    trigger.value++;

    expect(scalar).toHaveBeenCalledOnce();
    expect(multi).not.toHaveBeenCalled();
    expect(stableObject).not.toHaveBeenCalled();
    stops.forEach((stop) => stop());
  });

  it('deeply traverses symbols, collections, nested cells, and cycles', async () => {
    const symbol = Symbol('nested');
    const key = reactive({ count: 0 });
    const mapValue = reactive({ count: 0 });
    const setValue = reactive({ count: 0 });
    const nestedCell = signal({ count: 0 });
    const state = reactive({
      [symbol]: { count: 0 },
      map: new Map([[key, mapValue]]),
      set: new Set([setValue]),
      nestedCell,
      self: undefined as unknown,
    });
    state.self = state;
    const callback = vi.fn();
    const stop = watch(state, callback);

    batch(() => {
      state[symbol].count++;
      key.count++;
      mapValue.count++;
      setValue.count++;
      nestedCell.value.count++;
    });
    await nextTick();

    expect(callback).toHaveBeenCalledOnce();
    stop();
  });
});
it('preserves a once callback result when stopping its cleanup throws', () => {
  const source = signal(0);
  const cleanupError = new Error('once cleanup failed');
  const callback = vi.fn((_value: number, _oldValue: number | undefined, onCleanup) => {
    onCleanup(() => {
      throw cleanupError;
    });
  });
  const stop = watch(source, callback, { once: true });

  expect(() => {
    source.value = 1;
  }).toThrow(cleanupError);
  expect(callback).toHaveBeenCalledOnce();

  source.value = 2;
  expect(callback).toHaveBeenCalledOnce();
  expect(() => stop()).not.toThrow();
});

describe('watch (core options)', () => {
  it('effect', () => {
    let dummy: any;
    const source = signal(0);
    watch(() => {
      dummy = source.value;
    });
    expect(dummy).toBe(0);
    source.value++;
    expect(dummy).toBe(1);
  });

  it('with callback', () => {
    let dummy: any;
    const source = signal(0);
    watch(source, () => {
      dummy = source.value;
    });
    expect(dummy).toBe(undefined);
    source.value++;
    expect(dummy).toBe(1);
  });

  it('call option with error handling', () => {
    const onError = vi.fn();
    const call: WatchOptions['call'] = function call(fn, type, args) {
      if (Array.isArray(fn)) {
        fn.forEach((f) => call(f, type, args));
        return;
      }
      try {
        fn(...(args ?? []));
      } catch (error) {
        onError(error, type);
      }
    };

    watch(
      () => {
        throw 'oops in effect';
      },
      null,
      { call },
    );

    const source = signal(0);
    const effect = watch(
      source,
      () => {
        onWatcherCleanup(() => {
          throw 'oops in cleanup';
        });
        throw 'oops in watch';
      },
      { call },
    );

    expect(onError.mock.calls.length).toBe(1);
    expect(onError.mock.calls[0]).toMatchObject(['oops in effect', WatchErrorCodes.WATCH_CALLBACK]);

    source.value++;
    expect(onError.mock.calls.length).toBe(2);
    expect(onError.mock.calls[1]).toMatchObject(['oops in watch', WatchErrorCodes.WATCH_CALLBACK]);

    effect!.stop();
    source.value++;
    expect(onError.mock.calls.length).toBe(3);
    expect(onError.mock.calls[2]).toMatchObject(['oops in cleanup', WatchErrorCodes.WATCH_CLEANUP]);
  });

  it('call option with async error handling', async () => {
    const onError = vi.fn();
    const call: WatchOptions['call'] = function call(fn, type, args) {
      if (Array.isArray(fn)) {
        fn.forEach((f) => call(f, type, args));
        return;
      }
      fn(...(args ?? [])).catch((error: unknown) => {
        onError(error);
      });
    };

    const source1 = signal(0);
    watch(
      source1,
      // eslint-disable-next-line require-await
      async () => {
        throw 'oops in watch';
      },
      { call },
    );

    source1.value++;
    await Promise.resolve();
    expect(onError.mock.calls.length).toBe(1);
    expect(onError.mock.calls[0]).toMatchObject(['oops in watch']);

    const source2 = signal(0);
    watch(
      source2,
      // eslint-disable-next-line require-await
      async () => {
        throw 'oops in once watch';
      },
      { call, once: true },
    );

    source2.value++;
    await Promise.resolve();
    expect(onError.mock.calls.length).toBe(2);
    expect(onError.mock.calls[1]).toMatchObject(['oops in once watch']);
  });

  it('watch with onWatcherCleanup', () => {
    let dummy = 0;
    let source: Signal<number>;
    const scope = new EffectScope();

    scope.run(() => {
      source = signal(0);
      watch((onCleanup) => {
        source.value;

        onCleanup(() => (dummy += 2));
        onWatcherCleanup(() => (dummy += 3));
        onWatcherCleanup(() => (dummy += 5));
      });
    });
    expect(dummy).toBe(0);

    scope.run(() => {
      source.value++;
    });
    expect(dummy).toBe(10);

    scope.run(() => {
      source.value++;
    });
    expect(dummy).toBe(20);

    scope.stop();
    expect(dummy).toBe(30);
  });

  it('once option should be ignored by simple watch', () => {
    let dummy: any;
    const source = signal(0);
    watch(
      () => {
        dummy = source.value;
      },
      null,
      { once: true },
    );
    expect(dummy).toBe(0);

    source.value++;
    expect(dummy).toBe(1);
  });

  // #12033
  it('recursive sync watcher on computed', () => {
    const r = signal(0);
    const c = computed(() => r.value);

    watch(c, (v) => {
      if (v > 1) {
        r.value--;
      }
    });

    expect(r.value).toBe(0);
    expect(c.value).toBe(0);

    r.value = 10;
    expect(r.value).toBe(1);
    expect(c.value).toBe(1);
  });

  // edge case where a nested endBatch() causes an effect to be batched in a
  // nested batch loop with its .next mutated, causing the outer loop to end
  // early
  it('nested batch edge case', () => {
    // useClamp pattern
    const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
    function useClamp(src: Signal<number>, min: number, max: number) {
      return computed({
        get() {
          return (src.value = clamp(src.value, min, max));
        },
        set(val) {
          src.value = clamp(val, min, max);
        },
      });
    }

    const src = signal(1);
    const clamped = useClamp(src, 1, 5);
    watch(src, (val) => (clamped.value = val));

    const spy = vi.fn();
    watch(clamped, spy);

    src.value = 2;
    expect(spy).toHaveBeenCalledTimes(1);
    src.value = 10;
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('should ensure correct execution order in batch processing', () => {
    const dummy: number[] = [];
    const n1 = signal(0);
    const n2 = signal(0);
    const sum = computed(() => n1.value + n2.value);
    watch(n1, () => {
      dummy.push(1);
      n2.value++;
    });
    watch(sum, () => dummy.push(2));
    watch(n1, () => dummy.push(3));

    n1.value++;

    expect(dummy).toEqual([1, 2, 3]);
  });

  it('watch with immediate reset and sync flush', () => {
    const value = signal(false);

    watch(value, () => {
      value.value = false;
    });

    value.value = true;
    value.value = true;
    expect(value.value).toBe(false);
  });
});

describe('edge cases', () => {
  it('getCurrentWatcher inside callbacks', () => {
    const s = signal(0);
    let current: any;
    const handle = watch(s, () => {
      current = getCurrentWatcher();
    });
    s.value++;
    expect(current).toBeDefined();
    expect(getCurrentWatcher()).toBeUndefined();
    handle.stop();
  });

  it('onWatcherCleanup warns without active watcher', () => {
    onWatcherCleanup(() => {});
    expect('onWatcherCleanup() was called when there was no active watcher').toHaveBeenWarned();
    onWatcherCleanup(() => {}, true);
  });

  it('multi-source with invalid source and getter via call', () => {
    const s = signal(0);
    const call = vi.fn((fn: any, _t: any, args?: any[]) => fn(...(args ?? [])));
    const cb = vi.fn();
    watch([s, 1 as any, () => s.value * 2], cb, { call });
    s.value++;
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toEqual([1, undefined, 2]);
    expect('Invalid watch source').toHaveBeenWarned();
  });

  it('getter + cb via call', () => {
    const s = signal(0);
    const call = vi.fn((fn: any, _t: any, args?: any[]) => fn(...(args ?? [])));
    const cb = vi.fn();
    watch(() => s.value, cb, { call });
    s.value++;
    expect(cb).toHaveBeenCalledWith(1, 0, expect.any(Function));
  });

  it('simple effect cleanup runs untracked', () => {
    const s = signal(0);
    const other = signal(0);
    const cleanupFn = vi.fn(() => other.value);
    const fn = vi.fn();
    watch(() => {
      fn(s.value);
      onWatcherCleanup(cleanupFn);
    });
    s.value++;
    expect(cleanupFn).toHaveBeenCalledTimes(1);
    other.value++;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('deep: false on reactive traverses one level', () => {
    const state = reactive({ nested: { a: 1 }, b: 1 });
    const cb = vi.fn();
    watch(state, cb, { deep: false });
    state.nested.a++;
    expect(cb).not.toHaveBeenCalled();
    state.b++;
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('deep with numeric depth', () => {
    const s = signal({ a: { b: { c: 1 } } });
    const cb = vi.fn();
    watch(s, cb, { deep: 1 });
    s.value.a.b.c++;
    expect(cb).not.toHaveBeenCalled();
  });

  it('traverse handles signals, collections and symbols', () => {
    const sym = Symbol('s');
    const hidden = Symbol('h');
    const obj: any = { a: signal(1), m: new Map([[1, 2]]), s: new Set([1]), [sym]: 1 };
    Object.defineProperty(obj, hidden, { value: 1, enumerable: false });
    obj.self = obj;
    expect(traverse(obj)).toBe(obj);
    expect(traverse(1)).toBe(1);
    expect(traverse({ [signalsFlags.SKIP]: true })).toBeDefined();
  });

  it('multi-source immediate passes empty oldValue array', () => {
    const s = signal(0);
    const cb = vi.fn();
    watch([s], cb, { immediate: true });
    expect(cb.mock.calls[0][1]).toEqual([]);
  });
});
