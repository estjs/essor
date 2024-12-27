import process from 'node:process';
import { defineConfig } from 'tsup';

import pkg from './package.json';

const env = process.env.NODE_ENV;
const banner = `/**
* ${pkg.name} v${pkg.version}
* (c) 2023-Present jiangxd <jiangxd2016@gmail.com>
* @license MIT
**/`;

export default defineConfig({
  entryPoints: {
    template: './src/index.ts',
  },
  outDir: 'dist',
  format: ['cjs', 'esm'],
  target: 'es2015',
  dts: true,
  shims: true,
  clean: true,
  banner: {
    js: banner,
  },
  treeshake: true,
  cjsInterop: true,
  sourcemap: false,
  minify: env === 'production' ? true : false,
  tsconfig: '../../tsconfig.build.json',
  external: ['csstype', '@aube/shared', '@aube/signal'],
  define: {
    __DEV__: env !== 'production' ? 'true' : 'false',
  },
  outExtension({ format }) {
    return {
      js: `${env !== 'production' ? '.dev' : ''}.${format}.js`,
    };
  },
});
