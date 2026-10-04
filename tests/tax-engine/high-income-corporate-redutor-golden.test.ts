import { describe, it, expect } from 'vitest';
import {
  calculateHighIncomeMinimumTax,
  type CalculateHighIncomeMinimumTaxInput,
  type CorporatePayerEvidenceInput,
} from '@atlas/tax-engine';

/**
 * Phase 4I.3 — multi-payer golden vectors (exact, hand-verified against the
 * statutory formula; independently cross-checked by the BigInt differential).
 */

function ev(
  payerId: string,
  overrides: Partial<CorporatePayerEvidenceInput> = {},
): CorporatePayerEvidenceInput {
  return {
    evidenceId: `e-${payerId}`,
    payerId,
    payerType: 'STANDARD_CORPORATE',
    profitPeriodExercise: 2026,
    mode: 'FULL',
    accountingProfit: '800000',
    irDue: '200000',
    csllDue: '68000',
    evidenceAuthority: 'AUTHORITATIVE',
    evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
    ...overrides,
  };
}

function run(
  dividends: Array<{ payerId: string; amount: string }>,
  evidence: CorporatePayerEvidenceInput[],
  extraItems: CalculateHighIncomeMinimumTaxInput['items'] = [],
) {
  return calculateHighIncomeMinimumTax({
    calendarYear: 2026,
    taxSubjectId: 'golden',
    currency: 'BRL',
    items: [
      ...dividends.map((entry, index) => ({
        itemId: `d-${index}`,
        category: 'DIVIDEND' as const,
        amount: entry.amount,
        payerId: entry.payerId,
      })),
      ...extraItems,
    ],
    taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE' as const, amount: '0' }],
    corporateEvidence: evidence,
  });
}

describe('Phase 4I.3 — multi-payer golden vectors', () => {
  it('2 payers, same type, same corporate profile', () => {
    // Base 700000 -> gross 11666.67; effPF = 11666.67/700000 = 1.6667%.
    // pj-1: D=400000, effPJ 33.5% -> excess 1.1667% -> 4666.6667.
    // pj-2: D=300000, effPJ 30% (172000+68000) -> excess -2.3333% -> 0.
    // Total exact 4666.6667 -> 4666.67; net = 11666.67 - 4666.67 = 7000.
    const result = run(
      [
        { payerId: 'pj-1', amount: '400000' },
        { payerId: 'pj-2', amount: '300000' },
      ],
      [ev('pj-1'), ev('pj-2', { irDue: '172000' })],
    );
    expect(result.status).toBe('CALCULABLE');
    expect(result.corporateRedutor?.totalSupportedReduction?.amount).toBe('4666.67');
    expect(result.netMinimumTax?.amount).toBe('7000');
  });

  it('2 payers, different types', () => {
    // pj-bank: 45% cap, effPJ 33.5% -> excess negative -> 0.
    // pj-std: as above -> 4666.6667 -> total 4666.67.
    const result = run(
      [
        { payerId: 'pj-std', amount: '400000' },
        { payerId: 'pj-bank', amount: '300000' },
      ],
      [ev('pj-std'), ev('pj-bank', { payerType: 'FINANCIAL_INSTITUTION' })],
    );
    expect(result.status).toBe('CALCULABLE');
    expect(result.corporateRedutor?.totalSupportedReduction?.amount).toBe('4666.67');
    const byId = new Map(result.corporateRedutor?.payers.map((payer) => [payer.payerId, payer]));
    expect(byId.get('pj-bank')?.referenceRatePercentage).toBe('45');
  });

  it('10 payers, identical profile', () => {
    // Each: D=100000 (total 1000000), base 1000000 -> rate 6.6667%, gross 66666.67.
    // effPF = 66666.67/1000000 = 6.6667%; excess = 33.5+6.6667-34 = 6.1667%.
    // Per payer: 100000 x 6.16667% = 6166.6667; x10 = 61666.6667 -> 61666.67.
    // net = 66666.67 - 61666.67 = 5000.
    const payers = Array.from({ length: 10 }, (_, index) => `p-${index}`);
    const result = run(
      payers.map((payerId) => ({ payerId, amount: '100000' })),
      payers.map((payerId) => ev(payerId)),
    );
    expect(result.status).toBe('CALCULABLE');
    expect(result.corporateRedutor?.payerCount).toBe(10);
    expect(result.corporateRedutor?.totalSupportedReduction?.amount).toBe('61666.67');
    expect(result.netMinimumTax?.amount).toBe('5000');
  });

  it('100 payers, identical profile', () => {
    // Each: D=10000 (total 1000000); same arithmetic as the 10-payer vector.
    const payers = Array.from({ length: 100 }, (_, index) => `q-${index}`);
    const result = run(
      payers.map((payerId) => ({ payerId, amount: '10000' })),
      payers.map((payerId) => ev(payerId)),
    );
    expect(result.status).toBe('CALCULABLE');
    expect(result.corporateRedutor?.payerCount).toBe(100);
    expect(result.corporateRedutor?.totalSupportedReduction?.amount).toBe('61666.67');
    expect(result.netMinimumTax?.amount).toBe('5000');
  });
});
