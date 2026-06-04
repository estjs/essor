import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Single-file runtime regression
//
// provide/inject scope (`activeScope`) and the reactive scheduler are
// module-level state. The whole point of shipping `essor` as ONE self-contained
// file is that this state can only ever exist once: `provide` (client API) and
// `renderToStringAsync` (SSR API) are exports of the SAME module, so they share
// one `activeScope`. A regression that re-splits the runtime into two files —
// each inlining its own copy — would make `inject` read a different scope than
// `provide` wrote, surfacing downstream as athen's SSG crash:
//   "Cannot destructure property 'siteData' of 'usePageData(...)' as it is undefined".
//
// These tests import the BUILT `dist/essor.js` and assert provide→inject works
// across the client/SSR API boundary. Skipped until `dist/` is built.
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = join(here, '../dist/essor.js');
const built = existsSync(distEntry);

type EssorModule = typeof import('../src/index');
const load = async (): Promise<EssorModule> => (await import(distEntry)) as unknown as EssorModule;

describe.skipIf(!built)('essor dist: single-file provide/inject across the client/SSR boundary', () => {
  it('provide() (client API) is visible to inject() under renderToStringAsync (SSR API)', async () => {
    const { provide, inject, renderToStringAsync } = await load();
    const key = Symbol('page-data');

    const Child = () => `<i>${inject(key, 'MISSING')}</i>`;
    const html = await renderToStringAsync(() => {
      provide(key, 'SHARED');
      return Child();
    });

    expect(html).toBe('<i>SHARED</i>');
  });

  it('resolves a nested provide/inject hierarchy', async () => {
    const { provide, inject, renderToStringAsync } = await load();
    const themeKey = Symbol('theme');
    const userKey = Symbol('user');

    const Deep = () => `<p>${inject(themeKey, 'no-theme')}:${inject(userKey, 'no-user')}</p>`;
    const Middle = () => {
      provide(userKey, 'alice');
      return Deep();
    };
    const Root = () => {
      provide(themeKey, 'dark');
      return Middle();
    };

    expect(await renderToStringAsync(Root)).toBe('<p>dark:alice</p>');
  });

  it('falls back to the default when no value is provided', async () => {
    const { inject, renderToStringAsync } = await load();
    const key = Symbol('missing');
    expect(await renderToStringAsync(() => `<i>${inject(key, 'DEFAULT')}</i>`)).toBe('<i>DEFAULT</i>');
  });

  it('isolates scope between sequential renders (no leak across pages)', async () => {
    const { provide, inject, renderToStringAsync } = await load();
    const key = Symbol('isolated');

    const Reader = () => `<i>${inject(key, 'none')}</i>`;
    const WithProvider = () => {
      provide(key, 'provided');
      return Reader();
    };

    expect(await renderToStringAsync(WithProvider)).toBe('<i>provided</i>');
    expect(await renderToStringAsync(Reader)).toBe('<i>none</i>');
  });

  it('reads a signal created via the same module during SSR (shared reactivity)', async () => {
    const { signal, renderToStringAsync } = await load();
    const count = signal(41);
    expect(await renderToStringAsync(() => `<b>${count.value + 1}</b>`)).toBe('<b>42</b>');
  });

  it('exposes the SSR API on `essor/server` as the very same module instance', async () => {
    // `./server` resolves to the same dist/essor.js, so this import shares state.
    const main = await load();
    const server = await load();
    expect(server.renderToStringAsync).toBe(main.renderToStringAsync);
  });
});
