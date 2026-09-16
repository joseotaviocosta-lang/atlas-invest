import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/architecture/**/*.test.ts',
      'tests/foundation/domain-rules.test.ts',
      'tests/foundation/packages-import.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@atlas/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@atlas/ui': path.resolve(__dirname, 'packages/ui/src/index.ts'),
    },
  },
});
