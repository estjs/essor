import { defineConfig } from 'tsup';

export default defineConfig({
  entryPoints: ['src/*.ts'],
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  format: ['cjs', 'esm'],
  target: 'es2015',
  dts: true,

  shims: true,
  onSuccess: 'npm run build:fix',
  tsconfig: '../../tsconfig.build.json',
});
