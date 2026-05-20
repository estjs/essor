import process from 'node:process';
import { defineConfig } from 'tsup';

const env = process.env.NODE_ENV;
const isDev = env !== 'production';

export default defineConfig({
  entryPoints: {
    signals: './src/index.ts',
  },
  outDir: 'dist',
  format: ['cjs', 'esm'],
  target: 'es2016',
  dts: true,
  shims: true,
  clean: true,
  treeshake: true,
  cjsInterop: true,
  sourcemap: false,
  minify: !isDev,
  tsconfig: './tsconfig.json',
  external: ['@estjs/shared'],
  define: {
    __DEV__: isDev ? 'true' : 'false',
  },
  outExtension({ format }) {
    return {
      js: `${isDev ? '.dev' : ''}.${format}.js`,
    };
  },
});
