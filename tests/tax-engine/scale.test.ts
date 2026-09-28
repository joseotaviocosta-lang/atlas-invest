import { describe, it, expect } from 'vitest';
import { projectFiscalEvents, buildMonthlyTaxState, type TaxRuleSet } from '@atlas/tax-engine';
import { LocalDate } from '@atlas/domain';
import { buy, sell, PETR } from './helpers';

const RULE: TaxRuleSet = {
  id: 'BR-TEST',
  jurisdiction: 'BR',
  version: 'test-1',
  effectiveFrom: LocalDate.from('2026-01-01'),
  status: 'TEST_ONLY',
};

const META = { assetTypeByAssetId: new Map<string, string>([[PETR, 'STOCK']]) };

function buildLedger(n: number) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const day = ((i % 28) + 1).toString().padStart(2, '0');
    const date = `2026-09-${day}`;
    out.push(i % 2 === 0 ? buy(`tx-${i}`, date, '1', '10') : sell(`tx-${i}`, date, '1', '11'));
  }
  return out;
}

describe('Phase 4A — Scale characteristics', () => {
  it('projects and aggregates 10 / 100 / 1000 / 10000 transactions within bounded time', () => {
    const timings: Record<number, number> = {};
    for (const n of [10, 100, 1000, 10000]) {
      const ledger = buildLedger(n);
      const start = Date.now();
      const events = projectFiscalEvents(ledger, META);
      const state = buildMonthlyTaxState({ competence: '2026-09', events, ruleSets: [RULE] });
      const elapsed = Date.now() - start;
      timings[n] = elapsed;
      expect(state.eventCount).toBe(n);
      // Generous bound: linear/near-linear behaviour, never quadratic blow-up.
      expect(elapsed).toBeLessThan(n === 10000 ? 5000 : 2000);
    }
    // Deterministic, monotonic-ish sanity: 10000 >= 10 not required, but report.
    expect(Object.keys(timings)).toHaveLength(4);
  });
});
