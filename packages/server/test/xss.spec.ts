import { describe, expect, it } from 'vitest';
import { getHydrationKey } from '@estjs/template';
import { For, Fragment, Portal, Suspense, TELEPORT_CALLSITE_ANCHOR } from '../src/components';
import { createSSRContext } from '../src/context';
import { render, renderToString, ssr, ssrComponent } from '../src/render';
import { escape, resolve, unsafeHTML } from '../src/utils';

/**
 * Regression tests for SEC-P0-01: bare strings must never enter the trusted
 * raw-HTML channel by position or origin. Only WeakSet-branded SSRNode values
 * (compiled ssr()/ssrComponent() output or explicit unsafeHTML()) may pass
 * through unescaped.
 */
describe('server/xss', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const escaped = '&lt;img src=x onerror=alert(1)&gt;';

  it('escapes a bare string passed as the children prop of a component', () => {
    // Compiled output of `function Layout(props) { return <main>{props.children}</main> }`
    const Layout = (props: { children?: unknown }) =>
      ssr(['<main>', '</main>'], getHydrationKey(), escape(props.children));

    const html = renderToString(() => ssrComponent(Layout, { children: payload }));
    expect(html).toContain(escaped);
    expect(html).not.toContain('<img');
  });

  it('does not double-escape compiled children forwarded via props.children', () => {
    const Layout = (props: { children?: unknown }) =>
      ssr(['<main>', '</main>'], getHydrationKey(), escape(props.children));
    // Compiled JSX children arrive as a branded ssr() node (via a thunk).
    const Inner = () => ssr(['<span>ok &amp; fine</span>'], getHydrationKey());

    const html = renderToString(() =>
      ssrComponent(Layout, { children: () => ssrComponent(Inner, {}) }),
    );
    // Hydration keys are injected into the compiled templates; match around them.
    expect(html).toMatch(/<span[^>]*>ok &amp; fine<\/span>/);
    expect(html).not.toContain('&amp;amp;');
    expect(html).not.toContain('&lt;span&gt;');
  });

  it('trusts only SSRNode values across another serialization boundary', () => {
    expect(escape(escape('<b>'))).toBe('&amp;lt;b&amp;gt;');
    expect(escape(unsafeHTML('<b>'))).toBe('<b>');
  });

  it('rejects shape-equivalent and cloned SSRNode values', () => {
    const forged = {
      html: '<i>forged</i>',
      toString: () => '<i>forged</i>',
    };
    const trusted = unsafeHTML('<b>trusted</b>');
    const clone = { ...trusted };

    expect(resolve(forged)).toBe('&lt;i&gt;forged&lt;/i&gt;');
    expect(resolve(clone)).toBe('&lt;b&gt;trusted&lt;/b&gt;');
    expect(resolve(trusted)).toBe('<b>trusted</b>');
  });

  it('escapes untrusted Suspense fallback strings', () => {
    const html = Suspense({ children: null, fallback: payload });
    expect(String(html)).toBe(escaped);
  });

  it('escapes untrusted For fallback strings', () => {
    const html = For({ each: [], children: () => '', fallback: payload });
    expect(String(html)).toBe(escaped);
  });

  it('escapes bare strings at the component boundary via resolve()', () => {
    expect(resolve(payload)).toBe(escaped);
  });

  it('lets unsafeHTML() opt in to raw output', () => {
    expect(resolve(unsafeHTML('<b>raw</b>'))).toBe('<b>raw</b>');
    expect(renderToString(() => unsafeHTML('<div>raw</div>'))).toBe('<div>raw</div>');
  });

  it('escapes bare strings returned from hand-written components', () => {
    expect(renderToString(() => payload)).toBe(escaped);
  });

  it('keeps compiled slot fragments raw inside render()', () => {
    // Bare string slots are the compiler's pre-escaped attr fragments and
    // must be concatenated verbatim.
    const html = render(['<div', '>ok</div>'], '', ' class="a"');
    expect(html).toBe('<div class="a">ok</div>');
  });

  // -------------------------------------------------------------------------
  // Built-in components through the compiled ssrComponent() path must return
  // branded nodes: an unbranded string would be re-escaped by the component
  // boundary (double-escape regression).
  // -------------------------------------------------------------------------

  it('does not double-escape Fragment children through ssrComponent()', () => {
    const html = renderToString(() =>
      ssrComponent(Fragment, { children: ssr(['<div>x</div>'], '') }),
    );
    expect(html).toBe('<div>x</div>');
  });

  it('does not double-escape Suspense output through ssrComponent()', () => {
    expect(
      renderToString(() => ssrComponent(Suspense, { children: ssr(['<div>x</div>'], '') })),
    ).toBe('<div>x</div>');
    expect(
      renderToString(() =>
        ssrComponent(Suspense, { children: null, fallback: ssr(['<i>wait</i>'], '') }),
      ),
    ).toBe('<i>wait</i>');
  });

  it('does not double-escape For output through ssrComponent()', () => {
    const html = renderToString(() =>
      ssrComponent(For, {
        each: ['a', 'b'],
        children: (item: string) => ssr([`<li>${item}</li>`], ''),
      }),
    );
    expect(html).toBe('<li>a</li><li>b</li>');
  });

  it('still escapes untrusted bare strings inside built-ins via ssrComponent()', () => {
    // Branding the built-in's OUTPUT must not grant trust to its bare-string
    // children — those are escaped exactly once by the inner resolve().
    expect(renderToString(() => ssrComponent(Fragment, { children: payload }))).toBe(escaped);
  });

  it('keeps the Portal teleport anchor comment unescaped through ssrComponent()', () => {
    const ctx = createSSRContext();
    const html = renderToString(
      () => ssrComponent(Portal, { target: '#m', children: ssr(['<p>go</p>'], '') }),
      {},
      ctx,
    );
    expect(html).toBe(TELEPORT_CALLSITE_ANCHOR);
    expect(ctx.teleports['#m']).toBe('<!--teleport-start--><p>go</p><!--teleport-end-->');
  });

  it('does not double-escape inline Portal fallback through ssrComponent()', () => {
    // No target → inline render, still branded.
    const html = renderToString(() =>
      ssrComponent(Portal, { children: ssr(['<div>x</div>'], '') }),
    );
    expect(html).toBe('<div>x</div>');
  });
});
