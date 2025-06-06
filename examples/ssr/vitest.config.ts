import { defineConfig } from 'vitest/config';
import Inspect from 'vite-plugin-inspect';
import Essor from '@estjs/unplugin/vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  plugins: [Inspect(), Essor()],
});
