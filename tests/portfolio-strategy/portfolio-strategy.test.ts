import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compareAllocationToStrategy, validateStrategyTargets } from '@atlas/portfolio-strategy';
import {
  formatBasisPointsPtBr,
  formatDeviationPtBr,
  parsePercentToBasisPoints,
  STRATEGY_TOLERANCE_BP,
} from '@atlas/portfolio-strategy';

/**
 * Phase 5Q-C — strategy domain contract (pure).
 *
 * Covers the validation matrix (valid/invalid totals, duplicates, unknown
 * categories, zero targets, empty), the comparison matrix (above/below/on,
 * tolerance boundary, missing sides, multi-currency-safe aggregation is the
 * caller's job), deterministic ordering, exact basis-point math and the
 * advice boundary (no recommendation vocabulary anywhere in the contract).
 */
describe('Phase 5Q-C: strategy validation', () => {
  const valid = [
    { category: 'FIXED_INCOME', targetBp: 4000 },
    { category: 'STOCK', targetBp: 4000 },
    { category: 'FII', targetBp: 2000 },
  ];

  it('accepts a valid 100% strategy', () => {
    expect(validateStrategyTargets(valid)).toEqual({ valid: true });
  });

  it('rejects totals below and above 100%', () => {
    expect(
      validateStrategyTargets([
        { category: 'STOCK', targetBp: 4000 },
        { category: 'FII', targetBp: 2000 },
      ]),
    ).toEqual({ valid: false, errors: [{ code: 'TOTAL_NOT_100' }] });
    expect(
      validateStrategyTargets([
        { category: 'STOCK', targetBp: 6000 },
        { category: 'FII', targetBp: 5000 },
      ]),
    ).toEqual({ valid: false, errors: [{ code: 'TOTAL_NOT_100' }] });
  });

  it('rejects duplicate categories without summing them', () => {
    const result = validateStrategyTargets([
      { category: 'STOCK', targetBp: 5000 },
      { category: 'STOCK', targetBp: 5000 },
    ]);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContainEqual({ code: 'DUPLICATE_CATEGORY' });
    }
  });

  it('rejects unknown categories instead of creating them', () => {
    const result = validateStrategyTargets([
      { category: 'CRYPTO_SUPER_GROWTH', targetBp: 5000 },
      { category: 'STOCK', targetBp: 5000 },
    ]);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContainEqual({ code: 'UNKNOWN_CATEGORY' });
    }
  });

  it('rejects non-integer, negative and over-100 weights', () => {
    for (const targetBp of [12.5, -1, 10001, Number.NaN]) {
      const result = validateStrategyTargets([{ category: 'STOCK', targetBp: targetBp as number }]);
      expect(result.valid).toBe(false);
    }
  });

  it('accepts zero targets explicitly and rejects empty strategies', () => {
    expect(
      validateStrategyTargets([
        { category: 'STOCK', targetBp: 10000 },
        { category: 'CASH', targetBp: 0 },
      ]),
    ).toEqual({ valid: true });
    expect(validateStrategyTargets([])).toEqual({
      valid: false,
      errors: [{ code: 'EMPTY_TARGETS' }],
    });
  });
});

