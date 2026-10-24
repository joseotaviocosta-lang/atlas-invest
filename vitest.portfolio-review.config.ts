import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/portfolio-review/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@atlas/portfolio-review': path.resolve(__dirname, 'packages/portfolio-review/src/index.ts'),
    },
  },
});
