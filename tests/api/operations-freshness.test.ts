/**
 * Phase 5G - Freshness + missed-schedule unit tests (no DB, fake clock).
 *
 * Covers: healthy/stale/failed ladders, closed-day no-false-alarm, IPCA
 * publication semantics, SELIC event-driven semantics, calendar horizon,
 * missed-schedule grace + scheduler-disabled suppression.
 */
import { describe, it, expect } from 'vitest';
import { LocalDate } from '@atlas/domain';
import { DataFreshnessService } from '../../apps/api/src/ingestion/operations/freshness-service';
import { detectMissedDailySchedules } from '../../apps/api/src/ingestion/operations/missed-schedule';

function openCalendar(openDates: string[], min = '2026-01-01', max = '2026-12-31') {
  const open = new Set(openDates);
  return {
    findDay: async (_type: string, date: LocalDate) => {
      const key = date.toString();
      if (key < min || key > max) return null;
      return { isOpen: open.has(key) };
    },
    findDays: async (_type: string, from: LocalDate, to: LocalDate) => {
      const out: Array<{ date: LocalDate; isOpen: boolean }> = [];
      let cur = from;
      while (cur.compare(to) <= 0) {
        const key = cur.toString();
        if (key >= min && key <= max) out.push({ date: cur, isOpen: open.has(key) });
        const next = new Date(Date.UTC(cur.year, cur.month - 1, cur.day + 1));
        cur = LocalDate.fromParts(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
      }
      return out;
    },
    getCoverage: async () => ({ minDate: LocalDate.from(min), maxDate: LocalDate.from(max) }),
  };
}

function makeService(
  calendar: ReturnType<typeof openCalendar>,
  present: Record<string, string | null>,
  runs: Array<{ status: string; triggerType?: string; finishedAt?: string; startedAt?: string }> = [],
) {
  const at = (key: string): LocalDate | null => (present[key] ? LocalDate.from(present[key]!) : null);
  const runItems = runs.map((r, i) => ({
    jobRunId: `run-${i}`,
    logicalJobKey: `JOB:${i}`,
    jobType: 'BENCHMARK_IBOV_DAILY',
    triggerType: r.triggerType ?? 'SCHEDULED',
    targetPeriod: '2026-01-09',
    targetPeriodGranularity: 'DAY',
    scheduledFor: '2026-01-09',
    attempt: 1,
    status: r.status,
    startedAt: r.startedAt ?? `2026-10-20T10:0${i}:00.000Z`,
    finishedAt: r.finishedAt ?? `2026-10-20T10:0${i}:00.000Z`,
    durationMs: 0,
  }));
  return new DataFreshnessService(
    calendar as never,
    {
      getCoverage: async (benchmarkId: string) => ({
        totalObservations: at(benchmarkId as string) ? 1 : 0,
        firstObservationDate: at(benchmarkId as string),
        lastObservationDate: at(benchmarkId as string),
      }),
    } as never,
    {
      getCoverage: async (base: string, quote: string) => {
        const last = at(`${base}_${quote}`);
        return { totalObservations: last ? 1 : 0, firstObservationDate: last, lastObservationDate: last };
      },
    } as never,
    {
      getCoverage: async (seriesId: string) => {
        const max = at(seriesId);
        return {
          count: max ? 1 : 0,
          minReferenceDate: max,
          maxReferenceDate: max,
          latestPublishedAt: null,
          source: null,
          frequency: null,
        };
      },
    } as never,
    { findByAssetDate: async () => null } as never,
    { listRuns: async () => ({ items: runItems, hasMore: false, nextCursor: null }) } as never,
  );
}

const NOW_MON_10AM = '2026-10-20T13:00:00.000Z';
const WEEKDAYS_JAN5_9 = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'];

describe('5G freshness - daily families', () => {
  it('HEALTHY when latest open day is covered', async () => {
    const svc = makeService(openCalendar(WEEKDAYS_JAN5_9), { IBOV: '2026-01-09' }, [{ status: 'SUCCESS' }]);
    const result = await svc.evaluateFamily('IBOV', 'BENCHMARK_IBOV_DAILY', '2026-01-09T23:30:00.000Z');
    expect(result.state).toBe('HEALTHY');
    expect(result.reasonCode).toBe('UP_TO_DATE');
    expect(result.lagPeriods).toBe(0);
  });

  it('weekend does not become stale (calendar-aware)', async () => {
    const svc = makeService(openCalendar(WEEKDAYS_JAN5_9), { IBOV: '2026-01-09' }, [{ status: 'SUCCESS' }]);
    const result = await svc.evaluateFamily('IBOV', 'BENCHMARK_IBOV_DAILY', '2026-01-10T15:00:00.000Z');
    expect(result.state).toBe('HEALTHY');
    expect(result.expectedThrough).toBe('2026-01-09');
  });

  it('STALE/FAILED ladder follows lag thresholds', async () => {
    const svc = makeService(openCalendar(WEEKDAYS_JAN5_9), { CDI: '2026-01-06' }, [{ status: 'SUCCESS' }]);
    const stale = await svc.evaluateFamily('CDI', 'BENCHMARK_CDI_DAILY', '2026-01-09T23:30:00.000Z');
    expect(stale.lagPeriods).toBe(3);
    expect(stale.state).toBe('STALE');
  });

  it('UNKNOWN with no run history and no data', async () => {
    const svc = makeService(openCalendar(WEEKDAYS_JAN5_9), {}, []);
    const result = await svc.evaluateFamily('USD_BRL', 'FX_USD_BRL_DAILY', '2026-01-09T23:30:00.000Z');
    expect(result.state).toBe('UNKNOWN');
    expect(result.reasonCode).toBe('NO_RUN_HISTORY');
  });
});

describe('5G freshness - IPCA publication semantics', () => {
  it('current unpublished month is never expected', async () => {
    const svc = makeService(openCalendar([]), { IPCA: '2026-09-01' }, [{ status: 'SUCCESS' }]);
    const result = await svc.evaluateFamily('IPCA', 'MACRO_IPCA', NOW_MON_10AM);
    expect(result.expectedThrough).toBe('2026-09');
    expect(result.state).toBe('HEALTHY');
  });

  it('missing published month is STALE, older is FAILED', async () => {
    const svc = makeService(openCalendar([]), { IPCA: '2026-08-01' }, [{ status: 'SUCCESS' }]);
    const result = await svc.evaluateFamily('IPCA', 'MACRO_IPCA', NOW_MON_10AM);
    expect(result.expectedThrough).toBe('2026-09');
    expect(result.lagPeriods).toBe(1);
    expect(result.state).toBe('STALE');
  });
});

describe('5G freshness - SELIC target event-driven + calendar horizon', () => {
  it('SELIC target with any observation is HEALTHY regardless of date', async () => {
    const svc = makeService(openCalendar([]), { SELIC_TARGET: '2026-03-19' }, [{ status: 'SUCCESS' }]);
    const result = await svc.evaluateFamily('SELIC_TARGET', 'MACRO_SELIC_TARGET', NOW_MON_10AM);
    expect(result.state).toBe('HEALTHY');
  });

  it('SELIC target without observations is UNKNOWN, not stale', async () => {
    const svc = makeService(openCalendar([]), {}, []);
    const result = await svc.evaluateFamily('SELIC_TARGET', 'MACRO_SELIC_TARGET', NOW_MON_10AM);
    expect(result.state).toBe('UNKNOWN');
  });

  it('calendar missing next year near year-end is STALE, current-year gap is FAILED', async () => {
    const partial = {
      findDay: async () => ({ isOpen: true }),
      findDays: async () => [],
      getCoverage: async () => ({ minDate: LocalDate.from('2026-01-01'), maxDate: LocalDate.from('2026-12-31') }),
    };
    const svc = makeService(partial, {}, [{ status: 'SUCCESS' }]);
    const dec = await svc.evaluateFamily('B3_CALENDAR', 'CALENDAR_B3_REFRESH', '2026-12-15T12:00:00.000Z');
    expect(dec.state).toBe('STALE');
    const empty = {
      findDay: async () => null,
      findDays: async () => [],
      getCoverage: async () => ({ minDate: null, maxDate: null }),
    };
    const svc2 = makeService(empty, {}, []);
    const failed = await svc2.evaluateFamily('B3_CALENDAR', 'CALENDAR_B3_REFRESH', NOW_MON_10AM);
    expect(failed.state).toBe('FAILED');
  });
});

describe('5G missed schedule', () => {
  it('flags open days past grace without a SCHEDULED run', () => {
    const missed = detectMissedDailySchedules({
      jobType: 'BENCHMARK_IBOV_DAILY',
      openDates: [LocalDate.from('2026-10-19'), LocalDate.from('2026-10-20')],
      runs: [{ triggerType: 'SCHEDULED', targetPeriod: '2026-10-19', startedAt: '2026-10-19T19:05:00.000Z' }],
      nowIso: '2026-10-21T12:00:00.000Z',
      schedulerEnabled: true,
    });
    expect(missed.map((m) => m.expectedDate)).toEqual(['2026-10-20']);
  });

  it('suppressed entirely when scheduler is disabled', () => {
    const missed = detectMissedDailySchedules({
      jobType: 'BENCHMARK_IBOV_DAILY',
      openDates: [LocalDate.from('2026-10-19')],
      runs: [],
      nowIso: '2026-10-21T12:00:00.000Z',
      schedulerEnabled: false,
    });
    expect(missed).toEqual([]);
  });
});
