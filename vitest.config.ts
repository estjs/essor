import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEV__: JSON.stringify(true),
    __BROWSER__: JSON.stringify(true),
    __VERSION__: JSON.stringify('0.0.0'),
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Only include actual source files; e2e and scripts are excluded explicitly.
      include: ['packages/*/src/**'],
      exclude: [
        '**/scripts/**',
        '**/unplugin/**',
        '**/benchmark/**',
        '**/playground/**',
        '**/examples/**',
        '**/*.d.ts',
        '**/node_modules/**',
        '**/e2e/**',
        '**/dist/**',
        '**/version.ts',
      ],
    },
    globals: true,
    environment: 'jsdom',
    watch: false,
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
});
