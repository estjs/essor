import path from 'node:path';
import { defineConfig } from 'vite';
import Inspect from 'vite-plugin-inspect';
import Essor from 'unplugin-essor/vite';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@/': `${path.resolve(import.meta.dirname, 'src')}/`,
    },
  },
  build: {
    sourcemap: true,
  },
  plugins: [Inspect(), Essor({ hmr: false })],
});
