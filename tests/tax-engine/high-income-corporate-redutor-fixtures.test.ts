import { describe, it, expect } from 'vitest';
import { Money } from '@atlas/domain';
import {
  aggregateCorporateRedutor,
  calculateCorporatePayerRedutor,
  calculateHighIncomeMinimumTax,
  deduplicateCorporateEvidence,
  resolveHighIncomeMinimumTaxRuleSet,
  HIGH_INCOME_CORPORATE_REFERENCE_RATES,
  type CalculateHighIncomeMinimumTaxInput,
  type CorporatePayerEvidenceInput,
} from '@atlas/tax-engine';

/**
 * Phase 4I.3 — Corporate effective-tax redutor fixtures (A–AJ).
 * Statutes: Lei 9.250/1995 art. 16-B; Lei 15.270/2025.
 */

const YEAR = 2026;

function evidence(
  overrides: Partial<CorporatePayerEvidenceInput> &
    Pick<CorporatePayerEvidenceInput, 'evidenceId' | 'payerId'>,
): CorporatePayerEvidenceInput {
  return {
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

function dividendCase(
  payerId: string,
  amount: string,
  corporateEvidence: readonly CorporatePayerEvidenceInput[] = [],
): CalculateHighIncomeMinimumTaxInput {
  return {
    calendarYear: YEAR,
    taxSubjectId: 'subject',
    currency: 'BRL',
    items: [{ itemId: `d-${payerId}`, category: 'DIVIDEND', amount, payerId }],
    taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
    corporateEvidence,
  };
}

describe('Phase 4I.3 — corporate redutor fixtures A–AJ', () => {
  it('A — standard payer, complete evidence -> payer redutor calculable', () => {
    const result = calculateHighIncomeMinimumTax(
      dividendCase('pj-a', '700000', [evidence({ evidenceId: 'e1', payerId: 'pj-a' })]),
    );
    // effPJ = 268000/800000 = 33.5%; effPF = 11666.67/700000 = 1.6667%;
    // excess = 33.5 + 1.6667 - 34 = 1.1667%; redutor = 8166.67; net = 3500
    expect(result.status).toBe('CALCULABLE');
    expect(result.corporateRedutor?.status).toBe('APPLICABLE');
    expect(result.corporateRedutor?.payers).toHaveLength(1);
    expect(result.corporateRedutor?.totalSupportedReduction?.amount).toBe('8166.67');
    expect(result.netMinimumTax?.amount).toBe('3500');
  });

  it('B — corporate rate above reference -> reduction zero, not null', () => {
    const result = calculateHighIncomeMinimumTax(
      dividendCase('pj-b', '700000', [
        evidence({ evidenceId: 'e1', payerId: 'pj-b', irDue: '172000', csllDue: '68000' }),
      ]),
    );
    // effPJ = 240000/800000 = 30%; sum = 31.6667% < 34% -> zero reduction, authoritative
    expect(result.status).toBe('CALCULABLE');
    expect(result.corporateRedutor?.totalSupportedReduction?.amount).toBe('0');
    expect(result.netMinimumTax?.amount).toBe(result.grossMinimumTax?.amount);
  });

  it('C — low corporate tax still grants zero when below cap', () => {
    const result = calculateHighIncomeMinimumTax(
      dividendCase('pj-c', '700000', [
        evidence({ evidenceId: 'e1', payerId: 'pj-c', irDue: '120000', csllDue: '68000' }),
      ]),
    );
    // effPJ = 188000/800000 = 23.5%; sum = 25.1667% < 34% -> zero
    expect(result.status).toBe('CALCULABLE');
    expect(result.corporateRedutor?.totalSupportedReduction?.amount).toBe('0');
    expect(result.netMinimumTax?.amount).toBe('11666.67');
  });

  it('C2 — high PF rate plus corporate rate grants positive reduction', () => {
    const result = calculateHighIncomeMinimumTax({
      calendarYear: YEAR,
      taxSubjectId: 'subject',
      currency: 'BRL',
      items: [
        { itemId: 'd1', category: 'DIVIDEND', amount: '1100000', payerId: 'pj-c2' },
        { itemId: 'g1', category: 'EQUITY_CAPITAL_GAIN', amount: '100000' },
      ],
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
      corporateEvidence: [
        evidence({ evidenceId: 'e1', payerId: 'pj-c2', irDue: '200000', csllDue: '68000' }),
      ],
    });
    // base = 1200000 -> rate 10%; gross = 120000; effPF = 120000/1100000 = 10.9091%
    // effPJ = 33.5%; excess = 44.4091 - 34 = 10.4091%; redutor = 114500; net = 5500
    expect(result.status).toBe('CALCULABLE');
    expect(result.corporateRedutor?.totalSupportedReduction?.amount).toBe('114500');
    expect(result.netMinimumTax?.amount).toBe('5500');
  });

  it('D — exact reference rate boundary', () => {
    const result = calculateHighIncomeMinimumTax(
      dividendCase('pj-d', '700000', [
        evidence({ evidenceId: 'e1', payerId: 'pj-d', irDue: '204000', csllDue: '68000' }),
      ]),
    );
    // effPJ exactly 34%; excess = 34 + 1.6667 - 34 = 1.6667%; redutor = 11666.67; net = 0
    expect(result.corporateRedutor?.totalSupportedReduction?.amount).toBe('11666.67');
    expect(result.netMinimumTax?.amount).toBe('0');
  });

  it('E — 34% standard payer matrix entry', () => {
    expect(HIGH_INCOME_CORPORATE_REFERENCE_RATES.STANDARD_CORPORATE.ratePercentage).toBe('34');
    expect(HIGH_INCOME_CORPORATE_REFERENCE_RATES.STANDARD_CORPORATE.legalReference).toContain(
      '§1º, I',
    );
  });

  it('F — 40% insurance/capitalization payer', () => {
    expect(
      HIGH_INCOME_CORPORATE_REFERENCE_RATES.INSURANCE_CAPITALIZATION_REGULATED.ratePercentage,
    ).toBe('40');
    const result = calculateHighIncomeMinimumTax(
      dividendCase('pj-f', '700000', [
        evidence({
          evidenceId: 'e1',
          payerId: 'pj-f',
          payerType: 'INSURANCE_CAPITALIZATION_REGULATED',
        }),
      ]),
    );
    // 33.5 + 1.6667 = 35.1667 < 40 -> zero reduction, still authoritative
    expect(result.status).toBe('CALCULABLE');
    expect(result.corporateRedutor?.totalSupportedReduction?.amount).toBe('0');
  });

  it('G — 45% financial institution payer', () => {
    expect(HIGH_INCOME_CORPORATE_REFERENCE_RATES.FINANCIAL_INSTITUTION.ratePercentage).toBe('45');
    const result = calculateHighIncomeMinimumTax(
      dividendCase('pj-g', '700000', [
        evidence({ evidenceId: 'e1', payerId: 'pj-g', payerType: 'FINANCIAL_INSTITUTION' }),
      ]),
    );
    expect(result.status).toBe('CALCULABLE');
    expect(result.corporateRedutor?.totalSupportedReduction?.amount).toBe('0');
  });

  it('H — unknown payer type fails closed', () => {
    const result = calculateHighIncomeMinimumTax(
      dividendCase('pj-h', '700000', [
        evidence({ evidenceId: 'e1', payerId: 'pj-h', payerType: 'UNKNOWN' }),
      ]),
    );
    expect(result.status).toBe('BLOCKED');
    expect(result.netMinimumTax).toBeNull();
    expect(result.corporateRedutor?.status).toBe('UNSUPPORTED_PAYER_TYPE');
  });

  it('I — missing corporate profit evidence fails closed', () => {
    const result = calculateHighIncomeMinimumTax(dividendCase('pj-i', '700000', []));
    expect(result.status).toBe('INCOMPLETE_REDUCTION_DATA');
    expect(result.grossMinimumTax?.amount).toBe('11666.67');
    expect(result.netMinimumTax).toBeNull();
  });

  it('J — taxpayer confirmation alone is not authoritative', () => {
    const result = calculateHighIncomeMinimumTax(
      dividendCase('pj-j', '700000', [
        evidence({
          evidenceId: 'e1',
          payerId: 'pj-j',
          evidenceAuthority: 'AUTHORITATIVE',
          evidenceSource: 'TAXPAYER_CONFIRMED',
        }),
      ]),
    );
    expect(result.status).toBe('INCOMPLETE_REDUCTION_DATA');
    expect(result.netMinimumTax).toBeNull();
  });

  it('K — conflicting evidence blocks', () => {
    const result = calculateHighIncomeMinimumTax(
      dividendCase('pj-k', '700000', [
        evidence({ evidenceId: 'e1', payerId: 'pj-k', irDue: '200000' }),
        evidence({ evidenceId: 'e2', payerId: 'pj-k', irDue: '100000' }),
      ]),
    );
    expect(result.status).toBe('BLOCKED');
    expect(result.netMinimumTax).toBeNull();
    expect(
      result.blockingReasons.some((reason) => reason.includes('CONFLICTING_CORPORATE_EVIDENCE')),
    ).toBe(true);
  });

  it('L — two payers, both complete -> deterministic aggregate', () => {
    const input: CalculateHighIncomeMinimumTaxInput = {
      calendarYear: YEAR,
      taxSubjectId: 'subject',
      currency: 'BRL',
      items: [
        { itemId: 'd1', category: 'DIVIDEND', amount: '400000', payerId: 'pj-1' },
        { itemId: 'd2', category: 'DIVIDEND', amount: '300000', payerId: 'pj-2' },
      ],
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
      corporateEvidence: [
        evidence({ evidenceId: 'e1', payerId: 'pj-1' }),
        evidence({ evidenceId: 'e2', payerId: 'pj-2', irDue: '172000', csllDue: '68000' }),
      ],
    };
    const first = calculateHighIncomeMinimumTax(input);
    const second = calculateHighIncomeMinimumTax(input);
    expect(first.status).toBe('CALCULABLE');
    expect(first.corporateRedutor?.payerCount).toBe(2);
    expect(first.corporateRedutor?.calculationFingerprint).toBe(
      second.corporateRedutor?.calculationFingerprint,
    );
    expect(first.calculationFingerprint).toBe(second.calculationFingerprint);
  });

  it('M — two payers, one incomplete -> global net follows completeness rule', () => {
    const result = calculateHighIncomeMinimumTax({
      calendarYear: YEAR,
      taxSubjectId: 'subject',
      currency: 'BRL',
      items: [
        { itemId: 'd1', category: 'DIVIDEND', amount: '400000', payerId: 'pj-1' },
        { itemId: 'd2', category: 'DIVIDEND', amount: '300000', payerId: 'pj-2' },
      ],
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
      corporateEvidence: [evidence({ evidenceId: 'e1', payerId: 'pj-1' })],
    });
    expect(result.status).toBe('INCOMPLETE_REDUCTION_DATA');
    expect(result.grossMinimumTax).not.toBeNull();
    expect(result.netMinimumTax).toBeNull();
    expect(result.corporateRedutor?.blockingPayers).toContain('pj-2');
  });

  it('N — multiple distributions, same payer aggregate', () => {
    const result = calculateHighIncomeMinimumTax({
      calendarYear: YEAR,
      taxSubjectId: 'subject',
      currency: 'BRL',
      items: [
        { itemId: 'd1', category: 'DIVIDEND', amount: '400000', payerId: 'pj-n' },
        { itemId: 'd2', category: 'DIVIDEND', amount: '300000', payerId: 'pj-n' },
      ],
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
      corporateEvidence: [evidence({ evidenceId: 'e1', payerId: 'pj-n' })],
    });
    expect(result.status).toBe('CALCULABLE');
    expect(result.corporateRedutor?.payerCount).toBe(1);
    expect(result.corporateRedutor?.totalEligibleDividends?.amount).toBe('700000');
  });

  it('O — same display name, different payer IDs never merge', () => {
    const result = calculateHighIncomeMinimumTax({
      calendarYear: YEAR,
      taxSubjectId: 'subject',
      currency: 'BRL',
      items: [
        {
          itemId: 'd1',
          category: 'DIVIDEND',
          amount: '400000',
          payerId: 'pj-o-1',
          payerDisplayName: 'ACME SA',
        },
        {
          itemId: 'd2',
          category: 'DIVIDEND',
          amount: '300000',
          payerId: 'pj-o-2',
          payerDisplayName: 'ACME SA',
        },
      ],
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
      corporateEvidence: [
        evidence({ evidenceId: 'e1', payerId: 'pj-o-1' }),
        evidence({ evidenceId: 'e2', payerId: 'pj-o-2' }),
      ],
    });
    expect(result.corporateRedutor?.payerCount).toBe(2);
    expect(result.corporateRedutor?.payers.map((payer) => payer.payerId).sort()).toEqual([
      'pj-o-1',
      'pj-o-2',
    ]);
  });

  it('P — transition dividend attracts no redutor', () => {
    const result = calculateHighIncomeMinimumTax({
      calendarYear: YEAR,
      taxSubjectId: 'subject',
      currency: 'BRL',
      items: [
        {
          itemId: 'd1',
          category: 'DIVIDEND_TRANSITION',
          amount: '700000',
          payerId: 'pj-p',
          transitionEligibility: 'ELIGIBLE',
        },
      ],
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
    });
    expect(result.corporateRedutor).toBeNull();
    expect(result.status).toBe('CALCULABLE');
  });

  it('Q — ordinary 2026 dividend follows redutor eligibility path', () => {
    const result = calculateHighIncomeMinimumTax(
      dividendCase('pj-q', '700000', [evidence({ evidenceId: 'e1', payerId: 'pj-q' })]),
    );
    expect(result.corporateRedutor?.status).toBe('APPLICABLE');
  });

  it('R — no dividends -> redutor path inactive', () => {
    const result = calculateHighIncomeMinimumTax({
      calendarYear: YEAR,
      taxSubjectId: 'subject',
      currency: 'BRL',
      items: [{ itemId: 'g1', category: 'EQUITY_CAPITAL_GAIN', amount: '700000' }],
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
    });
    expect(result.corporateRedutor).toBeNull();
    expect(result.status).toBe('CALCULABLE');
  });

  it('S — reduction capped by payer dividend amount', () => {
    // Even with an extreme excess, the reduction cannot exceed a multiple of D_p
    // implied by the formula; it is inherently D_p × excess.
    const result = calculateHighIncomeMinimumTax(
      dividendCase('pj-s', '700000', [
        evidence({
          evidenceId: 'e1',
          payerId: 'pj-s',
          accountingProfit: '100000',
          irDue: '200000',
          csllDue: '68000',
        }),
      ]),
    );
    // effPJ = 268%; excess huge; redutor = D × excess may exceed gross -> net clamps to 0
    expect(result.status).toBe('CALCULABLE');
    expect(result.netMinimumTax?.amount).toBe('0');
  });

  it('T — reduction plus credits cannot drive net negative', () => {
    const result = calculateHighIncomeMinimumTax({
      calendarYear: YEAR,
      taxSubjectId: 'subject',
      currency: 'BRL',
      items: [{ itemId: 'd1', category: 'DIVIDEND', amount: '700000', payerId: 'pj-t' }],
      taxPaidFacts: [
        { factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '10000' },
        { factId: 'wh', kind: 'EXCLUSIVE_SOURCE_WITHHOLDING', amount: '0' },
      ],
      corporateEvidence: [
        evidence({ evidenceId: 'e1', payerId: 'pj-t', irDue: '204000', csllDue: '68000' }),
      ],
    });
    // gross 11666.67 - credit 10000 - redutor 11666.67 -> clamped to 0
    expect(result.netMinimumTax?.amount).toBe('0');
    expect(result.creditExcess?.amount).toBe('10000');
  });

  it('U — credits + redutor equal gross -> net zero', () => {
    const result = calculateHighIncomeMinimumTax({
      calendarYear: YEAR,
      taxSubjectId: 'subject',
      currency: 'BRL',
      items: [{ itemId: 'd1', category: 'DIVIDEND', amount: '700000', payerId: 'pj-u' }],
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '3500' }],
      corporateEvidence: [evidence({ evidenceId: 'e1', payerId: 'pj-u' })],
    });
    // gross 11666.67 - credit 3500 - redutor 8166.67 = 0
    expect(result.netMinimumTax?.amount).toBe('0');
  });

  it('V — credits + redutor exceed gross -> net non-negative', () => {
    const result = calculateHighIncomeMinimumTax({
      calendarYear: YEAR,
      taxSubjectId: 'subject',
      currency: 'BRL',
      items: [{ itemId: 'd1', category: 'DIVIDEND', amount: '700000', payerId: 'pj-v' }],
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '60000' }],
      corporateEvidence: [evidence({ evidenceId: 'e1', payerId: 'pj-v' })],
    });
    expect(result.netMinimumTax?.amount).toBe('0');
    expect(result.creditExcess).not.toBeNull();
  });

  it('W — very large payer values do not overflow', () => {
    const result = calculateHighIncomeMinimumTax(
      dividendCase('pj-w', '999999999999.99', [
        evidence({
          evidenceId: 'e1',
          payerId: 'pj-w',
          accountingProfit: '9999999999999.99',
          irDue: '2000000000000',
          csllDue: '680000000000',
        }),
      ]),
    );
    expect(result.status).toBe('CALCULABLE');
    expect(result.corporateRedutor?.totalSupportedReduction).not.toBeNull();
  });

  it('X — fractional-cent intermediate rounds once at the final boundary', () => {
    const result = calculateHighIncomeMinimumTax(
      dividendCase('pj-x', '700000.005', [evidence({ evidenceId: 'e1', payerId: 'pj-x' })]),
    );
    expect(result.status).toBe('CALCULABLE');
    expect(
      /^-?\d+(\.\d{1,2})?$/.test(result.corporateRedutor?.totalSupportedReduction?.amount ?? ''),
    ).toBe(true);
    expect(/^-?\d+(\.\d{1,2})?$/.test(result.netMinimumTax?.amount ?? '')).toBe(true);
  });

  it('Y — source revision changes fingerprints', () => {
    const first = calculateHighIncomeMinimumTax(
      dividendCase('pj-y', '700000', [evidence({ evidenceId: 'e1', payerId: 'pj-y' })]),
    );
    const second = calculateHighIncomeMinimumTax(
      dividendCase('pj-y', '700000', [
        evidence({ evidenceId: 'e1', payerId: 'pj-y', irDue: '200001' }),
      ]),
    );
    expect(second.calculationFingerprint).not.toBe(first.calculationFingerprint);
    expect(second.corporateRedutor?.calculationFingerprint).not.toBe(
      first.corporateRedutor?.calculationFingerprint,
    );
  });

  it('Z — rule version change changes fingerprints', () => {
    const base = resolveHighIncomeMinimumTaxRuleSet(2026)!;
    const items = dividendCase('pj-z', '700000', [evidence({ evidenceId: 'e1', payerId: 'pj-z' })]);
    const first = calculateHighIncomeMinimumTax(items);
    const second = calculateHighIncomeMinimumTax({
      ...items,
      ruleSet: { ...base, ruleVersion: '2099-01-01-LEI-TEST' },
    });
    expect(second.calculationFingerprint).not.toBe(first.calculationFingerprint);
  });

  it('AA — payer order shuffle yields identical aggregate', () => {
    const run = (order: string[]) =>
      calculateHighIncomeMinimumTax({
        calendarYear: YEAR,
        taxSubjectId: 'subject',
        currency: 'BRL',
        items: order.map((payerId) => ({
          itemId: `d-${payerId}`,
          category: 'DIVIDEND' as const,
          amount: '300000',
          payerId,
        })),
        taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE' as const, amount: '0' }],
        corporateEvidence: order.map((payerId) =>
          evidence({ evidenceId: `e-${payerId}`, payerId }),
        ),
      });
    const first = run(['pj-1', 'pj-2', 'pj-3']);
    const second = run(['pj-3', 'pj-1', 'pj-2']);
    expect(second.corporateRedutor?.calculationFingerprint).toBe(
      first.corporateRedutor?.calculationFingerprint,
    );
    expect(second.calculationFingerprint).toBe(first.calculationFingerprint);
  });

  it('AB — duplicate evidence does not double count', () => {
    const record = evidence({ evidenceId: 'e1', payerId: 'pj-ab' });
    const result = calculateHighIncomeMinimumTax(
      dividendCase('pj-ab', '700000', [record, { ...record }]),
    );
    expect(result.status).toBe('CALCULABLE');
    expect(result.corporateRedutor?.payerCount).toBe(1);
    expect(result.corporateRedutor?.totalSupportedReduction?.amount).toBe('8166.67');
  });

  it('AC — pre-2026 -> UNSUPPORTED_YEAR', () => {
    const result = calculateHighIncomeMinimumTax({
      calendarYear: 2025,
      taxSubjectId: 'subject',
      currency: 'BRL',
      items: [{ itemId: 'd1', category: 'DIVIDEND', amount: '700000', payerId: 'pj-ac' }],
    });
    expect(result.status).toBe('UNSUPPORTED_YEAR');
  });

  it('AD — 2028+ -> UNSUPPORTED_YEAR', () => {
    const result = calculateHighIncomeMinimumTax({
      calendarYear: 2028,
      taxSubjectId: 'subject',
      currency: 'BRL',
      items: [{ itemId: 'd1', category: 'DIVIDEND', amount: '700000', payerId: 'pj-ad' }],
    });
    expect(result.status).toBe('UNSUPPORTED_YEAR');
  });

  it('AE — mixed payer types use per-payer reference rates', () => {
    const input: CalculateHighIncomeMinimumTaxInput = {
      calendarYear: YEAR,
      taxSubjectId: 'subject',
      currency: 'BRL',
      items: [
        { itemId: 'd1', category: 'DIVIDEND', amount: '400000', payerId: 'pj-std' },
        { itemId: 'd2', category: 'DIVIDEND', amount: '300000', payerId: 'pj-bank' },
      ],
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
      corporateEvidence: [
        evidence({ evidenceId: 'e1', payerId: 'pj-std' }),
        evidence({ evidenceId: 'e2', payerId: 'pj-bank', payerType: 'FINANCIAL_INSTITUTION' }),
      ],
    };
    const result = calculateHighIncomeMinimumTax(input);
    expect(result.status).toBe('CALCULABLE');
    const byId = new Map(result.corporateRedutor?.payers.map((payer) => [payer.payerId, payer]));
    expect(byId.get('pj-std')?.referenceRatePercentage).toBe('34');
    expect(byId.get('pj-bank')?.referenceRatePercentage).toBe('45');
  });

  it('AF — complete 4I.2 + complete redutor -> authoritative net available', () => {
    const result = calculateHighIncomeMinimumTax(
      dividendCase('pj-af', '700000', [evidence({ evidenceId: 'e1', payerId: 'pj-af' })]),
    );
    expect(result.status).toBe('CALCULABLE');
    expect(result.netMinimumTax).not.toBeNull();
    expect(result.grossMinimumTax?.amount).toBe('11666.67');
    expect(result.netMinimumTax?.amount).toBe('3500');
  });

  it('AG — complete 4I.2 + incomplete redutor -> gross available, net null', () => {
    const result = calculateHighIncomeMinimumTax(dividendCase('pj-ag', '700000', []));
    expect(result.grossMinimumTax?.amount).toBe('11666.67');
    expect(result.netMinimumTax).toBeNull();
    expect(result.status).toBe('INCOMPLETE_REDUCTION_DATA');
  });

  it('AH — no redutor required -> 4I.2 net proceeds without corporate evidence', () => {
    const result = calculateHighIncomeMinimumTax({
      calendarYear: YEAR,
      taxSubjectId: 'subject',
      currency: 'BRL',
      items: [{ itemId: 'g1', category: 'EQUITY_CAPITAL_GAIN', amount: '900000' }],
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
    });
    expect(result.status).toBe('CALCULABLE');
    expect(result.corporateRedutor).toBeNull();
    expect(result.netMinimumTax?.amount).toBe('45000');
  });

  it('AI — zero reduction is authoritative zero, not null', () => {
    const result = calculateHighIncomeMinimumTax(
      dividendCase('pj-ai', '700000', [
        evidence({ evidenceId: 'e1', payerId: 'pj-ai', irDue: '172000', csllDue: '68000' }),
      ]),
    );
    expect(result.status).toBe('CALCULABLE');
    expect(result.corporateRedutor?.totalSupportedReduction?.amount).toBe('0');
    expect(result.netMinimumTax?.amount).toBe(result.grossMinimumTax?.amount);
  });

  it('AJ — missing evidence keeps net null while gross stays known', () => {
    const result = calculateHighIncomeMinimumTax(dividendCase('pj-aj', '700000', []));
    expect(result.netMinimumTax).toBeNull();
    expect(result.grossMinimumTax?.amount).toBe('11666.67');
    expect(result.status).toBe('INCOMPLETE_REDUCTION_DATA');
  });

  it('duplicate evidence records deduplicate deterministically', () => {
    const deduped = deduplicateCorporateEvidence(
      [
        evidence({ evidenceId: 'e1', payerId: 'pj-dup' }),
        evidence({ evidenceId: 'e1', payerId: 'pj-dup' }),
      ],
      'BRL',
    );
    expect(deduped.evidence).toHaveLength(1);
    expect(deduped.conflictingPayerIds).toHaveLength(0);
  });

  it('conflicting evidence records fail closed', () => {
    const deduped = deduplicateCorporateEvidence(
      [
        evidence({ evidenceId: 'e1', payerId: 'pj-con', irDue: '1' }),
        evidence({ evidenceId: 'e2', payerId: 'pj-con', irDue: '2' }),
      ],
      'BRL',
    );
    expect(deduped.conflictingPayerIds).toContain('pj-con');
  });

  it('per-payer computation never leaks across payers', () => {
    const aggregate = aggregateCorporateRedutor(
      [
        calculateCorporatePayerRedutor({
          payerId: 'pj-solo',
          payerType: 'STANDARD_CORPORATE',
          eligibleDividends: Money.from('100000', 'BRL'),
          pfEffectiveRatePercentage: '10',
          evidence: null,
          currency: 'BRL',
        }),
      ],
      'BRL',
    );
    expect(aggregate.status).toBe('REQUIRES_EVIDENCE');
    expect(aggregate.totalSupportedReduction).toBeNull();
  });

  it('non-positive accounting profit blocks the payer computation', () => {
    const result = calculateCorporatePayerRedutor({
      payerId: 'pj-zero',
      payerType: 'STANDARD_CORPORATE',
      eligibleDividends: Money.from('100000', 'BRL'),
      pfEffectiveRatePercentage: '10',
      evidence: {
        evidenceId: 'e1',
        payerId: 'pj-zero',
        payerType: 'STANDARD_CORPORATE',
        profitPeriodExercise: 2026,
        mode: 'FULL',
        accountingProfit: Money.from('0', 'BRL'),
        irDue: Money.from('1000', 'BRL'),
        csllDue: Money.from('500', 'BRL'),
        prouniTaxCredit: null,
        simplifiedRevenue: null,
        consolidatedStatements: false,
        evidenceAuthority: 'AUTHORITATIVE',
        evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
        sourceFingerprint: 'fp',
      },
      currency: 'BRL',
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.reductionExact.amount).toBe('0');
  });
});
