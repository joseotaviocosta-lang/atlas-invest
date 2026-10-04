import { describe, it, expect } from 'vitest';
import {
  calculateHighIncomeMinimumTax,
  resolveHighIncomeMinimumTaxRuleSet,
  type HighIncomeIncomeItemInput,
  type HighIncomeTaxPaidFactInput,
  type HighIncomeMinimumTaxCalculationResult,
} from '@atlas/tax-engine';

/**
 * Phase 4I.2 — High-income minimum tax deterministic calculation fixtures (A–AJ)
 * and legal golden vectors. Statutes: Lei 15.270/2025 arts. 16-A/16-B.
 *
 * Note: `Money.amount` serializes to a normalized decimal string (trailing zeros
 * stripped), e.g. "45000" — exact, never a float.
 */

const YEAR = 2026;

type Item = HighIncomeIncomeItemInput;

function item(overrides: Partial<Item> & Pick<Item, 'itemId' | 'category' | 'amount'>): Item {
  return { ...overrides };
}

function adj(amount = '0'): HighIncomeTaxPaidFactInput {
  return { factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount, currency: 'BRL' };
}

function wh(amount = '0'): HighIncomeTaxPaidFactInput {
  return { factId: 'wh', kind: 'EXCLUSIVE_SOURCE_WITHHOLDING', amount, currency: 'BRL' };
}

function calc(overrides: Partial<Parameters<typeof calculateHighIncomeMinimumTax>[0]>) {
  return calculateHighIncomeMinimumTax({
    calendarYear: YEAR,
    taxSubjectId: 'subject',
    currency: 'BRL',
    items: [],
    ...overrides,
  });
}

function findBreakdown(result: HighIncomeMinimumTaxCalculationResult, category: string) {
  return result.incomeBreakdown.find((entry) => entry.category === category);
}

