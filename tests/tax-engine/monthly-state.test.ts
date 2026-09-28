import { describe, it, expect } from 'vitest';
import { LocalDate } from '@atlas/domain';
import {
  projectFiscalEvents,
  buildMonthlyTaxState,
  type CanonicalRealizedResult,
  type TaxRuleSet,
} from '@atlas/tax-engine';
import { buy, sell, income, uuidFor, PETR, VALE } from './helpers';

const RULE: TaxRuleSet = {
  id: 'BR-TEST-2026',
  jurisdiction: 'BR',
  version: 'test-1',
  effectiveFrom: LocalDate.from('2026-01-01'),
  effectiveTo: LocalDate.from('2026-12-31'),
  status: 'TEST_ONLY',
};

const STOCK_META = { assetTypeByAssetId: new Map<string, string>([[PETR, 'STOCK']]) };

function canonical(entries: Array<[string, CanonicalRealizedResult]>) {
  return { canonicalRealizedByTransactionId: new Map<string, CanonicalRealizedResult>(entries) };
}

describe('Phase 4A — Monthly Tax State', () => {
  it('EMPTY month is a valid state (zero events), not an error', () => {
    const state = buildMonthlyTaxState({
      competence: '2026-09',
      events: [],
      ruleSets: [RULE],
    });
    expect(state.status).toBe('EMPTY');
    expect(state.eventCount).toBe(0);
    expect(state.categories).toHaveLength(0);
    expect(state.dataQuality.issueCount).toBe(0);
  });

  it('COMPLETE month aggregates canonical facts per category', () => {
    const events = projectFiscalEvents(
      [buy('b', '2026-09-02', '10', '25'), sell('s', '2026-09-20', '10', '30')],
      {
        ...STOCK_META,
        ...canonical([[uuidFor('s'), { realizedGainLoss: '50', costBasisRemoved: '250' }]]),
      },
    );
    const state = buildMonthlyTaxState({ competence: '2026-09', events, ruleSets: [RULE] });
    expect(state.status).toBe('COMPLETE');
    expect(state.eventCount).toBe(2);
    const equity = state.categories.find((c) => c.category === 'BRAZILIAN_EQUITY')!;
    expect(equity.capability).toBe('CALCULABLE');
    expect(equity.eventCount).toBe(2);
    expect(equity.salesProceeds!.amount).toBe('300');
    expect(equity.realizedGain!.amount).toBe('50');
    expect(state.capabilities.taxLiabilitySupported).toBe(false);
    expect(state.capabilities.withholdingSupported).toBe(false);
  });

  it('PARTIAL month when some sales lack canonical cost basis', () => {
    const events = projectFiscalEvents([sell('s', '2026-09-20', '10', '30')], STOCK_META);
    const state = buildMonthlyTaxState({ competence: '2026-09', events, ruleSets: [RULE] });
    expect(state.status).toBe('PARTIAL');
    expect(state.dataQuality.issues).toContain('UNKNOWN_COST_BASIS');
    const equity = state.categories.find((c) => c.category === 'BRAZILIAN_EQUITY')!;
    expect(equity.capability).toBe('PARTIAL');
    // A partial sale must not yield a fabricated realized total.
    expect(equity.realizedGain).toBeUndefined();
    expect(equity.realizedLoss).toBeUndefined();
  });

  it('BLOCKED month when no rule set covers the competence (fail closed)', () => {
    const events = projectFiscalEvents([buy('b')], STOCK_META);
    const state = buildMonthlyTaxState({ competence: '2026-09', events, ruleSets: [] });
    expect(state.status).toBe('BLOCKED');
    expect(state.dataQuality.issues).toContain('MISSING_RULE_SET');
    expect(state.ruleSetResolution.ok).toBe(false);
  });

  it('counts first and last day of the month and excludes the next month', () => {
    const events = projectFiscalEvents(
      [
        buy('first', '2026-09-01'),
        buy('last', '2026-09-30'),
        buy('next', '2026-10-01'),
        buy('prev', '2026-08-31'),
      ],
      STOCK_META,
    );
    const state = buildMonthlyTaxState({ competence: '2026-09', events, ruleSets: [RULE] });
    expect(state.eventCount).toBe(2);
    expect(state.events.map((e) => e.sourceTransactionId).sort()).toEqual(
      [uuidFor('first'), uuidFor('last')].sort(),
    );
  });

  it('prevents future leakage: October events never appear in September', () => {
    const events = projectFiscalEvents([buy('oct', '2026-10-05')], STOCK_META);
    const state = buildMonthlyTaxState({ competence: '2026-09', events, ruleSets: [RULE] });
    expect(state.eventCount).toBe(0);
    expect(state.status).toBe('EMPTY');
  });

  it('segregates currencies without implicit FX aggregation', () => {
    const events = projectFiscalEvents(
      [
        buy('brl', '2026-09-02', '10', '25', 'BRL', PETR),
        buy('usd', '2026-09-02', '10', '5', 'USD', VALE),
      ],
      {
        assetTypeByAssetId: new Map([
          [PETR, 'STOCK'],
          [VALE, 'STOCK'],
        ]),
      },
    );
    const state = buildMonthlyTaxState({ competence: '2026-09', events, ruleSets: [RULE] });
    expect(state.currencies).toEqual(['BRL', 'USD']);
    const usd = state.categories.find((c) => c.currency === 'USD')!;
    expect(usd.qualityIssues).toContain('UNSUPPORTED_CURRENCY');
    // BRL category must not be polluted by the USD event.
    const brl = state.categories.find((c) => c.currency === 'BRL')!;
    expect(brl.qualityIssues).not.toContain('UNSUPPORTED_CURRENCY');
  });

  it('keeps income distinct and aggregated per category', () => {
    const events = projectFiscalEvents([income('DIVIDEND', 'd', '2026-09-03', '100')], STOCK_META);
    const state = buildMonthlyTaxState({ competence: '2026-09', events, ruleSets: [RULE] });
    const equity = state.categories.find((c) => c.category === 'BRAZILIAN_EQUITY')!;
    expect(equity.income!.amount).toBe('100');
  });

  it('marks UNKNOWN asset category as BLOCKED at category level', () => {
    const events = projectFiscalEvents([sell('s', '2026-09-20', '10', '30', 'BRL', VALE)]);
    const state = buildMonthlyTaxState({ competence: '2026-09', events, ruleSets: [RULE] });
    const unknown = state.categories.find((c) => c.category === 'UNKNOWN')!;
    expect(unknown.capability).toBe('BLOCKED');
    expect(state.status).toBe('PARTIAL');
  });

  it('exposes the resolved rule set version and production verification capability', () => {
    const events = projectFiscalEvents([buy('b')], STOCK_META);
    const state = buildMonthlyTaxState({ competence: '2026-09', events, ruleSets: [RULE] });
    expect(state.ruleSetResolution.ok).toBe(true);
    if (state.ruleSetResolution.ok) {
      expect(state.ruleSetResolution.ruleSet.version).toBe('test-1');
    }
    // TEST_ONLY rule never counts as production-verified.
    expect(state.capabilities.productionRuleVerified).toBe(false);
    expect(state.capabilities.foundationOnly).toBe(true);
  });
});