describe('Phase 5Q-C: strategy comparison', () => {
  const targets = [
    { category: 'FIXED_INCOME', targetBp: 4000 },
    { category: 'STOCK', targetBp: 4000 },
    { category: 'FII', targetBp: 2000 },
  ];

  it('maps on/above/below target with exact deviations', () => {
    const comparison = compareAllocationToStrategy({
      targets,
      current: [
        { category: 'FIXED_INCOME', currentBp: 3500 },
        { category: 'STOCK', currentBp: 4700 },
        { category: 'FII', currentBp: 1800 },
      ],
    });
    expect(comparison.rows).toEqual([
      {
        category: 'STOCK',
        targetBp: 4000,
        currentBp: 4700,
        deviationBp: 700,
        state: 'ABOVE_TARGET',
      },
      {
        category: 'FII',
        targetBp: 2000,
        currentBp: 1800,
        deviationBp: -200,
        state: 'BELOW_TARGET',
      },
      {
        category: 'FIXED_INCOME',
        targetBp: 4000,
        currentBp: 3500,
        deviationBp: -500,
        state: 'BELOW_TARGET',
      },
    ]);
    expect(comparison.outsideTolerance).toEqual(['STOCK', 'FII', 'FIXED_INCOME']);
    expect(comparison.worstGap).toEqual({ category: 'FIXED_INCOME', deviationBp: -500 });
  });

  it('treats tolerance as inclusive on both sides', () => {
    const comparison = compareAllocationToStrategy({
      targets: [{ category: 'STOCK', targetBp: 4000 }],
      current: [
        { category: 'STOCK', currentBp: 4000 + STRATEGY_TOLERANCE_BP },
        { category: 'FII', currentBp: STRATEGY_TOLERANCE_BP + 1 },
      ],
    });
    expect(comparison.rows.find((row) => row.category === 'STOCK')?.state).toBe('ON_TARGET');
    expect(comparison.rows.find((row) => row.category === 'FII')?.state).toBe('ABOVE_TARGET');
    expect(comparison.rows.find((row) => row.category === 'FII')?.targetBp).toBe(0);
  });

  it('orders canonically, never by current weight', () => {
    const comparison = compareAllocationToStrategy({
      targets: [
        { category: 'CASH', targetBp: 1000 },
        { category: 'STOCK', targetBp: 9000 },
      ],
      current: [
        { category: 'CASH', currentBp: 1000 },
        { category: 'STOCK', currentBp: 9000 },
      ],
    });
    expect(comparison.rows.map((row) => row.category)).toEqual(['STOCK', 'CASH']);
  });

  it('treats targeted-but-missing as 0% current and untargeted current as target 0', () => {
    const comparison = compareAllocationToStrategy({
      targets: [{ category: 'FIXED_INCOME', targetBp: 3000 }],
      current: [{ category: 'CASH', currentBp: 1000 }],
    });
    expect(comparison.rows.find((row) => row.category === 'FIXED_INCOME')).toMatchObject({
      targetBp: 3000,
      currentBp: 0,
      deviationBp: -3000,
      state: 'BELOW_TARGET',
    });
    expect(comparison.rows.find((row) => row.category === 'CASH')).toMatchObject({
      targetBp: 0,
      currentBp: 1000,
      deviationBp: 1000,
      state: 'ABOVE_TARGET',
    });
  });

  it('marks unknown current as UNAVAILABLE instead of guessing', () => {
    const comparison = compareAllocationToStrategy({
      targets,
      current: [{ category: 'STOCK', currentBp: null }],
    });
    expect(comparison.rows.find((row) => row.category === 'STOCK')).toMatchObject({
      deviationBp: null,
      state: 'UNAVAILABLE',
    });
  });
});

describe('Phase 5Q-C: locale-safe percent parsing without floats', () => {
  it('parses pt-BR and plain decimals into basis points', () => {
    expect(parsePercentToBasisPoints('25')).toBe(2500);
    expect(parsePercentToBasisPoints('25.5')).toBe(2550);
    expect(parsePercentToBasisPoints('25,5')).toBe(2550);
    expect(parsePercentToBasisPoints('25,25')).toBe(2525);
    expect(parsePercentToBasisPoints('0')).toBe(0);
    expect(parsePercentToBasisPoints('0,00')).toBe(0);
    expect(parsePercentToBasisPoints('33.33')).toBe(3333);
    expect(parsePercentToBasisPoints('33.335')).toBe(3333);
  });

  it('rejects negatives, empties and garbage (never parseFloat coercion)', () => {
    expect(parsePercentToBasisPoints('-1')).toBeNull();
    expect(parsePercentToBasisPoints('')).toBeNull();
    expect(parsePercentToBasisPoints('abc')).toBeNull();
    expect(parsePercentToBasisPoints(null)).toBeNull();
    // parseFloat('25,5') === 25 — the classic locale bug this avoids.
    expect(parsePercentToBasisPoints('25,5')).not.toBe(2500 - 50 + 50 - 50 + 0);
    expect(parsePercentToBasisPoints('25,5')).toBe(2550);
  });

  it('formats basis points back to pt-BR without floats', () => {
    expect(formatBasisPointsPtBr(2500)).toBe('25,00%');
    expect(formatBasisPointsPtBr(10000)).toBe('100,00%');
    expect(formatBasisPointsPtBr(123456)).toBe('1.234,56%');
    expect(formatDeviationPtBr(700)).toBe('+7,00 p.p.');
    expect(formatDeviationPtBr(-500)).toBe('-5,00 p.p.');
    expect(formatDeviationPtBr(0)).toBe('0,00 p.p.');
  });

  it('contains no recommendation vocabulary in the contract', () => {
    const sources = ['types.ts', 'policy.ts', 'strategy.ts'].map((file) =>
      fs.readFileSync(path.join(process.cwd(), 'packages/portfolio-strategy/src', file), 'utf8'),
    );
    for (const content of sources) {
      expect(content).not.toMatch(
        /compre|venda\b|deve comprar|deve vender|rebalanceie|recomendamos|ideal\b|melhor\b|pior\b/i,
      );
    }
  });
});
