import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/ui/**/*.test.ts', 'tests/ui/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@atlas/ui': path.resolve(__dirname, 'packages/ui/src/index.ts'),
    },
  },
});
