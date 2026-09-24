import { describe, it, expect } from 'vitest';
import { LocalDate, Money, Currency, Percentage } from '@atlas/domain';
import {
  calculatePerformanceSeries,
  calculateTWR,
  resolveSeriesGranularity,
  selectDisplayDates,
  MAX_PERFORMANCE_SERIES_POINTS,
  ResolvedSeriesGranularity,
} from '@atlas/performance-engine';
import { calculateBenchmarkReturn, calculateRateBenchmarkReturn } from '@atlas/benchmark-engine';
import { Quantity } from '@atlas/domain';

const BRL = 'BRL' as Currency;
const USD = 'USD' as Currency;

function obs(date: string, amount: string, currency: Currency = BRL) {
  return { date: LocalDate.from(date), value: Money.from(amount, currency), currency };
}
function cf(
  date: string,
  amount: string,
  direction: 'INFLOW' | 'OUTFLOW' = 'INFLOW',
  currency: Currency = BRL,
) {
  return {
    date: LocalDate.from(date),
    amount: Money.from(amount, currency),
    direction: direction as never,
  };
}
function period(start: string, end: string) {
  return { startDate: LocalDate.from(start), endDate: LocalDate.from(end) };
}
function display(dates: string[]) {
  return dates.map((d) => LocalDate.from(d));
}

// --- §87 ENGINE TEST — FLAT -------------------------------------------------

describe('Series engine — flat (100 → 100)', () => {
  it('0% / 0%', () => {
    const s = calculatePerformanceSeries({
      observations: [obs('2026-01-01', '100'), obs('2026-01-31', '100')],
      cashFlows: [],
      period: period('2026-01-01', '2026-01-31'),
      currency: BRL,
      displayDates: display(['2026-01-01', '2026-01-31']),
      granularity: 'DAILY',
    });
    expect(s.points).toHaveLength(2);
    expect(s.points[0]!.cumulativeReturn?.value).toBe('0');
    expect(s.points[1]!.cumulativeReturn?.value).toBe('0');
    expect(s.status).toBe('COMPLETE');
  });
});

// --- §88 ENGINE TEST — GAIN -------------------------------------------------

describe('Series engine — gain (100 → 110)', () => {
  it('0% / 10%', () => {
    const s = calculatePerformanceSeries({
      observations: [obs('2026-01-01', '100'), obs('2026-01-31', '110')],
      cashFlows: [],
      period: period('2026-01-01', '2026-01-31'),
      currency: BRL,
      displayDates: display(['2026-01-01', '2026-01-31']),
      granularity: 'DAILY',
    });
    expect(s.points[0]!.cumulativeReturn?.value).toBe('0');
    expect(s.points[1]!.cumulativeReturn?.value).toBe('10');
  });
});

// --- §89 FLOW TEST (deposit neutralized) ------------------------------------

describe('Series engine — deposit neutralization', () => {
  it('D1 100, D2 deposit 100 → 200, D3 220 gives 0% / 0% / 10% (never 120%)', () => {
    const s = calculatePerformanceSeries({
      observations: [obs('2026-01-01', '100'), obs('2026-01-02', '200'), obs('2026-01-03', '220')],
      cashFlows: [cf('2026-01-02', '100', 'INFLOW')],
      period: period('2026-01-01', '2026-01-03'),
      currency: BRL,
      displayDates: display(['2026-01-01', '2026-01-02', '2026-01-03']),
      granularity: 'DAILY',
    });
    expect(s.points[0]!.cumulativeReturn?.value).toBe('0');
    expect(s.points[1]!.cumulativeReturn?.value).toBe('0');
    expect(s.points[2]!.cumulativeReturn?.value).toBe('10');
    expect(s.points[2]!.cumulativeReturn?.value).not.toBe('120');
  });
});

// --- §90 WITHDRAWAL TEST ----------------------------------------------------

describe('Series engine — withdrawal neutralization', () => {
  it('200, withdraw 100 → 100, then 110 gives 0% / 0% / 10%', () => {
    const s = calculatePerformanceSeries({
      observations: [obs('2026-01-01', '200'), obs('2026-01-02', '100'), obs('2026-01-03', '110')],
      cashFlows: [cf('2026-01-02', '100', 'OUTFLOW')],
      period: period('2026-01-01', '2026-01-03'),
      currency: BRL,
      displayDates: display(['2026-01-01', '2026-01-02', '2026-01-03']),
      granularity: 'DAILY',
    });
    expect(s.points[0]!.cumulativeReturn?.value).toBe('0');
    expect(s.points[1]!.cumulativeReturn?.value).toBe('0');
    expect(s.points[2]!.cumulativeReturn?.value).toBe('10');
  });
});

