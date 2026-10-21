import { describe, expect, it } from 'vitest';
import { reconcilePositions } from '@atlas/import-engine';

describe('Phase 5L: position snapshot reconciliation (never rewrites the ledger)', () => {
  it('H-matched: ledger 270 vs B3 D-1 snapshot 270 reconciles clean', () => {
    const { entries, summary } = reconcilePositions(
      [{ assetId: 'a1', ticker: 'PETR4', quantity: '270' }],
      [{ assetId: 'a1', ticker: 'PETR4', quantity: '270', asOf: '2026-06-27' }],
    );
    expect(summary).toEqual({
      totalAssets: 1,
      matched: 1,
      divergent: 0,
      missingLocal: 0,
      missingSource: 0,
      unresolved: 0,
    });
    expect(entries[0]).toMatchObject({ status: 'MATCHED', delta: '0' });
  });

  it('H-divergent: ledger 260 vs source 270 reports +10 without mutating anything', () => {
    const ledger = [{ assetId: 'a1', ticker: 'PETR4', quantity: '260' }];
    const { entries, summary } = reconcilePositions(ledger, [
      { assetId: 'a1', ticker: 'PETR4', quantity: '270', asOf: '2026-06-27' },
    ]);
    expect(summary.divergent).toBe(1);
    expect(entries[0]).toMatchObject({ status: 'DIVERGENT', delta: '10' });
    expect(ledger).toEqual([{ assetId: 'a1', ticker: 'PETR4', quantity: '260' }]);
  });

  it('distinguishes missing-local, missing-source and unparseable rows', () => {
    const { entries, summary } = reconcilePositions(
      [
        { assetId: 'local-only', quantity: '10' },
        { assetId: 'garbage', quantity: 'abc' },
      ],
      [
        { assetId: 'garbage', quantity: 'xyz', asOf: '2026-06-27' },
        { assetId: 'source-only', quantity: '5', asOf: '2026-06-27' },
      ],
    );
    const byAsset = Object.fromEntries(entries.map((entry) => [entry.assetId, entry.status]));
    expect(byAsset).toEqual({
      garbage: 'UNRESOLVED',
      'local-only': 'MISSING_SOURCE',
      'source-only': 'MISSING_LOCAL',
    });
    expect(summary).toEqual({
      totalAssets: 3,
      matched: 0,
      divergent: 0,
      missingLocal: 1,
      missingSource: 1,
      unresolved: 1,
    });
  });

  it('compares NUMERIC-formatted quantities canonically', () => {
    const { entries } = reconcilePositions(
      [{ assetId: 'a1', quantity: '100.00' }],
      [{ assetId: 'a1', quantity: '100', asOf: '2026-06-27' }],
    );
    expect(entries[0]?.status).toBe('MATCHED');
  });
});
