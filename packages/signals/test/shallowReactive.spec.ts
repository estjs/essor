import { effect, isReactive, isShallow, isSignal, reactive, shallowReactive, signal } from '../src';
import type { Signal } from '../src/signal';

describe('shallowReactive', () => {
  it('should not make non-reactive properties reactive', () => {
    const props = shallowReactive({ n: { foo: 1 } });
    expect(isReactive(props.n)).toBe(false);
  });

  it('should keep reactive properties reactive', () => {
    const props: any = shallowReactive({ n: reactive({ foo: 1 }) });
    props.n = reactive({ foo: 2 });
    expect(isReactive(props.n)).toBe(true);
  });

  // #2843
  it('should allow shallow and normal reactive for same target', () => {
    const original = { foo: {} };
    const shallowProxy = shallowReactive(original);
    const reactiveProxy = reactive(original);
    expect(shallowProxy).not.toBe(reactiveProxy);
    expect(isReactive(shallowProxy.foo)).toBe(false);
    expect(isReactive(reactiveProxy.foo)).toBe(true);
  });

  // #5271
  it('should respect shallow reactive nested inside reactive on reset', () => {
    const r = reactive({ foo: shallowReactive({ bar: {} }) });
    expect(isShallow(r.foo)).toBe(true);
    expect(isReactive(r.foo.bar)).toBe(false);

    r.foo = shallowReactive({ bar: {} });
    expect(isShallow(r.foo)).toBe(true);
    expect(isReactive(r.foo.bar)).toBe(false);
  });

  it('should not unwrap refs', () => {
    const foo = shallowReactive({
      bar: signal(123),
    });
    expect(isSignal(foo.bar)).toBe(true);
    expect(foo.bar.value).toBe(123);
  });

  it('should not mutate refs', () => {
    const original = signal(123);
    const foo = shallowReactive<{ bar: Signal<number> | number }>({
      bar: original,
    });
    expect(foo.bar).toBe(original);
    foo.bar = 234;
    expect(foo.bar).toBe(234);
    expect(original.value).toBe(123);
  });

  it('should respect shallow/deep versions of same target on access', () => {
    const original = {};
    const shallow = shallowReactive(original);
    const deep = reactive(original);
    const r = reactive({ shallow, deep });
    expect(r.shallow).toBe(shallow);
    expect(r.deep).toBe(deep);
  });

  describe('collections', () => {
    it('should be reactive', () => {
      const shallowSet = shallowReactive(new Set());
      const a = {};
      let size;

      effect(() => {
        size = shallowSet.size;
      });

      expect(size).toBe(0);

      shallowSet.add(a);
      expect(size).toBe(1);

      shallowSet.delete(a);
      expect(size).toBe(0);
    });

    it('should not observe when iterating', () => {
      const shallowSet = shallowReactive(new Set());
      const a = {};
      shallowSet.add(a);

      const spreadA = [...shallowSet][0];
      expect(isReactive(spreadA)).toBe(false);
    });

    it('should not get reactive entry', () => {
      const shallowMap = shallowReactive(new Map());
      const a = {};
      const key = 'a';

      shallowMap.set(key, a);

      expect(isReactive(shallowMap.get(key))).toBe(false);
    });

    it('should not get reactive on foreach', () => {
      const shallowSet = shallowReactive(new Set());
      const a = {};
      shallowSet.add(a);

      shallowSet.forEach((x) => expect(isReactive(x)).toBe(false));
    });

    it('setting a reactive object on a shallowReactive map', () => {
      const msg = signal('ads');
      const bar = reactive({ msg });
      const foo = shallowReactive(new Map([['foo1', bar]]));
      foo.set('foo2', bar);

      expect(isReactive(foo.get('foo2'))).toBe(true);
      expect(isReactive(foo.get('foo1'))).toBe(true);
    });

    it('setting a reactive object on a shallowReactive set', () => {
      const msg = signal(1);
      const bar = reactive({ msg });
      const foo = reactive({ msg });

      const deps = shallowReactive(new Set([bar]));
      deps.add(foo);

      deps.forEach((dep) => {
        expect(isReactive(dep)).toBe(true);
      });
    });

    // #1210
  });

  describe('array', () => {
    it('should be reactive', () => {
      const shallowArray = shallowReactive<unknown[]>([]);
      const a = {};
      let size;

      effect(() => {
        size = shallowArray.length;
      });

      expect(size).toBe(0);

      shallowArray.push(a);
      expect(size).toBe(1);

      shallowArray.pop();
      expect(size).toBe(0);
    });

    it('should not observe when iterating', () => {
      const shallowArray = shallowReactive<object[]>([]);
      const a = {};
      shallowArray.push(a);

      const spreadA = [...shallowArray][0];
      expect(isReactive(spreadA)).toBe(false);
    });
  });
});
