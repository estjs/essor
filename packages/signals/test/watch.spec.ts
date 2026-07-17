import { computed, reactive, signal, watch } from '../src';
import { nextTick } from '../src/scheduler';

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

  it('should watch an array of sources and trigger callback on change', async () => {
    const signalValue = signal(1);
    const computedValue = computed(() => signalValue.value * 2);
    const callback = vi.fn();

    const stop = watch([signalValue, computedValue], callback);

    signalValue.value = 2;
    await nextTick();
    expect(callback).toHaveBeenCalledWith([2, 4], [1, 2], expect.any(Function));

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

  it('should handle deep watch on cyclic objects without infinite loops', async () => {
    const obj = reactive({ name: 'A', nested: { count: 1 } });
    (obj as any).self = obj;

    const callback = vi.fn();
    const stop = watch(obj, callback, { deep: true });

    obj.nested.count = 2;
    await nextTick();

    expect(callback).toHaveBeenCalledTimes(1);
    stop();
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

    it('gives a real previous value when watching a derived primitive', async () => {
      const state = reactive({ count: 0 });
      const cb = vi.fn();

      const stop = watch(() => state.count, cb);

      state.count = 5;
      await nextTick();

      // Derived primitive → oldValue is the genuine prior value.
      expect(cb).toHaveBeenCalledWith(5, 0, expect.any(Function));

      stop();
    });

    it('provides correct oldValue for primitive signal sources', async () => {
      const s = signal('a');
      const cb = vi.fn();
      const stop = watch(s, cb);

      s.value = 'b';
      await nextTick();
      expect(cb).toHaveBeenCalledWith('b', 'a', expect.any(Function));

      stop();
    });
  });

  describe('initialization runs the getter exactly once', () => {
    it('does not double-invoke the source getter on (non-immediate) setup', () => {
      const s = signal(0);
      const getter = vi.fn(() => s.value);

      const stop = watch(getter, () => {});

      // Previously the effect ran eagerly AND watch re-ran it → 2 calls.
      expect(getter).toHaveBeenCalledTimes(1);
      stop();
    });

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

    it('swallows errors thrown by a cleanup handler', async () => {
      const s = signal(0);
      const cb = vi.fn();

      const stop = watch(s, (n, _o, onCleanup) => {
        cb(n);
        onCleanup(() => {
          throw new Error('boom');
        });
      });

      s.value = 1;
      await nextTick();
      // The throwing cleanup must not break the next scheduled run.
      s.value = 2;
      await expect(nextTick()).resolves.toBeUndefined();
      expect(cb).toHaveBeenLastCalledWith(2);

      stop();
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

    // SIG-14: once fires exactly once under sync re-entrancy
    it('should run a once watcher exactly once even when the callback writes the source', () => {
      const source = signal(0);
      const callback = vi.fn((newValue: number) => {
        // Re-triggers the watcher synchronously before stop() runs; the fired
        // guard must swallow the second invocation.
        if (newValue === 1) {
          source.value = 2;
        }
      });

      const stop = watch(source, callback, { once: true, flush: 'sync' });

      source.value = 1;

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(1, 0, expect.any(Function));

      // Watcher is stopped — further writes are ignored.
      source.value = 3;
      expect(callback).toHaveBeenCalledTimes(1);

      stop();
    });
  });

  describe('flush timing', () => {
    it("flush: 'sync' runs the callback synchronously on change", () => {
      const s = signal(0);
      const cb = vi.fn();

      const stop = watch(s, cb, { flush: 'sync' });

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

      const stop = watch(
        source,
        (newValue, oldValue) => {
          calls.push([newValue, oldValue]);
          // Re-entrant write from inside a sync callback: the inner invocation
          // must see this run's newValue as its oldValue, not the stale one.
          if (newValue === 1) {
            source.value = 2;
          }
        },
        { flush: 'sync' },
      );

      source.value = 1;

      expect(calls).toEqual([
        [1, 0],
        [2, 1],
      ]);

      stop();
    });

    it("flush: 'post' (default) batches and fires on the microtask", async () => {
      const s = signal(0);
      const cb = vi.fn();

      const stop = watch(s, cb);

      s.value = 1;
      s.value = 2;
      // Not yet — still pending the flush.
      expect(cb).not.toHaveBeenCalled();

      await nextTick();
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenLastCalledWith(2, 0, expect.any(Function));

      stop();
    });
  });

  describe('watch(reactiveArray) is a single deep source (SIG-15)', () => {
    it('fires when an element object is mutated in place', () => {
      const list = reactive([{ n: 1 }, { n: 2 }]);
      let calls = 0;
      watch(
        list,
        () => {
          calls++;
        },
        { flush: 'sync' },
      );

      list[0].n = 10;
      expect(calls).toBe(1);
    });

    it('fires when elements are pushed', () => {
      const list = reactive<number[]>([1]);
      let calls = 0;
      watch(
        list,
        () => {
          calls++;
        },
        { flush: 'sync' },
      );

      list.push(2);
      expect(calls).toBe(1);
    });
  });

  describe('traverse robustness (SIG-12/16)', () => {
    // SIG-16: iterative traverse
    it('should deep watch a 50k-deep nested chain without a RangeError', () => {
      // Build the chain with a loop — a literal this deep is not expressible,
      // and recursion in the builder would itself overflow.
      const root: any = {};
      let current = root;
      for (let i = 0; i < 50_000; i++) {
        current.child = {};
        current = current.child;
      }

      const callback = vi.fn();
      let stop!: () => void;
      // The eager effect run traverses the whole chain synchronously; the old
      // recursive traverse threw RangeError here.
      expect(() => {
        stop = watch(() => root, callback, { deep: true });
      }).not.toThrow();

      stop();
    });

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

  describe('immediate callback errors (SIG-13)', () => {
    it('should stop the watcher when an immediate callback throws', async () => {
      const source = signal(1);
      const callback = vi.fn(() => {
        throw new Error('immediate boom');
      });

      // watch() rethrows — the caller never receives a stop handle, so the
      // runner must already be torn down at this point.
      expect(() => watch(source, callback, { immediate: true })).toThrow('immediate boom');
      expect(callback).toHaveBeenCalledTimes(1);

      // A later source change must not reach the callback.
      source.value = 2;
      await nextTick();
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('multi-source element-wise comparison (SIG-32)', () => {
    it('should not fire a multi-source watcher when all sources are unchanged', async () => {
      const a = signal(1);
      const b = signal(2);
      const callback = vi.fn();

      const stop = watch([a, b], callback);

      // Same-value write: no observable change.
      a.value = a.peek();
      await nextTick();
      expect(callback).not.toHaveBeenCalled();

      // Change-and-revert within one flush: the job may be scheduled, but the
      // element-wise snapshot comparison sees identical values and skips.
      a.value = 5;
      a.value = 1;
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
