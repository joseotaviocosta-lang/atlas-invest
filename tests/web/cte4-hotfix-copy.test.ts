import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { shouldShowTaxCostDisclosure } from '@/lib/cost-evidence-entry';

const sectionPath = path.join(
  process.cwd(),
  'apps/web/src/components/portfolio/CostEvidenceSection.tsx',
);
const obligationPath = path.join(
  process.cwd(),
  'apps/web/src/components/fiscal/TaxObligationSection.tsx',
);

function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

describe('CTE-4 hotfix: stale activation copy (presentation-only)', () => {
  const completeOn = {
    enrichmentEnabled: true,
    status: 'COMPLETE_WITH_VERIFIED_EVIDENCE',
    resolvedCost: { amount: '2494.96', currency: 'BRL' },
  };

  it('Test 1 — OFF keeps the disabled/integration-pending banner path', () => {
    expect(shouldShowTaxCostDisclosure({ ...completeOn, enrichmentEnabled: false })).toBe(false);
    expect(shouldShowTaxCostDisclosure(null)).toBe(false);
    expect(shouldShowTaxCostDisclosure(undefined)).toBe(false);
  });

  it('Test 2 — ON + complete hides the stale pending-integration banner', () => {
    expect(shouldShowTaxCostDisclosure(completeOn)).toBe(true);
    // Partial/blocked never show the disclosure even when the gate is on.
    expect(
      shouldShowTaxCostDisclosure({ ...completeOn, status: 'PARTIAL' }),
    ).toBe(false);
  });

  it('Test 3 — canonical-incomplete note stays in the section copy', () => {
    const source = read(sectionPath);
    expect(source).toContain('histórico canônico da posição continua incompleto');
    // The pending-integration banner renders only behind the disclosure gate.
    const gateAt = source.indexOf('!shouldShowTaxCostDisclosure(');
    const bannerAt = source.indexOf('{COST_EVIDENCE_TAX_MESSAGE}');
    expect(gateAt).toBeGreaterThan(-1);
    expect(bannerAt).toBeGreaterThan(gateAt);
  });
});

describe('CTE-4 hotfix: internal reason codes hidden (presentation-only)', () => {
  it('Test 4 — OBLIGATION_NOT_PAYABLE never renders in fiscal UI', () => {
    const source = read(obligationPath);
    expect(source).not.toContain('OBLIGATION_NOT_PAYABLE');
    expect(source).not.toMatch(/\(\{adjustment\.reasonCode\}\)/);
  });

  it('Test 5 — human obligation message remains', () => {
    const source = read(obligationPath);
    expect(source).toContain('Não foi possível calcular o valor atualizado com segurança.');
  });

  it('CTI internal-code hygiene intact (blocker codes, enums)', () => {
    const section = read(sectionPath);
    // No raw enum rendering in the evidence section copy paths.
    expect(section).not.toContain('COMPLETE_WITH_VERIFIED_EVIDENCE');
    expect(section).not.toContain('TAX_COST_EVIDENCE_ENRICHMENT_ENABLED');
  });
});
