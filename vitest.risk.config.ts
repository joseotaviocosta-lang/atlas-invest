import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/risk/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@atlas/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@atlas/risk-engine': path.resolve(__dirname, 'packages/risk-engine/src/index.ts'),
      '@atlas/performance-engine': path.resolve(
        __dirname,
        'packages/performance-engine/src/index.ts',
      ),
    },
  },
});
