import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ComputedRef,
  type WritableComputedRef,
  computed,
  effect,
  effectScope,
  isComputed,
  pauseTracking,
  reactive,
  resetTracking,
  shallowSignal,
  signal,
} from '../src';
import { signalsFlags } from '../src/constants';
import { ReactiveFlags } from '../src/graph';
import { triggerSignal } from '../src/signal';
import type { ComputedRefImpl } from '../src/computed';

describe('computed contract', () => {
  it('uses signalsFlags for computed type guards', () => {
    const flaggedComputed = { [signalsFlags.IS_COMPUTED]: true };

    expect(isComputed(flaggedComputed)).toBe(true);
  });

  it('is lazy and does not recompute on unrelated writes', () => {
    const source = signal(1);
    const unrelated = signal(0);
    const getter = vi.fn(() => source.value * 2);
    const value = computed(getter);

    expect(getter).not.toHaveBeenCalled();
    expect(value.value).toBe(2);
    expect(value.value).toBe(2);
    expect(getter).toHaveBeenCalledOnce();

    unrelated.value = 1;
    expect(value.value).toBe(2);
    expect(getter).toHaveBeenCalledOnce();

    source.value = 2;
    expect(value.value).toBe(4);
    expect(getter).toHaveBeenCalledTimes(2);
  });

  it('reconnects a cold computed when it becomes observed after a standalone read', () => {
    const source = signal(1);
    const doubled = computed(() => source.value * 2);
    const seen: number[] = [];

    expect(doubled.value).toBe(2);
    const stop = effect(() => {
      seen.push(doubled.value);
    });

    source.value = 2;

    expect(seen).toEqual([2, 4]);
    stop();
  });

  it('passes the previous value to the getter', () => {
    const count = signal(0);
    const previous: Array<number | undefined> = [];
    const value = computed<number>((pre) => {
      previous.push(pre);
      return count.value;
    });

    expect(value.value).toBe(0);
    expect(previous).toEqual([undefined]);

    count.value++;
    expect(value.value).toBe(1);
    expect(previous).toEqual([undefined, 0]);
  });

  it('cuts an observed Effect when its output is Object.is equal', () => {
    const source = signal(1);
    const getter = vi.fn(() => source.value % 2);
    const parity = computed(getter);
    const run = vi.fn(() => parity.value);
    const stop = effect(run);

    source.value = 3;
    expect(getter).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledOnce();
    stop();
  });
  it('does not expose stale values in a diamond', () => {
    const source = signal(1);
    const left = computed(() => source.value + 1);
    const right = computed(() => source.value + 2);
    const total = computed(() => left.value + right.value);
    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(total.value);
    });

    source.value = 2;
    expect(seen).toEqual([5, 7]);
    stop();
  });

  it('retries an observed getter when it invalidates a dependency mid-run', () => {
    const source = signal(0);
    let mutate = false;
    const getter = vi.fn(() => {
      const current = source.value;
      if (mutate) {
        mutate = false;
        source.value = current + 1;
      }
      return current;
    });
    const value = computed(getter);
    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(value.value);
    });

    mutate = true;
    source.value = 1;

    expect(seen).toEqual([0, 2]);
    expect(getter).toHaveBeenCalledTimes(3);
    stop();
  });

  it('marks a parent clean when a changed child keeps the same value', () => {
    const source = signal(1);
    const childGetter = vi.fn(() => source.value % 2);
    const child = computed(childGetter);
    const parentGetter = vi.fn(() => child.value + 1);
    const parent = computed(parentGetter);
    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(parent.value);
    });
    const initialParentRuns = parentGetter.mock.calls.length;

    source.value = 3;

    expect(seen).toEqual([2]);
    expect(childGetter).toHaveBeenCalledTimes(2);
    expect(parentGetter).toHaveBeenCalledTimes(initialParentRuns);
    stop();
  });

  it('delegates writable assignment to its setter', () => {
    const source = signal(1);
    const value = computed({
      get: () => source.value * 2,
      set: (next) => {
        source.value = next / 2;
      },
    });

    value.value = 8;
    expect(source.value).toBe(4);
    expect(value.value).toBe(8);
  });

  it('brands Computed separately from mutable Cells', () => {
    const value = computed(() => 1);
    expect((value as unknown as Record<PropertyKey, unknown>)[signalsFlags.IS_COMPUTED]).toBe(true);
    expect(isComputed(value)).toBe(true);
  });

  it('does not expose cold-evaluation trampolines to getter catches', () => {
    const child = computed(() => 1);
    const parent = computed(() => {
      try {
        return child.value;
      } catch {
        return -1;
      }
    });

    expect(parent.value).toBe(1);
  });

  it('routes cold child errors through parent getter catches', () => {
    const failure = new Error('child failure');
    const child = computed(() => {
      throw failure;
    });
    const parent = computed(() => {
      try {
        return child.value;
      } catch (error) {
        return error === failure ? 1 : 0;
      }
    });

    expect(parent.value).toBe(1);
  });
});

