// @vitest-environment node
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transform } from 'esbuild';
import { rollup } from 'rollup';
import unplugin, { unpluginFactory } from '../src/index';

const fixtures = import.meta.glob('./fixtures/*.tsx');

describe('hMR - Rollup Platform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should work with rollup', async () => {
    for (const path of Object.keys(fixtures)) {
      const entry = join(__dirname, path);

      const bundle = await rollup({
        input: entry,
        plugins: [
          unplugin.rollup({
            hmr: true,
          }),
          {
            name: 'esbuild-transform',
            async transform(code, id) {
              if (id.endsWith('.tsx') || id.endsWith('.ts')) {
                const result = await transform(code, { loader: 'tsx' });
                return result.code;
              }
            },
          },
        ],
        external: ['essor'],
      });

      const { output } = await bundle.generate({
        format: 'es',
        exports: 'auto',
      });

      const code = output[0].code;

      expect(code).toContain('createHMRComponent');
      expect(code).toMatchSnapshot();
    }
  });
});

// ---------------------------------------------------------------------------
// Hot-global selection — verify each bundler gets the right hot expression
// ---------------------------------------------------------------------------

const inlineFixture = `
  import { createApp } from 'essor';

  function App() {
    return <main>hello</main>;
  }

  createApp(App, '#root');
`;
const inlineId = join(__dirname, 'fixtures/inline-hot-global.tsx');

function transformWith(framework: string, nodeEnv = 'development') {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  try {
    const plugin = unpluginFactory({ hmr: true }, { framework } as never) as any;
    // Trigger vite configResolved so isProd is set correctly
    if (framework === 'vite') {
      const command = nodeEnv === 'production' ? 'build' : 'serve';
      plugin.vite?.configResolved?.({ command });
    }
    const result = plugin.transform?.call({}, inlineFixture, inlineId);
    return typeof result === 'string' ? result : (result?.code ?? '');
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
}

describe('hMR hot-global expression per bundler', () => {
  it('vite uses import.meta.hot', () => {
    const code = transformWith('vite');
    expect(code).toContain('import.meta.hot');
    expect(code).not.toContain('import.meta.webpackHot');
  });

  it('rspack uses import.meta.webpackHot, not import.meta.hot', () => {
    const code = transformWith('rspack');
    expect(code).toContain('import.meta.webpackHot');
    // the guard and hmrAccept call must reference webpackHot
    expect(code).toContain('if (import.meta.webpackHot)');
    expect(code).toContain('__$hmrAccept$__("rspack", import.meta.webpackHot');
    // must NOT fall back to the vite guard
    expect(code).not.toContain('if (import.meta.hot)');
  });

  it('webpack (webpack5) uses import.meta.webpackHot, not import.meta.hot', () => {
    const code = transformWith('webpack');
    expect(code).toContain('import.meta.webpackHot');
    expect(code).toContain('if (import.meta.webpackHot)');
    expect(code).toContain('__$hmrAccept$__("webpack5", import.meta.webpackHot');
    expect(code).not.toContain('if (import.meta.hot)');
  });

  it('rollup (standard fallback) uses import.meta.hot', () => {
    const code = transformWith('rollup');
    expect(code).toContain('import.meta.hot');
    expect(code).not.toContain('import.meta.webpackHot');
  });

  it('esbuild uses import.meta.hot', () => {
    const code = transformWith('esbuild');
    expect(code).toContain('import.meta.hot');
    expect(code).not.toContain('import.meta.webpackHot');
  });

  it('production mode suppresses HMR code', () => {
    const code = transformWith('vite', 'production');
    expect(code).not.toContain('__$hmrAccept$__');
    expect(code).not.toContain('__$createHMRComponent$__');
    expect(code).not.toContain('__$registry$__');
  });
});
