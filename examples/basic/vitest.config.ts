import { defineConfig } from 'vitest/config';
import Inspect from 'vite-plugin-inspect';
import essor from 'unplugin-essor/vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  plugins: [Inspect(), essor({ ssg: true })],
});
