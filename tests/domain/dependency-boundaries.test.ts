import { describe, it, expect } from 'vitest';
import domainPkg from '../../packages/domain/package.json';
import taxPkg from '../../packages/tax-engine/package.json';
import portfolioPkg from '../../packages/portfolio-engine/package.json';
import * as domainExports from '../../packages/domain/src/index';

describe('Domain: Strict Architectural Dependency Boundaries', () => {
  it('domain package must never depend on UI frameworks, API frameworks, or database ORMs', () => {
    const deps = {
      ...(domainPkg as { dependencies?: Record<string, string> }).dependencies,
      ...(domainPkg as { devDependencies?: Record<string, string> }).devDependencies,
    };

    const forbidden = [
      'react',
      'react-native',
      'expo',
      'next',
      '@nestjs/common',
      '@nestjs/core',
      'prisma',
      '@prisma/client',
      'openai',
      'pg',
      'typeorm',
      'drizzle-orm',
    ];

    for (const pkg of forbidden) {
      expect(Object.keys(deps)).not.toContain(pkg);
    }
  });

  it('tax-engine must never depend on ai-engine or UI', () => {
    const deps = (taxPkg as { dependencies?: Record<string, string> }).dependencies ?? {};
    expect(Object.keys(deps)).not.toContain('@atlas/ai-engine');
    expect(Object.keys(deps)).not.toContain('@atlas/ui');
    expect(Object.keys(deps)).not.toContain('react');
    expect(Object.keys(deps)).not.toContain('expo');
  });

  it('portfolio-engine must never depend on UI or React', () => {
    const deps = (portfolioPkg as { dependencies?: Record<string, string> }).dependencies ?? {};
    expect(Object.keys(deps)).not.toContain('@atlas/ui');
    expect(Object.keys(deps)).not.toContain('react');
    expect(Object.keys(deps)).not.toContain('expo');
  });

  it('decimal.js implementation class (Decimal) must remain completely encapsulated and NOT leaked in public domain exports', () => {
    // Assert that 'Decimal' is not in domain public exports
    expect('Decimal' in domainExports).toBe(false);
    expect('DecimalValue' in domainExports).toBe(false);
  });
});
