import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/tax-intelligence/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@atlas/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@atlas/portfolio-engine': path.resolve(__dirname, 'packages/portfolio-engine/src/index.ts'),
      '@atlas/tax-intelligence': path.resolve(__dirname, 'packages/tax-intelligence/src/index.ts'),
    },
  },
});
