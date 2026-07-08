import { describe, expect, it, vi } from 'vitest';
import { isRef, ref } from '../src/ref';
import { effect } from '../src/effect';
import { signal } from '../src/signal';
import { ReactiveFlags } from '../src/constants';

describe('ref', () => {
  it('should create a ref with initial value', () => {
    const r = ref(1);
    expect(r.value).toBe(1);
    expect(isRef(r)).toBe(true);
  });

  it('should create a ref without initial value', () => {
    const r = ref();
    expect(r.value).toBe(undefined);
  });

  it('should track changes to ref value', () => {
    const r = ref(1);
    const fn = vi.fn();

    effect(() => {
      fn(r.value);
    });

    expect(fn).toHaveBeenCalledWith(1);

    r.value = 2;
    expect(fn).toHaveBeenCalledWith(2);
  });

  it('should work with set method', () => {
    const r = ref(1);
    const fn = vi.fn();

    effect(() => {
      fn(r.value);
    });

    r.set(2);
    expect(r.value).toBe(2);
    expect(fn).toHaveBeenCalledWith(2);
  });

  it('should work with update method', () => {
    const r = ref(1);
    const fn = vi.fn();

    effect(() => {
      fn(r.value);
    });

    r.update((val) => val + 1);
    expect(r.value).toBe(2);
    expect(fn).toHaveBeenCalledWith(2);
  });

  it('should track another ref', () => {
    const r1 = ref(1);
    const r2 = ref(r1);

    expect(r2.value).toBe(1);

    r1.value = 2;
    expect(r2.value).toBe(2);
  });

  it('should work with DOM elements', () => {
    const divRef = ref<HTMLDivElement | null>(null);
    const div = document.createElement('div');

    divRef.value = div;
    expect(divRef.value).toBe(div);
  });

  it('should work create ref from signal / ref', () => {
    const s = signal(1);
    const r = ref(s);
    const r2 = ref(r);
    expect(r.value).toBe(1);
    expect(r2.value).toBe(1);

    s.value = 2;
    expect(r.value).toBe(1);

    const r3 = ref(s);
    expect(r3.value).toBe(2);
  });

  it('should work set signal / ref', () => {
    const r = ref(1);
    // @ts-ignore
    r.value = signal(2);
    expect(r.value).toBe(2);

    // @ts-ignore
    r.value = ref(3);
    expect(r.value).toBe(3);
  });

  it('clears its DIRTY flag once read so dependents are not forced to recompute', () => {
    // Regression (F8): RefImpl.get value used to skip DIRTY clearing, leaving a
    // ref MUTABLE|DIRTY forever after its first write. checkDirty() then treated
    // it as perpetually dirty and forced dependent computeds to recompute even
    // when nothing relevant changed.
    const r = ref(1);
    // Freshly created (no write yet): not dirty.
    expect((r as any).flag & ReactiveFlags.DIRTY).toBe(0);

    r.value = 2;
    // A write sets DIRTY so pending dependents are validated.
    expect((r as any).flag & ReactiveFlags.DIRTY).toBe(ReactiveFlags.DIRTY);

    // Reading the ref must clear DIRTY again — otherwise it stays dirty forever.
    void r.value;
    expect((r as any).flag & ReactiveFlags.DIRTY).toBe(0);

    // Writing the same value must not re-dirty it.
    r.value = 2;
    void r.value;
    expect((r as any).flag & ReactiveFlags.DIRTY).toBe(0);
  });
});
