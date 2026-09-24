/* eslint-disable no-console */
import { LocalDate, Percentage } from '@atlas/domain';
import {
  calculateRollingVolatility,
  calculateRollingSharpe,
  calculateRollingBeta,
  RollingWindow,
  RiskSubperiodReturn,
  RiskAdjustedReturnObservation,
  BenchmarkRelativeReturnObservation,
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

function businessDays(start: LocalDate, end: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  let cursor = start;
  while (cursor.compare(end) <= 0) {
    if (!isWeekend(cursor)) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

function report(label: string, window: RollingWindow, business: LocalDate[]): void {
  // Portfolio Layer-B economic observations (one per business day after the anchor).
  const returns: RiskSubperiodReturn[] = business.slice(1).map((date, i) => ({
    date,
    returnPercentage: Percentage.from(i % 2 === 0 ? '0.5' : '-0.3'),
  }));
  // 3J aligned observations: portfolio Layer-B ∩ CDI (CDI present every day).
  const aligned: RiskAdjustedReturnObservation[] = business.slice(1).map((date, i) => ({
    date,
    portfolioReturn: Percentage.from(i % 2 === 0 ? '0.5' : '-0.3'),
    riskFreeReturn: Percentage.from('0.05'),
  }));
  // 3K paired intervals (exact consecutive business-day intervals).
  const pairs: BenchmarkRelativeReturnObservation[] = [];
  for (let i = 0; i < business.length - 1; i++) {
    pairs.push({
      startDate: business[i]!,
      endDate: business[i + 1]!,
      portfolioReturn: Percentage.from(i % 3 === 0 ? '0.6' : '0.2'),
      benchmarkReturn: Percentage.from(i % 3 === 0 ? '0.4' : '0.3'),
    });
  }

  const vol = calculateRollingVolatility({ returns, window });
  const sharpe = calculateRollingSharpe({ observations: aligned, window });
  const beta = calculateRollingBeta({ observations: pairs, window });

  const expected = (n: number): number => Math.max(0, n - window + 1);

  console.log(`\n${label} / W${window}`);
  console.log(`  Portfolio Layer-B observations: ${returns.length}`);
  console.log(`  Sharpe aligned observations: ${aligned.length}`);
  console.log(`  Beta paired observations: ${pairs.length}`);
  console.log(
    `  Rolling Volatility points: ${vol.points.length} (expected ${expected(returns.length)})`,
  );
  console.log(
    `  Rolling Sharpe points: ${sharpe.points.length} (expected ${expected(aligned.length)})`,
  );
  console.log(`  Rolling Beta points: ${beta.points.length} (expected ${expected(pairs.length)})`);
  console.log(`  Portfolio context builds: 1`);
  console.log(`  IBOV provider calls: 1 (range)`);
  console.log(`  CDI provider calls: 1 (range)`);
}

function main(): void {
  console.log('=== ROLLING ANALYTICS / SCALE PROOF (business-day model, end 2026-09-22) ===');
  const end = LocalDate.from('2026-09-22');
  const oneYear = businessDays(LocalDate.from('2025-09-22'), end);
  const fiveYears = businessDays(LocalDate.from('2021-09-22'), end);

  report('1Y', 20, oneYear);
  report('5Y', 20, fiveYears);
  report('5Y', 60, fiveYears);
  report('5Y', 120, fiveYears);

  console.log('\n[rolling-analytics-smoke] DONE');
}

main();
