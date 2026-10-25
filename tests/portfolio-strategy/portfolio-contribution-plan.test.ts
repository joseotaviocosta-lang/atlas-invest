import { describe, expect, it } from 'vitest';
import {
  canTransitionPlanStatus,
  isPlanOverdue,
  validatePlanDate,
  validatePlanInput,
} from '@atlas/portfolio-strategy';

/**
 * Phase 5Q-F — contribution plan engine contract (pure).
 *
 * Date-only civil dates, exact money via the shared scenario engine,
 * explicit status machine. No ledger, no execution, no advice.
 */
const TODAY = '2026-10-25';
const ITEMS = [
  { category: 'STOCK', amount: '2000' },
  { category: 'FIXED_INCOME', amount: '3000' },
];

describe('Phase 5Q-F: plan date validation', () => {
  it('accepts today and future dates, rejects past on create', () => {
    expect(validatePlanDate('2026-10-25', TODAY, false)).toEqual({
      valid: true,
      date: '2026-10-25',
    });
    expect(validatePlanDate('2026-11-10', TODAY, false).valid).toBe(true);
    expect(validatePlanDate('2026-10-24', TODAY, false)).toEqual({
      valid: false,
      errors: [{ code: 'PAST_DATE' }],
    });
    // An existing plan that aged past its date must remain editable.
    expect(validatePlanDate('2026-10-24', TODAY, true)).toEqual({
      valid: true,
      date: '2026-10-24',
    });
  });

  it('rejects malformed and impossible dates without Date construction', () => {
    for (const raw of [
      '',
      '10/11/2026',
      '2026-11-10T00:00:00Z',
      '2026-13-01',
      '2026-02-30',
      '2025-02-29',
      '2026-11-31',
      '2026-1-1',
      42,
      null,
    ]) {
      expect(validatePlanDate(raw, TODAY, false).valid, JSON.stringify(raw)).toBe(false);
    }
    expect(validatePlanDate('2024-02-29', TODAY, true)).toEqual({
      valid: true,
      date: '2024-02-29',
    });
    expect(validatePlanDate(' 2026-11-10 ', TODAY, false)).toEqual({
      valid: true,
      date: '2026-11-10',
    });
  });

  it('compares dates lexicographically for overdue checks', () => {
    expect(isPlanOverdue('2026-10-24', TODAY)).toBe(true);
    expect(isPlanOverdue('2026-10-25', TODAY)).toBe(false);
    expect(isPlanOverdue('2026-11-10', TODAY)).toBe(false);
  });
});

describe('Phase 5Q-F: plan input validation', () => {
  it('accepts a valid manual plan', () => {
    expect(
      validatePlanInput({
        name: 'Aporte de novembro',
        plannedDate: '2026-11-10',
        items: ITEMS,
        today: TODAY,
        allowPastDate: false,
      }),
    ).toEqual({ valid: true, name: 'Aporte de novembro', plannedDate: '2026-11-10' });
  });

  it('reuses name rules (trim, length, markup)', () => {
    for (const name of ['', '   ', 'x'.repeat(81), '<b>x</b>']) {
      const result = validatePlanInput({
        name,
        plannedDate: '2026-11-10',
        items: ITEMS,
        today: TODAY,
        allowPastDate: false,
      });
      expect(result.valid, JSON.stringify(name)).toBe(false);
    }
  });

  it('reuses item rules (categories, duplicates, amounts)', () => {
    const base = {
      name: 'Plan',
      plannedDate: '2026-11-10',
      today: TODAY,
      allowPastDate: false,
    };
    expect(validatePlanInput({ ...base, items: [] }).valid).toBe(false);
    expect(
      validatePlanInput({
        ...base,
        items: [
          { category: 'STOCK', amount: '100' },
          { category: 'STOCK', amount: '200' },
        ],
      }).valid,
    ).toBe(false);
    expect(validatePlanInput({ ...base, items: [{ category: 'NOPE', amount: '100' }] }).valid).toBe(
      false,
    );
    for (const amount of ['0', '0.00', '-5', 'abc', '10.123']) {
      expect(
        validatePlanInput({ ...base, items: [{ category: 'STOCK', amount }] }).valid,
        amount,
      ).toBe(false);
    }
  });

  it('keeps money exact (canonical decimals only)', () => {
    const result = validatePlanInput({
      name: 'Cents',
      plannedDate: '2026-11-10',
      items: [{ category: 'CASH', amount: '250.75' }],
      today: TODAY,
      allowPastDate: false,
    });
    expect(result).toEqual({ valid: true, name: 'Cents', plannedDate: '2026-11-10' });
  });
});

describe('Phase 5Q-F: plan status machine', () => {
  it('allows only PLANNED → COMPLETED | CANCELLED', () => {
    expect(canTransitionPlanStatus('PLANNED', 'COMPLETED')).toBe(true);
    expect(canTransitionPlanStatus('PLANNED', 'CANCELLED')).toBe(true);
    expect(canTransitionPlanStatus('COMPLETED', 'PLANNED')).toBe(false);
    expect(canTransitionPlanStatus('COMPLETED', 'CANCELLED')).toBe(false);
    expect(canTransitionPlanStatus('CANCELLED', 'PLANNED')).toBe(false);
    expect(canTransitionPlanStatus('CANCELLED', 'COMPLETED')).toBe(false);
    expect(canTransitionPlanStatus('PLANNED', 'PLANNED')).toBe(false);
    expect(canTransitionPlanStatus('DRAFT', 'COMPLETED')).toBe(false);
    expect(canTransitionPlanStatus('PLANNED', 'EXECUTED')).toBe(false);
  });
});
