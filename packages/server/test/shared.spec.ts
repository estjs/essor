import { describe, expect, it } from 'vitest';
import { addAttributes, convertTextChildToString, convertToString } from '../src/utils';

describe('server/ssr-utils', () => {
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

  describe('convertTextChildToString', () => {
    it('escapes strings used as text children', () => {
      expect(convertTextChildToString('<div>hello</div>')).toBe('&lt;div&gt;hello&lt;/div&gt;');
    });

    it('escapes nested arrays and function results used as text children', () => {
      expect(convertTextChildToString(['a', () => '<b>', ['&']])).toBe('a&lt;b&gt;&amp;');
    });

    it('returns empty string for falsey non-text child values', () => {
      expect(convertTextChildToString(false)).toBe('');
      expect(convertTextChildToString(null)).toBe('');
      expect(convertTextChildToString(undefined)).toBe('');
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

    it('adds hydration id to self-closing root elements without corrupting markup', () => {
      const html = '<img src="x"/>';
      expect(addAttributes(html, '1')).toBe('<img src="x" data-hk="1"/>');
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
