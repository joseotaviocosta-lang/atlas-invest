import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/portfolio-intelligence/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@atlas/portfolio-intelligence': path.resolve(
        __dirname,
        'packages/portfolio-intelligence/src/index.ts',
      ),
    },
  },
});
