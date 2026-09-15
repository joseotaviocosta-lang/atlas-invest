import { describe, it, expect } from 'vitest';
import { ok, fail } from '../../packages/domain/src/index';
import domainPkg from '../../packages/domain/package.json';
import taxPkg from '../../packages/tax-engine/package.json';
import portfolioPkg from '../../packages/portfolio-engine/package.json';

describe('Foundation: Domain & Architecture Dependency Rules', () => {
  it('should verify Result pattern works for success and failure', () => {
    const successResult = ok({ value: 100 });
    expect(successResult.success).toBe(true);
    if (successResult.success) {
      expect(successResult.data.value).toBe(100);
    }

    const failResult = fail(new Error('Operation failed'));
    expect(failResult.success).toBe(false);
    if (!failResult.success) {
      expect(failResult.error.message).toBe('Operation failed');
    }
  });

  it('domain package must be framework-agnostic (no React, Expo, Next, Nest, or ORM)', () => {
    const dependencies =
      (domainPkg as { dependencies?: Record<string, string> }).dependencies ?? {};
    const forbidden = [
      'react',
      'react-native',
      'expo',
      'next',
      '@nestjs',
      'prisma',
      '@prisma/client',
    ];

    for (const pkg of forbidden) {
      expect(Object.keys(dependencies)).not.toContain(pkg);
    }
  });

  it('tax-engine must not depend on Expo or ai-engine', () => {
    const dependencies = (taxPkg as { dependencies?: Record<string, string> }).dependencies ?? {};
    expect(Object.keys(dependencies)).not.toContain('expo');
    expect(Object.keys(dependencies)).not.toContain('@atlas/ai-engine');
  });

  it('portfolio-engine must not depend on React or UI', () => {
    const dependencies =
      (portfolioPkg as { dependencies?: Record<string, string> }).dependencies ?? {};
    expect(Object.keys(dependencies)).not.toContain('react');
    expect(Object.keys(dependencies)).not.toContain('@atlas/ui');
  });
});
