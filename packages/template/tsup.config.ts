import process from 'node:process';
import { defineConfig } from 'tsup';

const env = process.env.NODE_ENV;
const isDev = env !== 'production';

export default defineConfig({
  entryPoints: {
    template: './src/index.ts',
  },
  outDir: 'dist',
  format: ['cjs', 'esm'],
  target: 'es2016',
  dts: true,
  shims: true,
  clean: true,
  treeshake: true,
  cjsInterop: true,
  sourcemap: isDev,
  minify: !isDev,
  tsconfig: '../../tsconfig.build.json',
  external: ['csstype', '@estjs/shared', '@estjs/signals'],
  define: {
    __DEV__: isDev ? 'true' : 'false',
  },
  outExtension({ format }) {
    return {
      js: `${env !== 'production' ? '.dev' : ''}.${format}.js`,
    };
  },
});
