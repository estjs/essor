import process from 'node:process';
import { defineConfig } from 'tsup';
import pkg from './package.json';

const env = process.env.NODE_ENV;

const banner = `/**
* ${pkg.name} v${pkg.version}
* build time ${new Date().toISOString()}
* (c) 2023-Present jiangxd <jiangxd2016@gmail.com>
* @license MIT
**/`;

const isDev = env !== 'production';

export default defineConfig({
  // Single entry → single self-contained runtime file. Client runtime + SSR
  // renderer live in ONE module (`src/index.ts`), so there is exactly one
  // `activeScope` / reactive scheduler instance — `provide` and
  // `renderToStringAsync` can never touch different copies.
  entryPoints: {
    essor: './src/index.ts',
  },
  outDir: 'dist',
  format: ['cjs', 'esm'],
  target: 'es2016',
  dts: true,
  shims: true,
  clean: true,
  // One file, no shared chunks. Browser safety comes from the runtime itself
  // (SSR's `async_hooks` is loaded lazily via `process.getBuiltinModule`, never a
  // top-level import); `sideEffects:false` lets client builds tree-shake the SSR
  // half away.
  splitting: false,
  banner: {
    js: banner,
  },
  treeshake: true,
  cjsInterop: true,
  sourcemap: isDev,
  noExternal: ['@estjs/shared', '@estjs/template', '@estjs/signals', '@estjs/server'],
  minify: !isDev,
  tsconfig: './tsconfig.json',
  define: {
    __DEV__: isDev ? 'true' : 'false',
  },
  esbuildOptions(options) {
    if (isDev) {
      options.conditions = ['development', ...(options.conditions ?? [])];
    }
  },
  outExtension({ format }) {
    return {
      js: `${isDev ? '.dev' : ''}.${format === 'cjs' ? 'cjs' : 'js'}`,
    };
  },
});
