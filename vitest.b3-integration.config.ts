import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/b3-integration/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@atlas/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@atlas/import-engine': path.resolve(__dirname, 'packages/import-engine/src/index.ts'),
      '@atlas/b3-integration': path.resolve(__dirname, 'packages/b3-integration/src/index.ts'),
    },
  },
});
