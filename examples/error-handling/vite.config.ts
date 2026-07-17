import { defineConfig } from 'vite';
import essor from 'unplugin-essor/vite';

export default defineConfig({
  base: './',
  plugins: [
    essor({
      hmr: false,
      mode: 'client',
    }),
  ],
  server: process.env.E2E
    ? {
        hmr: false,
        watch: {
          ignored: ['**/*'],
        },
      }
    : undefined,
});
