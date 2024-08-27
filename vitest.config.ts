import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEV__: true,
    __BROWSER__: true,
  },
  test: {
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      include: ['**/src/**'],
      exclude: [
        '**/scripts/**',
        '**/unplugin/**',
        '**/playground/**',
        '**/examples/**',
        '**/*.d.ts',
        '**/index.ts',
        '**/test/**',
        '**/warning.ts',
        '**/node_modules/**',
        '**/e2e/**',
        '**/dist/**',
      ],
    },
    globals: true,
    environment: 'jsdom',
    watch: false,
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
});
