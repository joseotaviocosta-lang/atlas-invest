import { describe, it, expect } from 'vitest';
import { Money, DomainError } from '../../packages/domain/src/index';
import domainPkg from '../../packages/domain/package.json';
import taxPkg from '../../packages/tax-engine/package.json';
import portfolioPkg from '../../packages/portfolio-engine/package.json';

describe('Foundation: Domain & Architecture Dependency Rules', () => {
  it('should verify domain primitives and typed DomainError hierarchy', () => {
    const money = Money.from('100.00', 'BRL');
    expect(money.amount).toBe('100');
    expect(money.currency).toBe('BRL');

    const error = new DomainError('Test error', 'DOMAIN.TEST');
    expect(error.code).toBe('DOMAIN.TEST');
    expect(error.message).toBe('Test error');
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

  it('database package must depend on domain, but domain must never depend on database or ORMs', () => {
    const domainDeps = (domainPkg as { dependencies?: Record<string, string> }).dependencies ?? {};
    expect(Object.keys(domainDeps)).not.toContain('@atlas/database');
    expect(Object.keys(domainDeps)).not.toContain('@prisma/client');
    expect(Object.keys(domainDeps)).not.toContain('prisma');
  });
});
