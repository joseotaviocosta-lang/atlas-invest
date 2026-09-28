import { describe, it, expect } from 'vitest';
import { LocalDate } from '@atlas/domain';
import { projectFiscalEvents, buildMonthlyTaxState, type TaxRuleSet } from '@atlas/tax-engine';
import { allSixteenTypes, PETR } from './helpers';

const RULE: TaxRuleSet = {
  id: 'BR-TEST',
  jurisdiction: 'BR',
  version: 'test-1',
  effectiveFrom: LocalDate.from('2026-01-01'),
  effectiveTo: LocalDate.from('2026-12-31'),
  status: 'TEST_ONLY',
};

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe('Phase 4A — Determinism and order independence', () => {
  const base = allSixteenTypes('det');
  const options = { assetTypeByAssetId: new Map<string, string>([[PETR, 'STOCK']]) };

  it('produces identical projections across 1000 repeated executions', () => {
    const first = JSON.stringify(projectFiscalEvents(base, options));
    for (let i = 0; i < 1000; i++) {
      expect(JSON.stringify(projectFiscalEvents(base, options))).toBe(first);
    }
  });

  it('produces identical monthly state across 1000 repeated executions', () => {
    const events = projectFiscalEvents(base, options);
    const first = JSON.stringify(
      buildMonthlyTaxState({ competence: '2026-09', events, ruleSets: [RULE] }),
    );
    for (let i = 0; i < 1000; i++) {
      const again = buildMonthlyTaxState({
        competence: '2026-09',
        events: projectFiscalEvents(base, options),
        ruleSets: [RULE],
      });
      expect(JSON.stringify(again)).toBe(first);
    }
  });

  it('is invariant to input permutation (permutation invariance)', () => {
    const reference = JSON.stringify(projectFiscalEvents(base, options));
    for (let seed = 1; seed <= 25; seed++) {
      const shuffled = seededShuffle(base, seed);
      expect(JSON.stringify(projectFiscalEvents(shuffled, options))).toBe(reference);
    }
  });

  it('builds the same monthly state regardless of event input order', () => {
    const forward = projectFiscalEvents(base, options);
    const backward = projectFiscalEvents([...base].reverse(), options);
    const a = buildMonthlyTaxState({ competence: '2026-09', events: forward, ruleSets: [RULE] });
    const b = buildMonthlyTaxState({ competence: '2026-09', events: backward, ruleSets: [RULE] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
