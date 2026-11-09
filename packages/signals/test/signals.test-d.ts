import { describe, expectTypeOf, it } from 'vitest';
import {
  type ComputedRef,
  type MaybeSignal,
  type ShallowSignal,
  type Signal,
  type ToSignal,
  type ToSignals,
  type WritableComputedRef,
  computed,
  isSignal,
  reactive,
  shallowReactive,
  shallowSignal,
  signal,
  toSignal,
  toSignals,
  toValue,
  unSignal,
  watch,
} from '../src';

describe('signals typecheck', () => {
  it('infers signal primitive and object types', () => {
    const num = signal(0);
    expectTypeOf(num).toEqualTypeOf<Signal<number>>();
    expectTypeOf(num.value).toEqualTypeOf<number>();
    num.value = 42;

    const str = signal('hello');
    expectTypeOf(str).toEqualTypeOf<Signal<string>>();
    expectTypeOf(str.value).toEqualTypeOf<string>();

    const bool = signal(true);
    expectTypeOf(bool).toEqualTypeOf<Signal<boolean>>();

    const uninit = signal<number>();
    expectTypeOf(uninit).toEqualTypeOf<Signal<number | undefined>>();
  });

  it('infers shallowSignal types', () => {
    const shallow = shallowSignal({ count: 0 });
    expectTypeOf(shallow).toEqualTypeOf<ShallowSignal<{ count: number }>>();
    expectTypeOf(shallow.value).toEqualTypeOf<{ count: number }>();
  });

  it('infers computed and writable computed types', () => {
    const count = signal(1);
    const doubled = computed(() => count.value * 2);

    expectTypeOf(doubled).toEqualTypeOf<ComputedRef<number>>();
    expectTypeOf(doubled.value).toEqualTypeOf<number>();

    const writable = computed({
      get: () => count.value * 2,
      set: (val: number) => {
        count.value = val / 2;
      },
    });

    expectTypeOf(writable).toEqualTypeOf<WritableComputedRef<number>>();
    expectTypeOf(writable.value).toEqualTypeOf<number>();
    writable.value = 10;
  });

  it('infers reactive and shallowReactive types', () => {
    const state = reactive({
      count: 0,
      nested: { text: 'hello' },
    });

    expectTypeOf(state.count).toEqualTypeOf<number>();
    expectTypeOf(state.nested.text).toEqualTypeOf<string>();

    const shallow = shallowReactive({
      count: 0,
      nested: { text: 'hello' },
    });

    expectTypeOf(shallow.count).toEqualTypeOf<number>();
    expectTypeOf(shallow.nested.text).toEqualTypeOf<string>();
  });

  it('infers toValue and unSignal conversions', () => {
    const num = signal(10);
    const fn = () => 20;
    const raw = 30;

    expectTypeOf(toValue(num)).toEqualTypeOf<number>();
    expectTypeOf(toValue(fn)).toEqualTypeOf<number>();
    expectTypeOf(toValue(raw)).toEqualTypeOf<number>();

    expectTypeOf(unSignal(num)).toEqualTypeOf<number>();
    expectTypeOf(unSignal(raw)).toEqualTypeOf<number>();
  });

  it('infers toSignal and toSignals', () => {
    const obj = reactive({ x: 1, y: 'a' });

    const xSig = toSignal(obj, 'x');
    expectTypeOf(xSig).toEqualTypeOf<ToSignal<number>>();
    expectTypeOf(xSig.value).toEqualTypeOf<number>();

    const getterSig = toSignal(() => 42);
    expectTypeOf(getterSig).toEqualTypeOf<Readonly<Signal<42>>>();
    expectTypeOf(getterSig.value).toEqualTypeOf<42>();

    const getterSigNum = toSignal((): number => 42);
    expectTypeOf(getterSigNum).toEqualTypeOf<Readonly<Signal<number>>>();
    expectTypeOf(getterSigNum.value).toEqualTypeOf<number>();

    const allSignals = toSignals(obj);
    expectTypeOf(allSignals).toEqualTypeOf<ToSignals<{ x: number; y: string }>>();
    expectTypeOf(allSignals.x.value).toEqualTypeOf<number>();
    expectTypeOf(allSignals.y.value).toEqualTypeOf<string>();
  });

  it('checks isSignal type guard', () => {
    const unknownVal: unknown = signal(1);
    if (isSignal(unknownVal)) {
      expectTypeOf(unknownVal).toEqualTypeOf<Signal<any>>();
    }
  });

  it('checks watch source types', () => {
    const count = signal(0);
    const unwatch = watch(
      count,
      (newVal, oldVal) => {
        expectTypeOf(newVal).toEqualTypeOf<number>();
        expectTypeOf(oldVal).toEqualTypeOf<number | undefined>();
      },
      { immediate: true },
    );
    expectTypeOf(unwatch).toMatchTypeOf<() => void>();
  });

  it('handles MaybeSignal utility type', () => {
    type MaybeNum = MaybeSignal<number>;
    const a: MaybeNum = 1;
    const b: MaybeNum = signal(2);

    expectTypeOf(a).toMatchTypeOf<MaybeNum>();
    expectTypeOf(b).toMatchTypeOf<MaybeNum>();
  });
});
