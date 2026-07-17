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

    it('keys range starts while preserving boundary markers and ordinary comments', () => {
      const html = '<div><!--@essor:start:c:0--><!--0--><!-- user --></div>';
      expect(injectHydrationKeys(html, '1')).toBe(
        '<div data-hk="1"><!--@essor:start:c:1:0--><!--1-0--><!-- user --></div>',
      );
    });

    it('keeps colon-containing root keys unambiguous in range starts', () => {
      const html = '<div><!--@essor:start:c:0--><!--0--></div>';
      expect(injectHydrationKeys(html, 'root:child')).toBe(
        '<div data-hk="root:child"><!--@essor:start:c:root:child:0--><!--root:child-0--></div>',
      );
    });

    it('does not rewrite marker-like text inside RCDATA or raw-text elements', () => {
      const html =
        '<div>' +
        '<title><!--0--> data-hk-idx="0" <!--@essor:start:c:0--></title>' +
        '<textarea><!--1--> data-hk-idx="1" <!--@essor:start:c:1--></textarea>' +
        '<style data-hk-idx="2">/* <!--2--> data-hk-idx="2" <!--@essor:start:c:2--> */</style>' +
        '<script>/* <!--3--> data-hk-idx="3" <!--@essor:start:c:3--> */</script>' +
        '<span data-hk-idx="4"><!--@essor:start:c:5--><!--5--></span>' +
        '</div>';

      const output = injectHydrationKeys(html, 'root');

      expect(output).toContain('<title><!--0--> data-hk-idx="0" <!--@essor:start:c:0--></title>');
      expect(output).toContain(
        '<textarea><!--1--> data-hk-idx="1" <!--@essor:start:c:1--></textarea>',
      );
      expect(output).toContain(
        '<style data-hk-idx="root-2">/* <!--2--> data-hk-idx="2" <!--@essor:start:c:2--> */</style>',
      );
      expect(output).toContain(
        '<script>/* <!--3--> data-hk-idx="3" <!--@essor:start:c:3--> */</script>',
      );
      expect(output).toContain(
        '<span data-hk-idx="root-4"><!--@essor:start:c:root:5--><!--root-5--></span>',
      );
    });

    it('keeps self-closing raw-text start tags in raw-text mode until their end tag', () => {
      const html = '<div><style/><!--0-->x</style><p><!--1--></p></div>';

      expect(injectHydrationKeys(html, 'root')).toBe(
        '<div data-hk="root"><style/><!--0-->x</style><p><!--root-1--></p></div>',
      );
    });

    it('rewrites only real anchor attributes while respecting tokenizer context', () => {
      const html =
        '<div><!-- <style> -->' +
        '<TITLE title=\'> data-hk-idx="0"\' xdata-hk-idx="1" data-hk-idx="2">' +
        '<!--3--></tItLe><p><!--4--></p></div>';

      expect(injectHydrationKeys(html, 'root')).toBe(
        '<div data-hk="root"><!-- <style> -->' +
          '<TITLE title=\'> data-hk-idx="0"\' xdata-hk-idx="1" data-hk-idx="root-2">' +
          '<!--3--></tItLe><p><!--root-4--></p></div>',
      );
    });
  });
});
