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
    essor: './src/index.ts',
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
  noExternal: ['@estjs/shared', '@estjs/signal'],
  external: ['csstype'],
  minify: env === 'production' ? true : false,
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