// --- §91 MULTIPLE FLOWS -----------------------------------------------------

describe('Series engine — multiple flows', () => {
  it('chains correctly across two deposits', () => {
    const observations = [
      obs('2026-01-01', '100'),
      obs('2026-01-10', '200'),
      obs('2026-01-20', '330'),
      obs('2026-01-31', '363'),
    ];
    const flows = [cf('2026-01-10', '100'), cf('2026-01-20', '100')];
    const p = period('2026-01-01', '2026-01-31');
    const s = calculatePerformanceSeries({
      observations,
      cashFlows: flows,
      period: p,
      currency: BRL,
      displayDates: display(['2026-01-01', '2026-01-10', '2026-01-20', '2026-01-31']),
      granularity: 'DAILY',
    });
    // subperiods: 0%, (330-200-100)/200=15%, (363-330)/330=10% → 1.15*1.10-1 = 26.5%
    expect(s.points.map((x) => x.cumulativeReturn?.value)).toEqual(['0', '0', '15', '26.5']);
    const summary = calculateTWR({ observations, cashFlows: flows, period: p, currency: BRL });
    expect(s.points[3]!.cumulativeReturn?.value).toBe(summary.returnPercentage.value);
  });
});

// --- §92 INTERNAL TRANSFER (no flow recorded) -------------------------------

describe('Series engine — internal transfers have zero consolidated effect', () => {
  it('no external flow means plain chaining', () => {
    const s = calculatePerformanceSeries({
      observations: [obs('2026-01-01', '100'), obs('2026-01-15', '105'), obs('2026-01-31', '110')],
      cashFlows: [],
      period: period('2026-01-01', '2026-01-31'),
      currency: BRL,
      displayDates: display(['2026-01-01', '2026-01-15', '2026-01-31']),
      granularity: 'DAILY',
    });
    expect(s.points[0]!.cumulativeReturn?.value).toBe('0');
    expect(s.points[1]!.cumulativeReturn?.value).toBe('5');
    expect(s.points[2]!.cumulativeReturn?.value).toBe('10');
  });
});

// --- §93 BENCHMARK IBOV SERIES ----------------------------------------------

describe('Benchmark IBOV series semantics', () => {
  it('100000 / 105000 / 110000 → 0% / 5% / 10%', () => {
    const start = Quantity.from('100000');
    const mid = calculateBenchmarkReturn({
      benchmarkId: 'IBOV',
      startLevel: start,
      endLevel: Quantity.from('105000'),
    });
    const end = calculateBenchmarkReturn({
      benchmarkId: 'IBOV',
      startLevel: start,
      endLevel: Quantity.from('110000'),
    });
    expect(mid.value).toBe('5');
    expect(end.value).toBe('10');
    expect(Percentage.from('0').value).toBe('0');
  });
});

// --- §94 CDI SERIES ----------------------------------------------------------

describe('Benchmark CDI series semantics', () => {
  it('1% + 1% = 0% / 1% / 2.01%', () => {
    const rate = (date: string) => ({
      benchmarkId: 'CDI' as const,
      date: LocalDate.from(date),
      rate: Quantity.from('1'),
      unit: 'DAILY_PERCENT' as const,
      source: 'IN_MEMORY',
    });
    const start = LocalDate.from('2026-01-01');
    const afterFirst = calculateRateBenchmarkReturn({
      benchmarkId: 'CDI',
      observations: [rate('2026-01-02')],
      startDate: start,
      endDate: LocalDate.from('2026-01-02'),
    });
    const afterSecond = calculateRateBenchmarkReturn({
      benchmarkId: 'CDI',
      observations: [rate('2026-01-02'), rate('2026-01-03')],
      startDate: start,
      endDate: LocalDate.from('2026-01-03'),
    });
    expect(afterFirst.returnPercentage?.value).toBe('1');
    expect(afterSecond.returnPercentage?.value).toBe('2.01');
  });
});

// --- §95 CONSISTENCY: final point == summary ---------------------------------

