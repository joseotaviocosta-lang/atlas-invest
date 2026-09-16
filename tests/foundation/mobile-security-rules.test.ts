import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Foundation: Mobile Security & Storage Rules', () => {
  it('should not contain AsyncStorage references in apps/mobile for sensitive authentication tokens', () => {
    const mobileSrc = path.resolve(__dirname, '../../apps/mobile/src');

    function checkDir(dir: string) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          checkDir(fullPath);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          expect(content).not.toContain('@react-native-async-storage/async-storage');
          expect(content).not.toContain('AsyncStorage.setItem');
        }
      }
    }

    checkDir(mobileSrc);
  });

  it('should enforce that secureStorage key is strictly atlas.refresh-token', () => {
    const secureStoreFile = path.resolve(
      __dirname,
      '../../apps/mobile/src/storage/secure-store.ts',
    );
    const content = fs.readFileSync(secureStoreFile, 'utf8');
    expect(content).toContain("REFRESH_TOKEN_KEY = 'atlas.refresh-token'");
    expect(content).not.toContain('ACCESS_TOKEN_KEY');
    expect(content).not.toContain('PASSWORD_KEY');
  });

  it('should verify auth.store keeps access token strictly in memory variable', () => {
    const authStoreFile = path.resolve(__dirname, '../../apps/mobile/src/stores/auth.store.ts');
    const content = fs.readFileSync(authStoreFile, 'utf8');
    expect(content).toContain('let inMemoryAccessToken: string | null = null;');
    expect(content).toContain('getInMemoryAccessToken');
  });
});
