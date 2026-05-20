import process from 'node:process';
import { defineConfig } from 'tsup';

const env = process.env.NODE_ENV;
const isDev = env !== 'production';
export default defineConfig({
  entryPoints: {
    shared: './src/index.ts',
  },
  outDir: 'dist',
  format: ['cjs', 'esm'],
  target: 'es2016',
  dts: true,
  shims: true,
  clean: true,
  tsconfig: './tsconfig.json',
  splitting: false,
  sourcemap: isDev,
  cjsInterop: true,
  minify: !isDev,
  treeshake: true,
  define: {
    __DEV__: isDev ? 'true' : 'false',
  },
  outExtension({ format }) {
    return {
      js: `${isDev ? '.dev' : ''}.${format}.js`,
    };
  },
});
