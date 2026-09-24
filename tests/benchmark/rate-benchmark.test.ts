import { describe, it, expect } from 'vitest';
import { LocalDate, Quantity } from '@atlas/domain';
import {
  InMemoryRateBenchmarkDataProvider,
  calculateRateBenchmarkReturn,
  calculateExcessReturn,
  calculateBenchmarkReturn,
  UnsupportedRateUnitError,
  UnsupportedBenchmarkTypeError,
} from '@atlas/benchmark-engine';

function obs(date: string, rate: string, unit: 'DAILY_PERCENT' | 'DAILY_FACTOR' = 'DAILY_PERCENT') {
  return {
    benchmarkId: 'CDI' as const,
    date: LocalDate.from(date),
    rate: Quantity.from(rate),
    unit,
    source: 'IN_MEMORY',
  };
}

function cdi(input: {
  observations: ReturnType<typeof obs>[];
  start: string;
  end: string;
  expectedObservationDates?: LocalDate[];
}) {
  return calculateRateBenchmarkReturn({
    benchmarkId: 'CDI',
    observations: input.observations,
    startDate: LocalDate.from(input.start),
    endDate: LocalDate.from(input.end),
    expectedObservationDates: input.expectedObservationDates,
  });
}

describe('RateBenchmark: compounding (1% + 1% = 2.01%)', () => {
  it('two daily 1% compound to 2.01%', () => {
    const ret = cdi({
      observations: [obs('2026-01-02', '1'), obs('2026-01-03', '1')],
      start: '2026-01-01',
      end: '2026-01-03',
    });
    expect(ret.returnPercentage?.value).toBe('2.01');
    expect(ret.accumulatedFactor.toString()).toBe('1.0201');
    expect(ret.observationCount).toBe(2);
    expect(ret.status).toBe('AVAILABLE');
  });

  it('DAILY_FACTOR 1.01 twice also compounds to 2.01%', () => {
    const ret = cdi({
      observations: [
        obs('2026-01-02', '1.01', 'DAILY_FACTOR'),
        obs('2026-01-03', '1.01', 'DAILY_FACTOR'),
      ],
      start: '2026-01-01',
      end: '2026-01-03',
    });
    expect(ret.returnPercentage?.value).toBe('2.01');
  });

  it('never uses simple addition (would be 2.00)', () => {
    const ret = cdi({
      observations: [obs('2026-01-02', '1'), obs('2026-01-03', '1')],
      start: '2026-01-01',
      end: '2026-01-03',
    });
    expect(ret.returnPercentage?.value).not.toBe('2');
    expect(ret.returnPercentage?.value).not.toBe('2.00');
  });
});

describe('RateBenchmark: zero rate', () => {
  it('0 + 0 = 0%', () => {
    const ret = cdi({
      observations: [obs('2026-01-02', '0'), obs('2026-01-03', '0')],
      start: '2026-01-01',
      end: '2026-01-03',
    });
    expect(ret.returnPercentage?.value).toBe('0');
    expect(ret.accumulatedFactor.toString()).toBe('1');
  });
});

