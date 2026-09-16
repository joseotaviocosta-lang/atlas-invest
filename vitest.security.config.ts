import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/auth/**/*.test.ts',
      'tests/web/csrf-protection.test.ts',
      'tests/web/auth-cookie.test.ts',
      'tests/mobile/secure-store.test.ts',
      'tests/foundation/mobile-security-rules.test.ts',
      'tests/foundation/logger-sanitization.test.ts',
    ],
    fileParallelism: false,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/web/src'),
      '@atlas/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@atlas/database': path.resolve(__dirname, 'packages/database/src/index.ts'),
      '@atlas/validation': path.resolve(__dirname, 'packages/validation/src/index.ts'),
      '@atlas/logger': path.resolve(__dirname, 'packages/logger/src/index.ts'),
      '@atlas/ui': path.resolve(__dirname, 'packages/ui/src/index.ts'),
      '@prisma/client': path.resolve(__dirname, 'packages/database/node_modules/@prisma/client'),
      'react-native': path.resolve(__dirname, 'tests/mobile/react-native-mock.ts'),
      'expo-secure-store': path.resolve(__dirname, 'tests/mobile/expo-secure-store-mock.ts'),
    },
  },
});
