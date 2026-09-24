import { describe, it, expect } from 'vitest';
import { LocalDate, Currency, Percentage, Quantity } from '@atlas/domain';
import {
  calculateRealizedVolatility,
  calculateDrawdown,
  calculateDrawdownFromSubperiods,
  calculateRiskMetrics,
  selectRiskStatisticalReturns,
  decimalSqrt,
  InvalidRiskInputError,
  RiskSubperiodReturn,
  RiskCumulativePoint,
} from '@atlas/risk-engine';
import { calculateTWR } from '@atlas/performance-engine';
import { Money } from '@atlas/domain';

const BRL = 'BRL' as Currency;

function ret(date: string, percent: string): RiskSubperiodReturn {
  return { date: LocalDate.from(date), returnPercentage: Percentage.from(percent) };
}
function cum(date: string, percent: string): RiskCumulativePoint {
  return { date: LocalDate.from(date), cumulativeReturn: Percentage.from(percent) };
}
function num(pct: { value: string } | null): number {
  if (!pct) throw new Error('expected non-null percentage');
  return Number(pct.value);
}

// --- decimalSqrt boundary ----------------------------------------------------

describe('Risk sqrt boundary', () => {
  it('sqrt(4) is exactly 2', () => {
    expect(decimalSqrt(Quantity.from('4')).toString()).toBe('2');
  });

  it('sqrt(2) converges within 1e-12', () => {
    const s = Number(decimalSqrt(Quantity.from('2')).toString());
    expect(Math.abs(s - 1.4142135623730951)).toBeLessThan(1e-12);
  });

  it('sqrt(252) converges within 1e-12', () => {
    const s = Number(decimalSqrt(Quantity.from('252')).toString());
    expect(Math.abs(s - 15.874507866387544)).toBeLessThan(1e-12);
  });

  it('sqrt(0) is 0 and negative throws fail-closed', () => {
    expect(decimalSqrt(Quantity.zero()).isZero()).toBe(true);
    expect(() => decimalSqrt(Quantity.from('-1'))).toThrow(InvalidRiskInputError);
  });
});

// --- volatility §74 ----------------------------------------------------------

