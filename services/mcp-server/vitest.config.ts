import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

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
    env: {
      ENCRYPTION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long',
    },
  },
  resolve: {
    alias: {
      '@memron/analysis-engine': resolve(__dirname, '../../packages/analysis-engine/src/index.ts'),
      '@memron/shared-types': resolve(__dirname, '../../packages/shared-types/src/index.ts'),
    },
  },
});
