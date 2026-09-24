import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/benchmark/rate-benchmark.test.ts', 'tests/benchmark/cdi-provider.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@atlas/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@atlas/benchmark-engine': path.resolve(__dirname, 'packages/benchmark-engine/src/index.ts'),
    },
  },
});
