import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/mobile/**/*.test.ts'],
    setupFiles: ['./tests/mobile/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/mobile/src'),
      '@atlas/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@atlas/ui': path.resolve(__dirname, 'packages/ui/src/index.ts'),
      '@atlas/validation': path.resolve(__dirname, 'packages/validation/src/index.ts'),
      'react-native': path.resolve(__dirname, 'tests/mobile/react-native-mock.ts'),
      'expo-secure-store': path.resolve(__dirname, 'tests/mobile/expo-secure-store-mock.ts'),
    },
  },
});
