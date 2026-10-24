import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/portfolio-strategy/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@atlas/portfolio-strategy': path.resolve(
        __dirname,
        'packages/portfolio-strategy/src/index.ts',
      ),
    },
  },
});
