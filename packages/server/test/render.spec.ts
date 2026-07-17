import { describe, expect, it, vi } from 'vitest';
import { getHydrationKey } from '@estjs/template';
import {
  For,
  Fragment,
  Portal,
  type SSRNode,
  Suspense,
  createSSRComponent,
  escape,
  render,
  renderToString,
  renderToStringAsync,
  ssr,
  ssrComponent,
  unsafeHTML,
} from '../src/index';

describe('server/render', () => {
  describe('renderToString', () => {
    it('renders component to string', () => {
      const Component = () => unsafeHTML('<div>hello</div>');
      expect(renderToString(Component)).toBe('<div>hello</div>');
    });

    it('passes props to component', () => {
      const Component = (props: any) => unsafeHTML(`<div>${props.msg}</div>`);
      expect(renderToString(Component, { msg: 'hello' })).toBe('<div>hello</div>');
    });

    it('resets hydration key before render', () => {
      const Component = () => {
        return unsafeHTML(`<div data-hk="${getHydrationKey()}"></div>`);
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

    it('throws instead of emitting [object Promise] for an async component', () => {
      const AsyncComponent = () => Promise.resolve('<div>async</div>');
      // The sync entry point cannot await - it must fail loudly rather than
      // serialize the Promise into broken HTML. Use renderToStringAsync instead.
      expect(() => renderToString(AsyncComponent as any)).toThrow(/renderToStringAsync/);
    });
  });

  describe('createSSRComponent', () => {
    it('creates ssg component string', () => {
      const Component = () => unsafeHTML('<div>hello</div>');
      expect(createSSRComponent(Component)).toBe('<div>hello</div>');
    });

    it('passes props', () => {
      const Component = (props: any) => unsafeHTML(`<div>${props.msg}</div>`);
      expect(createSSRComponent(Component, { msg: 'hello' })).toBe('<div>hello</div>');
    });

    it('returns empty string and logs error if component is not a function', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // @ts-ignore
      expect(createSSRComponent(null)).toBe('');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('throws instead of emitting [object Promise] for an async nested component', () => {
      const AsyncComponent = () => Promise.resolve('<span>async</span>');

      expect(() => createSSRComponent(AsyncComponent as any)).toThrow(/async components/);
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
          children: (item) => unsafeHTML(render(['<span>', '</span>'], '', item)),
        }),
      );

      expect(result).toBe('<div><span>one</span><span>two</span></div>');
      expect(result).not.toContain('&lt;span&gt;');
    });

    it('returns primitive strings from every public string helper', async () => {
      const Component = () => ssr(['<em>safe</em>'], '');
      const rendered: string = render(['<span>safe</span>'], '');
      const renderedSync: string = renderToString(Component);
      const renderedAsyncPromise: Promise<string> = renderToStringAsync(Component);
      const renderedAsync: string = await renderedAsyncPromise;
      const escaped: string = escape('<safe>');
      const componentHtml: string = createSSRComponent(Component);
      const values: ReadonlyArray<readonly [string, string]> = [
        [rendered, '<span>safe</span>'],
        [renderedSync, '<em>safe</em>'],
        [renderedAsync, '<em>safe</em>'],
        [escaped, '&lt;safe&gt;'],
        [componentHtml, '<em>safe</em>'],
      ];

      for (const [value, expected] of values) {
        expect(typeof value).toBe('string');
        expect(value).toBe(expected);
      }
    });

    it('returns SSRNode from every compiler-facing helper and built-in', () => {
      const Component = (): SSRNode => ssr(['<em>safe</em>'], '');
      const rawHtml: SSRNode = unsafeHTML('<strong>safe</strong>');
      const nodes: SSRNode[] = [
        ssr(['<span>safe</span>'], ''),
        ssrComponent(Component),
        rawHtml,
        Fragment({ children: rawHtml }),
        Portal({ children: rawHtml, disabled: true }),
        Suspense({ children: rawHtml }),
        For({ each: [rawHtml], children: (node) => node }),
      ];

      for (const node of nodes) {
        expect(typeof node).toBe('object');
      }
    });
  });
});
