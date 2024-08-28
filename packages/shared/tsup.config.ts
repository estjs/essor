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
    'essor-shared': './src/index.ts',
  },
  banner: {
    js: banner,
  },
  outDir: 'dist',
  format: ['cjs', 'esm'],
  target: 'es2015',
  dts: true,
  shims: true,
  clean: true,
  sourcemap: true,
  cjsInterop: true,
  minify: env === 'production' ? true : false,
  tsconfig: '../../tsconfig.build.json',
});
