import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Architecture Gate: Layer Dependency Boundaries & Package Isolation', () => {
  const rootDir = path.resolve(__dirname, '../..');

  function readPackageJson(pkgPath: string): {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } {
    const fullPath = path.join(rootDir, pkgPath, 'package.json');
    if (!fs.existsSync(fullPath)) return {};
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  }

  it('Domain layer must have zero external framework or database dependencies', () => {
    const domainPkg = readPackageJson('packages/domain');
    const allDeps = {
      ...(domainPkg.dependencies || {}),
      ...(domainPkg.devDependencies || {}),
    };

    const forbidden = [
      '@atlas/database',
      '@atlas/api',
      '@atlas/web',
      '@atlas/mobile',
      '@atlas/ui',
      '@prisma/client',
      'prisma',
      '@nestjs/core',
      '@nestjs/common',
      'react',
      'react-native',
      'expo',
      'next',
    ];

    for (const dep of forbidden) {
      expect(allDeps).not.toHaveProperty(dep);
    }
  });

  it('Apps (mobile and web) must never import @atlas/database directly', () => {
    const mobilePkg = readPackageJson('apps/mobile');
    const webPkg = readPackageJson('apps/web');

    expect(mobilePkg.dependencies || {}).not.toHaveProperty('@atlas/database');
    expect(mobilePkg.devDependencies || {}).not.toHaveProperty('@atlas/database');

    expect(webPkg.dependencies || {}).not.toHaveProperty('@atlas/database');
    expect(webPkg.devDependencies || {}).not.toHaveProperty('@atlas/database');
  });

  it('Calculation engines must not depend on UI, React, or apps', () => {
    const enginePackages = [
      'packages/portfolio-engine',
      'packages/performance-engine',
      'packages/tax-engine',
      'packages/ai-engine',
      'packages/market-data',
      'packages/news-data',
    ];

    for (const pkg of enginePackages) {
      const pkgData = readPackageJson(pkg);
      const allDeps = {
        ...(pkgData.dependencies || {}),
        ...(pkgData.devDependencies || {}),
      };

      expect(allDeps).not.toHaveProperty('@atlas/ui');
      expect(allDeps).not.toHaveProperty('@atlas/web');
      expect(allDeps).not.toHaveProperty('@atlas/mobile');
      expect(allDeps).not.toHaveProperty('react');
      expect(allDeps).not.toHaveProperty('react-native');
    }
  });

  it('Formatting must be decoupled from calculation: UI package must not be imported in Domain or Calculation Engines', () => {
    const nonUiPackages = [
      'packages/domain',
      'packages/database',
      'packages/portfolio-engine',
      'packages/performance-engine',
      'packages/tax-engine',
    ];

    for (const pkg of nonUiPackages) {
      const pkgData = readPackageJson(pkg);
      const deps = pkgData.dependencies || {};
      expect(deps).not.toHaveProperty('@atlas/ui');
    }
  });

  it('Mobile app source must not contain direct database queries or raw SQL', () => {
    const mobileSrc = path.join(rootDir, 'apps/mobile/src');
    function scanDir(dir: string) {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          scanDir(fullPath);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          expect(content).not.toMatch(/\bSELECT\s+.+\s+FROM\b/i);
          expect(content).not.toMatch(/\bINSERT\s+INTO\b/i);
          expect(content).not.toMatch(/\bUPDATE\s+.+\s+SET\b/i);
          expect(content).not.toMatch(/\bDELETE\s+FROM\b/i);
        }
      }
    }
    scanDir(mobileSrc);
  });
});
