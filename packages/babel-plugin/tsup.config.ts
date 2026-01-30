import process from 'node:process';
import { defineConfig } from 'tsup';

const env = process.env.NODE_ENV;
const isDev = env !== 'production';

export default defineConfig({
  entry: ['./src/index.ts'],
  outDir: 'dist',
  sourcemap: isDev,
  clean: true,
  format: ['cjs', 'esm'],
  target: 'es2016',
  dts: true,
  shims: true,
  minify: !isDev,
  treeshake: true,
  external: ['@babel/core'],
  noExternal: ['@estjs/shared'],
  tsconfig: '../../tsconfig.build.json',
  define: {
    __DEV__: `${isDev}`,
  },
});
