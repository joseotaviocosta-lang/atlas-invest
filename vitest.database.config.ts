import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/database/**/*.test.ts'],
    globalSetup: ['tests/database/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 180000,
    hookTimeout: 180000,
  },
  resolve: {
    alias: {
      '@atlas/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@atlas/database': path.resolve(__dirname, 'packages/database/src/index.ts'),
      '@prisma/client': path.resolve(__dirname, 'packages/database/node_modules/@prisma/client'),
    },
  },
});
