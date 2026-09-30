import { describe, expect, it } from 'vitest';
import {
  type Signal,
  computed,
  customSignal,
  effect,
  isReactive,
  isShallow,
  isShallowSignal,
  isSignal,
  proxySignals,
  reactive,
  shallowReactive,
  shallowSignal,
  signal,
  toSignal,
  toSignals,
  toValue,
  triggerSignal,
  unSignal,
} from '../src';
import { signalsFlags } from '../src/constants';

describe('reactivity/ref', () => {
  it('should hold a value', () => {
    const a = signal(1);
    expect(a.value).toBe(1);
    a.value = 2;
    expect(a.value).toBe(2);
  });

  it('should be reactive', () => {
    const a = signal(1);
    let dummy;
    const fn = vi.fn(() => {
      dummy = a.value;
    });
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(dummy).toBe(1);
    a.value = 2;
    expect(fn).toHaveBeenCalledTimes(2);
    expect(dummy).toBe(2);
    // same value should not trigger
    a.value = 2;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('ref wrapped in reactive should not track internal _value access', () => {
    const a = signal(1);
    const b = reactive(a);
    let dummy;
    const fn = vi.fn(() => {
      dummy = b.value; // this will observe both b.value and a.value access
    });
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(dummy).toBe(1);

    // mutating a.value should only trigger effect once
    a.value = 3;
    expect(fn).toHaveBeenCalledTimes(2);
    expect(dummy).toBe(3);

    // mutating b.value should trigger the effect twice. (once for a.value change and once for b.value change)
    b.value = 5;
    expect(fn).toHaveBeenCalledTimes(4);
    expect(dummy).toBe(5);
  });

  it('should make nested properties reactive', () => {
    const a = signal({
      count: 1,
    });
    let dummy;
    effect(() => {
      dummy = a.value.count;
    });
    expect(dummy).toBe(1);
    a.value.count = 2;
    expect(dummy).toBe(2);
  });

  it('should work without initial value', () => {
    const a = signal();
    let dummy;
    effect(() => {
      dummy = a.value;
    });
    expect(dummy).toBe(undefined);
    a.value = 2;
    expect(dummy).toBe(2);
  });

  it('should work like a normal property when nested in a reactive object', () => {
    const a = signal(1);
    const obj = reactive({
      a,
      b: {
        c: a,
      },
    });

    let dummy1: number;
    let dummy2: number;

    effect(() => {
      dummy1 = obj.a;
      dummy2 = obj.b.c;
    });

    const assertDummiesEqualTo = (val: number) =>
      [dummy1, dummy2].forEach((dummy) => expect(dummy).toBe(val));

    assertDummiesEqualTo(1);
    a.value++;
    assertDummiesEqualTo(2);
    obj.a++;
    assertDummiesEqualTo(3);
    obj.b.c++;
    assertDummiesEqualTo(4);
  });

  it('should unwrap nested ref in types', () => {
    const a = signal(0);
    const b = signal(a);

    expect(typeof (b.value + 1)).toBe('number');
  });

  it('should unwrap nested values in types', () => {
    const a = {
      b: signal(0),
    };

    const c = signal(a);

    expect(typeof (c.value.b + 1)).toBe('number');
  });

  it('should NOT unwrap ref types nested inside arrays', () => {
    const arr = signal([1, signal(3)]).value;
    expect(isSignal(arr[0])).toBe(false);
    expect(isSignal(arr[1])).toBe(true);
    expect((arr[1] as Signal).value).toBe(3);
  });

  it('should unwrap ref types as props of arrays', () => {
    const arr = [signal(0)];
    const symbolKey = Symbol('');
    arr[''] = signal(1);
    arr[symbolKey] = signal(2);
    const arrRef = signal(arr).value;
    expect(isSignal(arrRef[0])).toBe(true);
    expect(isSignal(arrRef[''])).toBe(false);
    expect(isSignal(arrRef[symbolKey])).toBe(false);
    expect(arrRef['']).toBe(1);
    expect(arrRef[symbolKey]).toBe(2);
  });

  it('should keep tuple types', () => {
    const tuple: [number, string, { a: number }, () => number, Signal<number>] = [
      0,
      '1',
      { a: 1 },
      () => 0,
      signal(0),
    ];
    const tupleRef = signal(tuple);

    tupleRef.value[0]++;
    expect(tupleRef.value[0]).toBe(1);
    tupleRef.value[1] += '1';
    expect(tupleRef.value[1]).toBe('11');
    tupleRef.value[2].a++;
    expect(tupleRef.value[2].a).toBe(2);
    expect(tupleRef.value[3]()).toBe(0);
    tupleRef.value[4].value++;
    expect(tupleRef.value[4].value).toBe(1);
  });

  it('should keep symbols', () => {
    const customSymbol = Symbol();
    const obj = {
      [Symbol.asyncIterator]: signal(1),
      [Symbol.hasInstance]: { a: signal('a') },
      [Symbol.isConcatSpreadable]: { b: signal(true) },
      [Symbol.iterator]: [signal(1)],
      [Symbol.match]: new Set<Signal<number>>(),
      [Symbol.matchAll]: new Map<number, Signal<string>>(),
      [Symbol.replace]: { arr: [signal('a')] },
      [Symbol.search]: { set: new Set<Signal<number>>() },
      [Symbol.species]: { map: new Map<number, Signal<string>>() },
      [Symbol.split]: new WeakSet<Signal<boolean>>(),
      [Symbol.toPrimitive]: new WeakMap<Signal<boolean>, string>(),
      [Symbol.toStringTag]: { weakSet: new WeakSet<Signal<boolean>>() },
      [Symbol.unscopables]: { weakMap: new WeakMap<Signal<boolean>, string>() },
      [customSymbol]: { arr: [signal(1)] },
    };

    const objRef = signal(obj);

    const keys: (keyof typeof obj)[] = [
      Symbol.asyncIterator,
      Symbol.hasInstance,
      Symbol.isConcatSpreadable,
      Symbol.iterator,
      Symbol.match,
      Symbol.matchAll,
      Symbol.replace,
      Symbol.search,
      Symbol.species,
      Symbol.split,
      Symbol.toPrimitive,
      Symbol.toStringTag,
      Symbol.unscopables,
      customSymbol,
    ];

    keys.forEach((key) => {
      expect(objRef.value[key]).toStrictEqual(obj[key]);
    });
  });

  it('unref', () => {
    expect(unSignal(1)).toBe(1);
    expect(unSignal(signal(1))).toBe(1);
  });

  it('shallowRef', () => {
    const sref = shallowSignal({ a: 1 });
    expect(isReactive(sref.value)).toBe(false);

    let dummy;
    effect(() => {
      dummy = sref.value.a;
    });
    expect(dummy).toBe(1);

    sref.value = { a: 2 };
    expect(isReactive(sref.value)).toBe(false);
    expect(dummy).toBe(2);
  });

  it('shallowRef force trigger', () => {
    const sref = shallowSignal({ a: 1 });
    let dummy;
    effect(() => {
      dummy = sref.value.a;
    });
    expect(dummy).toBe(1);

    sref.value.a = 2;
    expect(dummy).toBe(1); // should not trigger yet

    // force trigger
    triggerSignal(sref);
    expect(dummy).toBe(2);
  });

  it('shallowRef isShallow', () => {
    expect(isShallow(shallowSignal({ a: 1 }))).toBe(true);
  });

  it('isRef', () => {
    expect(isSignal(signal(1))).toBe(true);
    expect(isSignal(computed(() => 1))).toBe(true);

    expect(isSignal(0)).toBe(false);
    expect(isSignal(1)).toBe(false);
    // an object that looks like a ref isn't necessarily a ref
    expect(isSignal({ value: 0 })).toBe(false);
  });

  it('toRef', () => {
    const a = reactive({
      x: 1,
    });
    const x = toSignal(a, 'x');

    const b = signal({ y: 1 });

    const c = toSignal(b);

    const d = toSignal({ z: 1 });

    expect(isSignal(d)).toBe(true);
    expect(d.value.z).toBe(1);

    expect(c).toBe(b);

    expect(isSignal(x)).toBe(true);
    expect(x.value).toBe(1);

    // source -> proxy
    a.x = 2;
    expect(x.value).toBe(2);

    // proxy -> source
    x.value = 3;
    expect(a.x).toBe(3);

    // reactivity
    let dummyX;
    effect(() => {
      dummyX = x.value;
    });
    expect(dummyX).toBe(x.value);

    // mutating source should trigger effect using the proxy refs
    a.x = 4;
    expect(dummyX).toBe(4);

    // a ref in a non-reactive object should be unwrapped
    const r: any = { x: signal(1) };
    const t = toSignal(r, 'x');
    expect(t.value).toBe(1);

    r.x.value = 2;
    expect(t.value).toBe(2);

    t.value = 3;
    expect(t.value).toBe(3);
    expect(r.x.value).toBe(3);

    // with a default
    const u = toSignal(r, 'x', 7);
    expect(u.value).toBe(3);

    r.x.value = undefined;
    expect(r.x.value).toBeUndefined();
    expect(t.value).toBeUndefined();
    expect(u.value).toBe(7);

    u.value = 7;
    expect(r.x.value).toBe(7);
    expect(t.value).toBe(7);
    expect(u.value).toBe(7);
  });

  it('toRef on array', () => {
    const a: any = reactive(['a', 'b']);
    const r = toSignal(a, 1);
    expect(r.value).toBe('b');
    r.value = 'c';
    expect(r.value).toBe('c');
    expect(a[1]).toBe('c');

    a[1] = signal('d');
    expect(isSignal(a[1])).toBe(true);
    expect(r.value).toBe('d');
    r.value = 'e';
    expect(isSignal(a[1])).toBe(true);
    expect(a[1].value).toBe('e');

    const s = toSignal(a, 2, 'def');
    const len = toSignal(a, 'length');

    expect(s.value).toBe('def');
    expect(len.value).toBe(2);

    a.push('f');
    expect(s.value).toBe('f');
    expect(len.value).toBe(3);

    len.value = 2;

    expect(s.value).toBe('def');
    expect(len.value).toBe(2);

    const symbol = Symbol();
    const t = toSignal(a, 'foo');
    const u = toSignal(a, symbol);
    expect(t.value).toBeUndefined();
    expect(u.value).toBeUndefined();

    const foo = signal(3);
    const bar = signal(5);
    a.foo = foo;
    a[symbol] = bar;
    expect(t.value).toBe(3);
    expect(u.value).toBe(5);

    t.value = 4;
    u.value = 6;

    expect(a.foo).toBe(4);
    expect(foo.value).toBe(4);
    expect(a[symbol]).toBe(6);
    expect(bar.value).toBe(6);
  });

  it('triggerRef on toRef created from array coerces property keys', () => {
    const assertTriggerRef = (key: unknown) => {
      const array = reactive(['a']);
      const first = toSignal(array, key);
      const fn = vi.fn();

      effect(() => fn(first.value));
      expect(fn).toHaveBeenCalledTimes(1);

      triggerSignal(first);
      expect(fn).toHaveBeenCalledTimes(2);
    };

    assertTriggerRef(0);
    // JS coerces non-symbol property keys like [0] to the string "0".
    assertTriggerRef([0]);
  });

  it('triggerRef on toRef created from symbol key preserves the symbol', () => {
    const key = Symbol();
    const object = reactive({ [key]: 'a' });
    const value = toSignal(object, key);
    const fn = vi.fn();

    effect(() => fn(value.value));
    expect(fn).toHaveBeenCalledTimes(1);

    triggerSignal(value);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('toRef default value', () => {
    const a: { x: number | undefined } = { x: undefined };
    const x = toSignal(a, 'x', 1);
    expect(x.value).toBe(1);

    a.x = 2;
    expect(x.value).toBe(2);

    a.x = undefined;
    expect(x.value).toBe(1);
  });

  it('toRef getter', () => {
    const x = toSignal(() => 1);
    expect(x.value).toBe(1);
    expect(isSignal(x)).toBe(true);
    expect(unSignal(x)).toBe(1);
    //@ts-expect-error
    expect(() => (x.value = 123)).toThrow();
  });

  it(`toRef doesn't bypass the proxy when getting/setting a nested ref`, () => {
    const r = signal(2);
    const obj = shallowReactive({ num: r });
    const t = toSignal(obj, 'num');

    expect(t.value).toBe(2);

    effect(() => {
      t.value = 3;
    });

    expect(t.value).toBe(3);
    expect(r.value).toBe(3);

    const s = signal(4);
    obj.num = s;

    expect(t.value).toBe(3);
    expect(s.value).toBe(3);
  });

  it('toRefs', () => {
    const a = reactive({
      x: 1,
      y: 2,
    });

    const { x, y } = toSignals(a);

    expect(isSignal(x)).toBe(true);
    expect(isSignal(y)).toBe(true);
    expect(x.value).toBe(1);
    expect(y.value).toBe(2);

    // source -> proxy
    a.x = 2;
    a.y = 3;
    expect(x.value).toBe(2);
    expect(y.value).toBe(3);

    // proxy -> source
    x.value = 3;
    y.value = 4;
    expect(a.x).toBe(3);
    expect(a.y).toBe(4);

    // reactivity
    let dummyX, dummyY;
    effect(() => {
      dummyX = x.value;
      dummyY = y.value;
    });
    expect(dummyX).toBe(x.value);
    expect(dummyY).toBe(y.value);

    // mutating source should trigger effect using the proxy refs
    a.x = 4;
    a.y = 5;
    expect(dummyX).toBe(4);
    expect(dummyY).toBe(5);
  });

  it('toRefs reactive array', () => {
    const arr = reactive(['a', 'b', 'c']);
    const refs = toSignals(arr);

    expect(Array.isArray(refs)).toBe(true);

    refs[0].value = '1';
    expect(arr[0]).toBe('1');

    arr[1] = '2';
    expect(refs[1].value).toBe('2');
  });

  it('customRef', () => {
    let value = 1;
    let _trigger: () => void;

    const custom = customSignal((track, trigger) => ({
      get() {
        track();
        return value;
      },
      set(newValue: number) {
        value = newValue;
        _trigger = trigger;
      },
    }));

    expect(isSignal(custom)).toBe(true);

    let dummy;
    effect(() => {
      dummy = custom.value;
    });
    expect(dummy).toBe(1);

    custom.value = 2;
    // should not trigger yet
    expect(dummy).toBe(1);

    _trigger!();
    expect(dummy).toBe(2);
  });

  it('should not trigger when setting value to same proxy', () => {
    const obj = reactive({ count: 0 });

    const a = signal(obj);
    const spy1 = vi.fn(() => a.value);

    effect(spy1);

    a.value = obj;
    expect(spy1).toBeCalledTimes(1);

    const b = shallowSignal(obj);
    const spy2 = vi.fn(() => b.value);

    effect(spy2);

    b.value = obj;
    expect(spy2).toBeCalledTimes(1);
  });

  it('should not trigger when setting the same raw object', () => {
    const obj = {};
    const r = signal(obj);
    const spy = vi.fn();
    effect(() => spy(r.value));
    expect(spy).toHaveBeenCalledTimes(1);

    r.value = obj;
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('toValue', () => {
    const a = signal(1);
    const b = computed(() => a.value + 1);
    const c = () => a.value + 2;
    const d = 4;

    expect(toValue(a)).toBe(1);
    expect(toValue(b)).toBe(2);
    expect(toValue(c)).toBe(3);
    expect(toValue(d)).toBe(4);
  });

  it('ref w/ customRef w/ getterRef w/ objectRef should store value cache', () => {
    const refValue = signal(1);
    // @ts-expect-error private field
    expect(refValue._value).toBe(1);

    let customRefValueCache = 0;
    const customRefValue = customSignal((track, trigger) => {
      return {
        get() {
          track();
          return customRefValueCache;
        },
        set(value: number) {
          customRefValueCache = value;
          trigger();
        },
      };
    });
    customRefValue.value;

    // @ts-expect-error internal field
    expect(customRefValue._value).toBe(0);

    const getterRefValue = toSignal(() => 1);
    getterRefValue.value;
    // @ts-expect-error internal field
    expect(getterRefValue._value).toBe(1);

    const objectRefValue = toSignal({ value: 1 }, 'value');
    objectRefValue.value;
    // @ts-expect-error internal field
    expect(objectRefValue._value).toBe(1);
  });
});

describe('edge cases', () => {
  it('isShallowSignal', () => {
    expect(isShallowSignal(shallowSignal(1))).toBe(true);
    expect(isShallowSignal(signal(1))).toBe(false);
    expect(isShallowSignal({})).toBe(false);
  });

  it('converting between signal flavors creates a new signal', () => {
    const s = shallowSignal({ a: 1 });
    const d = signal(s as any);
    expect(d).not.toBe(s);
    const d2 = signal(1);
    expect(shallowSignal(d2 as any)).not.toBe(d2);
    expect(signal(d2)).toBe(d2);
  });

  it('triggerSignal ignores non-signals and signals without subs', () => {
    expect(() => triggerSignal({} as any)).not.toThrow();
    expect(() => triggerSignal(signal(1))).not.toThrow();
  });

  it('proxySignals', () => {
    const r = reactive({ a: 1 });
    expect(proxySignals(r)).toBe(r);

    const raw = { a: signal(1), b: 2, c: signal(3) };
    const p = proxySignals(raw) as any;
    expect(p.a).toBe(1);
    expect(p[signalsFlags.RAW]).toBe(raw);
    p.a = 10;
    expect(raw.a.value).toBe(10);
    p.b = 20;
    expect(raw.b).toBe(20);
    const next = signal(30);
    p.c = next;
    expect(raw.c).toBe(next);
  });

  it('toSignal on shallowReactive writes nested signal', () => {
    const inner = signal(1);
    const obj = shallowReactive({ a: inner }) as any;
    const s = toSignal(obj, 'a');
    s.value = 2;
    expect(inner.value).toBe(2);
    expect(unSignal(obj.a)).toBe(2);
  });

  it('toSignal on plain object with signal falls back to property write when unwrapped value is not a signal', () => {
    const inner = signal(1);
    const raw: any = { a: inner };
    const target = new Proxy(raw, {
      get: (t, k) => (k === 'a' ? 5 : t[k]),
    });
    const s = toSignal(target, 'a');
    s.value = 9;
    expect(raw.a).toBe(9);
  });
});
