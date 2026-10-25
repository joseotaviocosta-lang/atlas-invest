import { describe, expect, it } from 'vitest';
import {
  absDecimalDifference,
  addDaysIso,
  canTransitionPlanLinkStatus,
  deriveContributionCandidates,
  deriveContributionTracking,
  ratioToHundredthsOfPercent,
  trackingCandidateWindow,
} from '@atlas/portfolio-strategy';

/**
 * Phase 5Q-G — tracking engine contract (pure).
 *
 * Candidates are deterministic suggestions (never counted); tracking
 * aggregates CONFIRMED ledger amounts only. Exact decimal math, no
 * floats, no scores, no recommendations.
 */
function tx(id: string, type: string, tradeDate: string, amount: string, currency = 'BRL') {
  return { id, type, tradeDate, amount, currency };
}

describe('Phase 5Q-G: candidate derivation', () => {
  const planned = { plannedDate: '2026-11-10', plannedTotal: '5000', currency: 'BRL' };

  it('suggests eligible deposits inside the window, deterministically ordered', () => {
    const transactions = [
      tx('t-far', 'DEPOSIT', '2026-12-01', '5000'),
      tx('t-early', 'DEPOSIT', '2026-11-08', '1000'),
      tx('t-close', 'DEPOSIT', '2026-11-11', '4900'),
      tx('t-same-day', 'DEPOSIT', '2026-11-10', '500'),
    ];
    const first = deriveContributionCandidates({
      ...planned,
      transactions,
      confirmedIds: new Set(),
      rejectedIds: new Set(),
    });
    const second = deriveContributionCandidates({
      ...planned,
      transactions: [...transactions].reverse(),
      confirmedIds: new Set(),
      rejectedIds: new Set(),
    });
    expect(first).toEqual(second);
    expect(first.map((candidate) => candidate.transactionId)).toEqual([
      't-same-day',
      't-close',
      't-early',
    ]);
  });

  it('excludes ineligible types, currencies, dates and remembered links', () => {
    const transactions = [
      tx('t-buy', 'BUY', '2026-11-10', '5000'),
      tx('t-div', 'DIVIDEND', '2026-11-10', '5000'),
      tx('t-usd', 'DEPOSIT', '2026-11-10', '5000', 'USD'),
      tx('t-early', 'DEPOSIT', '2026-11-01', '5000'),
      tx('t-late', 'DEPOSIT', '2026-11-25', '5000'),
      tx('t-ok', 'DEPOSIT', '2026-11-10', '5000'),
    ];
    const candidates = deriveContributionCandidates({
      ...planned,
      transactions,
      confirmedIds: new Set(['t-ok']),
      rejectedIds: new Set(),
    });
    expect(candidates).toEqual([]);
    const reopened = deriveContributionCandidates({
      ...planned,
      transactions,
      confirmedIds: new Set(),
      rejectedIds: new Set(['t-ok']),
    });
    expect(reopened).toEqual([]);
  });

  it('accepts window edges and caps the candidate count', () => {
    const transactions = Array.from({ length: 60 }, (_, index) =>
      tx(`t-${String(index).padStart(2, '0')}`, 'DEPOSIT', '2026-11-10', '100'),
    );
    const candidates = deriveContributionCandidates({
      ...planned,
      transactions,
      confirmedIds: new Set(),
      rejectedIds: new Set(),
    });
    expect(candidates).toHaveLength(50);
    const edges = deriveContributionCandidates({
      ...planned,
      transactions: [
        tx('t-before', 'DEPOSIT', '2026-11-03', '100'),
        tx('t-after', 'DEPOSIT', '2026-11-24', '100'),
      ],
      confirmedIds: new Set(),
      rejectedIds: new Set(),
    });
    expect(edges.map((candidate) => candidate.transactionId).sort()).toEqual([
      't-after',
      't-before',
    ]);
  });

  it('computes exact decimal distances without floats', () => {
    expect(absDecimalDifference('5000', '4700')).toBe('300');
    expect(absDecimalDifference('4700', '5000')).toBe('300');
    expect(absDecimalDifference('0.1', '0.07')).toBe('0.03');
    expect(absDecimalDifference('100.50', '100.5')).toBe('0');
  });
});

