import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

const INTELLIGENCE_CLIENT_FILES = [
  'apps/web/src/components/portfolio/IntelligenceSummarySection.tsx',
  'apps/mobile/src/components/portfolio/MobileIntelligenceSummarySection.tsx',
  'packages/ui/src/view-models/portfolio-intelligence.view-model.ts',
];

describe('Architecture: Portfolio Intelligence boundary (ADR-166)', () => {
  it('portfolio-intelligence is zero I/O and pure', () => {
    const c = read('packages/portfolio-intelligence/src/index.ts');
    expect(c).not.toMatch(/from '@atlas\/market-data'/);
    expect(c).not.toMatch(/from '@atlas\/database'/);
    expect(c).not.toMatch(/from '@atlas\/benchmark-engine'/);
    expect(c).not.toMatch(/from '@atlas\/performance-engine'/);
    expect(c).not.toMatch(/from '@atlas\/risk-engine'/);
    expect(c).not.toMatch(/from '@atlas\/scenario-engine'/);
    expect(c).not.toMatch(/from '@atlas\/portfolio-engine'/);
    expect(c).not.toMatch(/from '@atlas\/domain'/);
    expect(c).not.toMatch(/fetch\(/);
    expect(c).not.toMatch(/@prisma\//);
    expect(c).not.toMatch(/import React/);
    expect(c).not.toMatch(/@nestjs\//);
  });

  it('portfolio-intelligence cannot calculate financial formulas', () => {
    const c = read('packages/portfolio-intelligence/src/index.ts');
    expect(c).not.toMatch(/calculateSharpeRatio|calculateSortinoRatio|calculateBeta/);
    expect(c).not.toMatch(/calculateTWR|calculateXIRR|calculateRiskMetrics/);
    expect(c).not.toMatch(/calculateHistoricalVar|calculateHistoricalCvar/);
    expect(c).not.toMatch(/Math\.sqrt|Math\.pow|parseFloat/);
  });

  it('portfolio-engine does not import portfolio-intelligence', () => {
    const c = read('packages/portfolio-engine/src/index.ts');
    expect(c).not.toMatch(/portfolio-intelligence/);
    expect(c).not.toMatch(/buildPortfolioIntelligenceSummary/);
  });

  it('client cannot calculate summary metrics or benchmark differences', () => {
    for (const f of INTELLIGENCE_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateSharpeRatio|calculateSortinoRatio|calculateBeta/);
      expect(c, f).not.toMatch(/differencePercentagePoints\s*=(?!=)/);
      expect(c, f).not.toMatch(/\bsubtract\(/);
      expect(c, f).not.toMatch(/Math\.pow|Math\.sqrt/);
    }
  });

  it('client cannot generate a risk score, rank or recommendation', () => {
    for (const f of INTELLIGENCE_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/riskScore|healthScore|dataQualityScore/);
      expect(c, f).not.toMatch(/\.sort\(.*rank|rankPortfolio/);
      // Match code, not documentation prose ("...or recommended here").
      expect(c, f).not.toMatch(/recommendPortfolio|generateRecommendation|\.recommend\(/i);
      expect(c, f).not.toMatch(/you should|considere comprar/i);
    }
  });

  it('intelligence use-case reuses the shared context and does not call the AI engine', () => {
    const c = read(
      'apps/api/src/application/performance/get-portfolio-intelligence-summary.use-case.ts',
    );
    expect(c).toContain('PerformanceCalculationContextBuilder');
    expect(c).toContain('ScenarioSnapshotBuilder');
    expect(c).not.toMatch(/ai-engine|@atlas\/ai-engine/i);
    expect(c).not.toMatch(/openai|anthropic|gemini/i);
  });
});