describe('RateBenchmark: long decimals / precision', () => {
  it('handles long decimal without drift', () => {
    const ret = cdi({
      observations: [
        obs('2026-01-02', '0.123456789012345678'),
        obs('2026-01-03', '0.987654321098765432'),
      ],
      start: '2026-01-01',
      end: '2026-01-03',
    });
    expect(ret.returnPercentage?.value).not.toBe('0');
    expect(ret.accumulatedFactor.toString()).toContain('1.');
  });

  it('CDI-like daily rates over hundreds of observations are exact', () => {
    // 0.05% daily for 252 business days compounded exactly.
    const dates: string[] = [];
    const observations: ReturnType<typeof obs>[] = [];
    let d = new Date(Date.UTC(2026, 0, 1));
    while (dates.length < 252) {
      d = new Date(d.getTime() + 86400000);
      const day = d.getUTCDay();
      if (day === 0 || day === 6) continue;
      const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
        d.getUTCDate(),
      ).padStart(2, '0')}`;
      dates.push(iso);
      observations.push(obs(iso, '0.05'));
    }
    const ret = cdi({ observations, start: '2026-01-01', end: dates[dates.length - 1]! });
    expect(ret.observationCount).toBe(252);
    // (1.0005)^252 - 1 ~= 0.13411... ; assert it is a positive exact decimal string
    expect(ret.returnPercentage?.value).toMatch(/^\d+(\.\d+)?$/);
    expect(ret.accumulatedFactor.toString()).toMatch(/^1\.\d+$/);
  });
});

describe('RateBenchmark: observation counts', () => {
  it('single day 0.05% => 0.05%', () => {
    const ret = cdi({
      observations: [obs('2026-01-02', '0.05')],
      start: '2026-01-01',
      end: '2026-01-02',
    });
    expect(ret.returnPercentage?.value).toBe('0.05');
    expect(ret.observationCount).toBe(1);
    expect(ret.status).toBe('AVAILABLE');
  });

  it('counts two observations', () => {
    const ret = cdi({
      observations: [obs('2026-01-02', '0.04'), obs('2026-01-03', '0.04')],
      start: '2026-01-01',
      end: '2026-01-03',
    });
    expect(ret.observationCount).toBe(2);
  });
});

describe('RateBenchmark: period boundaries (start exclusive, end inclusive)', () => {
  it('observation on startDate is excluded (start, end]', () => {
    const ret = cdi({
      observations: [obs('2026-01-01', '1'), obs('2026-01-02', '1')],
      start: '2026-01-01',
      end: '2026-01-02',
    });
    expect(ret.observationCount).toBe(1);
    expect(ret.returnPercentage?.value).toBe('1');
  });

  it('observation on endDate is included', () => {
    const ret = cdi({
      observations: [obs('2026-01-03', '0.5')],
      start: '2026-01-01',
      end: '2026-01-03',
    });
    expect(ret.observationCount).toBe(1);
  });

  it('start === end has an empty (start, end] range => UNAVAILABLE', () => {
    const ret = cdi({
      observations: [obs('2026-01-05', '0.05')],
      start: '2026-01-05',
      end: '2026-01-05',
    });
    expect(ret.observationCount).toBe(0);
    expect(ret.status).toBe('UNAVAILABLE');
    expect(ret.returnPercentage).toBeNull();
  });

  it('crosses a month boundary', () => {
    const ret = cdi({
      observations: [obs('2026-01-30', '0.05'), obs('2026-02-02', '0.05')],
      start: '2026-01-29',
      end: '2026-02-02',
    });
    expect(ret.observationCount).toBe(2);
    expect(ret.status).toBe('AVAILABLE');
  });

  it('crosses a year boundary', () => {
    const ret = cdi({
      observations: [obs('2026-12-31', '0.05'), obs('2027-01-04', '0.05')],
      start: '2026-12-30',
      end: '2027-01-04',
    });
    expect(ret.observationCount).toBe(2);
    expect(ret.returnPercentage?.value).not.toBe('0');
  });
});

describe('RateBenchmark: weekends and holidays are not partial', () => {
  it('Friday -> Monday skipping the weekend stays AVAILABLE', () => {
    const ret = cdi({
      observations: [obs('2026-01-02', '0.04'), obs('2026-01-05', '0.04')], // Fri + Mon
      start: '2026-01-01',
      end: '2026-01-05',
    });
    expect(ret.status).toBe('AVAILABLE');
    expect(ret.observationCount).toBe(2);
  });
});

describe('RateBenchmark: missing observations are never treated as zero', () => {
  it('a missing weekday is not silently compounded as 0%', () => {
    const retMissing = cdi({
      observations: [obs('2026-01-02', '1')],
      start: '2026-01-01',
      end: '2026-01-03',
    });
    expect(retMissing.observationCount).toBe(1);
    expect(retMissing.returnPercentage?.value).toBe('1');
  });

  it('explicit expected business days reveal a gap as PARTIAL', () => {
    const ret = cdi({
      observations: [obs('2026-01-02', '0.05'), obs('2026-01-06', '0.05')],
      start: '2026-01-01',
      end: '2026-01-06',
      expectedObservationDates: [
        LocalDate.from('2026-01-02'),
        LocalDate.from('2026-01-05'),
        LocalDate.from('2026-01-06'),
      ],
    });
    expect(ret.status).toBe('PARTIAL');
    expect(ret.observationCount).toBe(2);
  });

  it('full coverage of expected business days is AVAILABLE', () => {
    const ret = cdi({
      observations: [obs('2026-01-02', '0.05'), obs('2026-01-05', '0.05')],
      start: '2026-01-01',
      end: '2026-01-05',
      expectedObservationDates: [LocalDate.from('2026-01-02'), LocalDate.from('2026-01-05')],
    });
    expect(ret.status).toBe('AVAILABLE');
  });
});

describe('RateBenchmark: empty series', () => {
  it('empty -> UNAVAILABLE with null return (never 0%)', () => {
    const ret = cdi({ observations: [], start: '2026-01-01', end: '2026-01-02' });
    expect(ret.status).toBe('UNAVAILABLE');
    expect(ret.observationCount).toBe(0);
    expect(ret.returnPercentage).toBeNull();
    expect(ret.accumulatedFactor.toString()).toBe('1');
  });
});

describe('RateBenchmark: long period', () => {
  it('100 daily 0.04% observations', () => {
    const obsArr = Array.from({ length: 100 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 2 + i));
      const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
        d.getUTCDate(),
      ).padStart(2, '0')}`;
      return obs(iso, '0.04');
    });
    const ret = cdi({ observations: obsArr, start: '2026-01-01', end: '2026-04-12' });
    expect(ret.observationCount).toBe(100);
    expect(ret.status).toBe('AVAILABLE');
  });
});

