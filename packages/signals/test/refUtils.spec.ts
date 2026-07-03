import { describe, expect, it, vi } from 'vitest';
import { computed, effect, reactive, ref, signal, toRef, toRefs, unref } from '../src';

describe('refUtils', () => {
  describe('unref', () => {
    it('unwraps a signal to its value', () => {
      const count = signal(5);
      expect(unref(count)).toBe(5);
    });

    it('unwraps a ref to its value', () => {
      const r = ref(10);
      expect(unref(r)).toBe(10);
    });

    it('unwraps a computed to its value', () => {
      const c = computed(() => 42);
      expect(unref(c)).toBe(42);
    });

    it('calls a getter function and returns its result', () => {
      const count = signal(3);
      expect(unref(() => count.value * 2)).toBe(6);
    });

    it('returns plain values unchanged', () => {
      expect(unref(7)).toBe(7);
      expect(unref('hello')).toBe('hello');
      expect(unref(null)).toBe(null);
      expect(unref(undefined)).toBe(undefined);
    });

    it('returns a plain object unchanged (not a signal/ref/function)', () => {
      const obj = { a: 1 };
      expect(unref(obj)).toBe(obj);
    });
  });

  describe('toRef', () => {
    it('reads through to the reactive source', () => {
      const state = reactive({ count: 0, name: 'Alice' });
      const countRef = toRef(state, 'count');
      expect(countRef.value).toBe(0);
      expect(toRef(state, 'name').value).toBe('Alice');
    });

    it('writes back to the reactive source', () => {
      const state = reactive({ count: 0 });
      const countRef = toRef(state, 'count');
      countRef.value = 5;
      expect(state.count).toBe(5);
    });

    it('reflects later source mutations when read', () => {
      const state = reactive({ count: 1 });
      const countRef = toRef(state, 'count');
      state.count = 99;
      expect(countRef.value).toBe(99);
    });

    it('stays reactive: an effect re-runs when the source changes', () => {
      const state = reactive({ count: 0 });
      const countRef = toRef(state, 'count');
      const spy = vi.fn();
      effect(() => spy(countRef.value));
      expect(spy).toHaveBeenCalledTimes(1);

      state.count = 1;
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenLastCalledWith(1);

      // Writing through the ref also triggers the effect.
      countRef.value = 2;
      expect(spy).toHaveBeenLastCalledWith(2);
    });

    it('falls back to the default value when the property is undefined', () => {
      const state = reactive<{ count?: number }>({});
      const countRef = toRef(state, 'count', 100);
      expect(countRef.value).toBe(100);

      state.count = 3;
      expect(countRef.value).toBe(3);
    });
  });

  describe('toRefs', () => {
    it('wraps every own property as a writable ref', () => {
      const state = reactive({ x: 1, y: 2 });
      const refs = toRefs(state);
      expect(refs.x.value).toBe(1);
      expect(refs.y.value).toBe(2);
    });

    it('supports destructuring while keeping reactivity', () => {
      const state = reactive({ x: 1, y: 2 });
      const { x, y } = toRefs(state);

      const spy = vi.fn();
      effect(() => spy(x.value + y.value));
      expect(spy).toHaveBeenLastCalledWith(3);

      state.x = 10;
      expect(spy).toHaveBeenLastCalledWith(12);
    });

    it('writes back to the source through a destructured ref', () => {
      const state = reactive({ x: 1, y: 2 });
      const { x } = toRefs(state);
      x.value = 10;
      expect(state.x).toBe(10);
    });
  });
});
