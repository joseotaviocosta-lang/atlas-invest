import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const WEB_HIGH_INCOME_FILES = [
  'apps/web/src/components/fiscal/AnnualHighIncomeSection.tsx',
  'apps/web/src/app/(app)/tax/high-income/page.tsx',
  'apps/web/src/app/(app)/tax/page.tsx',
];

function read(p: string): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
  } catch {
    return '';
  }
}

describe('Architecture: No Client-Side High-Income Tax Calculation', () => {
  it('web high-income files never import the tax engine calculation modules', () => {
    for (const file of WEB_HIGH_INCOME_FILES) {
      const content = read(file);
      expect(content, file).not.toContain('@atlas/tax-engine');
      expect(content, file).not.toContain('calculateHighIncomeMinimumTax');
      expect(content, file).not.toContain('calculateCorporatePayerRedutor');
      expect(content, file).not.toContain('resolveHighIncomeRatePercentage');
      expect(content, file).not.toContain('buildAnnualInvestmentIncomeSummary');
      expect(content, file).not.toContain('buildAnnualCapitalMarketSummary');
    }
  });

  it('web high-income files never do financial math', () => {
    for (const file of WEB_HIGH_INCOME_FILES) {
      const content = read(file);
      expect(content, file).not.toMatch(/parseFloat/);
      expect(content, file).not.toMatch(/Number\(/);
      expect(content, file).not.toMatch(/\.amount\s*[*/+-]/);
    }
  });

  it('high-income view-model never does financial math', () => {
    const content = read('packages/ui/src/view-models/annual-high-income.view-model.ts');
    expect(content).not.toMatch(/parseFloat/);
    expect(content).not.toMatch(/Number\(/);
    expect(content).not.toContain('@atlas/tax-engine');
    expect(content).toContain('formatCurrency');
  });
});
