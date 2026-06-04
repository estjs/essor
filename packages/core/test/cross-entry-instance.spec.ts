import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Cross-entry shared-instance regression.
//
// `provide`/`inject` scope and the reactive scheduler are module-level state in
// @estjs/template / @estjs/signals. The client `essor` entry re-exports them and
// the `essor/server` shim reaches the same packages; pnpm dedupes both to one
// copy, so `provide` (essor) and `renderToStringAsync` (essor/server) share one
// scope. If either entry inlined a private runtime copy, `inject` would read a
// different scope than `provide` wrote. Tests run against the BUILT entries.

const here = dirname(fileURLToPath(import.meta.url));
const clientEntry = join(here, '../dist/essor.js');
const serverEntry = join(here, '../server/index.js');
const built = existsSync(clientEntry) && existsSync(serverEntry);

type ClientModule = typeof import('../src/index');
type ServerModule = typeof import('@estjs/server');

const loadClient = async (): Promise<ClientModule> =>
  (await import(clientEntry)) as unknown as ClientModule;
const loadServer = async (): Promise<ServerModule> =>
  (await import(serverEntry)) as unknown as ServerModule;

describe.skipIf(!built)(
  'essor: provide/inject across the client (essor) / SSR (essor/server) boundary',
  () => {
    it('provide() (from essor) is visible to inject() under renderToStringAsync (from essor/server)', async () => {
      const { provide, inject } = await loadClient();
      const { renderToStringAsync } = await loadServer();
      const key = Symbol('page-data');

      const Child = () => `<i>${inject(key, 'MISSING')}</i>`;
      const html = await renderToStringAsync(() => {
        provide(key, 'SHARED');
        return Child();
      });

      expect(html).toBe('<i>SHARED</i>');
    });

    it('resolves a nested provide/inject hierarchy', async () => {
      const { provide, inject } = await loadClient();
      const { renderToStringAsync } = await loadServer();
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
      const { inject } = await loadClient();
      const { renderToStringAsync } = await loadServer();
      const key = Symbol('missing');
      expect(await renderToStringAsync(() => `<i>${inject(key, 'DEFAULT')}</i>`)).toBe(
        '<i>DEFAULT</i>',
      );
    });

    it('isolates scope between sequential renders (no leak across pages)', async () => {
      const { provide, inject } = await loadClient();
      const { renderToStringAsync } = await loadServer();
      const key = Symbol('isolated');

      const Reader = () => `<i>${inject(key, 'none')}</i>`;
      const WithProvider = () => {
        provide(key, 'provided');
        return Reader();
      };

      expect(await renderToStringAsync(WithProvider)).toBe('<i>provided</i>');
      expect(await renderToStringAsync(Reader)).toBe('<i>none</i>');
    });

    it('reads a signal created via essor during SSR from essor/server (shared reactivity)', async () => {
      const { signal } = await loadClient();
      const { renderToStringAsync } = await loadServer();
      const count = signal(41);
      expect(await renderToStringAsync(() => `<b>${count.value + 1}</b>`)).toBe('<b>42</b>');
    });

    it('keeps essor/server an SSR-only shim (reactivity stays in essor)', async () => {
      // Reactivity is imported from `essor`, so the shim must not re-export it —
      // guards against re-fattening it into a second signals instance.
      const server = (await loadServer()) as Record<string, unknown>;
      expect(server.signal).toBeUndefined();
      expect(server.isSignal).toBeUndefined();
      expect(typeof server.renderToStringAsync).toBe('function');
    });
  },
);
