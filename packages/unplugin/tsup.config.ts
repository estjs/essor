import { defineConfig } from 'tsup';
import RawPlugin from './esbuild-plugin-raw';

const env = process.env.NODE_ENV;
export default defineConfig({
  entryPoints: ['src/*.ts', '!src/*.d.ts'],
  outDir: 'dist',
  sourcemap: env !== 'production',
  clean: true,
  format: ['cjs', 'esm'],
  target: 'es2016',
  dts: true,
  splitting: true,
  shims: true,
  cjsInterop: true,
  minify: env === 'production',
  treeshake: true,
  esbuildPlugins: [RawPlugin()],
  define: {
    __DEV__: env !== 'production' ? 'true' : 'false',
  },

  tsconfig: '../../tsconfig.build.json',
});