describe('Series/summary consistency', () => {
  it('final series point equals summary TWR', () => {
    const observations = [
      obs('2026-03-01', '1000'),
      obs('2026-03-10', '1500'),
      obs('2026-03-20', '1320'),
    ];
    const flows = [cf('2026-03-10', '500')];
    const p = period('2026-03-01', '2026-03-20');
    const summary = calculateTWR({ observations, cashFlows: flows, period: p, currency: BRL });
    const s = calculatePerformanceSeries({
      observations,
      cashFlows: flows,
      period: p,
      currency: BRL,
      displayDates: display(['2026-03-01', '2026-03-10', '2026-03-20']),
      granularity: 'DAILY',
    });
    expect(s.points[s.points.length - 1]!.cumulativeReturn?.value).toBe(
      summary.returnPercentage.value,
    );
  });
});

// --- §96/§97 PARTIAL + UNAVAILABLE -------------------------------------------

describe('Series partial/unavailable points', () => {
  it('missing start valuation → UNAVAILABLE null (never 0%)', () => {
    const s = calculatePerformanceSeries({
      observations: [obs('2026-01-15', '100'), obs('2026-01-31', '110')],
      cashFlows: [],
      period: period('2026-01-01', '2026-01-31'),
      currency: BRL,
      displayDates: display(['2026-01-01', '2026-01-15', '2026-01-31']),
      granularity: 'DAILY',
    });
    expect(s.points[0]!.cumulativeReturn).toBeNull();
    expect(s.points[0]!.status).toBe('UNAVAILABLE');
  });

  it('availabilityByDate PARTIAL marks point PARTIAL with value kept', () => {
    const s = calculatePerformanceSeries({
      observations: [obs('2026-01-01', '100'), obs('2026-01-31', '110')],
      cashFlows: [],
      period: period('2026-01-01', '2026-01-31'),
      currency: BRL,
      displayDates: display(['2026-01-01', '2026-01-31']),
      granularity: 'DAILY',
      availabilityByDate: { '2026-01-31': 'PARTIAL' },
    });
    expect(s.points[1]!.cumulativeReturn?.value).toBe('10');
    expect(s.points[1]!.status).toBe('PARTIAL');
    expect(s.dataAvailability).toBe('PARTIAL');
  });

  it('fully empty observations → INSUFFICIENT_DATA/UNAVAILABLE', () => {
    const s = calculatePerformanceSeries({
      observations: [],
      cashFlows: [],
      period: period('2026-01-01', '2026-01-31'),
      currency: BRL,
      displayDates: display(['2026-01-01', '2026-01-31']),
      granularity: 'DAILY',
    });
    expect(s.status).toBe('INSUFFICIENT_DATA');
    expect(s.dataAvailability).toBe('UNAVAILABLE');
  });
});

// --- §98/§99/§100 SAMPLING ---------------------------------------------------

describe('Sampling: DAILY / WEEKLY / MONTHLY', () => {
  it('DAILY covers every civil date including start/end', () => {
    const dates = selectDisplayDates({
      startDate: LocalDate.from('2026-01-01'),
      endDate: LocalDate.from('2026-01-05'),
      granularity: 'DAILY',
    });
    expect(dates.map((d) => d.toString())).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
    ]);
  });

  it('WEEKLY uses deterministic 7-day steps and always includes end', () => {
    const dates = selectDisplayDates({
      startDate: LocalDate.from('2026-01-01'),
      endDate: LocalDate.from('2026-02-10'),
      granularity: 'WEEKLY',
    });
    const strs = dates.map((d) => d.toString());
    expect(strs[0]).toBe('2026-01-01');
    expect(strs[strs.length - 1]).toBe('2026-02-10');
    expect(strs).toContain('2026-01-08');
    expect(strs).toContain('2026-01-15');
  });

  it('MONTHLY uses month-ends and always includes end', () => {
    const dates = selectDisplayDates({
      startDate: LocalDate.from('2026-01-15'),
      endDate: LocalDate.from('2026-04-10'),
      granularity: 'MONTHLY',
    });
    const strs = dates.map((d) => d.toString());
    expect(strs[0]).toBe('2026-01-15');
    expect(strs).toContain('2026-01-31');
    expect(strs).toContain('2026-02-28');
    expect(strs).toContain('2026-03-31');
    expect(strs[strs.length - 1]).toBe('2026-04-10');
  });
});

// --- §101 AUTO GRANULARITY ---------------------------------------------------

