import { describe, expect, it } from 'vitest';
import {
  addMonthsToFirstDay,
  compareMonthKeys,
  deriveGoalProgress,
  enumerateGoalMonths,
  firstDayToMonthKey,
  goalForMonth,
  monthKeyToFirstDay,
  sumGoalForPeriod,
  validateGoalMonth,
} from '@atlas/portfolio-strategy';

/**
 * Phase 5Q-J — contribution goal engine (pure, user-owned).
 *
 * Versioned monthly goals, exact money, no tolerance, no scores,
 * no forecasts, no recommendations. History is never rewritten.
 */
const V1 = [
  { amount: '2000', currency: 'BRL', effectiveFromMonth: '2026-01', effectiveToMonth: '2026-07' },
  { amount: '3000', currency: 'BRL', effectiveFromMonth: '2026-07', effectiveToMonth: null },
];

describe('Phase 5Q-J: goal month validation and civil math', () => {
  it('accepts YYYY-MM and rejects the rest without Date construction', () => {
    expect(validateGoalMonth('2026-11')).toEqual({ valid: true, month: '2026-11' });
    expect(validateGoalMonth(' 2026-01 ').valid).toBe(true);
    for (const raw of ['2026-13', '2026-00', '2026-1', '2026/11', '2026-11-10', '', 42, null]) {
      expect(validateGoalMonth(raw).valid, JSON.stringify(raw)).toBe(false);
    }
    expect(monthKeyToFirstDay('2026-11')).toBe('2026-11-01');
    expect(firstDayToMonthKey('2026-02-29')).toBe('2026-02');
    expect(addMonthsToFirstDay('2026-01-15', -1)).toBe('2025-12-01');
    expect(addMonthsToFirstDay('2026-12-01', 1)).toBe('2027-01-01');
    expect(compareMonthKeys('2026-01', '2026-02')).toBe(-1);
    expect(compareMonthKeys('2026-02', '2026-02')).toBe(0);
    expect(compareMonthKeys('2026-03', '2026-02')).toBe(1);
  });
});

describe('Phase 5Q-J: versioned goal lookup', () => {
  it('returns the amount in force per month without rewriting history', () => {
    expect(goalForMonth(V1, '2025-12')).toBeNull();
    expect(goalForMonth(V1, '2026-01')).toBe('2000');
    expect(goalForMonth(V1, '2026-06')).toBe('2000');
    expect(goalForMonth(V1, '2026-07')).toBe('3000');
    expect(goalForMonth(V1, '2030-01')).toBe('3000');
  });

  it('treats the end month as exclusive and open rows as indefinite', () => {
    expect(
      goalForMonth(
        [
          {
            amount: '100',
            currency: 'BRL',
            effectiveFromMonth: '2026-01',
            effectiveToMonth: '2026-04',
          },
        ],
        '2026-04',
      ),
    ).toBeNull();
  });

  it('returns null months instead of zero and stays deterministic', () => {
    const first = [
      { amount: '100', currency: 'BRL', effectiveFromMonth: '2026-02', effectiveToMonth: null },
      {
        amount: '200',
        currency: 'BRL',
        effectiveFromMonth: '2026-01',
        effectiveToMonth: '2026-02',
      },
    ];
    const second = [...first].reverse();
    expect(goalForMonth(first, '2026-01')).toBe(goalForMonth(second, '2026-01'));
    expect(goalForMonth(first, '2026-03')).toBe('100');
  });
});

describe('Phase 5Q-J: monthly goal progress', () => {
  it('computes exact differences with neutral status vocabulary', () => {
    expect(
      deriveGoalProgress({ goalAmount: '3000', plannedAmount: '3000', confirmedAmount: '2500' }),
    ).toEqual({
      goalAmount: '3000',
      plannedAmount: '3000',
      confirmedAmount: '2500',
      plannedDifference: '0',
      confirmedDifference: '-500',
      completionBp: 8333,
      status: 'BELOW',
    });
    expect(
      deriveGoalProgress({ goalAmount: '3000', plannedAmount: '3200', confirmedAmount: '3000' })
        .status,
    ).toBe('AT');
    expect(
      deriveGoalProgress({ goalAmount: '3000', plannedAmount: '3000', confirmedAmount: '3100' })
        .status,
    ).toBe('ABOVE');
    expect(
      deriveGoalProgress({ goalAmount: null, plannedAmount: '10', confirmedAmount: '5' }),
    ).toEqual({
      goalAmount: null,
      plannedAmount: '10',
      confirmedAmount: '5',
      plannedDifference: null,
      confirmedDifference: null,
      completionBp: null,
      status: 'NO_GOAL',
    });
  });

  it('uses exact money compare with no tolerance', () => {
    expect(
      deriveGoalProgress({
        goalAmount: '3000',
        plannedAmount: '2999.99',
        confirmedAmount: '2999.99',
      }).status,
    ).toBe('BELOW');
    expect(
      deriveGoalProgress({ goalAmount: '100', plannedAmount: '0', confirmedAmount: '33.33' })
        .completionBp,
    ).toBe(3333);
  });
});

describe('Phase 5Q-J: multi-month aggregation', () => {
  it('sums only months with an active goal, never extrapolating', () => {
    const months = ['2026-05', '2026-06', '2026-07', '2026-08'];
    expect(sumGoalForPeriod({ versions: V1, months })).toEqual({
      total: '10000',
      monthsWithGoal: 4,
      monthsWithoutGoal: 0,
    });
    expect(sumGoalForPeriod({ versions: V1, months: ['2025-11', '2025-12'] })).toEqual({
      total: '0',
      monthsWithGoal: 0,
      monthsWithoutGoal: 2,
    });
    expect(
      sumGoalForPeriod({
        versions: [
          {
            amount: '3000',
            currency: 'BRL',
            effectiveFromMonth: '2026-10',
            effectiveToMonth: null,
          },
        ],
        months: ['2026-01', '2026-10', '2026-11', '2026-12'],
      }),
    ).toEqual({ total: '9000', monthsWithGoal: 3, monthsWithoutGoal: 1 });
  });
});

describe('Phase 5Q-J: period month enumeration', () => {
  it('enumerates every month of a fixed range for versioned aggregation', () => {
    expect(enumerateGoalMonths({ start: '2025-10-10', end: '2026-10-09' }, [])).toEqual([
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
  });

  it('falls back to activity months for open-ended ranges and caps the length', () => {
    expect(enumerateGoalMonths({ start: null, end: '2026-10-01' }, ['2026-08', '2026-09'])).toEqual(
      ['2026-08', '2026-09'],
    );
    expect(enumerateGoalMonths({ start: '2020-01-15', end: '2021-06-20' }, [])).toHaveLength(18);
    expect(enumerateGoalMonths({ start: '2000-01-01', end: '2030-12-31' }, [], 5)).toHaveLength(5);
  });
});
