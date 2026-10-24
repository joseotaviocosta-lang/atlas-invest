import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseScenarioAmountToCanonical,
  simulateAllocationScenario,
  validateScenarioInput,
} from '@atlas/portfolio-strategy';

/**
 * Phase 5Q-D — scenario derivation contract (pure).
 *
 * Hypothetical contributions only (WITHDRAWAL is explicitly unsupported in
 * v1). Exact decimal money math; integer basis-point weights; neutral
 * before/after metrics. No advice, no optimization, no execution.
 */
const TARGETS = [
  { category: 'STOCK', targetBp: 6000 },
  { category: 'FIXED_INCOME', targetBp: 4000 },
];

const CURRENT = [
  { category: 'STOCK', value: '8000.00' },
  { category: 'FIXED_INCOME', value: '2000.00' },
];

describe('Phase 5Q-D: scenario validation', () => {
  it('accepts a simple contribution', () => {
    expect(
      validateScenarioInput({
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount: '1000' }],
      }),
    ).toEqual({ valid: true });
  });

  it('accepts multiple categories and cent precision', () => {
    expect(
      validateScenarioInput({
        type: 'CONTRIBUTION',
        changes: [
          { category: 'STOCK', amount: '3000' },
          { category: 'FIXED_INCOME', amount: '7050.25' },
        ],
      }),
    ).toEqual({ valid: true });
  });

  it('rejects unknown scenario types (WITHDRAWAL deferred explicitly)', () => {
    const result = validateScenarioInput({
      type: 'WITHDRAWAL',
      changes: [{ category: 'STOCK', amount: '100' }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toEqual([{ code: 'UNKNOWN_SCENARIO_TYPE' }]);
  });

  it('rejects unknown categories instead of inventing them', () => {
    const result = validateScenarioInput({
      type: 'CONTRIBUTION',
      changes: [{ category: 'CRYPTO_X', amount: '100' }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toContainEqual({ code: 'UNKNOWN_CATEGORY' });
  });

  it('rejects duplicates without summing silently', () => {
    const result = validateScenarioInput({
      type: 'CONTRIBUTION',
      changes: [
        { category: 'STOCK', amount: '100' },
        { category: 'STOCK', amount: '200' },
      ],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toContainEqual({ code: 'DUPLICATE_CATEGORY' });
  });

  it('rejects zero, negative and malformed amounts', () => {
    for (const amount of ['0', '0.00', '-5', 'abc', '', '10.123', '1,000.00']) {
      const result = validateScenarioInput({
        type: 'CONTRIBUTION',
        changes: [{ category: 'STOCK', amount }],
      });
      expect(result.valid, amount).toBe(false);
    }
    expect(validateScenarioInput({ type: 'CONTRIBUTION', changes: [] })).toEqual({
      valid: false,
      errors: [{ code: 'EMPTY_CHANGES' }],
    });
  });

  it('rejects pt-BR thousands without canonical form', () => {
    // '10.000,50' is locale input: the edge parses it to canonical form.
    // The engine itself only accepts canonical decimals.
    const result = validateScenarioInput({
      type: 'CONTRIBUTION',
      changes: [{ category: 'STOCK', amount: '10.000,50' }],
    });
    expect(result.valid).toBe(false);
  });
});

describe('Phase 5Q-D: scenario simulation', () => {
  it('projects values, total and weights exactly', () => {
    const result = simulateAllocationScenario({
      type: 'CONTRIBUTION',
      changes: [{ category: 'FIXED_INCOME', amount: '10000' }],
      currency: 'BRL',
      current: CURRENT,
      targets: TARGETS,
    });
    expect(result.totals).toMatchObject({
      current: '10000',
      scenario: '10000',
      projected: '20000',
      currency: 'BRL',
    });
    const stock = result.rows.find((row) => row.category === 'STOCK')!;
    const fixed = result.rows.find((row) => row.category === 'FIXED_INCOME')!;
    expect(stock.projectedValue).toBe('8000');
    expect(stock.projectedBp).toBe(4000);
    expect(fixed.projectedValue).toBe('12000');
    expect(fixed.projectedBp).toBe(6000);
    // STOCK: current 80% vs 60% target (+2000), projected 40% vs 60% (-2000).
    const stockRow = result.rows.find((row) => row.category === 'STOCK')!;
    expect(stockRow.currentDeviationBp).toBe(2000);
    expect(stockRow.projectedDeviationBp).toBe(-2000);
    expect(stockRow.state).toBe('BELOW_TARGET');
  });

  it('computes current and projected deviations with tolerance', () => {
    const result = simulateAllocationScenario({
      type: 'CONTRIBUTION',
      changes: [{ category: 'FIXED_INCOME', amount: '10000' }],
      currency: 'BRL',
      current: CURRENT,
      targets: TARGETS,
    });
    expect(result.beforeOutsideCount).toBe(2);
    expect(result.afterOutsideCount).toBe(2);
    expect(result.worstGap).toEqual({ category: 'STOCK', deviationBp: -2000 });
  });

  it('handles target categories with zero current value', () => {
    const result = simulateAllocationScenario({
      type: 'CONTRIBUTION',
      changes: [{ category: 'FUND', amount: '5000' }],
      currency: 'BRL',
      current: [{ category: 'STOCK', value: '10000' }],
      targets: [
        { category: 'STOCK', targetBp: 5000 },
        { category: 'FUND', targetBp: 5000 },
      ],
    });
    const fund = result.rows.find((row) => row.category === 'FUND')!;
    expect(fund.currentBp).toBeNull();
    expect(fund.projectedBp).toBe(3333);
    expect(result.afterOutsideCount).toBe(2);
  });

  it('keeps money strings exact with cents', () => {
    const result = simulateAllocationScenario({
      type: 'CONTRIBUTION',
      changes: [{ category: 'STOCK', amount: '0.01' }],
      currency: 'BRL',
      current: [{ category: 'STOCK', value: '100.00' }],
      targets: [{ category: 'STOCK', targetBp: 10000 }],
    });
    expect(result.totals).toMatchObject({ current: '100', scenario: '0.01', projected: '100.01' });
  });

  it('orders rows canonically regardless of input order', () => {
    const result = simulateAllocationScenario({
      type: 'CONTRIBUTION',
      changes: [
        { category: 'CASH', amount: '100' },
        { category: 'STOCK', amount: '100' },
      ],
      currency: 'BRL',
      current: CURRENT,
      targets: [{ category: 'CASH', targetBp: 0 }, ...TARGETS].filter((t) => t.targetBp >= 0),
    });
    expect(result.rows.map((row) => row.category)).toEqual(
      [...result.rows.map((row) => row.category)].sort(
        (a, b) =>
          [
            'STOCK',
            'FII',
            'ETF',
            'BDR',
            'FIXED_INCOME',
            'TREASURY',
            'FUND',
            'CASH',
            'OTHER',
          ].indexOf(a) -
          [
            'STOCK',
            'FII',
            'ETF',
            'BDR',
            'FIXED_INCOME',
            'TREASURY',
            'FUND',
            'CASH',
            'OTHER',
          ].indexOf(b),
      ),
    );
  });

  it('parses pt-BR money inputs without floats', () => {
    expect(parseScenarioAmountToCanonical('10000')).toBe('10000');
    expect(parseScenarioAmountToCanonical('10.000')).toBe('10000');
    expect(parseScenarioAmountToCanonical('10.000,50')).toBe('10000.5');
    expect(parseScenarioAmountToCanonical('10000,50')).toBe('10000.5');
    expect(parseScenarioAmountToCanonical('7050.25')).toBe('7050.25');
    expect(parseScenarioAmountToCanonical('10.123')).toBe('10123');
    expect(parseScenarioAmountToCanonical('0')).toBe('0');
    expect(parseScenarioAmountToCanonical('-5')).toBeNull();
    expect(parseScenarioAmountToCanonical('10.1234')).toBeNull();
    expect(parseScenarioAmountToCanonical('10,123')).toBeNull();
    expect(parseScenarioAmountToCanonical('1,000.00')).toBeNull();
    expect(parseScenarioAmountToCanonical('')).toBeNull();
  });

  it('contains no recommendation vocabulary', () => {
    const sources = ['types.ts', 'policy.ts', 'strategy.ts', 'scenario.ts'].map((file) =>
      fs.readFileSync(path.join(process.cwd(), 'packages/portfolio-strategy/src', file), 'utf8'),
    );
    for (const content of sources) {
      expect(content).not.toMatch(
        /melhor cen[áa]rio|recomend|ótimo|ideal|deve (comprar|vender|aportar)/i,
      );
    }
  });
});
