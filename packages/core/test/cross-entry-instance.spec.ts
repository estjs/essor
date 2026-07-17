import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
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

// These suites exercise BUILT artifacts on purpose (dist/ + server/ shims).
// In CI the build always runs before tests, so missing artifacts there mean
// the pipeline order broke — fail loudly instead of silently skipping.
// Locally, a missing build only degrades coverage: warn and skip so editing
// src/ stays testable without a rebuild (unit tests resolve src via alias).
function requireBuiltArtifacts(label: string, ok: boolean): void {
  if (ok) return;
  if (process.env.CI) {
    describe(label, () => {
      it('requires built artifacts in CI', () => {
        throw new Error(
          `${label}: dist artifacts missing — CI must run \`pnpm run build\` before tests`,
        );
      });
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[cross-entry-instance] ${label} SKIPPED: run \`pnpm run build\` to enable`);
  }
}

requireBuiltArtifacts('essor ESM cross-entry suite', built);

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
      const { renderToStringAsync, unsafeHTML } = await loadServer();
      const key = Symbol('page-data');

      // Bare component strings are escaped by default (XSS hardening);
      // hand-written raw HTML must opt in via unsafeHTML().
      const Child = () => unsafeHTML(`<i>${inject(key, 'MISSING')}</i>`);
      const html = await renderToStringAsync(() => {
        provide(key, 'SHARED');
        return Child();
      });

      expect(html).toBe('<i>SHARED</i>');
    });

    it('resolves a nested provide/inject hierarchy', async () => {
      const { provide, inject } = await loadClient();
      const { renderToStringAsync, unsafeHTML } = await loadServer();
      const themeKey = Symbol('theme');
      const userKey = Symbol('user');

      const Deep = () =>
        unsafeHTML(`<p>${inject(themeKey, 'no-theme')}:${inject(userKey, 'no-user')}</p>`);
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
      const { renderToStringAsync, unsafeHTML } = await loadServer();
      const key = Symbol('missing');
      expect(await renderToStringAsync(() => unsafeHTML(`<i>${inject(key, 'DEFAULT')}</i>`))).toBe(
        '<i>DEFAULT</i>',
      );
    });

    it('isolates scope between sequential renders (no leak across pages)', async () => {
      const { provide, inject } = await loadClient();
      const { renderToStringAsync, unsafeHTML } = await loadServer();
      const key = Symbol('isolated');

      const Reader = () => unsafeHTML(`<i>${inject(key, 'none')}</i>`);
      const WithProvider = () => {
        provide(key, 'provided');
        return Reader();
      };

      expect(await renderToStringAsync(WithProvider)).toBe('<i>provided</i>');
      expect(await renderToStringAsync(Reader)).toBe('<i>none</i>');
    });

    it('reads a signal created via essor during SSR from essor/server (shared reactivity)', async () => {
      const { signal } = await loadClient();
      const { renderToStringAsync, unsafeHTML } = await loadServer();
      const count = signal(41);
      expect(await renderToStringAsync(() => unsafeHTML(`<b>${count.value + 1}</b>`))).toBe(
        '<b>42</b>',
      );
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

// CJS variant of the same regression. tsup does not code-split CJS, so
// template.cjs and internal.cjs each inline their own copy of the template
// modules. The SSR slot providers (installed by @estjs/server through
// @estjs/template/internal) must therefore live in a cross-bundle registry
// (globalThis Symbol.for key), NOT a module variable — otherwise provide()
// writes one bundle's scope while renderToStringAsync reads the other's.
const clientEntryCjs = join(here, '../dist/essor.cjs');
const serverEntryCjs = join(here, '../server/index.cjs');
const builtCjs = existsSync(clientEntryCjs) && existsSync(serverEntryCjs);
const requireCjs = createRequire(import.meta.url);

requireBuiltArtifacts('essor CJS cross-entry suite', builtCjs);

describe.skipIf(!builtCjs)(
  'essor (CJS): provide/inject across the client / SSR boundary',
  () => {
    const loadClientCjs = () => requireCjs(clientEntryCjs) as ClientModule;
    const loadServerCjs = () => requireCjs(serverEntryCjs) as ServerModule;

    it('provide() (essor.cjs) is visible to inject() under renderToStringAsync (server .cjs)', async () => {
      const { provide, inject } = loadClientCjs();
      const { renderToStringAsync, unsafeHTML } = loadServerCjs();
      const key = Symbol('cjs-page-data');

      const Child = () => unsafeHTML(`<i>${inject(key, 'MISSING')}</i>`);
      const html = await renderToStringAsync(() => {
        provide(key, 'SHARED');
        return Child();
      });

      expect(html).toBe('<i>SHARED</i>');
    });

    it('isolates hydration keys between sequential CJS renders', async () => {
      const { renderToStringAsync } = loadServerCjs();
      // getHydrationKey is not re-exported by essor.cjs; load the template
      // CJS bundle directly (workspace sibling) — this is the bundle compiled
      // components resolve to under require().
      const templateCjs = join(here, '../../template/dist/template.cjs');
      const { getHydrationKey } = requireCjs(templateCjs) as {
        getHydrationKey: () => string;
      };

      const Page = () => `key:${getHydrationKey()}`;
      const first = await renderToStringAsync(Page);
      const second = await renderToStringAsync(Page);
      // Each request-local counter starts at 0 — no leakage across renders.
      expect(first).toBe(second);
    });
  },
);
