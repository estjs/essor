import path from 'node:path';
import { defineConfig } from 'vite';
import Inspect from 'vite-plugin-inspect';
import est from '@estjs/unplugin/vite';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@/': `${path.resolve(__dirname, '/src')}/`,
    },
  },
  plugins: [Inspect(), est({ mode: 'ssg' })],
});
