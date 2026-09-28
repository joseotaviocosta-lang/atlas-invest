import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const COMPONENT = 'apps/web/src/components/fiscal/TaxInputEntry.tsx';
const PAGE = 'apps/web/src/app/(app)/tax/page.tsx';

describe('Web tax input entry UX (Phase 4B.4)', () => {
  it('calls the canonical tax-input and resolve endpoints', () => {
    const c = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(c).toContain('/api/v1/fiscal/inputs/trade-classifications');
    expect(c).toContain('/api/v1/fiscal/inputs/withholdings');
    expect(c).toContain('/api/v1/fiscal/inputs/fii-metadata');
    expect(c).toContain('/resolve');
    expect(c).toContain('Classificação da operação');
    expect(c).toContain('Há informações conflitantes');
    expect(c).toContain('Informar dados fiscais');
  });

  it('performs no tax math and keeps ownership as a string', () => {
    const c = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(c).not.toMatch(/parseFloat|Math\./);
    expect(c).not.toMatch(/calculateTax|computeTax/i);
    // Ownership percent is passed through as an exact decimal string (never Number()).
    expect(c).toContain('fii.investorOwnershipPercent');
    expect(c).not.toMatch(/Number\(\s*fii\.investorOwnershipPercent/);
  });

  it('is wired into the fiscal page', () => {
    const c = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    expect(c).toContain('TaxInputEntry');
  });
});
