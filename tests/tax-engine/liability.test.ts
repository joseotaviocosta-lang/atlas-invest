import { describe, expect, it } from 'vitest';
import { Money } from '@atlas/domain';
import {
  calculateMonthlyTaxLiability,
  type MonthlyTaxCalculationInput,
  type TaxLossBalance,
} from '@atlas/tax-engine';
import { fiscalEvent, income, sale, testOnlyRule, verifiedRule } from './liability-helpers';

function opening(category: 'BRAZILIAN_EQUITY' | 'FII', amount: string): TaxLossBalance {
  return {
    category,
    currency: 'BRL',
    amount: Money.from(amount, 'BRL'),
    competence: '2026-08',
    provenance: 'REPLAY',
  };
}

function calc(over: Partial<MonthlyTaxCalculationInput>) {
  return calculateMonthlyTaxLiability({
    competence: '2026-09',
    events: [],
    ruleSets: [],
    ...over,
  });
}

describe('Phase 4B — Monthly tax liability', () => {
  it('reports NO_ACTIVITY with zero tax due when history is known', () => {
    const r = calc({ ruleSets: [verifiedRule('BRAZILIAN_EQUITY', { ratePercentage: '15' })] });
    expect(r.status).toBe('NO_ACTIVITY');
    expect(r.taxDue!.amount).toBe('0');
    expect(r.categories).toHaveLength(0);
  });

  it('computes a COMPLETE taxable sale using a rule-driven rate', () => {
    const r = calc({
      events: [sale('s1', '2026-09-10', '300', '100')],
      ruleSets: [verifiedRule('BRAZILIAN_EQUITY', { ratePercentage: '15' })],
    });
    expect(r.status).toBe('COMPLETE');
    const c = r.categories[0]!;
    expect(c.status).toBe('COMPLETE');
    expect(c.grossSales.amount).toBe('300');
    expect(c.taxableBaseBeforeLosses.amount).toBe('100');
    expect(c.taxBeforeWithholding.amount).toBe('15');
    expect(c.taxDue!.amount).toBe('15');
    expect(r.taxDue!.amount).toBe('15');
  });

  it('applies category-scoped opening loss compensation', () => {
    const r = calc({
      events: [sale('s1', '2026-09-10', '300', '100')],
      ruleSets: [verifiedRule('BRAZILIAN_EQUITY', { ratePercentage: '15' })],
      openingLossBalances: [opening('BRAZILIAN_EQUITY', '40')],
    });
    const c = r.categories[0]!;
    expect(c.taxableBaseBeforeLosses.amount).toBe('100');
    expect(c.lossApplied.amount).toBe('40');
    expect(c.taxableBaseAfterLosses.amount).toBe('60');
    expect(c.taxDue!.amount).toBe('9');
    expect(c.closingLossBalance.amount).toBe('0');
  });

  it('applies gross-sales exemption exactly at the threshold', () => {
    const ruleSet = verifiedRule('BRAZILIAN_EQUITY', {
      ratePercentage: '15',
      exemptionGrossSalesThreshold: '20000',
    });
    const at = calc({ events: [sale('a', '2026-09-05', '20000', '1000')], ruleSets: [ruleSet] });
    expect(at.categories[0]!.exemptionApplied).toBe(true);
    expect(at.categories[0]!.taxableBaseBeforeLosses.amount).toBe('0');
    expect(at.categories[0]!.taxDue!.amount).toBe('0');

    const above = calc({
      events: [sale('b', '2026-09-05', '20000.01', '1000')],
      ruleSets: [ruleSet],
    });
    expect(above.categories[0]!.exemptionApplied).toBe(false);
    expect(above.categories[0]!.taxableBaseBeforeLosses.amount).toBe('1000');

    const below = calc({
      events: [sale('c', '2026-09-05', '19999.99', '1000')],
      ruleSets: [ruleSet],
    });
    expect(below.categories[0]!.exemptionApplied).toBe(true);
  });

  it('applies canonical withholding credits without ever going negative', () => {
    const ruleSet = verifiedRule('FII', { ratePercentage: '20' });
    const base = [sale('w', '2026-09-10', '1000', '500', 'FII')];
    const credit = (amount: string) => [
      {
        category: 'FII' as const,
        currency: 'BRL',
        amount: Money.from(amount, 'BRL'),
        source: 'FISCAL_EVENT' as const,
      },
    ];

    const partial = calc({ events: base, ruleSets: [ruleSet], withholdingCredits: credit('20') });
    expect(partial.categories[0]!.taxBeforeWithholding.amount).toBe('100');
    expect(partial.categories[0]!.withholdingApplied.amount).toBe('20');
    expect(partial.categories[0]!.taxDue!.amount).toBe('80');

    const equal = calc({ events: base, ruleSets: [ruleSet], withholdingCredits: credit('100') });
    expect(equal.categories[0]!.taxDue!.amount).toBe('0');

    const excess = calc({ events: base, ruleSets: [ruleSet], withholdingCredits: credit('120') });
    expect(excess.categories[0]!.withholdingApplied.amount).toBe('100');
    expect(excess.categories[0]!.taxDue!.amount).toBe('0');
    expect(excess.categories[0]!.taxDue!.isNegative()).toBe(false);
  });

  it('blocks a missing rule set (no tax due)', () => {
    const r = calc({ events: [sale('s1', '2026-09-10', '300', '100')], ruleSets: [] });
    expect(r.status).toBe('BLOCKED');
    expect(r.categories[0]!.qualityIssues).toContain('MISSING_RULE_SET');
    expect(r.categories[0]!.taxDue).toBeNull();
    expect(r.taxDue).toBeNull();
  });

  it('blocks a TEST_ONLY rule (never produces production liability)', () => {
    const r = calc({
      events: [sale('s1', '2026-09-10', '300', '100')],
      ruleSets: [testOnlyRule('BRAZILIAN_EQUITY', { ratePercentage: '15' })],
    });
    expect(r.status).toBe('BLOCKED');
    expect(r.categories[0]!.qualityIssues).toContain('UNVERIFIED_RULE_SET');
    expect(r.categories[0]!.taxDue).toBeNull();
    expect(r.capabilities.productionRuleVerified).toBe(false);
  });

  it('blocks an unknown tax category', () => {
    const r = calc({
      events: [
        fiscalEvent({
          id: 'u',
          category: 'UNKNOWN',
          eventType: 'SALE',
          date: '2026-09-10',
          proceeds: '300',
          realizedResult: '100',
        }),
      ],
      ruleSets: [verifiedRule('UNKNOWN', { ratePercentage: '15' })],
    });
    expect(r.categories[0]!.status).toBe('BLOCKED');
    expect(r.categories[0]!.qualityIssues).toContain('UNKNOWN_ASSET_TAX_CATEGORY');
  });

  it('blocks an unsupported currency without FX conversion', () => {
    const r = calc({
      events: [sale('usd', '2026-09-10', '300', '100', 'BRAZILIAN_EQUITY', 'USD')],
      ruleSets: [verifiedRule('BRAZILIAN_EQUITY', { ratePercentage: '15' })],
    });
    expect(r.categories[0]!.qualityIssues).toContain('UNSUPPORTED_CURRENCY');
    expect(r.categories[0]!.taxDue).toBeNull();
  });

  it('treats a sale without canonical cost basis as PARTIAL (no fabricated gain)', () => {
    const r = calc({
      events: [sale('s1', '2026-09-10', '300')],
      ruleSets: [verifiedRule('BRAZILIAN_EQUITY', { ratePercentage: '15' })],
    });
    expect(r.status).toBe('PARTIAL');
    expect(r.categories[0]!.qualityIssues).toContain('UNKNOWN_COST_BASIS');
    expect(r.categories[0]!.taxDue).toBeNull();
  });

  it('treats unknown opening loss with a positive gain as PARTIAL (never zero)', () => {
    const r = calc({
      events: [sale('s1', '2026-09-10', '300', '100')],
      ruleSets: [verifiedRule('BRAZILIAN_EQUITY', { ratePercentage: '15' })],
      openingLossState: 'UNKNOWN',
    });
    expect(r.status).toBe('PARTIAL');
    expect(r.categories[0]!.qualityIssues).toContain('UNKNOWN_OPENING_LOSS_BALANCE');
    expect(r.categories[0]!.taxDue).toBeNull();
  });

  it('records loss from a negative realized result and carries it forward', () => {
    const r = calc({
      events: [sale('s1', '2026-09-10', '300', '-120')],
      ruleSets: [verifiedRule('BRAZILIAN_EQUITY', { ratePercentage: '15' })],
    });
    const c = r.categories[0]!;
    expect(c.lossGenerated.amount).toBe('120');
    expect(c.taxableBaseBeforeLosses.amount).toBe('0');
    expect(c.closingLossBalance.amount).toBe('120');
    expect(c.taxDue!.amount).toBe('0');
  });

  it('keeps income category results distinct from sales', () => {
    const r = calc({
      events: [income('i1', '2026-09-12', '50', 'FII')],
      ruleSets: [verifiedRule('FII', { ratePercentage: '20' })],
    });
    const c = r.categories[0]!;
    expect(c.grossSales.amount).toBe('0');
    // Income is not a sale: no taxable base unless a rule says so.
    expect(c.taxableBaseBeforeLosses.amount).toBe('0');
  });

  it('uses the category-effective rule version', () => {
    const v1 = verifiedRule(
      'BRAZILIAN_EQUITY',
      { ratePercentage: '10' },
      { id: 'V1', version: 'v1' },
    );
    const r = calc({ events: [sale('s1', '2026-09-10', '300', '100')], ruleSets: [v1] });
    expect(r.categories[0]!.ratePercentage).toBe('10');
    expect(r.ruleVersions).toEqual(['v1']);
  });

  it('is deterministic across 1000 identical calculations', () => {
    const input: MonthlyTaxCalculationInput = {
      competence: '2026-09',
      events: [sale('s1', '2026-09-10', '300', '100')],
      ruleSets: [verifiedRule('BRAZILIAN_EQUITY', { ratePercentage: '15' })],
    };
    const first = JSON.stringify(calculateMonthlyTaxLiability(input));
    for (let i = 0; i < 1000; i++) {
      expect(JSON.stringify(calculateMonthlyTaxLiability(input))).toBe(first);
    }
  });

  it('is invariant to event ordering', () => {
    const ruleSets = [verifiedRule('BRAZILIAN_EQUITY', { ratePercentage: '15' })];
    const forward = calc({
      events: [sale('a', '2026-09-05', '100', '30'), sale('b', '2026-09-20', '200', '70')],
      ruleSets,
    });
    const reversed = calc({
      events: [sale('b', '2026-09-20', '200', '70'), sale('a', '2026-09-05', '100', '30')],
      ruleSets,
    });
    expect(JSON.stringify(forward.categories)).toBe(JSON.stringify(reversed.categories));
  });

  it('preserves exact decimal arithmetic for extreme values', () => {
    const r = calc({
      events: [sale('x', '2026-09-10', '12345.678901234567890123', '12345.678901234567890123')],
      ruleSets: [verifiedRule('BRAZILIAN_EQUITY', { ratePercentage: '15' })],
    });
    // Exact. 12345.678901234567890123 * 15 / 100
    expect(r.categories[0]!.taxBeforeWithholding.amount).toBe('1851.85183518518518351845');
  });

  it('never produces a negative category tax due (property)', () => {
    for (const credit of ['0', '1', '0.01', '999999.99']) {
      const r = calc({
        events: [sale('s', '2026-09-10', '1000', '100')],
        ruleSets: [verifiedRule('BRAZILIAN_EQUITY', { ratePercentage: '15' })],
        withholdingCredits: [
          {
            category: 'BRAZILIAN_EQUITY',
            currency: 'BRL',
            amount: Money.from(credit, 'BRL'),
            source: 'FISCAL_EVENT',
          },
        ],
      });
      expect(r.categories[0]!.taxDue!.isNegative()).toBe(false);
      if (r.taxDue) expect(r.taxDue.isNegative()).toBe(false);
    }
  });
});
