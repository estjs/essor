import { describe, expect, it } from 'vitest';
import { omitProps, shallowCompare } from '../src/utils';

describe('template utils', () => {
  describe('shallowCompare', () => {
    it('returns true for the same reference', () => {
      const value = { a: 1 };
      expect(shallowCompare(value, value)).toBe(true);
    });

    it('returns false for array/object mismatches and missing keys', () => {
      expect(shallowCompare([], {})).toBe(false);
      expect(shallowCompare({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      expect(shallowCompare({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    });

    it('returns false when shallow values differ', () => {
      expect(shallowCompare({ a: 1 }, { a: 2 })).toBe(false);
      expect(shallowCompare(['a', 'b'], ['a', 'c'])).toBe(false);
    });

    it('returns true for shallow-equal arrays and objects', () => {
      expect(shallowCompare({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true);
      expect(shallowCompare(['a', 'b'], ['a', 'b'])).toBe(true);
    });

    it('returns true for prototype-backed objects with matching inherited enumerable keys', () => {
      const proto = { inherited: 1 };
      const a = Object.create(proto);
      const b = Object.create(proto);

      expect(shallowCompare(a, b)).toBe(true);
    });
  });

  describe('omitProps', () => {
    it('hides excluded keys from reads, "in", and Object.keys', () => {
      const source = { keep: 1, omit: 2, extra: 3 };
      const proxy = omitProps(source, ['omit']);

      expect(proxy.keep).toBe(1);
      expect((proxy as any).omit).toBeUndefined();
      expect('keep' in proxy).toBe(true);
      expect('omit' in proxy).toBe(false);
      expect(Object.keys(proxy)).toEqual(['keep', 'extra']);
    });

    it('hides descriptors for excluded keys while preserving visible ones', () => {
      const source = Object.create(null, {
        keep: {
          enumerable: true,
          configurable: true,
          value: 'visible',
        },
        omit: {
          enumerable: true,
          configurable: true,
          value: 'hidden',
        },
      });

      const proxy = omitProps(source, ['omit']);

      expect(Object.getOwnPropertyDescriptor(proxy, 'keep')?.value).toBe('visible');
      expect(Object.getOwnPropertyDescriptor(proxy, 'omit')).toBeUndefined();
    });
  });
});
