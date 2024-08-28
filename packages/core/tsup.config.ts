import process from 'node:process';
import { defineConfig } from 'tsup';

const env = process.env.NODE_ENV;

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
  treeshake: true,
  cjsInterop: true,
  sourcemap: false,
  noExternal: ['@essor/shared', '@essor/template', '@essor/signal'],
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
