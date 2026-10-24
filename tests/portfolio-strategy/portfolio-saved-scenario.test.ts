import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildScenarioCopyName,
  compareScenarioResults,
  simulateAllocationScenario,
  validateScenarioName,
} from '@atlas/portfolio-strategy';

/**
 * Phase 5Q-E — saved scenario + comparison engine contract (pure).
 *
 * Names are plain text; comparison is factual (no winner, no score);
 * both sides must share the same live basis or comparison refuses.
 */
const TARGETS = [
  { category: 'STOCK', targetBp: 6000 },
  { category: 'FIXED_INCOME', targetBp: 4000 },
];

const CURRENT = [
  { category: 'STOCK', value: '8000.00' },
  { category: 'FIXED_INCOME', value: '2000.00' },
];

function simulate(amount: string, category = 'FIXED_INCOME') {
  return simulateAllocationScenario({
    changes: [{ category, amount }],
    currency: 'BRL',
    current: CURRENT,
    targets: TARGETS,
  });
}

describe('Phase 5Q-E: saved scenario name validation', () => {
  it('accepts plain names and trims', () => {
    expect(validateScenarioName('  Aporte de novembro  ')).toEqual({
      valid: true,
      name: 'Aporte de novembro',
    });
  });

  it('rejects empty, overlong and markup names', () => {
    expect(validateScenarioName('')).toEqual({ valid: false, errors: [{ code: 'EMPTY_NAME' }] });
    expect(validateScenarioName('   ')).toEqual({
      valid: false,
      errors: [{ code: 'EMPTY_NAME' }],
    });
    expect(validateScenarioName('x'.repeat(81))).toEqual({
      valid: false,
      errors: [{ code: 'NAME_TOO_LONG' }],
    });
    expect(validateScenarioName('x'.repeat(80)).valid).toBe(true);
    expect(validateScenarioName('<b>Aporte</b>')).toEqual({
      valid: false,
      errors: [{ code: 'NAME_HAS_MARKUP' }],
    });
    expect(validateScenarioName(42)).toEqual({ valid: false, errors: [{ code: 'EMPTY_NAME' }] });
  });

  it('builds copy names within the limit', () => {
    expect(buildScenarioCopyName('Aporte mensal')).toBe('Aporte mensal — cópia');
    expect(buildScenarioCopyName('x'.repeat(80))).toBe(`${'x'.repeat(72)} — cópia`);
    expect(buildScenarioCopyName('x'.repeat(80)).length).toBeLessThanOrEqual(80);
  });
});

describe('Phase 5Q-E: scenario comparison engine', () => {
  it('compares two live results factually without a winner', () => {
    const comparison = compareScenarioResults({
      left: { scenarioId: 'a', name: 'Aporte conservador', result: simulate('10000') },
      right: { scenarioId: 'b', name: 'Aporte dividido', result: simulate('5000') },
    });
    expect(comparison.currency).toBe('BRL');
    expect(comparison.sameScenarioTotal).toBe(false);
    expect(comparison.sides).toHaveLength(2);
    const [a, b] = comparison.sides;
    expect(a!.scenarioTotal).toBe('10000');
    expect(b!.scenarioTotal).toBe('5000');
    expect(typeof a!.outsideCount).toBe('number');
    expect(typeof a!.totalAbsDeviationBp).toBe('number');
    expect(a!.projectedWeights.length).toBeGreaterThan(0);
    // No winner/score/ranking fields anywhere in the comparison.
    expect(comparison).not.toHaveProperty('winner');
    expect(comparison).not.toHaveProperty('bestScenario');
    expect(comparison).not.toHaveProperty('score');
    expect(JSON.stringify(comparison)).not.toMatch(/winner|best|score|recomend/i);
  });

  it('flags equal contribution totals explicitly', () => {
    const comparison = compareScenarioResults({
      left: { scenarioId: 'a', name: 'A', result: simulate('10000') },
      right: { scenarioId: 'b', name: 'B', result: simulate('10000', 'STOCK') },
    });
    expect(comparison.sameScenarioTotal).toBe(true);
  });

  it('orders projected weights canonically and deterministically', () => {
    const first = compareScenarioResults({
      left: { scenarioId: 'a', name: 'A', result: simulate('10000') },
      right: { scenarioId: 'b', name: 'B', result: simulate('5000') },
    });
    const second = compareScenarioResults({
      left: { scenarioId: 'a', name: 'A', result: simulate('10000') },
      right: { scenarioId: 'b', name: 'B', result: simulate('5000') },
    });
    expect(second).toEqual(first);
  });

  it('refuses to compare across different bases instead of mixing states', () => {
    const otherBasis = simulateAllocationScenario({
      changes: [{ category: 'FIXED_INCOME', amount: '10000' }],
      currency: 'BRL',
      current: [{ category: 'STOCK', value: '5000' }],
      targets: TARGETS,
    });
    expect(() =>
      compareScenarioResults({
        left: { scenarioId: 'a', name: 'A', result: simulate('10000') },
        right: { scenarioId: 'b', name: 'B', result: otherBasis },
      }),
    ).toThrow();
    const otherCurrency = simulateAllocationScenario({
      changes: [{ category: 'FIXED_INCOME', amount: '10000' }],
      currency: 'USD',
      current: CURRENT,
      targets: TARGETS,
    });
    expect(() =>
      compareScenarioResults({
        left: { scenarioId: 'a', name: 'A', result: simulate('10000') },
        right: { scenarioId: 'b', name: 'B', result: otherCurrency },
      }),
    ).toThrow();
  });

  it('contains no recommendation vocabulary', () => {
    const sources = ['scenario.ts', 'policy.ts'].map((file) =>
      fs.readFileSync(path.join(process.cwd(), 'packages/portfolio-strategy/src', file), 'utf8'),
    );
    for (const content of sources) {
      expect(content).not.toMatch(
        /melhor cen[áa]rio|recomend|ótimo|ideal|deve (comprar|vender|aportar)/i,
      );
    }
  });
});
