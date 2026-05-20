import { describe, expect, it } from 'vitest';
import {
  injectHydrationKeys,
  toEscapedHtmlString,
  toRawHtmlString,
  markAsRawHtml,
} from '../src/utils';

describe('server/ssr-utils', () => {
  describe('toRawHtmlString', () => {
    it('converts string', () => {
      expect(toRawHtmlString('hello')).toBe('hello');
    });

    it('converts number', () => {
      expect(toRawHtmlString(123)).toBe('123');
    });

    it('converts array', () => {
      expect(toRawHtmlString(['a', 'b'])).toBe('ab');
    });

    it('converts nested array', () => {
      expect(toRawHtmlString(['a', ['b', 'c']])).toBe('abc');
    });

    it('converts function result', () => {
      expect(toRawHtmlString(() => 'hello')).toBe('hello');
    });

    it('returns empty string for null/undefined', () => {
      expect(toRawHtmlString(null)).toBe('');
      expect(toRawHtmlString(undefined)).toBe('');
    });

    it('preserves marked safe HTML', () => {
      const html = markAsRawHtml('<span>safe</span>');

      expect(toRawHtmlString(html)).toBe('<span>safe</span>');
      expect(toRawHtmlString(markAsRawHtml(html))).toBe('<span>safe</span>');
    });
  });

  describe('toEscapedHtmlString', () => {
    it('escapes strings used as text children', () => {
      expect(toEscapedHtmlString('<div>hello</div>')).toBe('&lt;div&gt;hello&lt;/div&gt;');
    });

    it('escapes nested arrays and function results used as text children', () => {
      expect(toEscapedHtmlString(['a', () => '<b>', ['&']])).toBe('a&lt;b&gt;&amp;');
    });

    it('returns empty string for falsey non-text child values', () => {
      expect(toEscapedHtmlString(false)).toBe('');
      expect(toEscapedHtmlString(null)).toBe('');
      expect(toEscapedHtmlString(undefined)).toBe('');
    });

    it('preserves marked safe HTML while still escaping normal text', () => {
      expect(toEscapedHtmlString(markAsRawHtml('<span>safe</span>'))).toBe('<span>safe</span>');
      expect(toEscapedHtmlString(['before ', markAsRawHtml('<b>bold</b>'), ' <after>'])).toBe(
        'before <b>bold</b> &lt;after&gt;',
      );
      expect(toEscapedHtmlString(markAsRawHtml(false))).toBe('');
    });
  });

  describe('injectHydrationKeys', () => {
    it('adds hydration id to root element', () => {
      const html = '<div>content</div>';
      expect(injectHydrationKeys(html, '1')).toBe('<div data-hk="1">content</div>');
    });

    it('preserves existing attributes', () => {
      const html = '<div class="foo">content</div>';
      expect(injectHydrationKeys(html, '1')).toBe('<div class="foo" data-hk="1">content</div>');
    });

    it('adds hydration id to self-closing root elements without corrupting markup', () => {
      const html = '<img src="x"/>';
      expect(injectHydrationKeys(html, '1')).toBe('<img src="x" data-hk="1"/>');
    });

    it('prefixes internal hydration anchor attributes', () => {
      const html = '<div><span data-hk-idx="0">child</span></div>';
      expect(injectHydrationKeys(html, '1')).toBe(
        '<div data-hk="1"><span data-hk-idx="1-0">child</span></div>',
      );
    });

    it('does not rewrite user data-idx attributes', () => {
      const html = '<div><span data-idx="row" data-hk-idx="0">child</span></div>';
      expect(injectHydrationKeys(html, '1')).toBe(
        '<div data-hk="1"><span data-idx="row" data-hk-idx="1-0">child</span></div>',
      );
    });

    it('prefixes comment markers', () => {
      const html = '<div><!--0--></div>';
      expect(injectHydrationKeys(html, '1')).toBe('<div data-hk="1"><!--1-0--></div>');
    });

    it('preserves non-numeric HTML comments unchanged', () => {
      const html = '<div><!-- TODO: fix this --></div>';
      expect(injectHydrationKeys(html, '1')).toBe('<div data-hk="1"><!-- TODO: fix this --></div>');
    });
  });
});
