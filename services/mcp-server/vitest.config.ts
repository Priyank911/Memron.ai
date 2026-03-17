import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/__tests__/**'],
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@memron/analysis-engine': '../../packages/analysis-engine/src',
      '@memron/shared-types': '../../packages/shared-types/src',
    },
  },
});
