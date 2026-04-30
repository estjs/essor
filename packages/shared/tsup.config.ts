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
  sourcemap: true,
  cjsInterop: true,
  minify: isDev,
  tsconfig: '../../tsconfig.build.json',
  splitting: false,
  outExtension({ format }) {
    return {
      js: `${isDev ? '.dev' : ''}.${format}.js`,
    };
  },
});
