import process from 'node:process';
import { type Options, defineConfig } from 'tsup';
import pkg from './package.json';

const isDev = process.env.NODE_ENV !== 'production';

const banner = `/**
* ${pkg.name} v${pkg.version}
* build time ${new Date().toISOString()}
* (c) 2023-Present jiangxd <jiangxd2016@gmail.com>
* @license MIT
**/`;

const RUNTIME = ['@estjs/shared', '@estjs/template', '@estjs/signals'];

const base: Options = {
  outDir: 'dist',
  target: 'es2016',
  banner: { js: banner },
  treeshake: true,
  sourcemap: isDev,
  minify: !isDev,
  tsconfig: './tsconfig.json',
  define: { __DEV__: isDev ? 'true' : 'false' },
  splitting: false,
  esbuildOptions(options) {
    if (isDev) {
      options.conditions = ['development', ...(options.conditions ?? [])];
    }
  },
};

export default defineConfig([
  {
    ...base,
    entryPoints: { essor: './src/index.ts' },
    format: ['cjs', 'esm'],
    dts: true,
    shims: true,
    clean: true,
    cjsInterop: true,
    external: [...RUNTIME, '@estjs/server'],
    outExtension({ format }) {
      return { js: `${isDev ? '.dev' : ''}.${format === 'cjs' ? 'cjs' : 'js'}` };
    },
  },

  {
    ...base,
    entryPoints: { 'essor.browser': './src/index.ts' },
    format: ['esm'],
    dts: false,
    shims: false,
    clean: false,
    platform: 'browser',
    noExternal: RUNTIME,
    outExtension() {
      return { js: `${isDev ? '.dev' : ''}.js` };
    },
  },
]);
