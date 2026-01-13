import { describe, expect, it } from 'vitest';
import { addAttributes, convertToString, getHydrationKey, resetHydrationKey } from '../src/utils';

describe('server/ssr-utils', () => {
  describe('hydration key', () => {
    it('generates sequential keys', () => {
      resetHydrationKey();
      expect(getHydrationKey()).toBe('0');
      expect(getHydrationKey()).toBe('1');
      expect(getHydrationKey()).toBe('2');
    });

    it('resets key', () => {
      resetHydrationKey();
      getHydrationKey();
      getHydrationKey();
      resetHydrationKey();
      expect(getHydrationKey()).toBe('0');
    });
  });

  describe('convertToString', () => {
    it('converts string', () => {
      expect(convertToString('hello')).toBe('hello');
    });

    it('converts number', () => {
      expect(convertToString(123)).toBe('123');
    });

    it('converts array', () => {
      expect(convertToString(['a', 'b'])).toBe('ab');
    });

    it('converts nested array', () => {
      expect(convertToString(['a', ['b', 'c']])).toBe('abc');
    });

    it('converts function result', () => {
      expect(convertToString(() => 'hello')).toBe('hello');
    });

    it('returns empty string for null/undefined', () => {
      expect(convertToString(null)).toBe('');
      expect(convertToString(undefined)).toBe('');
    });
  });

  describe('addAttributes', () => {
    it('adds hydration id to root element', () => {
      const html = '<div>content</div>';
      expect(addAttributes(html, '1')).toBe('<div data-hk="1">content</div>');
    });

    it('preserves existing attributes', () => {
      const html = '<div class="foo">content</div>';
      expect(addAttributes(html, '1')).toBe('<div class="foo" data-hk="1">content</div>');
    });

    it('prefixes data-idx attributes', () => {
      const html = '<div><span data-idx="0">child</span></div>';
      expect(addAttributes(html, '1')).toBe(
        '<div data-hk="1"><span data-idx="1-0">child</span></div>',
      );
    });

    it('prefixes comment markers', () => {
      const html = '<div><!--0--></div>';
      expect(addAttributes(html, '1')).toBe('<div data-hk="1"><!--1-0--></div>');
    });
  });
});
