import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/portfolio-engine/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@atlas/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@atlas/portfolio-engine': path.resolve(__dirname, 'packages/portfolio-engine/src/index.ts'),
      '@atlas/database': path.resolve(__dirname, 'packages/database/src/index.ts'),
      '@atlas/validation': path.resolve(__dirname, 'packages/validation/src/index.ts'),
      '@atlas/logger': path.resolve(__dirname, 'packages/logger/src/index.ts'),
      '@prisma/client': path.resolve(__dirname, 'packages/database/node_modules/@prisma/client'),
    },
  },
});
