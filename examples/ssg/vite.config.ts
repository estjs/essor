import path from 'node:path';
import { defineConfig } from 'vite';
import Inspect from 'vite-plugin-inspect';
import essor from 'unplugin-essor/vite';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@/': `${path.resolve(__dirname, '/src')}/`,
    },
  },
  plugins: [Inspect(), essor()],
  build: {
    rollupOptions: {
      input: {
        app: 'src/app.js',
        main: 'src/main.js',
        server: 'src/server.js',
      },
      output: {
        dir: 'dist',
        format: 'es',
        exports: 'named',
        entryFileNames: '[name].js',
      },
    },
  },
});