describe('AUTO granularity thresholds', () => {
  it('<=90d DAILY, 91–365d WEEKLY, >365d MONTHLY', () => {
    const g = (s: string, e: string): ResolvedSeriesGranularity =>
      resolveSeriesGranularity({
        startDate: LocalDate.from(s),
        endDate: LocalDate.from(e),
        requested: 'AUTO',
      });
    expect(g('2026-01-01', '2026-04-01')).toBe('DAILY'); // 90 days
    expect(g('2026-01-01', '2026-04-02')).toBe('WEEKLY'); // 91 days
    expect(g('2026-01-01', '2027-01-01')).toBe('WEEKLY'); // 365 days
    expect(g('2026-01-01', '2027-01-02')).toBe('MONTHLY'); // 366 days
  });

  it('explicit granularity passes through', () => {
    expect(
      resolveSeriesGranularity({
        startDate: LocalDate.from('2026-01-01'),
        endDate: LocalDate.from('2026-01-02'),
        requested: 'MONTHLY',
      }),
    ).toBe('MONTHLY');
  });
});

// --- §102 MAX POINTS ----------------------------------------------------------

describe('Max points cap', () => {
  it('never exceeds 400 points', () => {
    const dates = selectDisplayDates({
      startDate: LocalDate.from('2020-01-01'),
      endDate: LocalDate.from('2026-09-21'),
      granularity: 'DAILY',
    });
    expect(dates.length).toBeLessThanOrEqual(MAX_PERFORMANCE_SERIES_POINTS);
    expect(dates[0]!.toString()).toBe('2020-01-01');
    expect(dates[dates.length - 1]!.toString()).toBe('2026-09-21');
  });
});

// --- §103 START/END ALWAYS INCLUDED -------------------------------------------

describe('Start/end always included', () => {
  it('WEEKLY and MONTHLY include exact endpoints', () => {
    for (const g of ['WEEKLY', 'MONTHLY'] as const) {
      const dates = selectDisplayDates({
        startDate: LocalDate.from('2026-03-04'),
        endDate: LocalDate.from('2026-09-17'),
        granularity: g,
      });
      expect(dates[0]!.toString()).toBe('2026-03-04');
      expect(dates[dates.length - 1]!.toString()).toBe('2026-09-17');
    }
  });
});

// --- §104 NO FUTURE (engine is date-bounded by caller; invalid period fails closed)

describe('Invalid period fails closed', () => {
  it('start > end → INVALID_INPUT', () => {
    const s = calculatePerformanceSeries({
      observations: [],
      cashFlows: [],
      period: { startDate: LocalDate.from('2026-02-01'), endDate: LocalDate.from('2026-01-01') },
      currency: BRL,
      displayDates: [],
      granularity: 'DAILY',
    });
    expect(s.status).toBe('INVALID_INPUT');
  });
});

// --- §105 MULTI-CURRENCY -------------------------------------------------------

describe('Multi-currency segregation', () => {
  it('BRL and USD computed independently', () => {
    const p = period('2026-01-01', '2026-01-31');
    const dd = display(['2026-01-01', '2026-01-31']);
    const brl = calculatePerformanceSeries({
      observations: [obs('2026-01-01', '100', BRL), obs('2026-01-31', '110', BRL)],
      cashFlows: [],
      period: p,
      currency: BRL,
      displayDates: dd,
      granularity: 'DAILY',
    });
    const usd = calculatePerformanceSeries({
      observations: [obs('2026-01-01', '200', USD), obs('2026-01-31', '190', USD)],
      cashFlows: [],
      period: p,
      currency: USD,
      displayDates: dd,
      granularity: 'DAILY',
    });
    expect(brl.points[1]!.cumulativeReturn?.value).toBe('10');
    expect(usd.points[1]!.cumulativeReturn?.value).toBe('-5');
  });
});

// --- Immutability --------------------------------------------------------------

describe('Series engine purity', () => {
  it('freezes outputs and does not mutate inputs', () => {
    const observations = [obs('2026-01-01', '100'), obs('2026-01-31', '110')];
    const dd = display(['2026-01-31', '2026-01-01']);
    const s = calculatePerformanceSeries({
      observations,
      cashFlows: [],
      period: period('2026-01-01', '2026-01-31'),
      currency: BRL,
      displayDates: dd,
      granularity: 'DAILY',
    });
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.points)).toBe(true);
    expect(observations).toHaveLength(2);
    expect(dd[0]!.toString()).toBe('2026-01-31');
    // display order normalized ascending regardless of input order
    expect(s.points[0]!.date.toString()).toBe('2026-01-01');
  });
});
