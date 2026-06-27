import { describe, expect, it, vi } from 'vitest';
import { getHydrationKey } from '@estjs/template';
import { For } from '../src/components';
import { createSSRComponent, render, renderToString, ssr, ssrComponent } from '../src/render';
import { escape } from '../src/utils';

describe('server/render', () => {
  describe('renderToString', () => {
    it('renders component to string', () => {
      const Component = () => '<div>hello</div>';
      expect(renderToString(Component)).toBe('<div>hello</div>');
    });

    it('passes props to component', () => {
      const Component = (props: any) => `<div>${props.msg}</div>`;
      expect(renderToString(Component, { msg: 'hello' })).toBe('<div>hello</div>');
    });

    it('keeps raw HTML returned by components untouched', () => {
      const Component = () => '<div><strong>safe</strong></div>';
      expect(renderToString(Component)).toBe('<div><strong>safe</strong></div>');
    });

    it('resets hydration key before render', () => {
      const Component = () => {
        return `<div data-hk="${getHydrationKey()}"></div>`;
      };
      // First render
      expect(renderToString(Component)).toBe('<div data-hk="0"></div>');
      // Second render should reset key and start from 0
      expect(renderToString(Component)).toBe('<div data-hk="0"></div>');
    });

    it('returns empty string and logs error if component is not a function', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // @ts-ignore
      expect(renderToString(null)).toBe('');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('createSSRComponent', () => {
    it('creates ssg component string', () => {
      const Component = () => '<div>hello</div>';
      expect(createSSRComponent(Component)).toBe('<div>hello</div>');
    });

    it('passes props', () => {
      const Component = (props: any) => `<div>${props.msg}</div>`;
      expect(createSSRComponent(Component, { msg: 'hello' })).toBe('<div>hello</div>');
    });

    it('returns empty string and logs error if component is not a function', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // @ts-ignore
      expect(createSSRComponent(null)).toBe('');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('render', () => {
    it('interpolates templates and components', () => {
      const templates = ['<div>', '<span>', '</span>', '</div>'];
      const comp1 = 'hello';
      const comp2 = 'world';
      const comp3 = '!';

      const result = render(templates, '0', comp1, comp2, comp3);
      expect(result).toBe('<div data-hk="0">hello<span>world</span>!</div>');
    });

    it('handles missing components', () => {
      const templates = ['<div>', '</div>'];
      const result = render(templates, '0');
      expect(result).toBe('<div data-hk="0"></div>');
    });

    it('concatenates pre-serialized slot strings verbatim (no re-escaping)', () => {
      // render() does NOT escape — the compiler wraps child-text slots in
      // escape() and attribute slots in ssrAttr(), so slot strings are already
      // final. A nested render()/component result is likewise already-safe HTML.
      const templates = ['<div>', '</div>'];
      const result = render(templates, '0', '<span>safe</span>');
      expect(result).toBe('<div data-hk="0"><span>safe</span></div>');
    });

    it('escapes untrusted child text via escape() at the slot position', () => {
      // This mirrors what the babel server codegen emits for `<div>{expr}</div>`:
      // the slot is `escape(expr)`, not the bare expression.
      const templates = ['<div>', '</div>'];
      const result = render(templates, '0', escape('<img src=x onerror=1>'));
      expect(result).toBe('<div data-hk="0">&lt;img src=x onerror=1&gt;</div>');
    });

    it('keeps For callback JSX output raw on the server', () => {
      const result = render(
        ['<div>', '</div>'],
        '',
        For({
          each: ['one', 'two'],
          children: (item) => render(['<span>', '</span>'], '', item),
        }),
      );

      expect(result).toBe('<div><span>one</span><span>two</span></div>');
      expect(result).not.toContain('&lt;span&gt;');
    });

    it('lets compiler SSR nodes pass through child escape while escaping plain strings', () => {
      const safe = ssr(['<span>', '</span>'], '', escape('<ok>'));

      expect(escape(safe)).toBe('<span>&lt;ok&gt;</span>');
      expect(escape('<span>unsafe</span>')).toBe('&lt;span&gt;unsafe&lt;/span&gt;');
    });

    it('keeps public SSR helpers string-compatible', () => {
      const Component = () => ssr(['<em>safe</em>'], '');

      expect(render(['<div>', '</div>'], '', ssr(['<span>safe</span>'], ''))).toBe(
        '<div><span>safe</span></div>',
      );
      expect(createSSRComponent(Component)).toBe('<em>safe</em>');
      expect(String(ssrComponent(Component))).toBe('<em>safe</em>');
    });
  });
});