describe('computed graph depth', () => {
  it('evaluates a 1,000-level fully cold lazy chain', () => {
    const source = signal(0);
    let value = computed(() => source.value);
    for (let index = 0; index < 1_000; index++) {
      const previous = value;
      value = computed(() => previous.value + 1);
    }

    expect(value.value).toBe(1_000);
  });

  it('updates a 10,000-level observed graph without overflowing the stack', () => {
    const source = signal(0);
    let value = computed(() => source.value);
    let result = 0;
    const stops: Array<() => void> = [];

    for (let index = 0; index < 10_000; index++) {
      const previous = value;
      value = computed(() => previous.value + 1);

      if ((index + 1) % 250 === 0) {
        const pinned = value;
        stops.push(
          effect(() => {
            result = pinned.value;
          }),
        );
      }
    }

    source.value = 1;
    expect(result).toBe(10_001);
    for (let index = stops.length - 1; index >= 0; index--) stops[index]();
  });
});

describe('computed edge behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns when a readonly computed is assigned in development', () => {
    const value = computed(() => 1);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    (value as { value: number }).value = 2;

    expect(value.value).toBe(1);
    expect(warning).toHaveBeenCalledWith(
      '[Essor warn]: Write operation failed: computed value is readonly',
    );
  });

  it('recovers after a getter failure when its source changes', () => {
    const source = signal(false);
    const failure = new Error('not ready');
    const value = computed(() => {
      if (!source.value) throw failure;
      return 'ready';
    });

    expect(() => value.value).toThrow(failure);

    source.value = true;

    expect(value.value).toBe('ready');
  });

  it('propagates errors thrown by a writable computed setter', () => {
    const setterError = new Error('setter failed');
    const setter = vi.fn(() => {
      throw setterError;
    });
    const value = computed({
      get: () => 1,
      set: setter,
    });

    expect(() => {
      value.value = 2;
    }).toThrow(setterError);
    expect(setter).toHaveBeenCalledWith(2);
    expect(value.value).toBe(1);
  });
});

describe('effect edge behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pauses and resumes owned effects, then stops them permanently', () => {
    const source = signal(0);
    const scope = effectScope();
    let runs = 0;

    scope.run(() => {
      effect(() => {
        source.value;
        runs++;
      });
    });

    scope.pause();
    source.value = 1;
    expect(runs).toBe(1);

    scope.resume();
    expect(runs).toBe(2);

    scope.stop();
    source.value = 2;
    expect(runs).toBe(2);
  });
});

