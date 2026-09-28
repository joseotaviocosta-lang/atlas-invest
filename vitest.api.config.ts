import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/api/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@atlas/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@atlas/database': path.resolve(__dirname, 'packages/database/src/index.ts'),
      '@atlas/validation': path.resolve(__dirname, 'packages/validation/src/index.ts'),
      '@atlas/logger': path.resolve(__dirname, 'packages/logger/src/index.ts'),
      '@atlas/portfolio-engine': path.resolve(__dirname, 'packages/portfolio-engine/src/index.ts'),
      '@atlas/market-data': path.resolve(__dirname, 'packages/market-data/src/index.ts'),
      '@atlas/valuation-engine': path.resolve(__dirname, 'packages/valuation-engine/src/index.ts'),
      '@atlas/portfolio-intelligence': path.resolve(
        __dirname,
        'packages/portfolio-intelligence/src/index.ts',
      ),
      '@atlas/ai-engine': path.resolve(__dirname, 'packages/ai-engine/src/index.ts'),
      '@atlas/tax-engine': path.resolve(__dirname, 'packages/tax-engine/src/index.ts'),
      '@prisma/client': path.resolve(__dirname, 'packages/database/node_modules/@prisma/client'),
    },
  },
});
