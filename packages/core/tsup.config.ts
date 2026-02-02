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

export default defineConfig({
  entryPoints: {
    'essor-client': './src/index.client.ts',
    'essor-server': './src/index.server.ts',
  },
  outDir: 'dist',
  format: ['cjs', 'esm'],
  target: 'es2016',
  dts: true,
  shims: true,
  clean: true,
  banner: {
    js: banner,
  },
  treeshake: true,
  cjsInterop: true,
  sourcemap: true,
  noExternal: ['@estjs/shared', '@estjs/template', '@estjs/signals', '@estjs/server'],
  minify: env === 'production',
  tsconfig: '../../tsconfig.build.json',
  define: {
    __DEV__: env !== 'production' ? 'true' : 'false',
  },
  outExtension({ format }) {
    return {
      js: `${env !== 'production' ? '.dev' : ''}.${format}.js`,
    };
  },
});
