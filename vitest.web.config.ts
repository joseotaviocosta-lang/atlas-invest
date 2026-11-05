import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/web/**/*.test.ts', 'tests/web/**/*.test.tsx'],
    setupFiles: ['./tests/web/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/web/src'),
      '@tanstack/react-query': path.resolve(__dirname, 'apps/web/node_modules/@tanstack/react-query'),
      '@atlas/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@atlas/ui': path.resolve(__dirname, 'packages/ui/src/index.ts'),
      '@atlas/validation': path.resolve(__dirname, 'packages/validation/src/index.ts'),
      '@atlas/api-client': path.resolve(__dirname, 'packages/api-client/src/index.ts'),
    },
  },
});
