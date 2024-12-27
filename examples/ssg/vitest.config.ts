import { defineConfig } from 'vitest/config';
import Inspect from 'vite-plugin-inspect';
import aube from 'unplugin-aube/vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  plugins: [Inspect(), aube()],
});
