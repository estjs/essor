import process from 'node:process';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['./src/index.ts'],
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  format: ['cjs', 'esm'],
  target: 'es2015',
  dts: true,
  shims: true,
  external: ['@babel/core'],
  noExternal: ['@essor/shared'],
  tsconfig: '../../tsconfig.build.json',
  define: {
    __DEV__: `${process.env.BUILD_ENV !== 'production'}` + ``,
  },
});
