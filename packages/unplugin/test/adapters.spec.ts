// @vitest-environment node
import { describe, expect, it } from 'vitest';
import astro from '../src/astro';
import esbuild from '../src/esbuild';
import farm from '../src/farm';
import rolldown from '../src/rolldown';
import rollup from '../src/rollup';
import { unpluginFactory } from '../src/index';

// Adapter smoke tests: every bundler entry must produce a plugin object with
// the shape its host expects, backed by the shared unpluginFactory. These do
// not run a real bundler — deep transform behavior is covered by the
// hmr-*.spec.ts suites; this file guards the thin adapter wiring
// (astro.ts / farm.ts / rolldown.ts / esbuild.ts / rollup.ts) that previously
// had zero coverage.

const OPTIONS = { hmr: false } as const;

describe('unplugin adapters', () => {
  it('factory produces a plugin with name and transform for any framework', () => {
    for (const framework of ['vite', 'rollup', 'esbuild', 'farm', 'rolldown'] as const) {
      const plugin = unpluginFactory(OPTIONS, { framework } as never);
      expect(plugin.name).toBe('unplugin-essor');
      expect(plugin.transform).toBeTypeOf('function');
    }
  });

  it('rollup adapter returns a rollup-shaped plugin', () => {
    const plugin = rollup(OPTIONS) as Record<string, unknown>;
    expect(plugin.name).toBe('unplugin-essor');
    expect(plugin.transform).toBeDefined();
  });

  it('rolldown adapter returns a rolldown-shaped plugin', () => {
    const plugin = rolldown(OPTIONS) as Record<string, unknown>;
    expect(plugin.name).toBe('unplugin-essor');
    expect(plugin.transform).toBeDefined();
  });

  it('esbuild adapter returns an esbuild plugin with a setup hook', () => {
    const plugin = esbuild(OPTIONS) as { name: string; setup: unknown };
    expect(plugin.name).toBe('unplugin-essor');
    expect(plugin.setup).toBeTypeOf('function');
  });

  it('farm adapter returns a farm-shaped plugin', () => {
    const plugin = farm(OPTIONS) as Record<string, unknown>;
    expect(plugin.name).toBe('unplugin-essor');
  });

  it('astro adapter registers the vite plugin through astro:config:setup', async () => {
    const integration = astro(OPTIONS) as {
      name: string;
      hooks: Record<string, (astro: unknown) => Promise<void>>;
    };
    expect(integration.hooks['astro:config:setup']).toBeTypeOf('function');

    const astroCtx = { config: { vite: {} as { plugins?: unknown[] } } };
    await integration.hooks['astro:config:setup'](astroCtx);
    expect(astroCtx.config.vite.plugins).toHaveLength(1);
    const [vitePlugin] = astroCtx.config.vite.plugins as Array<{ name: string }>;
    // unplugin's vite adapter may return a single plugin or an array.
    const resolved = Array.isArray(vitePlugin) ? vitePlugin[0] : vitePlugin;
    expect(resolved.name).toBe('unplugin-essor');
  });

  it('adapters transform essor JSX (rollup smoke)', async () => {
    const plugin = rollup(OPTIONS) as {
      transform: { handler?: Function } | Function;
    };
    const transform =
      typeof plugin.transform === 'function' ? plugin.transform : plugin.transform.handler!;
    const result = await transform.call(
      // Minimal plugin context: unplugin adapters call this.error on failure.
      { error: (e: unknown) => expect.fail(`transform errored: ${String(e)}`) },
      'export const App = () => <div>hi</div>;',
      '/src/App.tsx',
    );
    expect(result).toBeTruthy();
    expect(typeof result === 'string' ? result : result.code).toContain('template');
  });
});
