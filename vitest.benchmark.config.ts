import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/benchmark/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@atlas/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@atlas/benchmark-engine': path.resolve(__dirname, 'packages/benchmark-engine/src/index.ts'),
      '@atlas/database': path.resolve(__dirname, 'packages/database/src/index.ts'),
      '@atlas/market-data': path.resolve(__dirname, 'packages/market-data/src/index.ts'),
      '@atlas/portfolio-engine': path.resolve(__dirname, 'packages/portfolio-engine/src/index.ts'),
      '@atlas/performance-engine': path.resolve(
        __dirname,
        'packages/performance-engine/src/index.ts',
      ),
      '@atlas/valuation-engine': path.resolve(__dirname, 'packages/valuation-engine/src/index.ts'),
    },
  },
});
