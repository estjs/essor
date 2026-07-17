import { describe, expect, it } from 'vitest';
import { Portal } from '../src/components';
import { createSSRContext } from '../src/context';
import { renderToString, renderToStringAsync } from '../src/render';
import { unsafeHTML } from '../src/utils';

// Portal returns a branded SSR node, so components can return it directly —
// no unsafeHTML() wrapper needed. Wrappers remain only where a test builds
// raw HTML around the Portal output in a template literal.
describe('server/components/Portal', () => {
  describe('inline fallback', () => {
    it('renders inline when no context is active', () => {
      expect(String(Portal({ target: '#m', children: unsafeHTML('<div>x</div>') }))).toBe(
        '<div>x</div>',
      );
    });

    it('renders inline when no target is provided', () => {
      const ctx = createSSRContext();
      const App = () => Portal({ children: unsafeHTML('<p/>') });
      expect(renderToString(App, {}, ctx)).toBe('<p/>');
      expect(ctx.teleports).toEqual({});
    });

    it('renders inline when disabled is true', () => {
      const ctx = createSSRContext();
      const App = () => Portal({ target: '#m', disabled: true, children: unsafeHTML('<p/>') });
      expect(renderToString(App, {}, ctx)).toBe('<p/>');
      expect(ctx.teleports).toEqual({});
    });

    it('renders inline when disabled is a getter returning true', () => {
      const ctx = createSSRContext();
      const App = () =>
        Portal({
          target: '#m',
          disabled: () => true,
          children: unsafeHTML('<p>gated</p>'),
        });
      expect(renderToString(App, {}, ctx)).toBe('<p>gated</p>');
      expect(ctx.teleports).toEqual({});
    });

    it('teleports when disabled getter returns false', () => {
      const ctx = createSSRContext();
      const App = () =>
        Portal({
          target: '#m',
          disabled: () => false,
          children: unsafeHTML('<p>go</p>'),
        });
      expect(renderToString(App, {}, ctx)).toBe('<!--teleport-anchor-->');
      expect(ctx.teleports['#m']).toBe('<!--teleport-start--><p>go</p><!--teleport-end-->');
    });

    it('emits anchors for empty children so hydration can pair them', () => {
      const ctx = createSSRContext();
      const App = () => Portal({ target: '#m', children: '' });
      expect(renderToString(App, {}, ctx)).toBe('<!--teleport-anchor-->');
      expect(ctx.teleports['#m']).toBe('<!--teleport-start--><!--teleport-end-->');
    });

    it('renders inline for nullish children without target', () => {
      expect(String(Portal({ children: null }))).toBe('');
      expect(String(Portal({ children: undefined }))).toBe('');
    });
  });

  describe('teleport collection', () => {
    it('collects rendered HTML into ctx.teleports keyed by target', () => {
      const ctx = createSSRContext();
      const App = () =>
        unsafeHTML(
          `<main>${Portal({ target: '#modal', children: unsafeHTML('<div>hi</div>') })}</main>`,
        );

      const html = renderToString(App, {}, ctx);

      expect(html).toBe('<main><!--teleport-anchor--></main>');
      expect(ctx.teleports['#modal']).toBe('<!--teleport-start--><div>hi</div><!--teleport-end-->');
    });

    it('keeps multiple Portals to the same selector independently delimited', () => {
      const ctx = createSSRContext();
      const App = () =>
        unsafeHTML(
          `<div>${Portal({ target: '#root', children: unsafeHTML('<a/>') })}${Portal({ target: '#root', children: unsafeHTML('<b/>') })}</div>`,
        );

      const html = renderToString(App, {}, ctx);

      expect(html).toBe('<div><!--teleport-anchor--><!--teleport-anchor--></div>');
      expect(ctx.teleports['#root']).toBe(
        '<!--teleport-start--><a/><!--teleport-end-->' +
          '<!--teleport-start--><b/><!--teleport-end-->',
      );
    });

    it('separates Portals with different targets', () => {
      const ctx = createSSRContext();
      const App = () => [
        Portal({ target: '#a', children: unsafeHTML('<x/>') }),
        Portal({ target: '#b', children: unsafeHTML('<y/>') }),
      ];

      renderToString(App, {}, ctx);

      expect(ctx.teleports).toEqual({
        '#a': '<!--teleport-start--><x/><!--teleport-end-->',
        '#b': '<!--teleport-start--><y/><!--teleport-end-->',
      });
    });

    it('isolates teleports between independent renderToString calls', () => {
      const ctx1 = createSSRContext();
      const ctx2 = createSSRContext();
      const App = () => Portal({ target: '#t', children: unsafeHTML('<div/>') });

      renderToString(App, {}, ctx1);
      renderToString(App, {}, ctx2);

      const expected = '<!--teleport-start--><div/><!--teleport-end-->';
      expect(ctx1.teleports['#t']).toBe(expected);
      expect(ctx2.teleports['#t']).toBe(expected);
      expect(ctx1.teleports).not.toBe(ctx2.teleports);
    });

    it('does not leak SSR context after render returns', () => {
      const ctx = createSSRContext();
      renderToString(() => Portal({ target: '#t', children: unsafeHTML('<x/>') }), {}, ctx);

      expect(String(Portal({ target: '#t', children: unsafeHTML('<y/>') }))).toBe('<y/>');
    });

    it('handles deeply nested Portal children', () => {
      const ctx = createSSRContext();
      const App = () =>
        Portal({
          target: '#deep',
          children: unsafeHTML('<div><span><em>deep</em></span></div>'),
        });
      renderToString(App, {}, ctx);
      expect(ctx.teleports['#deep']).toBe(
        '<!--teleport-start--><div><span><em>deep</em></span></div><!--teleport-end-->',
      );
    });

    it('handles children that are arrays', () => {
      const ctx = createSSRContext();
      const App = () =>
        Portal({
          target: '#arr',
          children: [unsafeHTML('<span>1</span>'), unsafeHTML('<span>2</span>')],
        });
      renderToString(App, {}, ctx);
      expect(ctx.teleports['#arr']).toBe(
        '<!--teleport-start--><span>1</span><span>2</span><!--teleport-end-->',
      );
    });

    it('handles children that are functions', () => {
      const ctx = createSSRContext();
      const App = () =>
        Portal({
          target: '#fn',
          children: (() => unsafeHTML('<b>lazy</b>')) as any,
        });
      renderToString(App, {}, ctx);
      expect(ctx.teleports['#fn']).toBe('<!--teleport-start--><b>lazy</b><!--teleport-end-->');
    });
  });

  describe('async rendering', () => {
    it('collects teleports from async components', async () => {
      const ctx = createSSRContext();
      const AsyncBody = async () => {
        const data = await Promise.resolve('hello');
        return unsafeHTML(
          `<main>${Portal({ target: '#toast', children: unsafeHTML(`<p>${data}</p>`) })}</main>`,
        );
      };

      const html = await renderToStringAsync(AsyncBody as any, {}, ctx);

      expect(html).toBe('<main><!--teleport-anchor--></main>');
      expect(ctx.teleports['#toast']).toBe('<!--teleport-start--><p>hello</p><!--teleport-end-->');
    });

    it('collects multiple teleports from async components', async () => {
      const ctx = createSSRContext();
      const AsyncBody = async () => {
        const a = await Promise.resolve('alpha');
        const b = await Promise.resolve('beta');
        return [
          Portal({ target: '#a', children: unsafeHTML(`<p>${a}</p>`) }),
          Portal({ target: '#b', children: unsafeHTML(`<p>${b}</p>`) }),
        ];
      };

      await renderToStringAsync(AsyncBody as any, {}, ctx);

      expect(ctx.teleports['#a']).toBe('<!--teleport-start--><p>alpha</p><!--teleport-end-->');
      expect(ctx.teleports['#b']).toBe('<!--teleport-start--><p>beta</p><!--teleport-end-->');
    });
  });

  describe('edge cases', () => {
    it('disabled=false with target teleports normally', () => {
      const ctx = createSSRContext();
      const App = () => Portal({ target: '#t', disabled: false, children: unsafeHTML('<ok/>') });
      expect(renderToString(App, {}, ctx)).toBe('<!--teleport-anchor-->');
      expect(ctx.teleports['#t']).toBe('<!--teleport-start--><ok/><!--teleport-end-->');
    });

    it('empty string target renders inline', () => {
      const ctx = createSSRContext();
      const App = () => Portal({ target: '', children: unsafeHTML('<inline/>') });
      expect(renderToString(App, {}, ctx)).toBe('<inline/>');
      expect(ctx.teleports).toEqual({});
    });

    it('children with numeric values are stringified', () => {
      const ctx = createSSRContext();
      const App = () => Portal({ target: '#num', children: 42 as any });
      renderToString(App, {}, ctx);
      expect(ctx.teleports['#num']).toBe('<!--teleport-start-->42<!--teleport-end-->');
    });
  });
});
