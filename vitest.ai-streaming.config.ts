import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/ai-streaming/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@atlas/ai-engine': path.resolve(__dirname, 'packages/ai-engine/src/index.ts'),
      '@atlas/portfolio-intelligence': path.resolve(
        __dirname,
        'packages/portfolio-intelligence/src/index.ts',
      ),
      '@atlas/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@atlas/ui': path.resolve(__dirname, 'packages/ui/src/index.ts'),
    },
  },
});