describe('Phase 4I.2 — calculation fixtures A–AJ', () => {
  it('A — 600.000,00 exact -> NOT_APPLICABLE (rate/gross/net null, not computed zero)', () => {
    const result = calc({
      items: [item({ itemId: 'a1', category: 'EQUITY_CAPITAL_GAIN', amount: '600000' })],
    });
    expect(result.status).toBe('NOT_APPLICABLE');
    expect(result.minimumRatePercentage).toBeNull();
    expect(result.grossMinimumTax).toBeNull();
    expect(result.netMinimumTax).toBeNull();
  });

  it('B — 600.000,01 -> CALCULABLE, rate just above zero', () => {
    const result = calc({
      items: [item({ itemId: 'b1', category: 'EQUITY_CAPITAL_GAIN', amount: '600000.01' })],
      taxPaidFacts: [adj()],
    });
    expect(result.status).toBe('CALCULABLE');
    expect(result.minimumRatePercentage).toBe('0.0000001667');
    expect(result.grossMinimumTax?.amount).toBe('0');
    expect(result.netMinimumTax?.amount).toBe('0');
  });

  it('C — 900.000 -> exact progressive-rate calculation', () => {
    const result = calc({
      items: [item({ itemId: 'c1', category: 'EQUITY_CAPITAL_GAIN', amount: '900000' })],
      taxPaidFacts: [adj()],
    });
    expect(result.status).toBe('CALCULABLE');
    expect(result.minimumRatePercentage).toBe('5.0000000000');
    expect(result.grossMinimumTax?.amount).toBe('45000');
  });

  it('D — 1.200.000 -> 10% minimum rate', () => {
    const result = calc({
      items: [item({ itemId: 'd1', category: 'EQUITY_CAPITAL_GAIN', amount: '1200000' })],
      taxPaidFacts: [adj()],
    });
    expect(result.minimumRatePercentage).toBe('10.0000000000');
    expect(result.grossMinimumTax?.amount).toBe('120000');
  });

  it('E — above 1.200.000 -> still 10%', () => {
    const result = calc({
      items: [item({ itemId: 'e1', category: 'EQUITY_CAPITAL_GAIN', amount: '2000000' })],
      taxPaidFacts: [adj()],
    });
    expect(result.minimumRatePercentage).toBe('10.0000000000');
    expect(result.grossMinimumTax?.amount).toBe('200000');
  });

  it('F — total vs base divergence: threshold on total, calculation on base', () => {
    const result = calc({
      items: [
        item({ itemId: 'f1', category: 'EQUITY_CAPITAL_GAIN', amount: '400000' }),
        item({ itemId: 'f2', category: 'SAVINGS_INCOME', amount: '300000' }),
      ],
      taxPaidFacts: [adj()],
    });
    expect(result.totalAnnualIncome?.amount).toBe('700000');
    expect(result.minimumTaxBase?.amount).toBe('400000');
    expect(result.minimumRatePercentage).toBe('0.0000000000');
    expect(result.grossMinimumTax?.amount).toBe('0');
    expect(result.status).toBe('CALCULABLE');
  });

  it('G — ordinary dividends: INCLUDED; gross computed, net blocked by corporate reduction', () => {
    const result = calc({
      items: [item({ itemId: 'g1', category: 'DIVIDEND', amount: '700000', payerId: 'payer-g' })],
    });
    expect(findBreakdown(result, 'DIVIDEND')?.classification).toBe('INCLUDED');
    expect(result.minimumTaxBase?.amount).toBe('700000');
    expect(result.grossMinimumTax?.amount).toBe('11666.67');
    expect(result.status).toBe('INCOMPLETE_REDUCTION_DATA');
    expect(result.netMinimumTax).toBeNull();
  });

  it('H — transition dividend eligible: EXCLUDED', () => {
    const result = calc({
      items: [
        item({
          itemId: 'h1',
          category: 'DIVIDEND_TRANSITION',
          amount: '700000',
          payerId: 'payer-h',
          transitionEligibility: 'ELIGIBLE',
        }),
      ],
      taxPaidFacts: [adj()],
    });
    expect(findBreakdown(result, 'DIVIDEND_TRANSITION')?.classification).toBe('EXCLUDED');
    expect(result.minimumTaxBase?.amount).toBe('0');
    expect(result.status).toBe('CALCULABLE');
    expect(result.netMinimumTax?.amount).toBe('0');
  });

  it('I — transition dividend unknown -> REQUIRES_CONFIRMATION, net null', () => {
    const result = calc({
      items: [
        item({
          itemId: 'i1',
          category: 'DIVIDEND_TRANSITION',
          amount: '700000',
          payerId: 'payer-i',
        }),
      ],
    });
    expect(result.status).toBe('REQUIRES_CONFIRMATION');
    expect(result.netMinimumTax).toBeNull();
  });

  it('J — JCP: INCLUDED; exclusive withholding consumed', () => {
    const result = calc({
      items: [item({ itemId: 'j1', category: 'JCP', amount: '700000', payerId: 'payer-j' })],
      taxPaidFacts: [adj(), wh('105000')],
    });
    expect(findBreakdown(result, 'JCP')?.classification).toBe('INCLUDED');
    expect(result.minimumTaxBase?.amount).toBe('700000');
    expect(result.status).toBe('CALCULABLE');
    expect(result.grossMinimumTax?.amount).toBe('11666.67');
    expect(result.netMinimumTax?.amount).toBe('0');
    expect(result.creditExcess?.amount).toBe('93333.33');
  });

  it('K — FII income eligible: EXCLUDED', () => {
    const result = calc({
      items: [
        item({
          itemId: 'k1',
          category: 'FII_INCOME',
          amount: '700000',
          payerId: 'payer-k',
          fiiEligibility: 'ELIGIBLE',
        }),
      ],
      taxPaidFacts: [adj()],
    });
    expect(findBreakdown(result, 'FII_INCOME')?.classification).toBe('EXCLUDED');
    expect(result.minimumTaxBase?.amount).toBe('0');
  });

  it('L — FII income unknown -> fail closed', () => {
    const result = calc({
      items: [item({ itemId: 'l1', category: 'FII_INCOME', amount: '700000', payerId: 'payer-l' })],
    });
    expect(result.status).toBe('REQUIRES_CONFIRMATION');
    expect(result.netMinimumTax).toBeNull();
  });

  it('M — normal equity gain is INCLUDED', () => {
    const result = calc({
      items: [item({ itemId: 'm1', category: 'EQUITY_CAPITAL_GAIN', amount: '800000' })],
      taxPaidFacts: [adj()],
    });
    expect(findBreakdown(result, 'EQUITY_CAPITAL_GAIN')?.includedAmount?.amount).toBe('800000');
  });

  it('N — day trade gain is INCLUDED', () => {
    const result = calc({
      items: [item({ itemId: 'n1', category: 'EQUITY_DAY_TRADE_GAIN', amount: '800000' })],
      taxPaidFacts: [adj()],
    });
    expect(findBreakdown(result, 'EQUITY_DAY_TRADE_GAIN')?.classification).toBe('INCLUDED');
  });

  it('O — FII capital gain is INCLUDED', () => {
    const result = calc({
      items: [item({ itemId: 'o1', category: 'FII_CAPITAL_GAIN', amount: '800000' })],
      taxPaidFacts: [adj()],
    });
    expect(findBreakdown(result, 'FII_CAPITAL_GAIN')?.classification).toBe('INCLUDED');
  });

  it('P — mixed included/excluded: base composition is exact', () => {
    const result = calc({
      items: [
        item({ itemId: 'p1', category: 'EQUITY_CAPITAL_GAIN', amount: '700000' }),
        item({ itemId: 'p2', category: 'SAVINGS_INCOME', amount: '100000' }),
      ],
      taxPaidFacts: [adj()],
    });
    expect(findBreakdown(result, 'EQUITY_CAPITAL_GAIN')?.includedAmount?.amount).toBe('700000');
    expect(findBreakdown(result, 'SAVINGS_INCOME')?.excludedAmount?.amount).toBe('100000');
    expect(result.minimumTaxBase?.amount).toBe('700000');
    expect(result.totalAnnualIncome?.amount).toBe('800000');
  });

  it('Q — included + conditional unknown -> no authoritative net tax', () => {
    const result = calc({
      items: [
        item({ itemId: 'q1', category: 'EQUITY_CAPITAL_GAIN', amount: '500000' }),
        item({ itemId: 'q2', category: 'EXEMPT_SECURITIES_INCOME', amount: '300000' }),
      ],
    });
    expect(result.status).toBe('REQUIRES_CONFIRMATION');
    expect(result.netMinimumTax).toBeNull();
  });

  it('R — unsupported foreign income -> UNSUPPORTED_INPUT', () => {
    const result = calc({
      items: [
        item({ itemId: 'r1', category: 'EQUITY_CAPITAL_GAIN', amount: '700000' }),
        item({ itemId: 'r2', category: 'FOREIGN_INCOME', amount: '100000' }),
      ],
    });
    expect(result.status).toBe('UNSUPPORTED_INPUT');
    expect(result.netMinimumTax).toBeNull();
  });

  it('S — corporate reduction required but missing -> gross known, net null', () => {
    const result = calc({
      items: [item({ itemId: 's1', category: 'DIVIDEND', amount: '700000', payerId: 'payer-s' })],
    });
    expect(result.grossMinimumTax?.amount).toBe('11666.67');
    expect(result.netMinimumTax).toBeNull();
    expect(result.status).toBe('INCOMPLETE_REDUCTION_DATA');
  });

  it('T — corporate reduction not applicable -> complete calculation proceeds', () => {
    const result = calc({
      items: [item({ itemId: 't1', category: 'EQUITY_CAPITAL_GAIN', amount: '700000' })],
      taxPaidFacts: [adj()],
    });
    expect(result.status).toBe('CALCULABLE');
    expect(result.netMinimumTax?.amount).toBe(result.grossMinimumTax?.amount);
    expect(result.netMinimumTax?.amount).toBe('11666.67');
  });

  it('U — credit below gross tax subtracts exactly', () => {
    const result = calc({
      items: [item({ itemId: 'u1', category: 'EQUITY_CAPITAL_GAIN', amount: '900000' })],
      taxPaidFacts: [adj('10000')],
    });
    expect(result.grossMinimumTax?.amount).toBe('45000');
    expect(result.netMinimumTax?.amount).toBe('35000');
  });

  it('V — credit equal to gross tax -> net zero', () => {
    const result = calc({
      items: [item({ itemId: 'v1', category: 'EQUITY_CAPITAL_GAIN', amount: '900000' })],
      taxPaidFacts: [adj('45000')],
    });
    expect(result.netMinimumTax?.amount).toBe('0');
    expect(result.creditExcess?.amount).toBe('0');
  });

  it('W — credit above gross tax -> net cannot go negative; excess classified', () => {
    const result = calc({
      items: [item({ itemId: 'w1', category: 'EQUITY_CAPITAL_GAIN', amount: '900000' })],
      taxPaidFacts: [adj('60000')],
    });
    expect(result.netMinimumTax?.amount).toBe('0');
    expect(result.creditExcess?.amount).toBe('15000');
  });

  it('X — no activity -> NOT_APPLICABLE', () => {
    const result = calc({ items: [] });
    expect(result.status).toBe('NOT_APPLICABLE');
    expect(result.grossMinimumTax).toBeNull();
    expect(result.netMinimumTax).toBeNull();
  });

  it('Y — pre-2026 -> UNSUPPORTED_YEAR', () => {
    const result = calc({
      calendarYear: 2025,
      items: [item({ itemId: 'y1', category: 'EQUITY_CAPITAL_GAIN', amount: '700000' })],
    });
    expect(result.status).toBe('UNSUPPORTED_YEAR');
  });

  it('Z — 2028+ -> UNSUPPORTED_YEAR', () => {
    const result = calc({
      calendarYear: 2028,
      items: [item({ itemId: 'z1', category: 'EQUITY_CAPITAL_GAIN', amount: '700000' })],
    });
    expect(result.status).toBe('UNSUPPORTED_YEAR');
  });

  it('AA — large values do not overflow', () => {
    const result = calc({
      items: [item({ itemId: 'aa1', category: 'EQUITY_CAPITAL_GAIN', amount: '999999999999.99' })],
      taxPaidFacts: [adj()],
    });
    expect(result.status).toBe('CALCULABLE');
    expect(result.grossMinimumTax?.amount).toBe('100000000000');
  });

  it('AB — many payers (200) do not collapse identity', () => {
    const items: Item[] = [];
    for (let i = 0; i < 200; i++) {
      items.push(
        item({ itemId: `ab-${i}`, category: 'JCP', amount: '5000', payerId: `payer-${i}` }),
      );
    }
    const result = calc({ items, taxPaidFacts: [adj(), wh()] });
    const jcp = findBreakdown(result, 'JCP');
    expect(jcp?.payerIds).toHaveLength(200);
    expect(result.status).toBe('CALCULABLE');
  });

  it('AC — order shuffle yields identical result and fingerprint', () => {
    const a = item({ itemId: 'ac1', category: 'EQUITY_CAPITAL_GAIN', amount: '400000' });
    const b = item({ itemId: 'ac2', category: 'EQUITY_CAPITAL_GAIN', amount: '300000' });
    const c = item({ itemId: 'ac3', category: 'SAVINGS_INCOME', amount: '200000' });
    const first = calc({ items: [a, b, c], taxPaidFacts: [adj()] });
    const second = calc({ items: [c, b, a], taxPaidFacts: [adj()] });
    expect(second.calculationFingerprint).toBe(first.calculationFingerprint);
    expect(second.netMinimumTax?.amount).toBe(first.netMinimumTax?.amount);
  });

  it('AD — source revision changes calculation fingerprint', () => {
    const first = calc({
      items: [item({ itemId: 'ad1', category: 'EQUITY_CAPITAL_GAIN', amount: '700000' })],
      taxPaidFacts: [adj()],
    });
    const second = calc({
      items: [item({ itemId: 'ad1', category: 'EQUITY_CAPITAL_GAIN', amount: '700001' })],
      taxPaidFacts: [adj()],
    });
    expect(second.calculationFingerprint).not.toBe(first.calculationFingerprint);
  });

  it('AE — rule version change changes fingerprint', () => {
    const base = resolveHighIncomeMinimumTaxRuleSet(YEAR)!;
    const items = [item({ itemId: 'ae1', category: 'EQUITY_CAPITAL_GAIN', amount: '700000' })];
    const first = calc({ items, taxPaidFacts: [adj()] });
    const second = calc({
      items,
      taxPaidFacts: [adj()],
      ruleSet: { ...base, ruleVersion: '2099-01-01-LEI-TEST' },
    });
    expect(second.calculationFingerprint).not.toBe(first.calculationFingerprint);
  });

  it('AF — unknown category fails closed', () => {
    const result = calc({
      items: [item({ itemId: 'af1', category: 'UNKNOWN', amount: '700000' })],
    });
    expect(result.status).toBe('UNSUPPORTED_INPUT');
    expect(result.netMinimumTax).toBeNull();
  });

  it('AG — duplicate item is not double counted', () => {
    const duplicate = item({ itemId: 'ag1', category: 'EQUITY_CAPITAL_GAIN', amount: '700000' });
    const result = calc({
      items: [duplicate, { ...duplicate }],
      taxPaidFacts: [adj()],
    });
    expect(result.minimumTaxBase?.amount).toBe('700000');
    expect(result.grossMinimumTax?.amount).toBe('11666.67');
  });

  it('AG2 — conflicting duplicate item blocks', () => {
    const result = calc({
      items: [
        item({ itemId: 'agx', category: 'EQUITY_CAPITAL_GAIN', amount: '700000' }),
        item({ itemId: 'agx', category: 'EQUITY_CAPITAL_GAIN', amount: '800000' }),
      ],
      taxPaidFacts: [adj()],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.blockingReasons).toContain('CONFLICTING_DUPLICATE_SOURCE_ITEM');
  });

  it('AH — decimal edge: half-up rounding at the final boundary', () => {
    const result = calc({
      items: [item({ itemId: 'ah1', category: 'EQUITY_CAPITAL_GAIN', amount: '900000' })],
      taxPaidFacts: [adj('0.005')],
    });
    expect(result.grossMinimumTax?.amount).toBe('45000');
    expect(result.netMinimumTax?.amount).toBe('45000');
  });

  it('AI — zero included value remains zero, not null', () => {
    const result = calc({
      items: [item({ itemId: 'ai1', category: 'SAVINGS_INCOME', amount: '700000' })],
      taxPaidFacts: [adj()],
    });
    expect(result.status).toBe('CALCULABLE');
    expect(result.minimumTaxBase?.amount).toBe('0');
    expect(result.grossMinimumTax?.amount).toBe('0');
    expect(result.netMinimumTax?.amount).toBe('0');
  });

  it('AJ — missing required credit: gross known, net null', () => {
    const result = calc({
      items: [item({ itemId: 'aj1', category: 'EQUITY_CAPITAL_GAIN', amount: '900000' })],
    });
    expect(result.grossMinimumTax?.amount).toBe('45000');
    expect(result.netMinimumTax).toBeNull();
    expect(result.status).toBe('INCOMPLETE_CREDITS');
  });
});

describe('Phase 4I.2 — legal golden vectors', () => {
  const vectors: Array<{
    label: string;
    total: string;
    applicable: boolean;
    rate: string | null;
    gross: string | null;
  }> = [
    { label: '600k', total: '600000', applicable: false, rate: null, gross: null },
    {
      label: '600k + 0.01',
      total: '600000.01',
      applicable: true,
      rate: '0.0000001667',
      gross: '0',
    },
    { label: '660k', total: '660000', applicable: true, rate: '1.0000000000', gross: '6600' },
    { label: '900k', total: '900000', applicable: true, rate: '5.0000000000', gross: '45000' },
    { label: '1.14M', total: '1140000', applicable: true, rate: '9.0000000000', gross: '102600' },
    {
      label: '1.19999999M',
      total: '1199999.99',
      applicable: true,
      rate: '9.9999998333',
      gross: '120000',
    },
    { label: '1.2M', total: '1200000', applicable: true, rate: '10.0000000000', gross: '120000' },
    { label: '2M', total: '2000000', applicable: true, rate: '10.0000000000', gross: '200000' },
  ];

  for (const vector of vectors) {
    it(`golden vector ${vector.label}`, () => {
      const result = calc({
        items: [
          item({
            itemId: `gv-${vector.label}`,
            category: 'EQUITY_CAPITAL_GAIN',
            amount: vector.total,
          }),
        ],
        taxPaidFacts: [adj()],
      });
      if (!vector.applicable) {
        expect(result.status).toBe('NOT_APPLICABLE');
        expect(result.minimumRatePercentage).toBeNull();
        expect(result.grossMinimumTax).toBeNull();
        return;
      }
      expect(result.status).toBe('CALCULABLE');
      expect(result.minimumRatePercentage).toBe(vector.rate);
      expect(result.grossMinimumTax?.amount).toBe(vector.gross);
    });
  }
});
