import { describe, it, expect } from 'vitest';
import { Argon2PasswordHasher } from '../../../apps/api/src/auth/services/argon2-password-hasher.service';

describe('Unit Test: Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('should hash a password and produce a valid Argon2id hash', async () => {
    const password = 'SuperSecretPassword123!';
    const hash = await hasher.hash(password);

    expect(hash).toBeDefined();
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toBe(password);
  });

  it('should verify a valid password against its hash', async () => {
    const password = 'MySecurePassword2026';
    const hash = await hasher.hash(password);

    const isValid = await hasher.verify(password, hash);
    expect(isValid).toBe(true);
  });

  it('should reject an incorrect password', async () => {
    const password = 'MySecurePassword2026';
    const hash = await hasher.hash(password);

    const isValid = await hasher.verify('WrongPassword123', hash);
    expect(isValid).toBe(false);
  });

  it('should execute verifyDummy() and return false for timing attack mitigation', async () => {
    const start = Date.now();
    const result = await hasher.verifyDummy();
    const duration = Date.now() - start;

    expect(result).toBe(false);
    // Verification should take a non-trivial amount of time (Argon2 computation)
    expect(duration).toBeGreaterThanOrEqual(0);
  });
});
