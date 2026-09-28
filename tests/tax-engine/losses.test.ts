import { describe, expect, it } from 'vitest';
import { replayMonthlyTaxLiability, type TaxRuleSet } from '@atlas/tax-engine';
import { sale, verifiedRule } from './liability-helpers';

const EQUITY_RULE = verifiedRule('BRAZILIAN_EQUITY', { ratePercentage: '15' });
const FII_RULE = verifiedRule('FII', { ratePercentage: '20' });

function replay(
  months: Array<{ competence: string; events: ReturnType<typeof sale>[] }>,
  ruleSets: TaxRuleSet[],
) {
  return replayMonthlyTaxLiability({ months, ruleSets });
}

describe('Phase 4B — category-isolated loss carryforward', () => {
  it('does not compensate across categories', () => {
    const [month] = replay(
      [
        {
          competence: '2026-01',
          events: [
            sale('loss', '2026-01-10', '100', '-100', 'BRAZILIAN_EQUITY'),
            sale('gain', '2026-01-11', '500', '100', 'FII'),
          ],
        },
      ],
      [EQUITY_RULE, FII_RULE],
    );
    const equity = month!.categories.find((c) => c.category === 'BRAZILIAN_EQUITY')!;
    const fii = month!.categories.find((c) => c.category === 'FII')!;
    expect(equity.lossGenerated.amount).toBe('100');
    expect(equity.closingLossBalance.amount).toBe('100');
    expect(equity.taxDue!.amount).toBe('0');
    // FII gain is fully taxed; the equity loss never touches it.
    expect(fii.taxableBaseBeforeLosses.amount).toBe('100');
    expect(fii.lossApplied.amount).toBe('0');
    expect(fii.taxDue!.amount).toBe('20');
  });

  it('carries a January loss into February gain', () => {
    const results = replay(
      [
        { competence: '2026-01', events: [sale('jan', '2026-01-10', '100', '-100')] },
        { competence: '2026-02', events: [sale('feb', '2026-02-10', '300', '100')] },
      ],
      [EQUITY_RULE],
    );
    expect(results[0]!.closingLossBalances[0]!.amount.amount).toBe('100');
    const feb = results[1]!.categories[0]!;
    expect(feb.openingLossBalance.amount).toBe('100');
    expect(feb.lossApplied.amount).toBe('100');
    expect(feb.taxableBaseAfterLosses.amount).toBe('0');
    expect(feb.closingLossBalance.amount).toBe('0');
    expect(feb.taxDue!.amount).toBe('0');
  });

  it('propagates loss across four months exactly', () => {
    const results = replay(
      [
        { competence: '2026-01', events: [sale('m1', '2026-01-10', '100', '-100')] },
        { competence: '2026-02', events: [sale('m2', '2026-02-10', '100', '-50')] },
        { competence: '2026-03', events: [sale('m3', '2026-03-10', '200', '100')] },
        { competence: '2026-04', events: [sale('m4', '2026-04-10', '400', '200')] },
      ],
      [EQUITY_RULE],
    );
    const closing = results.map((r) => r.closingLossBalances[0]!.amount.amount);
    expect(closing).toEqual(['100', '150', '50', '0']);

    // Month 3: 100 gain fully absorbed by 150 opening loss -> no tax, 50 remaining.
    expect(results[2]!.categories[0]!.lossApplied.amount).toBe('100');
    expect(results[2]!.categories[0]!.taxDue!.amount).toBe('0');
    // Month 4: 200 base - 50 loss = 150 taxable -> 15% = 22.5
    expect(results[3]!.categories[0]!.lossApplied.amount).toBe('50');
    expect(results[3]!.categories[0]!.taxableBaseAfterLosses.amount).toBe('150');
    expect(results[3]!.categories[0]!.taxDue!.amount).toBe('22.5');
  });

  it('never allows loss application to exceed the taxable base or go negative', () => {
    const [month] = replay(
      [{ competence: '2026-01', events: [sale('g', '2026-01-10', '300', '100')] }],
      [EQUITY_RULE],
    );
    const c = month!.categories[0]!;
    expect(c.taxableBaseAfterLosses.isNegative()).toBe(false);
    expect(c.taxDue!.isNegative()).toBe(false);
  });

  it('resolves opening loss as zero at inception only when history is known', () => {
    const [known] = replay(
      [{ competence: '2026-01', events: [sale('g', '2026-01-10', '300', '100')] }],
      [EQUITY_RULE],
    );
    expect(known!.categories[0]!.openingLossBalance.amount).toBe('0');

    const unknown = replayMonthlyTaxLiability({
      months: [{ competence: '2026-01', events: [sale('g', '2026-01-10', '300', '100')] }],
      ruleSets: [EQUITY_RULE],
      openingLossState: 'UNKNOWN',
    });
    expect(unknown[0]!.status).toBe('PARTIAL');
    expect(unknown[0]!.categories[0]!.qualityIssues).toContain('UNKNOWN_OPENING_LOSS_BALANCE');
    expect(unknown[0]!.categories[0]!.taxDue).toBeNull();
  });

  it('replays 12 / 60 / 120 months deterministically with stable loss propagation', () => {
    for (const n of [12, 60, 120]) {
      const months: Array<{ competence: string; events: ReturnType<typeof sale>[] }> = [];
      for (let i = 0; i < n; i++) {
        const year = 2026 + Math.floor(i / 12);
        const month = (i % 12) + 1;
        const competence = `${year}-${month.toString().padStart(2, '0')}`;
        const realized = i % 3 === 0 ? '-10' : '5';
        months.push({ competence, events: [sale(`m${i}`, `${competence}-10`, '100', realized)] });
      }
      const start = Date.now();
      const first = replay(months, [EQUITY_RULE]);
      const second = replay(months, [EQUITY_RULE]);
      const elapsed = Date.now() - start;
      expect(first).toHaveLength(n);
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
      // Exact, non-negative closing balances throughout.
      for (const month of first) {
        expect(month.closingLossBalances[0]!.amount.isNegative()).toBe(false);
      }
      expect(elapsed).toBeLessThan(5000);
    }
  });
});
