import { describe, expect, it } from 'vitest';
import { Portal } from '../src/components';
import { createSSRContext } from '../src/context';
import { renderToString, renderToStringAsync } from '../src/render';

describe('server/components/Portal', () => {
  describe('inline fallback', () => {
    it('renders inline when no context is active', () => {
      expect(Portal({ target: '#m', children: '<div>x</div>' })).toBe('<div>x</div>');
    });

    it('renders inline when no target is provided', () => {
      const ctx = createSSRContext();
      const App = () => Portal({ children: '<p/>' });
      expect(renderToString(App, {}, ctx)).toBe('<p/>');
      expect(ctx.teleports).toEqual({});
    });

    it('renders inline when disabled is true', () => {
      const ctx = createSSRContext();
      const App = () => Portal({ target: '#m', disabled: true, children: '<p/>' });
      expect(renderToString(App, {}, ctx)).toBe('<p/>');
      expect(ctx.teleports).toEqual({});
    });

    it('emits anchors for empty children so hydration can pair them', () => {
      const ctx = createSSRContext();
      const App = () => Portal({ target: '#m', children: '' });
      expect(renderToString(App, {}, ctx)).toBe('<!--teleport-anchor-->');
      expect(ctx.teleports['#m']).toBe('<!--teleport-start--><!--teleport-end-->');
    });
  });

  describe('teleport collection', () => {
    it('collects rendered HTML into ctx.teleports keyed by target', () => {
      const ctx = createSSRContext();
      const App = () => `<main>${Portal({ target: '#modal', children: '<div>hi</div>' })}</main>`;

      const html = renderToString(App, {}, ctx);

      expect(html).toBe('<main><!--teleport-anchor--></main>');
      expect(ctx.teleports['#modal']).toBe('<!--teleport-start--><div>hi</div><!--teleport-end-->');
    });

    it('keeps multiple Portals to the same selector independently delimited', () => {
      const ctx = createSSRContext();
      const App = () =>
        `<div>${Portal({ target: '#root', children: '<a/>' })}${Portal({ target: '#root', children: '<b/>' })}</div>`;

      const html = renderToString(App, {}, ctx);

      expect(html).toBe('<div><!--teleport-anchor--><!--teleport-anchor--></div>');
      expect(ctx.teleports['#root']).toBe(
        '<!--teleport-start--><a/><!--teleport-end-->' +
          '<!--teleport-start--><b/><!--teleport-end-->',
      );
    });

    it('separates Portals with different targets', () => {
      const ctx = createSSRContext();
      const App = () =>
        `${Portal({ target: '#a', children: '<x/>' })}${Portal({ target: '#b', children: '<y/>' })}`;

      renderToString(App, {}, ctx);

      expect(ctx.teleports).toEqual({
        '#a': '<!--teleport-start--><x/><!--teleport-end-->',
        '#b': '<!--teleport-start--><y/><!--teleport-end-->',
      });
    });

    it('isolates teleports between independent renderToString calls', () => {
      const ctx1 = createSSRContext();
      const ctx2 = createSSRContext();
      const App = () => Portal({ target: '#t', children: '<div/>' });

      renderToString(App, {}, ctx1);
      renderToString(App, {}, ctx2);

      const expected = '<!--teleport-start--><div/><!--teleport-end-->';
      expect(ctx1.teleports['#t']).toBe(expected);
      expect(ctx2.teleports['#t']).toBe(expected);
      expect(ctx1.teleports).not.toBe(ctx2.teleports);
    });

    it('does not leak SSR context after render returns', () => {
      const ctx = createSSRContext();
      renderToString(() => Portal({ target: '#t', children: '<x/>' }), {}, ctx);

      expect(Portal({ target: '#t', children: '<y/>' })).toBe('<y/>');
    });
  });

  describe('async rendering', () => {
    it('collects teleports from async components', async () => {
      const ctx = createSSRContext();
      const AsyncBody = async () => {
        const data = await Promise.resolve('hello');
        return `<main>${Portal({ target: '#toast', children: `<p>${data}</p>` })}</main>`;
      };

      const html = await renderToStringAsync(AsyncBody as any, {}, ctx);

      expect(html).toBe('<main><!--teleport-anchor--></main>');
      expect(ctx.teleports['#toast']).toBe('<!--teleport-start--><p>hello</p><!--teleport-end-->');
    });
  });
});
