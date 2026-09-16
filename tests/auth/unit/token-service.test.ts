import { describe, it, expect } from 'vitest';
import { TokenService } from '../../../apps/api/src/auth/services/token.service';

describe('Unit Test: TokenService', () => {
  const tokenService = new TokenService();

  describe('Access Tokens (JWT)', () => {
    it('should generate and verify a valid access token', () => {
      const payload = {
        userId: '11111111-1111-4111-8111-111111111111',
        sessionId: '22222222-2222-4222-8222-222222222222',
      };

      const token = tokenService.generateAccessToken(payload);
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);

      const verified = tokenService.verifyAccessToken(token);
      expect(verified.userId).toBe(payload.userId);
      expect(verified.sessionId).toBe(payload.sessionId);
    });

    it('should reject a tampered or invalid access token', () => {
      const payload = {
        userId: '11111111-1111-4111-8111-111111111111',
        sessionId: '22222222-2222-4222-8222-222222222222',
      };

      const token = tokenService.generateAccessToken(payload);
      const tampered = token.slice(0, -5) + 'abcde';

      expect(() => tokenService.verifyAccessToken(tampered)).toThrow();
    });
  });

  describe('Refresh Tokens (HMAC-SHA256)', () => {
    it('should generate high-entropy opaque refresh tokens and hash them with HMAC-SHA256', () => {
      const token1 = tokenService.generateRefreshToken();
      const token2 = tokenService.generateRefreshToken();

      expect(token1).not.toBe(token2);
      expect(token1.length).toBe(96); // 48 bytes hex

      const hash1 = tokenService.hashRefreshToken(token1);
      const hash2 = tokenService.hashRefreshToken(token2);

      expect(hash1).not.toBe(token1);
      expect(hash1.length).toBe(64); // SHA-256 hex
      expect(hash1).not.toBe(hash2);

      // Deterministic hashing with same pepper
      expect(tokenService.hashRefreshToken(token1)).toBe(hash1);
    });

    it('should compute future expiration date', () => {
      const expiresAt = tokenService.getRefreshTokenExpiresAt();
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Password Reset Tokens (HMAC-SHA256)', () => {
    it('should generate opaque reset tokens and hash them with HMAC-SHA256', () => {
      const resetToken = tokenService.generatePasswordResetToken();
      expect(resetToken.length).toBe(64); // 32 bytes hex

      const tokenHash = tokenService.hashPasswordResetToken(resetToken);
      expect(tokenHash).not.toBe(resetToken);
      expect(tokenHash.length).toBe(64);
      expect(tokenService.hashPasswordResetToken(resetToken)).toBe(tokenHash);
    });
  });
});
