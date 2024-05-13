import process from 'node:process';
import { defineConfig } from 'tsup';

const env = process.env.NODE_ENV;

export default defineConfig({
  entryPoints: {
    essor: './src/index.ts',
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
  minify: env === 'production' ? true : false,
  tsconfig: '../../tsconfig.build.json',
  noExternal: ['essor-shared'],
  external: ['csstype'],
  define: {
    __DEV__: env !== 'production' ? 'true' : 'false',
  },
  outExtension({ format }) {
    return {
      js: `${env !== 'production' ? '.dev' : ''}.${format}.js`,
    };
  },
});
