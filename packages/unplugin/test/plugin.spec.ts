// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { unpluginFactory } from '../src/index';
import type { Options } from '../src/types';

const source = `
  import { createApp } from 'essor'
  function Card() { return <article>card</article> }
  function App() { return <Card /> }
  createApp(App, '#app')
`;

function plugin(options: Options = {}, framework = 'vite') {
  return unpluginFactory(options, { framework } as never) as any;
}

function transform(
  code = source,
  id = '/workspace/App.tsx',
  options: Options = {},
  framework = 'vite',
) {
  const current = process.env.NODE_ENV;
  delete process.env.NODE_ENV;
  try {
    return plugin(options, framework).transform(code, id) as any;
  } finally {
    if (current === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = current;
  }
}

describe('unplugin factory', () => {
  it('exposes the plugin lifecycle for a supported framework', () => {
    const result = plugin();

    expect(result.name).toBe('unplugin-essor');
    expect(result.resolveId('virtual:essor-hmr')).toBe('\0virtual:essor-hmr');
    expect(result.resolveId('unrelated')).toBeNull();
    expect(result.load('\0virtual:essor-hmr')).toEqual(
      expect.objectContaining({
        code: expect.stringContaining('export function hmrAccept'),
      }),
    );
    expect(result.load('unrelated')).toBeNull();
  });

  it('transforms TSX and returns source-map metadata in client mode', () => {
    const result = transform(source, '/workspace/App.tsx', { hmr: false });

    expect(result.code).toContain('template');
    expect(result.code).not.toContain('virtual:essor-hmr');
    expect(result.map).toEqual(
      expect.objectContaining({
        sources: [expect.stringContaining('App.tsx')],
      }),
    );
    expect(result.meta).toEqual({ ssr: false });
  });

  it('enables development HMR and selects the hot API for each bundler', () => {
    const vite = transform(source, '/workspace/App.tsx', { hmr: true }, 'vite').code;
    const webpack = transform(source, '/workspace/App.tsx', { hmr: true }, 'webpack').code;
    const rollup = transform(source, '/workspace/App.tsx', { hmr: true }, 'rollup').code;

    expect(vite).toContain('if (import.meta.hot)');
    expect(vite).toContain('import.meta.hot.accept()');
    expect(vite).toContain('__$hmrAccept$__("vite", import.meta.hot');
    expect(webpack).toContain('if (import.meta.webpackHot)');
    expect(webpack).toContain('__$hmrAccept$__("webpack5", import.meta.webpackHot');
    expect(rollup).toContain('__$hmrAccept$__("rollup", import.meta.hot');
    expect(rollup).not.toContain('import.meta.webpackHot');
  });

  it('does not emit HMR in production or when explicitly disabled', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(
        plugin({ hmr: true }, 'vite').transform(source, '/workspace/App.tsx').code,
      ).not.toContain('virtual:essor-hmr');
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }

    expect(transform(source, '/workspace/App.tsx', { hmr: false }).code).not.toContain(
      'virtual:essor-hmr',
    );
  });

  it('uses Vite command state instead of NODE_ENV', () => {
    const vite = plugin({ hmr: true }, 'vite');
    vite.vite.configResolved({ command: 'serve' });
    expect(vite.transform(source, '/workspace/App.tsx').code).toContain('import.meta.hot');

    vite.vite.configResolved({ command: 'build' });
    expect(vite.transform(source, '/workspace/App.tsx').code).not.toContain('virtual:essor-hmr');
  });

  it('skips unsupported files, excluded directories, and configured exclusions', () => {
    const configured = plugin({
      include: '**/*.tsx',
      exclude: '**/ignored/**',
    });

    expect(configured.transform(source, '/workspace/App.css')).toBeUndefined();
    expect(configured.transform(source, '/workspace/node_modules/App.tsx')).toBeUndefined();
    expect(configured.transform(source, '/workspace/dist/App.tsx')).toBeUndefined();
    expect(configured.transform(source, '/workspace/ignored/App.tsx')).toBeUndefined();
    expect(configured.transform(source, '/workspace/App.ts')).toBeUndefined();
  });

  it('marks server transforms and maps legacy modes to server or hydrate', () => {
    const server = transform(source, '/workspace/App.tsx', { mode: 'server' });
    const ssg = transform(source, '/workspace/App.tsx', { mode: 'ssg' });
    const ssr = transform(source, '/workspace/App.tsx', { mode: 'ssr' });

    expect(server.meta).toEqual({ ssr: true });
    expect(server.code).not.toContain('virtual:essor-hmr');
    expect(ssg.meta).toEqual({ ssr: true });
    expect(ssr.meta).toEqual({ ssr: false });
  });

  it('forces SSR output when the transform hook receives ssr true', () => {
    const result = plugin({ hmr: true }).transform(source, '/workspace/App.tsx', { ssr: true });

    expect(result.meta).toEqual({ ssr: true });
    expect(result.code).not.toContain('virtual:essor-hmr');
  });

  it('passes signalPrefix and compiler options through to Babel', () => {
    const result = transform(
      `function App() { const $state = 1; const _$state = 2; return <div>{$state}{_$state}</div> }`,
      '/workspace/Custom.tsx',
      { hmr: false, signalPrefix: '_' },
    );

    expect(result.code).toContain('function App');
    expect(result.code).toContain('signal');
  });

  it('configures JSX preservation for Vite and Rolldown', () => {
    const vite = plugin({}, 'vite');
    expect(vite.vite.config.call({ meta: {} })).toEqual({
      esbuild: { jsx: 'preserve' },
    });
    expect(vite.vite.config.call({ meta: { rolldownVersion: '1' } })).toEqual({
      oxc: { jsx: 'preserve' },
    });

    const rolldown = plugin({}, 'rolldown');
    const options: Record<string, unknown> = {};
    rolldown.rolldown.options(options);
    expect(options).toEqual({ transform: { jsx: 'preserve' } });
  });
});
