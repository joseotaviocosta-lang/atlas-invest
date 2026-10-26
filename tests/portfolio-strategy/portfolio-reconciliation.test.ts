import { describe, expect, it } from 'vitest';
import {
  compareReconciliationFacts,
  type LocalFact,
  type SourceFact,
} from '@atlas/portfolio-strategy';

function source(overrides: Partial<SourceFact> = {}): SourceFact {
  return {
    source: 'B3',
    reference: null,
    type: 'BUY',
    date: '2026-10-10',
    assetId: 'asset-1',
    ticker: 'PETR4',
    quantity: '100',
    amount: null,
    currency: 'BRL',
    ...overrides,
  };
}

function local(overrides: Partial<LocalFact> = {}): LocalFact {
  return {
    transactionId: 'tx-1',
    type: 'BUY',
    tradeDate: '2026-10-10',
    assetId: 'asset-1',
    ticker: 'PETR4',
    quantity: '100',
    amount: null,
    currency: 'BRL',
    ...overrides,
  };
}

/**
 * Phase 5S-B — reconciliation comparison engine (pure, zero I/O).
 *
 * Semantic field comparison with exact decimals/dates/identity. No
 * floats, no JSON-string diffs, no fuzzy matching, no confidence scores.
 */
describe('Phase 5S-B: exact match and single differences', () => {
  it('matches identical facts on every comparable field', () => {
    const result = compareReconciliationFacts(source(), local());
    expect(result.state).toBe('MATCHED');
    expect(result.differences).toEqual([]);
    expect(result.matchingFacts).toEqual([
      'SAME_DATE',
      'SAME_TYPE',
      'SAME_ASSET',
      'SAME_QUANTITY',
      'SAME_CURRENCY',
    ]);
  });

  it('matches income amounts exactly regardless of scale', () => {
    const result = compareReconciliationFacts(
      source({ type: 'DIVIDEND', quantity: null, amount: '87.30' }),
      local({ type: 'DIVIDEND', quantity: null, amount: '87.3' }),
    );
    expect(result.state).toBe('MATCHED');
    expect(result.matchingFacts).toContain('SAME_AMOUNT');
  });

  it('flags date, amount, quantity, type, asset and currency differences', () => {
    const cases: Array<{
      name: string;
      sourcePatch: Partial<SourceFact>;
      kind: string;
      field: string;
    }> = [
      { name: 'date', sourcePatch: { date: '2026-10-11' }, kind: 'DATE_DIFFERENCE', field: 'date' },
      {
        name: 'amount',
        sourcePatch: { quantity: null, amount: '90.00' },
        kind: 'AMOUNT_DIFFERENCE',
        field: 'amount',
      },
      {
        name: 'quantity',
        sourcePatch: { quantity: '50' },
        kind: 'QUANTITY_DIFFERENCE',
        field: 'quantity',
      },
      { name: 'type', sourcePatch: { type: 'SELL' }, kind: 'TYPE_DIFFERENCE', field: 'type' },
      {
        name: 'asset',
        sourcePatch: { assetId: 'asset-2', ticker: 'VALE3' },
        kind: 'ASSET_DIFFERENCE',
        field: 'asset',
      },
      {
        name: 'currency',
        sourcePatch: { currency: 'USD' },
        kind: 'CURRENCY_DIFFERENCE',
        field: 'currency',
      },
    ];
    for (const entry of cases) {
      const patchedSource = source(entry.sourcePatch);
      const patchedLocal =
        entry.name === 'amount' ? local({ quantity: null, amount: '87.30' }) : local();
      const result = compareReconciliationFacts(patchedSource, patchedLocal);
      expect(result.state, entry.name).toBe('DIVERGENT');
      expect(result.differences, entry.name).toHaveLength(1);
      expect(result.differences[0]).toMatchObject({ field: entry.field, kind: entry.kind });
    }
  });

  it('compares decimals exactly without floats', () => {
    const close = compareReconciliationFacts(
      source({ quantity: '100.00000001' }),
      local({ quantity: '100' }),
    );
    expect(close.state).toBe('DIVERGENT');
    expect(close.differences[0]?.kind).toBe('QUANTITY_DIFFERENCE');
  });

  it('compares civil dates without timezone math', () => {
    const withTime = compareReconciliationFacts(
      source({ date: '2026-10-10T23:59:00.000Z' }),
      local({ tradeDate: '2026-10-10' }),
    );
    expect(withTime.state).toBe('MATCHED');
    const garbage = compareReconciliationFacts(source({ date: 'tomorrow' }), local());
    expect(garbage.state).toBe('DIVERGENT');
  });

  it('never confirms identity on ticker alone', () => {
    const result = compareReconciliationFacts(
      source({ assetId: null, ticker: 'PETR4' }),
      local({ assetId: null, ticker: 'PETR4' }),
    );
    expect(result.state).toBe('MATCHED');
    expect(result.matchingFacts).not.toContain('SAME_ASSET');
    const mismatch = compareReconciliationFacts(
      source({ assetId: 'asset-9', ticker: 'PETR4' }),
      local({ assetId: 'asset-1', ticker: 'PETR4' }),
    );
    expect(mismatch.state).toBe('DIVERGENT');
    expect(mismatch.differences[0]).toMatchObject({ kind: 'ASSET_DIFFERENCE' });
  });
});

describe('Phase 5S-B: missing sides, multiples and ordering', () => {
  it('reports source-only and local-only without inventing the other side', () => {
    expect(compareReconciliationFacts(source(), null)).toMatchObject({ state: 'MISSING_LOCAL' });
    expect(compareReconciliationFacts(null, local())).toMatchObject({ state: 'MISSING_SOURCE' });
    expect(compareReconciliationFacts(null, null)).toMatchObject({ state: 'UNRESOLVED' });
  });

  it('lists multiple differences in deterministic field order', () => {
    const result = compareReconciliationFacts(
      source({ date: '2026-10-11', currency: 'USD', quantity: '50' }),
      local(),
    );
    expect(result.state).toBe('DIVERGENT');
    expect(result.differences.map((row) => row.field)).toEqual(['date', 'quantity', 'currency']);
  });

  it('ignores absent fields on both sides without false differences', () => {
    const result = compareReconciliationFacts(
      source({ quantity: null, amount: null }),
      local({ quantity: null, amount: null }),
    );
    expect(result.differences).toEqual([]);
  });

  it('contains no score, forecast or fuzzy language', () => {
    const result = compareReconciliationFacts(source(), local({ date: '2026-10-11' }));
    expect(JSON.stringify(result)).not.toMatch(/score|confiden|fuzzy|probab|match_/i);
    expect(compareReconciliationFacts.toString()).not.toMatch(
      /parseFloat|\bNumber\(|confidence|similarity/i,
    );
  });
});
