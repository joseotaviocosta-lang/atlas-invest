import { describe, expect, it } from 'vitest';
import {
  buildCompositionDimension,
  largestBucket,
  topPositions,
  UNCLASSIFIED_KEY,
} from '@atlas/portfolio-strategy';

/**
 * Phase 5R-C — composition engine (pure, zero I/O).
 *
 * Exact integer basis points, deterministic ordering, explicit UNKNOWN
 * buckets. No inference, no renormalization hiding unknowns, no scores.
 */
describe('Phase 5R-C: composition dimension building', () => {
  it('aggregates buckets with exact basis points and deterministic order', () => {
    const dimension = buildCompositionDimension({
      code: 'ASSET_CLASS',
      currency: 'BRL',
      denominator: '10000',
      entries: [
        { key: 'STOCK', label: 'Ações', value: '6000', positionCount: 3 },
        { key: 'FIXED_INCOME', label: 'Renda Fixa', value: '3000', positionCount: 2 },
        { key: 'CASH', label: 'Caixa', value: '1000', positionCount: 1 },
      ],
    });
    expect(dimension.buckets.map((row) => [row.key, row.weightBp])).toEqual([
      ['STOCK', 6000],
      ['FIXED_INCOME', 3000],
      ['CASH', 1000],
    ]);
    expect(dimension.coveragePercent).toBe('100.00');
    expect(dimension.unclassified).toBeNull();
    expect(dimension.totalKnownValue).toBe('10000');
  });

  it('merges duplicate keys and breaks weight ties by key', () => {
    const dimension = buildCompositionDimension({
      code: 'EXCHANGE',
      currency: 'BRL',
      denominator: '2000',
      entries: [
        { key: 'B', label: 'B', value: '500', positionCount: 1 },
        { key: 'A', label: 'A', value: '500', positionCount: 1 },
        { key: 'B', label: 'B', value: '1000', positionCount: 2 },
      ],
    });
    expect(dimension.buckets.map((row) => [row.key, row.weightBp, row.positionCount])).toEqual([
      ['B', 7500, 3],
      ['A', 2500, 1],
    ]);
  });

  it('rounds half-up without forcing bucket sums to 10000', () => {
    const dimension = buildCompositionDimension({
      code: 'ASSET',
      currency: 'BRL',
      denominator: '300',
      entries: [
        { key: 'a', label: 'A', value: '100', positionCount: 1 },
        { key: 'b', label: 'B', value: '100', positionCount: 1 },
        { key: 'c', label: 'C', value: '100', positionCount: 1 },
      ],
    });
    expect(dimension.buckets.map((row) => row.weightBp)).toEqual([3333, 3333, 3333]);
    expect(dimension.coveragePercent).toBe('100.00');
  });

  it('groups unknown classifications into an explicit UNCLASSIFIED bucket', () => {
    const dimension = buildCompositionDimension({
      code: 'ASSET_CLASS',
      currency: 'BRL',
      denominator: '10000',
      entries: [
        { key: 'STOCK', label: 'Ações', value: '7000', positionCount: 2 },
        { key: null, label: 'X', value: '2000', positionCount: 1 },
        { key: '', label: 'Y', value: '1000', positionCount: 1 },
      ],
    });
    expect(dimension.unclassified).toMatchObject({
      key: UNCLASSIFIED_KEY,
      marketValue: '3000',
      weightBp: 3000,
      positionCount: 2,
    });
    expect(dimension.coveragePercent).toBe('70.00');
    // Classified buckets come first; UNCLASSIFIED is appended last.
    expect(dimension.buckets.map((row) => row.key)).toEqual(['STOCK', UNCLASSIFIED_KEY]);
  });

  it('fails closed on a zero denominator instead of inventing weights', () => {
    const dimension = buildCompositionDimension({
      code: 'CURRENCY',
      currency: null,
      denominator: '0',
      entries: [{ key: 'BRL', label: 'BRL', value: '0', positionCount: 0 }],
    });
    expect(dimension.buckets[0]?.weightBp).toBeNull();
    expect(dimension.totalKnownValue).toBeNull();
    expect(dimension.coveragePercent).toBeNull();
  });

  it('reports zero values as zero, never as unknown', () => {
    const dimension = buildCompositionDimension({
      code: 'ASSET',
      currency: 'BRL',
      denominator: '1000',
      entries: [{ key: 'a', label: 'A', value: '0', positionCount: 1 }],
    });
    expect(dimension.buckets).toHaveLength(1);
    expect(dimension.buckets[0]).toMatchObject({ weightBp: 0, marketValue: '0' });
  });

  it('contains no heuristic classification', () => {
    // Genuine grouping keys only — never string-sniffed.
    const source = buildCompositionDimension.toString();
    expect(source).not.toMatch(/startsWith|includes\(|toUpperCase|toLowerCase/);
  });
});

describe('Phase 5R-C: top positions and concentration facts', () => {
  it('ranks by weight desc with stable assetId tiebreaks', () => {
    expect(
      topPositions(
        [
          { assetId: 'b', ticker: 'B', value: '100', weightBp: 1000 },
          { assetId: 'a', ticker: 'A', value: '100', weightBp: 1000 },
          { assetId: 'c', ticker: 'C', value: '900', weightBp: 9000 },
        ],
        2,
      ),
    ).toEqual([
      { assetId: 'c', ticker: 'C', marketValue: '900', weightBp: 9000, rank: 1 },
      { assetId: 'a', ticker: 'A', marketValue: '100', weightBp: 1000, rank: 2 },
    ]);
  });

  it('largestBucket skips unclassified buckets', () => {
    const dimension = buildCompositionDimension({
      code: 'ASSET_CLASS',
      currency: 'BRL',
      denominator: '10000',
      entries: [
        { key: 'STOCK', label: 'Ações', value: '4000', positionCount: 1 },
        { key: null, label: '?', value: '6000', positionCount: 1 },
      ],
    });
    expect(largestBucket(dimension)).toEqual({
      dimension: 'ASSET_CLASS',
      key: 'STOCK',
      label: 'Ações',
      weightBp: 4000,
    });
    expect(largestBucket({ code: 'ASSET_CLASS', buckets: [] })).toBeNull();
  });
});