describe('reactivity/computed', () => {
  it('should return updated value', () => {
    const value = reactive<{ foo?: number }>({});
    const cValue = computed(() => value.foo);
    expect(cValue.value).toBe(undefined);
    value.foo = 1;
    expect(cValue.value).toBe(1);
  });

  it('pass oldValue to computed getter', () => {
    const count = signal(0);
    const oldValue = signal();
    const curValue = computed((pre) => {
      oldValue.value = pre;
      return count.value;
    });
    expect(curValue.value).toBe(0);
    expect(oldValue.value).toBe(undefined);
    count.value++;
    expect(curValue.value).toBe(1);
    expect(oldValue.value).toBe(0);
  });

  it('should compute lazily', () => {
    const value = reactive<{ foo?: number }>({});
    const getter = vi.fn(() => value.foo);
    const cValue = computed(getter);

    // lazy
    expect(getter).not.toHaveBeenCalled();

    expect(cValue.value).toBe(undefined);
    expect(getter).toHaveBeenCalledTimes(1);

    // should not compute again
    cValue.value;
    expect(getter).toHaveBeenCalledTimes(1);

    // should not compute until needed
    value.foo = 1;
    expect(getter).toHaveBeenCalledTimes(1);

    // now it should compute
    expect(cValue.value).toBe(1);
    expect(getter).toHaveBeenCalledTimes(2);

    // should not compute again
    cValue.value;
    expect(getter).toHaveBeenCalledTimes(2);
  });

  it('should trigger effect', () => {
    const value = reactive<{ foo?: number }>({});
    const cValue = computed(() => value.foo);
    let dummy;
    effect(() => {
      dummy = cValue.value;
    });
    expect(dummy).toBe(undefined);
    value.foo = 1;
    expect(dummy).toBe(1);
  });

  it('should work when chained', () => {
    const value = reactive({ foo: 0 });
    const c1 = computed(() => value.foo);
    const c2 = computed(() => c1.value + 1);
    expect(c2.value).toBe(1);
    expect(c1.value).toBe(0);
    value.foo++;
    expect(c2.value).toBe(2);
    expect(c1.value).toBe(1);
  });

  it('should trigger effect when chained', () => {
    const value = reactive({ foo: 0 });
    const getter1 = vi.fn(() => value.foo);
    const getter2 = vi.fn(() => {
      return c1.value + 1;
    });
    const c1 = computed(getter1);
    const c2 = computed(getter2);

    let dummy;
    effect(() => {
      dummy = c2.value;
    });
    expect(dummy).toBe(1);
    expect(getter1).toHaveBeenCalledTimes(1);
    expect(getter2).toHaveBeenCalledTimes(1);
    value.foo++;
    expect(dummy).toBe(2);
    // should not result in duplicate calls
    expect(getter1).toHaveBeenCalledTimes(2);
    expect(getter2).toHaveBeenCalledTimes(2);
  });

  it('should trigger effect when chained (mixed invocations)', () => {
    const value = reactive({ foo: 0 });
    const getter1 = vi.fn(() => value.foo);
    const getter2 = vi.fn(() => {
      return c1.value + 1;
    });
    const c1 = computed(getter1);
    const c2 = computed(getter2);

    let dummy;
    effect(() => {
      dummy = c1.value + c2.value;
    });
    expect(dummy).toBe(1);

    expect(getter1).toHaveBeenCalledTimes(1);
    expect(getter2).toHaveBeenCalledTimes(1);
    value.foo++;
    expect(dummy).toBe(3);
    // should not result in duplicate calls
    expect(getter1).toHaveBeenCalledTimes(2);
    expect(getter2).toHaveBeenCalledTimes(2);
  });

  it('should support setter', () => {
    const n = signal(1);
    const plusOne = computed({
      get: () => n.value + 1,
      set: (val) => {
        n.value = val - 1;
      },
    });

    expect(plusOne.value).toBe(2);
    n.value++;
    expect(plusOne.value).toBe(3);

    plusOne.value = 0;
    expect(n.value).toBe(-1);
  });

  it('should trigger effect w/ setter', () => {
    const n = signal(1);
    const plusOne = computed({
      get: () => n.value + 1,
      set: (val) => {
        n.value = val - 1;
      },
    });

    let dummy;
    effect(() => {
      dummy = n.value;
    });
    expect(dummy).toBe(1);

    plusOne.value = 0;
    expect(dummy).toBe(-1);
  });

  // #5720
  it('should invalidate before non-computed effects', () => {
    const plusOneValues: number[] = [];
    const n = signal(0);
    const plusOne = computed(() => n.value + 1);
    effect(() => {
      n.value;
      plusOneValues.push(plusOne.value);
    });
    // access plusOne, causing it to be non-dirty
    plusOne.value;
    // mutate n
    n.value++;
    // on the 2nd run, plusOne.value should have already updated.
    expect(plusOneValues).toMatchObject([1, 2]);
  });

  it('should warn if trying to set a readonly computed', () => {
    const n = signal(1);
    const plusOne = computed(() => n.value + 1);
    (plusOne as WritableComputedRef<number>).value++; // Type cast to prevent TS from preventing the error

    expect('Write operation failed: computed value is readonly').toHaveBeenWarnedLast();
  });

  it('should query deps dirty sequentially', () => {
    const cSpy = vi.fn();

    const a = signal<null | { v: number }>({
      v: 1,
    });
    const b = computed(() => {
      return a.value;
    });
    const c = computed(() => {
      cSpy();
      return b.value?.v;
    });
    const d = computed(() => {
      if (b.value) {
        return c.value;
      }
      return 0;
    });

    d.value;
    a.value!.v = 2;
    a.value = null;
    d.value;
    expect(cSpy).toHaveBeenCalledTimes(1);
  });

  it('chained computed dirty reallocation after querying dirty', () => {
    let _msg: string | undefined;

    const items = signal<number[]>();
    const isLoaded = computed(() => {
      return !!items.value;
    });
    const msg = computed(() => {
      if (isLoaded.value) {
        return 'The items are loaded';
      } else {
        return 'The items are not loaded';
      }
    });

    effect(() => {
      _msg = msg.value;
    });

    items.value = [1, 2, 3];
    items.value = [1, 2, 3];
    items.value = undefined;

    expect(_msg).toBe('The items are not loaded');
  });

  it('chained computed dirty reallocation after trigger computed getter', () => {
    let _msg: string | undefined;

    const items = signal<number[]>();
    const isLoaded = computed(() => {
      return !!items.value;
    });
    const msg = computed(() => {
      if (isLoaded.value) {
        return 'The items are loaded';
      } else {
        return 'The items are not loaded';
      }
    });

    _msg = msg.value;
    items.value = [1, 2, 3];
    isLoaded.value; // <- trigger computed getter
    _msg = msg.value;
    items.value = undefined;
    _msg = msg.value;

    expect(_msg).toBe('The items are not loaded');
  });

  it('deps order should be consistent with the last time get value', () => {
    const cSpy = vi.fn();

    const a = signal(0);
    const b = computed(() => {
      return a.value % 3 !== 0;
    }) as unknown as ComputedRefImpl;
    const c = computed(() => {
      cSpy();
      if (a.value % 3 === 2) {
        return 'expensive';
      }
      return 'cheap';
    }) as unknown as ComputedRefImpl;
    const d = computed(() => {
      return a.value % 3 === 2;
    }) as unknown as ComputedRefImpl;
    const e = computed(() => {
      if (b.value) {
        if (d.value) {
          return 'Avoiding expensive calculation';
        }
      }
      return c.value;
    }) as unknown as ComputedRefImpl;

    e.value;
    a.value++;
    e.value;

    expect(e.deps!.dep).toBe(b);
    expect(e.deps!.nextDep!.dep).toBe(d);
    expect(e.deps!.nextDep!.nextDep!.dep).toBe(c);
    expect(cSpy).toHaveBeenCalledTimes(2);

    a.value++;
    e.value;

    expect(cSpy).toHaveBeenCalledTimes(2);
  });

  it('should trigger by the second computed that maybe dirty', () => {
    const cSpy = vi.fn();

    const src1 = signal(0);
    const src2 = signal(0);
    const c1 = computed(() => src1.value);
    const c2 = computed(() => (src1.value % 2) + src2.value);
    const c3 = computed(() => {
      cSpy();
      c1.value;
      c2.value;
    });

    c3.value;
    src1.value = 2;
    c3.value;
    expect(cSpy).toHaveBeenCalledTimes(2);
    src2.value = 1;
    c3.value;
    expect(cSpy).toHaveBeenCalledTimes(3);
  });

  it('should trigger the second effect', () => {
    const fnSpy = vi.fn();
    const v = signal(1);
    const c = computed(() => v.value);

    effect(() => {
      c.value;
    });
    effect(() => {
      c.value;
      fnSpy();
    });

    expect(fnSpy).toBeCalledTimes(1);
    v.value = 2;
    expect(fnSpy).toBeCalledTimes(2);
  });

  it('should chained recursive effects clear dirty after trigger', () => {
    const v = signal(1);
    const c1 = computed(() => v.value) as unknown as ComputedRefImpl;
    const c2 = computed(() => c1.value) as unknown as ComputedRefImpl;

    c2.value;
    expect(c1.flags & (ReactiveFlags.Dirty | ReactiveFlags.Pending)).toBe(0);
    expect(c2.flags & (ReactiveFlags.Dirty | ReactiveFlags.Pending)).toBe(0);
  });

  it('should chained computeds dirtyLevel update with first computed effect', () => {
    const v = signal(0);
    const c1 = computed(() => {
      if (v.value === 0) {
        v.value = 1;
      }
      return v.value;
    });
    const c2 = computed(() => c1.value);
    const c3 = computed(() => c2.value);

    expect(c3.value).toBe(1);
    // expect(COMPUTED_SIDE_EFFECT_WARN).toHaveBeenWarned()
  });

  it('should work when chained(ref+computed)', () => {
    const v = signal(0);
    const c1 = computed(() => {
      if (v.value === 0) {
        v.value = 1;
      }
      return 'foo';
    });
    const c2 = computed(() => v.value + c1.value);
    expect(c2.value).toBe('0foo');
    expect(c2.value).toBe('1foo');
    // expect(COMPUTED_SIDE_EFFECT_WARN).toHaveBeenWarned()
  });

  it('should trigger effect even computed already dirty', () => {
    const fnSpy = vi.fn();
    const v = signal(0);
    const c1 = computed(() => {
      if (v.value === 0) {
        v.value = 1;
      }
      return 'foo';
    });
    const c2 = computed(() => v.value + c1.value);

    effect(() => {
      fnSpy(c2.value);
    });
    expect(fnSpy).toBeCalledTimes(1);
    expect(fnSpy.mock.calls).toMatchObject([['0foo']]);
    expect(v.value).toBe(1);
    v.value = 2;
    expect(fnSpy).toBeCalledTimes(2);
    expect(fnSpy.mock.calls).toMatchObject([['0foo'], ['2foo']]);
    expect(v.value).toBe(2);
    // expect(COMPUTED_SIDE_EFFECT_WARN).toHaveBeenWarned()
  });

  // #10185
  it('should not override queried MaybeDirty result', () => {
    class Item {
      v = signal(0);
    }
    const v1 = shallowSignal();
    const v2 = signal(false);
    const c1 = computed(() => {
      let c = v1.value;
      if (!v1.value) {
        c = new Item();
        v1.value = c;
      }
      return c.v.value;
    });
    const c2 = computed(() => {
      if (!v2.value) return 'no';
      return c1.value ? 'yes' : 'no';
    });
    const c3 = computed(() => c2.value);

    c3.value;
    v2.value = true;

    c3.value;
    v1.value.v.value = 999;

    expect(c3.value).toBe('yes');
    // expect(COMPUTED_SIDE_EFFECT_WARN).toHaveBeenWarned()
  });

  it('should not trigger if value did not change', () => {
    const src = signal(0);
    const c = computed(() => src.value % 2);
    const spy = vi.fn();
    effect(() => {
      spy(c.value);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    src.value = 2;

    // should not trigger
    expect(spy).toHaveBeenCalledTimes(1);

    src.value = 3;
    src.value = 5;
    // should trigger because latest value changes
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('chained computed trigger', () => {
    const effectSpy = vi.fn();
    const c1Spy = vi.fn();
    const c2Spy = vi.fn();

    const src = signal(0);
    const c1 = computed(() => {
      c1Spy();
      return src.value % 2;
    });
    const c2 = computed(() => {
      c2Spy();
      return c1.value + 1;
    });

    effect(() => {
      effectSpy(c2.value);
    });

    expect(c1Spy).toHaveBeenCalledTimes(1);
    expect(c2Spy).toHaveBeenCalledTimes(1);
    expect(effectSpy).toHaveBeenCalledTimes(1);

    src.value = 1;
    expect(c1Spy).toHaveBeenCalledTimes(2);
    expect(c2Spy).toHaveBeenCalledTimes(2);
    expect(effectSpy).toHaveBeenCalledTimes(2);
  });

  it('chained computed avoid re-compute', () => {
    const effectSpy = vi.fn();
    const c1Spy = vi.fn();
    const c2Spy = vi.fn();

    const src = signal(0);
    const c1 = computed(() => {
      c1Spy();
      return src.value % 2;
    });
    const c2 = computed(() => {
      c2Spy();
      return c1.value + 1;
    });

    effect(() => {
      effectSpy(c2.value);
    });

    expect(effectSpy).toHaveBeenCalledTimes(1);
    src.value = 2;
    src.value = 4;
    src.value = 6;
    expect(c1Spy).toHaveBeenCalledTimes(4);
    // c2 should not have to re-compute because c1 did not change.
    expect(c2Spy).toHaveBeenCalledTimes(1);
    // effect should not trigger because c2 did not change.
    expect(effectSpy).toHaveBeenCalledTimes(1);
  });

  it('chained computed value invalidation', () => {
    const effectSpy = vi.fn();
    const c1Spy = vi.fn();
    const c2Spy = vi.fn();

    const src = signal(0);
    const c1 = computed(() => {
      c1Spy();
      return src.value % 2;
    });
    const c2 = computed(() => {
      c2Spy();
      return c1.value + 1;
    });

    effect(() => {
      effectSpy(c2.value);
    });

    expect(effectSpy).toHaveBeenCalledTimes(1);
    expect(effectSpy).toHaveBeenCalledWith(1);
    expect(c2.value).toBe(1);

    expect(c1Spy).toHaveBeenCalledTimes(1);
    expect(c2Spy).toHaveBeenCalledTimes(1);

    src.value = 1;
    // value should be available sync
    expect(c2.value).toBe(2);
    expect(c2Spy).toHaveBeenCalledTimes(2);
  });

  it('sync access of invalidated chained computed should not prevent final effect from running', () => {
    const effectSpy = vi.fn();
    const c1Spy = vi.fn();
    const c2Spy = vi.fn();

    const src = signal(0);
    const c1 = computed(() => {
      c1Spy();
      return src.value % 2;
    });
    const c2 = computed(() => {
      c2Spy();
      return c1.value + 1;
    });

    effect(() => {
      effectSpy(c2.value);
    });
    expect(effectSpy).toHaveBeenCalledTimes(1);

    src.value = 1;
    // sync access c2
    c2.value;
    expect(effectSpy).toHaveBeenCalledTimes(2);
  });

  it('computed should force track in untracked zone', () => {
    const n = signal(0);
    const spy1 = vi.fn();
    const spy2 = vi.fn();

    let c: ComputedRef;
    effect(() => {
      spy1();
      pauseTracking();
      n.value;
      c = computed(() => n.value + 1);
      // access computed now to force refresh
      c.value;
      effect(() => spy2(c.value));
      n.value;
      resetTracking();
    });

    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);

    n.value++;
    // outer effect should not trigger
    expect(spy1).toHaveBeenCalledTimes(1);
    // inner effect should trigger
    expect(spy2).toHaveBeenCalledTimes(2);
  });

  // not recommended behavior, but needed for backwards compatibility
  // asyncComputed pattern
  it('computed side effect should be able trigger', () => {
    const a = signal(false);
    const b = signal(false);
    const c = computed(() => {
      a.value = true;
      return b.value;
    });
    effect(() => {
      if (a.value) {
        b.value = true;
      }
    });
    expect(b.value).toBe(false);
    // accessing c triggers change
    c.value;
    expect(b.value).toBe(true);
    expect(c.value).toBe(true);
  });

  it('chained computed should work when accessed before having subs', () => {
    const n = signal(0);
    const c = computed(() => n.value);
    const d = computed(() => c.value + 1);
    const spy = vi.fn();

    // access
    d.value;

    let dummy;
    effect(() => {
      spy();
      dummy = d.value;
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(dummy).toBe(1);

    n.value++;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(dummy).toBe(2);
  });

  // #10236

  // case: setting a template ref during mount,
  // and checks for the element's closest form element in a computed.
  // the computed is expected to only evaluate after mount.

  it('should be recomputed without being affected by side effects', () => {
    const v = signal(0);
    const c1 = computed(() => {
      v.value = 1;
      return 0;
    });
    const c2 = computed(() => {
      return `${v.value},${c1.value}`;
    });

    expect(c2.value).toBe('0,0');
    v.value = 1;
    expect(c2.value).toBe('1,0');
    // expect(COMPUTED_SIDE_EFFECT_WARN).toHaveBeenWarned()
  });

  // #11797

  it('manual trigger computed', () => {
    const cValue = computed(() => 1);
    triggerSignal(cValue);
    expect(cValue.value).toBe(1);
  });

  it('should not recompute if computed does not track reactive data', () => {
    const spy = vi.fn();
    const c1 = computed(() => spy());

    c1.value;
    signal(0).value++; // update globalVersion
    c1.value;

    expect(spy).toBeCalledTimes(1);
  });

  it('computed should remain live after losing all subscribers', () => {
    const state = reactive({ a: 1 });
    const p = computed(() => state.a + 1);
    const { effect: e } = effect(() => p.value);
    e.stop();

    expect(p.value).toBe(2);
    state.a++;
    expect(p.value).toBe(3);
  });

  // #11995
  it('computed dep cleanup should not cause property dep to be deleted', () => {
    const toggle = signal(true);
    const state = reactive({ a: 1 });
    const p = computed(() => {
      return toggle.value ? state.a : 111;
    });
    const pp = computed(() => state.a);
    effect(() => p.value);

    expect(pp.value).toBe(1);
    toggle.value = false;
    state.a++;
    expect(pp.value).toBe(2);
  });

  // #12020
  it('computed value updates correctly after dep cleanup', () => {
    const obj = reactive({ foo: 1, flag: 1 });
    const c1 = computed(() => obj.foo);

    let foo;
    effect(() => {
      foo = obj.flag ? (obj.foo, c1.value) : 0;
    });
    expect(foo).toBe(1);

    obj.flag = 0;
    expect(foo).toBe(0);

    obj.foo = 2;
    obj.flag = 1;
    expect(foo).toBe(2);
  });

  // #11928
  it('should not lead to exponential perf cost with deeply chained computed', () => {
    const start = {
      prop1: shallowSignal(1),
      prop2: shallowSignal(2),
      prop3: shallowSignal(3),
      prop4: shallowSignal(4),
    };

    let layer = start;

    const LAYERS = 1000;

    for (let i = LAYERS; i > 0; i--) {
      const m = layer;
      const s = {
        prop1: computed(() => m.prop2.value),
        prop2: computed(() => m.prop1.value - m.prop3.value),
        prop3: computed(() => m.prop2.value + m.prop4.value),
        prop4: computed(() => m.prop3.value),
      };
      effect(() => s.prop1.value);
      effect(() => s.prop2.value);
      effect(() => s.prop3.value);
      effect(() => s.prop4.value);

      s.prop1.value;
      s.prop2.value;
      s.prop3.value;
      s.prop4.value;

      layer = s;
    }

    const t = performance.now();
    start.prop1.value = 4;
    start.prop2.value = 3;
    start.prop3.value = 2;
    start.prop4.value = 1;
    expect(performance.now() - t).toBeLessThan(100);

    const end = layer;
    expect([end.prop1.value, end.prop2.value, end.prop3.value, end.prop4.value]).toMatchObject([
      -2, -4, 2, 3,
    ]);
  });

  it('performance when removing dependencies from deeply nested computeds', () => {
    const base = signal(1);
    const trigger = signal(true);
    const computeds: ComputedRef<number>[] = [];

    const LAYERS = 30;

    for (let i = 0; i < LAYERS; i++) {
      const earlier = [...computeds];

      computeds.push(
        computed(() => {
          return base.value + earlier.reduce((sum, c) => sum + c.value, 0);
        }),
      );
    }

    const tail = computed(() => (trigger.value ? computeds[computeds.length - 1].value : 0));

    const t0 = performance.now();
    expect(tail.value).toBe(2 ** (LAYERS - 1));
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(100);

    trigger.value = false;
    expect(tail.value).toBe(0);
    const t2 = performance.now();
    expect(t2 - t1).toBeLessThan(100);
  });
});

describe('edge cases', () => {
  it('exposes backwards-compat effect/dep accessors', () => {
    const c = computed(() => 1);
    expect((c as any).effect).toBe(c);
    expect((c as any).dep).toBe(c);
  });

  it('_dirty getter resolves pending state through checkDirty', () => {
    const a = signal(1);
    const b = computed(() => a.value % 2);
    const c = computed(() => b.value) as any;
    expect(c.value).toBe(1);
    expect(c._dirty).toBe(false);

    // b changes -> c becomes dirty
    a.value = 2;
    expect(c._dirty).toBe(true);
    expect(c.value).toBe(0);

    // b recomputes to same value -> c pending but not dirty
    a.value = 4;
    expect(c._dirty).toBe(false);
    expect(c.value).toBe(0);
  });

  it('_dirty setter marks and clears dirty state', () => {
    const getter = vi.fn(() => 1);
    const c = computed(getter) as any;
    c.value;
    expect(getter).toHaveBeenCalledTimes(1);
    c._dirty = true;
    expect(c._dirty).toBe(true);
    c.value;
    expect(getter).toHaveBeenCalledTimes(2);
    c._dirty = true;
    c._dirty = false;
    expect(c._dirty).toBe(false);
    c.value;
    expect(getter).toHaveBeenCalledTimes(2);
  });
});