describe('Phase 5Q-G: tracking aggregation', () => {
  it('aggregates confirmed totals, difference and completion exactly', () => {
    const tracking = deriveContributionTracking({
      planned: new Map([
        ['STOCK', '2000'],
        ['FIXED_INCOME', '3000'],
      ]),
      actual: [
        { category: 'STOCK', amount: '1800' },
        { category: 'FIXED_INCOME', amount: '2900' },
      ],
    });
    expect(tracking.plannedTotal).toBe('5000');
    expect(tracking.actualTotal).toBe('4700');
    expect(tracking.difference).toBe('-300');
    expect(tracking.completionBp).toBe(9400);
    expect(tracking.confirmedCount).toBe(2);
  });

  it('shows above-plan differences neutrally and covers absent categories', () => {
    const tracking = deriveContributionTracking({
      planned: new Map([['STOCK', '2000']]),
      actual: [
        { category: 'STOCK', amount: '2100' },
        { category: 'CASH', amount: '100' },
      ],
    });
    expect(tracking.difference).toBe('200');
    expect(tracking.completionBp).toBe(11000);
    const stock = tracking.byCategory.find((row) => row.category === 'STOCK')!;
    expect(stock).toMatchObject({ planned: '2000', actual: '2100', difference: '100' });
    const cash = tracking.byCategory.find((row) => row.category === 'CASH')!;
    expect(cash).toMatchObject({ planned: '0', actual: '100', difference: '100' });
  });

  it('counts nothing without confirmations and never a score', () => {
    const tracking = deriveContributionTracking({
      planned: new Map([['STOCK', '2000']]),
      actual: [],
    });
    expect(tracking.actualTotal).toBe('0');
    expect(tracking.difference).toBe('-2000');
    expect(tracking.completionBp).toBe(0);
    expect(tracking.confirmedCount).toBe(0);
    expect(tracking).not.toHaveProperty('score');
    expect(JSON.stringify(tracking)).not.toMatch(/score|winner|best/i);
  });

  it('computes completion ratios exactly', () => {
    expect(ratioToHundredthsOfPercent('4700', '5000')).toBe(9400);
    expect(ratioToHundredthsOfPercent('0', '5000')).toBe(0);
    expect(ratioToHundredthsOfPercent('5000', '5000')).toBe(10000);
    expect(ratioToHundredthsOfPercent('1', '3')).toBe(3333);
    expect(ratioToHundredthsOfPercent('100', '0')).toBeNull();
  });

  it('shifts dates civilly across month and year boundaries', () => {
    expect(addDaysIso('2026-11-10', -7)).toBe('2026-11-03');
    expect(addDaysIso('2026-11-10', 14)).toBe('2026-11-24');
    expect(addDaysIso('2026-11-01', -7)).toBe('2026-10-25');
    expect(addDaysIso('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDaysIso('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(trackingCandidateWindow('2026-11-10')).toEqual({
      start: '2026-11-03',
      end: '2026-11-24',
    });
  });
});

describe('Phase 5Q-G: link transitions', () => {
  it('allows manual confirm, reject and unlink with idempotency', () => {
    expect(canTransitionPlanLinkStatus('ABSENT', 'CONFIRMED')).toBe(true);
    expect(canTransitionPlanLinkStatus('ABSENT', 'REJECTED')).toBe(true);
    expect(canTransitionPlanLinkStatus('CONFIRMED', 'CONFIRMED')).toBe(true);
    expect(canTransitionPlanLinkStatus('REJECTED', 'REJECTED')).toBe(true);
    expect(canTransitionPlanLinkStatus('CONFIRMED', 'REJECTED')).toBe(true);
    expect(canTransitionPlanLinkStatus('REJECTED', 'CONFIRMED')).toBe(true);
  });
});