describe('Volatility — minimum observations', () => {
  it('0 and 1 observations → UNAVAILABLE with nulls (never 0)', () => {
    const empty = calculateRealizedVolatility({ returns: [] });
    expect(empty.status).toBe('UNAVAILABLE');
    expect(empty.samplePercentage).toBeNull();
    expect(empty.annualizedPercentage).toBeNull();

    const one = calculateRealizedVolatility({ returns: [ret('2026-01-02', '1')] });
    expect(one.status).toBe('UNAVAILABLE');
    expect(one.samplePercentage).toBeNull();
  });

  it('exactly 2 observations computes (n-1 = 1)', () => {
    const r = calculateRealizedVolatility({
      returns: [ret('2026-01-02', '2'), ret('2026-01-03', '4')],
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.observationCount).toBe(2);
    // sample var = (0.0001+0.0001)/1 → sqrt = 1.41421…% (population would be 1%)
    expect(Math.abs(num(r.samplePercentage) - 1.41421356)).toBeLessThan(1e-6);
  });
});

describe('Volatility — constant returns are exactly 0', () => {
  it('1%/1%/1% → 0 (known, not missing)', () => {
    const r = calculateRealizedVolatility({
      returns: [ret('2026-01-02', '1'), ret('2026-01-03', '1'), ret('2026-01-04', '1')],
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.samplePercentage?.value).toBe('0');
    expect(r.annualizedPercentage?.value).toBe('0');
  });
});

describe('Volatility — alternating and mixed returns', () => {
  it('+1/-1/+1/-1 → sample ≈ 1.1547%, annualized ≈ 18.3303%', () => {
    const r = calculateRealizedVolatility({
      returns: [
        ret('2026-01-02', '1'),
        ret('2026-01-03', '-1'),
        ret('2026-01-04', '1'),
        ret('2026-01-05', '-1'),
      ],
    });
    expect(r.observationCount).toBe(4);
    expect(Math.abs(num(r.samplePercentage) - 1.1547005383792515)).toBeLessThan(1e-8);
    expect(Math.abs(num(r.annualizedPercentage) - 18.33030277982336)).toBeLessThan(1e-6);
  });

  it('annualized == sample × sqrt(252) by construction', () => {
    const r = calculateRealizedVolatility({
      returns: [ret('2026-01-02', '3'), ret('2026-01-03', '-2'), ret('2026-01-04', '0.5')],
    });
    const ratio = num(r.annualizedPercentage) / num(r.samplePercentage);
    expect(Math.abs(ratio - 15.874507866387544)).toBeLessThan(1e-9);
  });
});

describe('Volatility — determinism, decimals, frozen, finite', () => {
  const input = [
    ret('2026-01-02', '0.123456789012345678'),
    ret('2026-01-03', '-0.987654321098765432'),
    ret('2026-01-04', '2.5'),
    ret('2026-01-05', '0'),
    ret('2026-01-06', '-3.333333333333333333'),
  ];

  it('deterministic across runs', () => {
    const a = calculateRealizedVolatility({ returns: input });
    const b = calculateRealizedVolatility({ returns: [...input].reverse() });
    expect(a.samplePercentage?.value).toBe(b.samplePercentage?.value);
    expect(a.annualizedPercentage?.value).toBe(b.annualizedPercentage?.value);
  });

  it('long decimal inputs stay decimal strings, finite, frozen', () => {
    const r = calculateRealizedVolatility({ returns: input });
    expect(r.samplePercentage?.value).toMatch(/^-?\d+(\.\d+)?$/);
    expect(r.annualizedPercentage?.value).toMatch(/^-?\d+(\.\d+)?$/);
    expect(Number.isFinite(num(r.samplePercentage))).toBe(true);
    expect(Object.isFrozen(r)).toBe(true);
  });

  it('long series (500 obs) is deterministic and finite', () => {
    const many: RiskSubperiodReturn[] = [];
    let y = 2024;
    let m = 1;
    let d = 1;
    const daysIn = (yy: number, mm: number): number => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    for (let i = 0; i < 500; i++) {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      many.push(ret(date, i % 2 === 0 ? '0.5' : '-0.3'));
      d += 1;
      if (d > daysIn(y, m)) {
        d = 1;
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
    }
    const r = calculateRealizedVolatility({ returns: many });
    expect(r.observationCount).toBe(500);
    expect(Number.isFinite(num(r.annualizedPercentage))).toBe(true);
    expect(num(r.annualizedPercentage)).toBeGreaterThan(0);
  });

  it('duplicate dates fail closed to UNAVAILABLE', () => {
    const r = calculateRealizedVolatility({
      returns: [ret('2026-01-02', '1'), ret('2026-01-02', '2')],
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.samplePercentage).toBeNull();
  });
});

// --- cash-flow neutralization §75 --------------------------------------------

describe('Volatility — cash flows neutralized via TWR subperiods', () => {
  it('deposit doubling wealth creates no risk spike', () => {
    // 100 → deposit 100 → 200 → 220: TWR subperiods are 0%, 0%, 10%.
    const twr = calculateTWR({
      observations: [
        { date: LocalDate.from('2026-01-01'), value: Money.from('100', BRL), currency: BRL },
        { date: LocalDate.from('2026-01-02'), value: Money.from('200', BRL), currency: BRL },
        { date: LocalDate.from('2026-01-03'), value: Money.from('220', BRL), currency: BRL },
      ],
      cashFlows: [
        {
          date: LocalDate.from('2026-01-02'),
          amount: Money.from('100', BRL),
          direction: 'INFLOW' as never,
        },
      ],
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-01-03') },
      currency: BRL,
    });
    expect(twr.status).toBe('COMPLETE');
    const subperiods: RiskSubperiodReturn[] = twr.subperiods.map((s) => ({
      date: s.endDate,
      returnPercentage: s.returnPercentage,
    }));
    const r = calculateRealizedVolatility({ returns: subperiods });
    expect(r.status).toBe('AVAILABLE');
    // No +100% spike: vol of [0,0,10] ≈ 5.77% daily, far below a spike regime.
    expect(num(r.samplePercentage)).toBeLessThan(10);
    expect(num(r.samplePercentage)).toBeGreaterThan(0);
  });
});

// --- drawdown §76/§77 ---------------------------------------------------------

describe('Drawdown — flat series', () => {
  it('0/0/0 → max 0, current 0, peak=trough=start, recovery null', () => {
    const d = calculateDrawdown({
      startDate: LocalDate.from('2026-01-01'),
      cumulativePoints: [cum('2026-01-02', '0'), cum('2026-01-03', '0')],
    });
    expect(d.status).toBe('AVAILABLE');
    expect(d.maximumPercentage?.value).toBe('0');
    expect(d.currentPercentage?.value).toBe('0');
    expect(d.peakDate?.toString()).toBe('2026-01-01');
    expect(d.troughDate?.toString()).toBe('2026-01-01');
    expect(d.recoveryDate).toBeNull();
  });
});

describe('Drawdown — monotonically rising', () => {
  it('new highs keep current at 0', () => {
    const d = calculateDrawdown({
      startDate: LocalDate.from('2026-01-01'),
      cumulativePoints: [cum('2026-01-02', '5'), cum('2026-01-03', '10')],
    });
    expect(d.maximumPercentage?.value).toBe('0');
    expect(d.currentPercentage?.value).toBe('0');
    expect(d.recoveryDate).toBeNull();
  });
});

describe('Drawdown — canonical example (peak 1.10, trough 0.99, −10%, recovery)', () => {
  const d = calculateDrawdown({
    startDate: LocalDate.from('2026-01-01'),
    cumulativePoints: [
      cum('2026-01-02', '10'),
      cum('2026-01-03', '-1'),
      cum('2026-01-04', '5'),
      cum('2026-01-05', '12'),
    ],
  });

  it('maximum is −10% (negative convention)', () => {
    expect(Math.abs(num(d.maximumPercentage) - -10)).toBeLessThan(1e-9);
    expect(num(d.maximumPercentage)).toBeLessThanOrEqual(0);
  });

  it('exact peak/trough/recovery dates', () => {
    expect(d.peakDate?.toString()).toBe('2026-01-02');
    expect(d.troughDate?.toString()).toBe('2026-01-03');
    expect(d.recoveryDate?.toString()).toBe('2026-01-05');
  });

  it('current is 0 at the new high', () => {
    expect(d.currentPercentage?.value).toBe('0');
  });
});

describe('Drawdown — multiple drawdowns, deepest wins, open stays null', () => {
  it('−10% recovered, then −25% open', () => {
    const d = calculateDrawdown({
      startDate: LocalDate.from('2026-01-01'),
      cumulativePoints: [
        cum('2026-01-02', '20'), // peak 1.2
        cum('2026-01-03', '8'), // 1.08 → −10%
        cum('2026-01-04', '20'), // recover 1.2
        cum('2026-01-05', '30'), // new peak 1.3
        cum('2026-01-06', '-2.5'), // 0.975 → −25% from 1.3
      ],
    });
    expect(Math.abs(num(d.maximumPercentage) - -25)).toBeLessThan(1e-9);
    expect(d.peakDate?.toString()).toBe('2026-01-05');
    expect(d.troughDate?.toString()).toBe('2026-01-06');
    expect(d.recoveryDate).toBeNull();
    expect(Math.abs(num(d.currentPercentage) - -25)).toBeLessThan(1e-9);
  });
});

describe('Drawdown — subperiod chaining matches cumulative input', () => {
  it('same trajectory via subperiods gives same dates and magnitude', () => {
    const fromSubs = calculateDrawdownFromSubperiods({
      startDate: LocalDate.from('2026-01-01'),
      subperiodReturns: [
        ret('2026-01-02', '10'),
        ret('2026-01-03', '-10'),
        ret('2026-01-04', '6.06060606060606060606'),
        ret('2026-01-05', '6.66666666666666666667'),
      ],
    });
    expect(Math.abs(num(fromSubs.maximumPercentage) - -10)).toBeLessThan(1e-6);
    expect(fromSubs.peakDate?.toString()).toBe('2026-01-02');
    expect(fromSubs.troughDate?.toString()).toBe('2026-01-03');
    expect(fromSubs.recoveryDate?.toString()).toBe('2026-01-05');
  });

  it('empty subperiods → UNAVAILABLE nulls', () => {
    const d = calculateDrawdownFromSubperiods({
      startDate: LocalDate.from('2026-01-01'),
      subperiodReturns: [],
    });
    expect(d.status).toBe('UNAVAILABLE');
    expect(d.maximumPercentage).toBeNull();
    expect(d.currentPercentage).toBeNull();
  });
});

// --- Layer B: economic risk observations (ADR-132) ----------------------------

function economic(...dates: string[]) {
  return dates.map((d) => LocalDate.from(d));
}

describe('Layer B — Friday→Monday weekend gap', () => {
  // Fri economic 0% (anchor move), Sat/Sun fallback 0%, Mon economic +2%.
  const twrSubperiods = [
    ret('2026-01-02', '0'), // Fri anchor move (EXACT)
    ret('2026-01-03', '0'), // Sat fallback
    ret('2026-01-04', '0'), // Sun fallback
    ret('2026-01-05', '2'), // Mon EXACT
  ];

  it('Saturday/Sunday do NOT enter the volatility sample', () => {
    const selected = selectRiskStatisticalReturns({
      subperiodReturns: twrSubperiods,
      economicDates: economic('2026-01-01', '2026-01-02', '2026-01-05'),
    });
    expect(selected.map((r) => r.date.toString())).toEqual(['2026-01-02', '2026-01-05']);
    expect(selected).toHaveLength(2);
  });

  it('observationCount proves the exclusion (2, not 4)', () => {
    const vol = calculateRealizedVolatility({
      returns: selectRiskStatisticalReturns({
        subperiodReturns: twrSubperiods,
        economicDates: economic('2026-01-01', '2026-01-02', '2026-01-05'),
      }),
    });
    expect(vol.observationCount).toBe(2);
  });
});

describe('Layer B — holiday gap', () => {
  it('holiday with reused price creates no 0% statistical return', () => {
    // Tue EXACT +1%, Wed holiday fallback 0%, Thu EXACT +1%.
    const selected = selectRiskStatisticalReturns({
      subperiodReturns: [ret('2026-01-06', '1'), ret('2026-01-07', '0'), ret('2026-01-08', '1')],
      economicDates: economic('2026-01-05', '2026-01-06', '2026-01-08'),
    });
    expect(selected.map((r) => r.returnPercentage.value)).toEqual(['1', '1']);
  });
});

describe('Layer B — weekend flow stays neutralized but out of sample', () => {
  it('Saturday flow boundary excluded; Monday keeps the neutralized return', () => {
    // Fri 100 → Sat deposit 100 (value 200, TWR 0%) → Mon 202 (+1% economic).
    const selected = selectRiskStatisticalReturns({
      subperiodReturns: [ret('2026-01-03', '0'), ret('2026-01-05', '1')],
      economicDates: economic('2026-01-02', '2026-01-05'),
    });
    expect(selected.map((r) => r.returnPercentage.value)).toEqual(['1']);
  });
});

describe('Layer B — Friday→Tuesday with Monday holiday', () => {
  it('no Sat/Sun/Mon zeros before the Tuesday return', () => {
    const selected = selectRiskStatisticalReturns({
      subperiodReturns: [
        ret('2026-01-03', '0'),
        ret('2026-01-04', '0'),
        ret('2026-01-05', '0'),
        ret('2026-01-06', '3'),
      ],
      economicDates: economic('2026-01-02', '2026-01-06'),
    });
    expect(selected).toHaveLength(1);
    expect(selected[0]!.returnPercentage.value).toBe('3');
  });
});

describe('Layer B — exact boundary/subperiod/statistical counts', () => {
  it('5 TWR boundaries can yield 2 statistical observations', () => {
    const twr = [
      ret('2026-01-02', '0'),
      ret('2026-01-03', '0'),
      ret('2026-01-04', '0'),
      ret('2026-01-05', '2'),
      ret('2026-01-06', '-1'),
    ];
    const selected = selectRiskStatisticalReturns({
      subperiodReturns: twr,
      economicDates: economic('2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06'),
    });
    expect(twr).toHaveLength(5);
    expect(selected).toHaveLength(3);
  });

  it('output is frozen and sorted regardless of input order', () => {
    const selected = selectRiskStatisticalReturns({
      subperiodReturns: [ret('2026-01-05', '2'), ret('2026-01-02', '0')],
      economicDates: economic('2026-01-02', '2026-01-05'),
    });
    expect(Object.isFrozen(selected)).toBe(true);
    expect(selected.map((r) => r.date.toString())).toEqual(['2026-01-02', '2026-01-05']);
  });
});

describe('Layer B — wrong-implementation regression (no zero dilution)', () => {
  it('correct +2%/−2% sample, not 0/0/+2/0/0/−2', () => {
    const correct = selectRiskStatisticalReturns({
      subperiodReturns: [
        ret('2026-01-03', '0'),
        ret('2026-01-04', '0'),
        ret('2026-01-05', '2'),
        ret('2026-01-10', '0'),
        ret('2026-01-11', '0'),
        ret('2026-01-12', '-2'),
      ],
      economicDates: economic('2026-01-02', '2026-01-05', '2026-01-12'),
    });
    expect(correct.map((r) => r.returnPercentage.value)).toEqual(['2', '-2']);
    const vol = calculateRealizedVolatility({ returns: correct });
    expect(vol.observationCount).toBe(2);
    // sample of [+2,−2]: mean 0, var (0.0004+0.0004)/1 → sqrt = 2.8284…%
    expect(Math.abs(num(vol.samplePercentage) - 2.82842712)).toBeLessThan(1e-6);
    // Diluted calendar implementation would report 6 obs with vol ≈ 1.26%.
    const diluted = calculateRealizedVolatility({
      returns: [
        ret('2026-01-03', '0'),
        ret('2026-01-04', '0'),
        ret('2026-01-05', '2'),
        ret('2026-01-10', '0'),
        ret('2026-01-11', '0'),
        ret('2026-01-12', '-2'),
      ],
    });
    expect(diluted.observationCount).toBe(6);
    expect(num(diluted.samplePercentage)).toBeLessThan(num(vol.samplePercentage));
  });
});

// --- combined -----------------------------------------------------------------

describe('calculateRiskMetrics — combined and partial propagation', () => {
  it('AVAILABLE when upstream is AVAILABLE', () => {
    const m = calculateRiskMetrics({
      currency: BRL,
      startDate: LocalDate.from('2026-01-01'),
      subperiodReturns: [ret('2026-01-02', '1'), ret('2026-01-03', '-1')],
      dataAvailability: 'AVAILABLE',
    });
    expect(m.status).toBe('AVAILABLE');
    expect(m.volatility.status).toBe('AVAILABLE');
    expect(m.drawdown.status).toBe('AVAILABLE');
    expect(Object.isFrozen(m)).toBe(true);
  });

  it('PARTIAL propagates (never silently COMPLETE)', () => {
    const m = calculateRiskMetrics({
      currency: BRL,
      startDate: LocalDate.from('2026-01-01'),
      subperiodReturns: [ret('2026-01-02', '1'), ret('2026-01-03', '-1')],
      dataAvailability: 'PARTIAL',
    });
    expect(m.status).toBe('PARTIAL');
    expect(m.volatility.status).toBe('PARTIAL');
    expect(m.drawdown.status).toBe('PARTIAL');
  });

  it('empty input → UNAVAILABLE', () => {
    const m = calculateRiskMetrics({
      currency: BRL,
      startDate: LocalDate.from('2026-01-01'),
      subperiodReturns: [],
      dataAvailability: 'UNAVAILABLE',
    });
    expect(m.status).toBe('UNAVAILABLE');
    expect(m.volatility.annualizedPercentage).toBeNull();
    expect(m.drawdown.maximumPercentage).toBeNull();
  });
});
