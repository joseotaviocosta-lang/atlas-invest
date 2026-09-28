import { describe, it, expect } from 'vitest';
import { projectFiscalEvents, buildMonthlyTaxState, type TaxRuleSet } from '@atlas/tax-engine';
import { LocalDate } from '@atlas/domain';
import { buy, sell, uuidFor, PETR } from './helpers';

const RULE: TaxRuleSet = {
  id: 'BR-TEST',
  jurisdiction: 'BR',
  version: 'test-1',
  effectiveFrom: LocalDate.from('2026-01-01'),
  status: 'TEST_ONLY',
};

const META = { assetTypeByAssetId: new Map<string, string>([[PETR, 'STOCK']]) };

describe('Phase 4A — Exact decimal semantics (zero IEEE-754)', () => {
  it('preserves extreme decimal precision end to end', () => {
    const [event] = projectFiscalEvents(
      [buy('precise', '2026-09-02', '3.999999999999999999', '12345.678901234567890123')],
      META,
    );
    expect(event!.quantity!.value).toBe('3.999999999999999999');
    expect(event!.unitPrice!.amount).toBe('12345.678901234567890123');
  });

  it('computes proceeds without binary floating-point drift', () => {
    // 1.1 - 0.2 must be exactly 0.9 (never 0.9000000000000001).
    const [event] = projectFiscalEvents(
      [sell('s', '2026-09-02', '1', '1.1', 'BRL', PETR, '0.2')],
      META,
    );
    expect(event!.proceeds!.amount).toBe('0.9');
  });

  it('aggregates precise decimal amounts exactly in monthly state', () => {
    // 0.1 + 0.2 must aggregate to exactly 0.3.
    const events = projectFiscalEvents(
      [
        sell('s1', '2026-09-02', '1', '0.1', 'BRL', PETR),
        sell('s2', '2026-09-03', '1', '0.2', 'BRL', PETR),
      ],
      META,
    );
    const state = buildMonthlyTaxState({ competence: '2026-09', events, ruleSets: [RULE] });
    const equity = state.categories.find((c) => c.category === 'BRAZILIAN_EQUITY')!;
    expect(equity.salesProceeds!.amount).toBe('0.3');
  });

  it('keeps exact strings for high-precision income aggregation', () => {
    const events = projectFiscalEvents([sell('v1', '2026-09-28', '0.1', '0.2')], {
      ...META,
      canonicalRealizedByTransactionId: new Map([
        [uuidFor('v1'), { realizedGainLoss: '0.3000000000000000001' }],
      ]),
    });
    const state = buildMonthlyTaxState({ competence: '2026-09', events, ruleSets: [RULE] });
    const equity = state.categories.find((c) => c.category === 'BRAZILIAN_EQUITY')!;
    expect(equity.realizedGain!.amount).toBe('0.3000000000000000001');
  });
});
