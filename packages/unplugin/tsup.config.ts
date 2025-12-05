import { defineConfig } from 'tsup';

const env = process.env.NODE_ENV;
export default defineConfig({
  entryPoints: ['src/*.ts'],
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  format: ['cjs', 'esm'],
  target: 'es2017',
  dts: true,
  splitting: true,
  shims: true,
  cjsInterop: true,
  define: {
    __DEV__: env !== 'production' ? 'true' : 'false',
  },

  tsconfig: '../../tsconfig.build.json',
});
