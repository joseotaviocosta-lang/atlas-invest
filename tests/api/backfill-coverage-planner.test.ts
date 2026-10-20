/**
 * Phase 5F (I1) - Coverage planner unit tests (no DB, no providers).
 *
 * Deterministic fake repositories prove the coverage taxonomy:
 * EXPECTED/covered, CLOSED_DAY, DATA_GAP, NOT_PUBLISHED_YET,
 * CALENDAR_COVERAGE_MISSING, plus compaction, bounds and validation.
 */
import { describe, it, expect } from 'vitest';
import { LocalDate } from '@atlas/domain';
import {
  BackfillCoveragePlanner,
  PlannerRepositories,
} from '../../apps/api/src/ingestion/backfill/coverage-planner';

function fakeRepos(overrides: Partial<PlannerRepositories> = {}): PlannerRepositories {
  const openDays = new Set<string>();
  return {
    calendar: {
      findDay: async (_type: string, date: LocalDate) =>
        openDays.has(date.toString()) ? null : { isOpen: true },
      getCoverage: async () => ({ minDate: null, maxDate: null }),
    },
    benchmark: { findObservation: async () => null },
    fx: { findObservation: async () => null },
    macro: { findObservations: async () => [] },
    marketQuote: { findByAssetDate: async () => null },
    universe: { listTransactedAssetIds: async () => [] },
    ...overrides,
  };
}

const TODAY = '2026-10-20';

describe('5F planner - empty plan when fully covered', () => {
  it('returns no eligible periods when every open day already has data', async () => {
    const planner = BackfillCoveragePlanner.fromRepositories(
      fakeRepos({
        calendar: {
          findDay: async () => ({ isOpen: true }),
          getCoverage: async () => ({
            minDate: LocalDate.from('2026-01-01'),
            maxDate: LocalDate.from('2026-12-31'),
          }),
        },
        benchmark: { findObservation: async () => ({}) },
      }),
    );
    const plan = await planner.plan({
      domain: 'BENCHMARK_IBOV',
      from: '2026-01-05',
      to: '2026-01-09',
      todayIso: TODAY,
    });
    expect(plan.eligiblePeriods).toEqual([]);
    expect(plan.eligibleWindows).toEqual([]);
    expect(plan.requiresConfirmation).toBe(false);
    expect(plan.skippedPeriods.every((s) => s.reason === 'ALREADY_COVERED')).toBe(true);
  });
});

describe('5F planner - single gap and contiguous compaction', () => {
  it('selects exactly the missing open day as DATA_GAP-eligible', async () => {
    const planner = BackfillCoveragePlanner.fromRepositories(
      fakeRepos({
        calendar: {
          findDay: async () => ({ isOpen: true }),
          getCoverage: async () => ({
            minDate: LocalDate.from('2026-01-01'),
            maxDate: LocalDate.from('2026-12-31'),
          }),
        },
        benchmark: {
          findObservation: async (_id: string, date: LocalDate) =>
            date.toString() === '2026-01-07' ? null : {},
        },
      }),
    );
    const plan = await planner.plan({
      domain: 'BENCHMARK_IBOV',
      from: '2026-01-05',
      to: '2026-01-09',
      todayIso: TODAY,
    });
    expect(plan.eligiblePeriods).toEqual(['2026-01-07']);
    expect(plan.eligibleWindows).toHaveLength(1);
    expect(plan.eligibleWindows[0]).toMatchObject({ from: '2026-01-07', to: '2026-01-07' });
  });

  it('compacts contiguous eligible days into one window', async () => {
    const planner = BackfillCoveragePlanner.fromRepositories(
      fakeRepos({
        calendar: {
          findDay: async () => ({ isOpen: true }),
          getCoverage: async () => ({
            minDate: LocalDate.from('2026-01-01'),
            maxDate: LocalDate.from('2026-12-31'),
          }),
        },
        fx: { findObservation: async () => null },
      }),
    );
    const plan = await planner.plan({
      domain: 'FX_USD_BRL',
      from: '2026-01-05',
      to: '2026-01-07',
      todayIso: TODAY,
    });
    expect(plan.eligiblePeriods).toEqual(['2026-01-05', '2026-01-06', '2026-01-07']);
    expect(plan.eligibleWindows).toHaveLength(1);
    expect(plan.eligibleWindows[0]).toMatchObject({ from: '2026-01-05', to: '2026-01-07' });
  });
});

