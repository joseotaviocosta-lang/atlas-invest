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

  it('@atlas/portfolio-engine must have zero dependencies on @atlas/database, prisma, @prisma/client, apps, or UI frameworks', () => {
    const pkgData = readPackageJson('packages/portfolio-engine');
    const allDeps = {
      ...(pkgData.dependencies || {}),
      ...(pkgData.devDependencies || {}),
    };

    const forbidden = [
      '@atlas/database',
      '@atlas/api',
      '@atlas/web',
      '@atlas/mobile',
      '@atlas/ui',
      '@prisma/client',
      'prisma',
      'react',
      'react-native',
      'next',
    ];

    for (const dep of forbidden) {
      expect(allDeps).not.toHaveProperty(dep);
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

  it('API presentation layer (controllers, DTOs) must not import internal engine state or domain value objects directly', () => {
    const portfoliosModuleDir = path.join(rootDir, 'apps/api/src/modules/portfolios');
    if (!fs.existsSync(portfoliosModuleDir)) return;

    const files = fs.readdirSync(portfoliosModuleDir);
    const forbiddenImports = [
      'PortfolioState',
      'AccountState',
      'AssetState',
      'DecimalValue',
      'Money',
      'Quantity',
      'Percentage',
    ];

    for (const file of files) {
      if (file.endsWith('.ts')) {
        const content = fs.readFileSync(path.join(portfoliosModuleDir, file), 'utf8');
        for (const forbidden of forbiddenImports) {
          const importPattern = new RegExp(`import\\s+.*\\b${forbidden}\\b.*from`, 'g');
          expect(content).not.toMatch(importPattern);
        }
      }
    }
  });

  it('Phase 4I.6: high-income review package tax-engine module must not import Nest/Prisma/@atlas/database/react', () => {
    const annualIrpfDir = path.join(rootDir, 'packages/tax-engine/src/annual-irpf');
    const moduleFiles = [
      'high-income-review-package.ts',
      'high-income-review-package-registry.ts',
      'high-income-review-package-export.ts',
      'csv-escape.ts',
    ];

    const forbiddenImportPatterns = [
      /from\s+['"]@nestjs\//,
      /from\s+['"]@prisma\/client['"]/,
      /from\s+['"]@atlas\/database['"]/,
      /from\s+['"]react['"]/,
      /from\s+['"]react-native['"]/,
    ];

    for (const file of moduleFiles) {
      const fullPath = path.join(annualIrpfDir, file);
      expect(fs.existsSync(fullPath), `${file} must exist`).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of forbiddenImportPatterns) {
        expect(content, `${file} must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('Phase 4I.6: high-income review package API use-case consumes the 4I.4 use-case, never raw calculate* or a repository', () => {
    const useCasePath = path.join(
      rootDir,
      'apps/api/src/application/fiscal/get-high-income-annual-review-package.use-case.ts',
    );
    expect(fs.existsSync(useCasePath), 'review-package API use-case must exist').toBe(true);
    const content = fs.readFileSync(useCasePath, 'utf8');

    // MUST consume the frozen 4I.4 assessment use-case (loaded once).
    expect(content).toMatch(/GetAnnualHighIncomeAssessmentUseCase/);
    // MUST feed the pure engine assembler/exporters.
    expect(content).toMatch(/buildHighIncomeAnnualReviewPackage/);

    // MUST NOT re-run the frozen tax calculation.
    expect(content).not.toMatch(/calculateHighIncomeMinimumTax/);
    // MUST NOT touch the database/repository layer directly.
    expect(content).not.toMatch(/from\s+['"]@atlas\/database['"]/);
    expect(content).not.toMatch(/Repository/);
    expect(content).not.toMatch(/_REPOSITORY\b/);
  });

  it('Zero Client Financial Math: Shared UI view models must not perform financial division or arithmetic', () => {
    const viewModelsDir = path.join(rootDir, 'packages/ui/src/view-models');
    if (!fs.existsSync(viewModelsDir)) return;

    const files = fs.readdirSync(viewModelsDir);
    for (const file of files) {
      if (file.endsWith('.ts')) {
        const content = fs.readFileSync(path.join(viewModelsDir, file), 'utf8');

        // Must not import math/decimal libraries
        expect(content).not.toMatch(/from\s+['"]decimal\.js/);
        expect(content).not.toMatch(/from\s+['"]bignumber\.js/);
        expect(content).not.toMatch(/from\s+['"]big\.js/);

        // Must not execute method-based financial divisions/multiplications
        expect(content).not.toMatch(/\.div\(/);
        expect(content).not.toMatch(/\.dividedBy\(/);
        expect(content).not.toMatch(/\.times\(/);
        expect(content).not.toMatch(/\.multipliedBy\(/);

        // Must not calculate percentage share from total quantities
        expect(content).not.toMatch(/\/.*totalQuantity/i);
        expect(content).not.toMatch(/\/.*totalCost/i);
      }
    }
  });
});
