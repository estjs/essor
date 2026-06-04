import { describe, expect, it } from 'vitest';
import { injectHydrationKeys } from '../src/utils';

describe('server/ssr-utils', () => {
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
