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
  entryPoints: {
    essor: './src/index.ts',
    server: './src/server.ts',
  },
  outDir: 'dist',
  format: ['cjs', 'esm'],
  target: 'es2016',
  dts: true,
  shims: true,
  clean: true,
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
