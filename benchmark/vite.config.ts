import path from 'node:path';
import { defineConfig } from 'vite';
import essor from 'unplugin-essor/vite';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@/': `${path.resolve(__dirname, '/src')}/`,
    },
  },
  plugins: [essor()],
});