describe('5F planner - calendar taxonomy', () => {
  it('excludes closed days and missing calendar coverage, never as DATA_GAP', async () => {
    const planner = BackfillCoveragePlanner.fromRepositories(
      fakeRepos({
        calendar: {
          findDay: async (_type: string, date: LocalDate) => {
            if (date.toString() === '2026-01-10') return null;
            if (date.toString() === '2026-01-11') return { isOpen: false };
            return { isOpen: true };
          },
          getCoverage: async () => ({
            minDate: LocalDate.from('2026-01-01'),
            maxDate: LocalDate.from('2026-12-31'),
          }),
        },
        benchmark: { findObservation: async () => null },
      }),
    );
    const plan = await planner.plan({
      domain: 'BENCHMARK_CDI',
      from: '2026-01-09',
      to: '2026-01-12',
      todayIso: TODAY,
    });
    expect(plan.eligiblePeriods).toEqual(['2026-01-09', '2026-01-12']);
    const byPeriod = new Map(plan.skippedPeriods.map((s) => [s.targetPeriod, s.reason]));
    expect(byPeriod.get('2026-01-10')).toBe('CALENDAR_COVERAGE_MISSING');
    expect(byPeriod.get('2026-01-11')).toBe('CLOSED_DAY');
  });

  it('marks future dates NOT_PUBLISHED_YET and IPCA current month likewise', async () => {
    const planner = BackfillCoveragePlanner.fromRepositories(fakeRepos());
    const plan = await planner.plan({
      domain: 'FX_EUR_BRL',
      from: '2026-10-19',
      to: '2026-10-21',
      todayIso: TODAY,
    });
    expect(plan.eligiblePeriods).toEqual([]);
    expect(plan.skippedPeriods.map((s) => s.reason)).toContain('NOT_PUBLISHED_YET');

    const ipca = await BackfillCoveragePlanner.fromRepositories(fakeRepos()).plan({
      domain: 'MACRO_IPCA',
      from: '2026-09-01',
      to: '2026-10-15',
      todayIso: TODAY,
    });
    expect(ipca.eligiblePeriods).toContain('2026-09');
    expect(ipca.eligiblePeriods).not.toContain('2026-10');
    expect(ipca.skippedPeriods.find((s) => s.targetPeriod === '2026-10')?.reason).toBe(
      'NOT_PUBLISHED_YET',
    );
  });
});

describe('5F planner - bounds and validation', () => {
  it('rejects from>to, malformed dates and oversized ranges before any insert', async () => {
    const planner = BackfillCoveragePlanner.fromRepositories(fakeRepos());
    await expect(
      planner.plan({
        domain: 'BENCHMARK_IBOV',
        from: '2026-02-01',
        to: '2026-01-01',
        todayIso: TODAY,
      }),
    ).rejects.toThrow();
    await expect(
      planner.plan({
        domain: 'BENCHMARK_IBOV',
        from: '2026-02-30',
        to: '2026-03-01',
        todayIso: TODAY,
      }),
    ).rejects.toThrow();
    await expect(
      planner.plan({ domain: 'NOPE', from: '2026-01-01', to: '2026-01-02', todayIso: TODAY }),
    ).rejects.toThrow();
    await expect(
      planner.plan({
        domain: 'MARKET_QUOTES',
        from: '2026-01-01',
        to: '2026-12-31',
        todayIso: TODAY,
      }),
    ).rejects.toThrow(/bound/);
  });

  it('flags large plans for explicit confirmation without executing', async () => {
    const planner = BackfillCoveragePlanner.fromRepositories(
      fakeRepos({
        calendar: {
          findDay: async () => ({ isOpen: true }),
          getCoverage: async () => ({
            minDate: LocalDate.from('2026-01-01'),
            maxDate: LocalDate.from('2026-12-31'),
          }),
        },
        benchmark: { findObservation: async () => null },
      }),
    );
    const plan = await planner.plan({
      domain: 'BENCHMARK_IBOV',
      from: '2026-01-05',
      to: '2026-05-05',
      todayIso: TODAY,
    });
    expect(plan.eligiblePeriods.length).toBeGreaterThan(90);
    expect(plan.requiresConfirmation).toBe(true);
    expect(plan.estimatedProviderCalls).toBe(plan.eligiblePeriods.length);
  });
});
