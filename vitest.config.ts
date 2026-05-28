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
      include: ['**/src/**', '**/e2e/**'],
      exclude: [
        '**/scripts/**',
        '**/unplugin/**',
        '**/benchmark/**',
        '**/playground/**',
        '**/examples/**',
        '**/*.d.ts',
        '**/index.ts',
        '**/test/**',
        '**/warning.ts',
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
