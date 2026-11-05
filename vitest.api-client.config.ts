import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    include: ['tests/api-client/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@atlas/api-client': path.resolve(__dirname, 'packages/api-client/src/index.ts'),
    },
  },
});
