import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

const SCENARIO_CLIENT_FILES = [
  'apps/web/src/components/portfolio/ScenarioSection.tsx',
  'apps/mobile/src/components/portfolio/MobileScenarioSection.tsx',
  'packages/ui/src/view-models/portfolio-scenario.view-model.ts',
];

describe('Architecture: Scenario client boundary (ADR-159)', () => {
  it('client cannot calculate scenario shocks', () => {
    for (const f of SCENARIO_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/applyScenarioToSnapshot\(/);
      expect(c, f).not.toMatch(/runScenario\(/);
      expect(c, f).not.toMatch(/shockFactor/);
    }
  });

  it('client cannot apply beta', () => {
    for (const f of SCENARIO_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/portfolioBeta\s*\*/);
      expect(c, f).not.toMatch(/beta\s*\*\s*shock/i);
    }
  });

  it('client cannot reprice positions', () => {
    for (const f of SCENARIO_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/stressedPrice/);
      expect(c, f).not.toMatch(/marketPrice\.multiply/);
      expect(c, f).not.toMatch(/marketValue\.multiply/);
    }
  });

  it('client cannot apply duration', () => {
    for (const f of SCENARIO_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/modifiedDuration/);
      expect(c, f).not.toMatch(/duration\s*\*/);
    }
  });

  it('scenario-engine is zero I/O and pure', () => {
    const c = read('packages/scenario-engine/src/index.ts');
    expect(c).not.toMatch(/from '@atlas\/market-data'/);
    expect(c).not.toMatch(/from '@atlas\/database'/);
    expect(c).not.toMatch(/from '@atlas\/benchmark-engine'/);
    expect(c).not.toMatch(/from '@atlas\/performance-engine'/);
    expect(c).not.toMatch(/from '@atlas\/portfolio-engine'/);
    expect(c).not.toMatch(/fetch\(/);
    expect(c).not.toMatch(/@prisma\//);
    expect(c).not.toMatch(/import React/);
    expect(c).not.toMatch(/@nestjs\//);
    expect(c).not.toMatch(/Math\.sqrt\(/);
    expect(c).not.toMatch(/Math\.pow\(/);
    expect(c).not.toMatch(/parseFloat\(/);
    // No ledger/portfolio mutation primitives.
    expect(c).not.toMatch(/replayPortfolio/);
    expect(c).not.toMatch(/\.create\(/);
    expect(c).not.toMatch(/prisma/i);
  });

  it('portfolio-engine does not import scenario-engine', () => {
    const c = read('packages/portfolio-engine/src/index.ts');
    expect(c).not.toMatch(/scenario-engine/);
    expect(c).not.toMatch(/applyScenario/);
  });

  it('snapshot builder never supplies modifiedDuration (no inference from maturity/coupon/yield)', () => {
    const c = read('apps/api/src/application/performance/scenario-snapshot.builder.ts');
    expect(c).toMatch(/modifiedDuration:\s*null/);
    expect(c).not.toMatch(/modifiedDuration:\s*Quantity/);
    expect(c).not.toMatch(/modifiedDuration:\s*pos\./);
  });

  it('scenario use-case and API DTO cannot accept a modifiedDuration input', () => {
    const useCase = read('apps/api/src/application/performance/run-portfolio-scenario.use-case.ts');
    expect(useCase).not.toMatch(/modifiedDuration/);
    const dto = read('apps/api/src/modules/performance/dto/run-scenario.dto.ts');
    expect(dto).not.toMatch(/modifiedDuration/);
    expect(dto).toContain('.strict()');
  });

  it('scenario use-case reuses the valuation snapshot builder and 3K beta (no per-component provider)', () => {
    const c = read('apps/api/src/application/performance/run-portfolio-scenario.use-case.ts');
    expect(c).toContain('ScenarioSnapshotBuilder');
    expect(c).toContain('GetPortfolioBenchmarkRelativeRiskUseCase');
    expect(c).not.toMatch(/StooqCsvRow/);
    expect(c).not.toMatch(/YahooFinanceQuote/);
  });
});
