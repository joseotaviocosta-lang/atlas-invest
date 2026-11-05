import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/app/**/*.test.ts', 'tests/app/**/*.test.tsx'],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/atlas-app/src'),
      'react': path.resolve(__dirname, 'apps/atlas-app/node_modules/react'),
      'react-dom': path.resolve(__dirname, 'apps/atlas-app/node_modules/react-dom'),
      'react-router-dom': path.resolve(__dirname, 'apps/atlas-app/node_modules/react-router-dom'),
      '@tanstack/react-query': path.resolve(__dirname, 'apps/atlas-app/node_modules/@tanstack/react-query'),
      '@atlas/ui': path.resolve(__dirname, 'packages/ui/src/index.ts'),
      '@atlas/api-client': path.resolve(__dirname, 'packages/api-client/src/index.ts'),
    },
  },
});
