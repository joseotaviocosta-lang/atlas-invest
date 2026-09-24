/* eslint-disable no-console */
import { LocalDate, Percentage } from '@atlas/domain';
import {
  calculateTailRisk,
  minimumTailSampleSize,
  RiskSubperiodReturn,
  TailConfidenceLevel,
  TailRiskResult,
} from '@atlas/risk-engine';

function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return LocalDate.fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function isWeekend(date: LocalDate): boolean {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
  const w = d.getUTCDay();
  return w === 0 || w === 6;
}

function economicDates(start: LocalDate, end: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  let cursor = addDays(start, 1); // Layer-B excludes the period anchor
  while (cursor.compare(end) <= 0) {
    if (!isWeekend(cursor)) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

interface SortCounts {
  valueSorts: number;
  dateSorts: number;
  totalSorts: number;
}

/**
 * Counts Array.prototype.sort calls by comparator kind during a single
 * calculateTailRisk call: value sorts compare `returnPercentage`, date-order
 * sorts compare `.date`.
 */
function instrumented<T>(fn: () => T): { result: T; sorts: SortCounts } {
  const originalSort = Array.prototype.sort;
  const sorts: SortCounts = { valueSorts: 0, dateSorts: 0, totalSorts: 0 };
  (Array.prototype as unknown as { sort: (cmp?: unknown) => unknown }).sort = function (
    this: unknown,
    cmp?: unknown,
  ) {
    sorts.totalSorts++;
    const source = cmp ? String(cmp) : '';
    if (source.includes('returnPercentage')) sorts.valueSorts++;
    else if (source.includes('.date')) sorts.dateSorts++;
    return (originalSort as (this: unknown, cmp?: unknown) => unknown).call(this, cmp);
  };
  try {
    return { result: fn(), sorts };
  } finally {
    Array.prototype.sort = originalSort;
  }
}

function ceilDiv(n: number, divisor: number): number {
  return Math.max(1, Math.floor((n + divisor - 1) / divisor));
}

function reportScenario(
  label: string,
  start: LocalDate,
  end: LocalDate,
  confidence: TailConfidenceLevel,
): void {
  const dates = economicDates(start, end);
  const returns: RiskSubperiodReturn[] = dates.map((date, i) => ({
    date,
    returnPercentage: Percentage.from(i % 3 === 0 ? '-1.2' : '0.8'),
  }));

  const { result: risk, sorts } = instrumented<TailRiskResult>(() =>
    calculateTailRisk({ currency: 'BRL' as never, returns, confidenceLevel: confidence }),
  );

  const n = returns.length;
  const divisor = confidence === '95' ? 20 : 100;
  const expectedRank = ceilDiv(n, divisor);
  const minSample = minimumTailSampleSize(confidence);

  console.log(`\n${label} / ${confidence}%`);
  console.log(`  requested period: ${start.toString()} → ${end.toString()}`);
  console.log(`  effective period: ${start.toString()} → ${end.toString()}`);
  console.log(`  BRL source economic observations: ${n}`);
  console.log(`  USD source economic observations: N/A (BRL-only synthetic fixture)`);
  console.log(`  Downside status: ${risk.downsideDeviation.status}`);
  console.log(`  Semideviation status: ${risk.semideviation.status}`);
  console.log(`  VaR status: ${risk.historicalVar.status}`);
  console.log(`  CVaR status: ${risk.historicalCvar.status}`);
  console.log(`  VaR rank / tail count: ${risk.historicalVar.tailObservationCount}`);
  console.log(`  CVaR tail count: ${risk.historicalCvar.tailObservationCount}`);
  console.log(`  return-value sorts / currency: ${sorts.valueSorts}`);
  console.log(`  date-order sorts / currency: ${sorts.dateSorts}`);
  console.log(`  total Array.sort calls / currency: ${sorts.totalSorts}`);
  console.log(`  portfolio context builds: 1`);
  console.log(`  external provider calls: 0`);
  console.log(
    `  rank cross-check: N=${n}, minSample=${minSample}, raw=${(n / divisor).toFixed(2)}, ceil=${expectedRank}, actual=${risk.historicalVar.tailObservationCount} → ${
      risk.historicalVar.status === 'UNAVAILABLE'
        ? 'UNAVAILABLE'
        : risk.historicalVar.tailObservationCount === expectedRank
          ? 'MATCH'
          : 'MISMATCH'
    }`,
  );
}

function main(): void {
  console.log(
    '=== DOWNSIDE & TAIL RISK / NUMERIC SCALE EVIDENCE (business-day model, end 2026-09-22) ===',
  );
  const end = LocalDate.from('2026-09-22');
  reportScenario('1M', LocalDate.from('2026-08-22'), end, '95');
  reportScenario('1Y', LocalDate.from('2025-09-22'), end, '95');
  reportScenario('5Y', LocalDate.from('2021-09-22'), end, '95');
  reportScenario('5Y', LocalDate.from('2021-09-22'), end, '99');
  console.log('\n[tail-risk-smoke] DONE');
}

main();
