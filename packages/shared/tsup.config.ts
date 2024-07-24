import process from 'node:process';
import { defineConfig } from 'tsup';

const env = process.env.NODE_ENV;

export default defineConfig({
  entryPoints: {
    'essor-shared': './src/index.ts',
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