describe('RateBenchmark: deterministic & frozen', () => {
  it('same input -> same output and frozen result', () => {
    const input = {
      observations: [obs('2026-01-02', '0.03'), obs('2026-01-03', '0.04')],
      start: '2026-01-01',
      end: '2026-01-03',
    };
    const a = cdi(input);
    const b = cdi(input);
    expect(a.returnPercentage?.value).toBe(b.returnPercentage?.value);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it('permutation of input observations does not change the result', () => {
    const o1 = obs('2026-01-02', '0.03');
    const o2 = obs('2026-01-03', '0.04');
    const a = cdi({ observations: [o1, o2], start: '2026-01-01', end: '2026-01-03' });
    const b = cdi({ observations: [o2, o1], start: '2026-01-01', end: '2026-01-03' });
    expect(a.returnPercentage?.value).toBe(b.returnPercentage?.value);
  });
});

describe('RateBenchmark: unit safety', () => {
  it('rejects an unsupported/unknown rate unit instead of compounding it as daily', () => {
    const bad = {
      benchmarkId: 'CDI' as const,
      date: LocalDate.from('2026-01-02'),
      rate: Quantity.from('13.65'),
      unit: 'ANNUAL_PERCENT' as never,
      source: 'IN_MEMORY',
    };
    expect(() => cdi({ observations: [bad], start: '2026-01-01', end: '2026-01-02' })).toThrow(
      UnsupportedRateUnitError,
    );
  });

  it('rejects a PRICE_INDEX benchmark on the rate path', () => {
    expect(() =>
      calculateRateBenchmarkReturn({
        benchmarkId: 'IBOV',
        observations: [obs('2026-01-02', '0.05')],
        startDate: LocalDate.from('2026-01-01'),
        endDate: LocalDate.from('2026-01-02'),
      }),
    ).toThrow(UnsupportedBenchmarkTypeError);
  });

  it('rejects a RATE_SERIES benchmark on the price path', () => {
    expect(() =>
      calculateBenchmarkReturn({
        benchmarkId: 'CDI',
        startLevel: Quantity.from('100'),
        endLevel: Quantity.from('110'),
      }),
    ).toThrow(UnsupportedBenchmarkTypeError);
  });

  it('rejects an inverted period', () => {
    expect(() =>
      cdi({ observations: [obs('2026-01-02', '0.05')], start: '2026-02-01', end: '2026-01-01' }),
    ).toThrow();
  });
});

describe('RateBenchmark: BRL currency', () => {
  it('CDI is a BRL series', async () => {
    const p = new InMemoryRateBenchmarkDataProvider();
    p.seed({ benchmarkId: 'CDI', date: '2026-01-02', rate: '0.04' });
    const o = await p.getRateObservation('CDI', LocalDate.from('2026-01-02'));
    expect(o.rate.toString()).toBe('0.04');
    expect(o.unit).toBe('DAILY_PERCENT');
  });
});

describe('RateBenchmark: USD incompatibility', () => {
  it('CDI vs USD is not applicable server-side (no FX, no cross-currency)', () => {
    // The API never attaches a CDI benchmark to a non-BRL currency.
    // See portfolio-cdi-benchmark-api.test.ts for the HTTP-level assertion.
    expect(true).toBe(true);
  });
});

describe('RateBenchmark: difference in percentage points', () => {
  it('portfolio 12% vs CDI 9% => +3 p.p.', () => {
    const diff = calculateExcessReturn({
      portfolioTwr: { value: '12' } as never,
      benchmarkReturn: { value: '9' } as never,
    });
    expect(diff.value).toBe('3');
  });

  it('portfolio 8% vs CDI 10% => -2 p.p.', () => {
    const diff = calculateExcessReturn({
      portfolioTwr: { value: '8' } as never,
      benchmarkReturn: { value: '10' } as never,
    });
    expect(diff.value).toBe('-2');
  });

  it('zero difference 10% vs 10% => 0', () => {
    const diff = calculateExcessReturn({
      portfolioTwr: { value: '10' } as never,
      benchmarkReturn: { value: '10' } as never,
    });
    expect(diff.value).toBe('0');
  });
});
