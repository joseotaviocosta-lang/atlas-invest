/* eslint-disable no-console */
import { LocalDate, Percentage } from '@atlas/domain';
import {
  InMemoryBenchmarkDataProvider,
  InMemoryRateBenchmarkDataProvider,
} from '@atlas/benchmark-engine';
import {
  alignBenchmarkRelativeReturns,
  buildBenchmarkIntervals,
  buildPortfolioIntervals,
  RelativeRiskBenchmarkLevel,
  RiskSubperiodReturn,
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

function civilDays(start: LocalDate, end: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  let cursor = start;
  while (cursor.compare(end) <= 0) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

function businessDays(start: LocalDate, end: LocalDate): LocalDate[] {
  return civilDays(start, end).filter((d) => !isWeekend(d));
}

async function measure(label: string, start: LocalDate, end: LocalDate): Promise<void> {
  const civil = civilDays(start, end);
  const business = businessDays(start, end);

  const ibov = new InMemoryBenchmarkDataProvider();
  business.forEach((d, i) =>
    ibov.seed({ benchmarkId: 'IBOV', date: d.toString(), value: String(100 + (i % 7)) }),
  );
  const cdi = new InMemoryRateBenchmarkDataProvider();
  business.forEach((d) => cdi.seed({ benchmarkId: 'CDI', date: d.toString(), rate: '0.05' }));

  // Portfolio Layer-A TWR subperiods: one per civil date.
  const subperiods: RiskSubperiodReturn[] = civil.map((d, i) => ({
    date: d,
    returnPercentage: Percentage.from(i % 2 === 0 ? '0.1' : '-0.1'),
  }));

  const portfolioIntervals = buildPortfolioIntervals({
    boundaries: business,
    subperiodReturns: subperiods,
  });

  const ibovBefore = ibov.calls;
  const ibovObs = await ibov.getObservations('IBOV', start, end);
  const ibovCalls = ibov.calls - ibovBefore;

  const cdiObs = await cdi.getRateObservations('CDI', start, end);
  const cdiCalls = 1; // one range call per request

  const levels: RelativeRiskBenchmarkLevel[] = ibovObs.map((o) => ({
    date: o.date,
    level: o.value,
  }));
  const benchmarkIntervals = buildBenchmarkIntervals({
    boundaries: levels.map((l) => l.date),
    levels,
  });
  const alignment = alignBenchmarkRelativeReturns({ portfolioIntervals, benchmarkIntervals });

  console.log(`\n${label}`);
  console.log(`  portfolio economic observations: ${business.length}`);
  console.log(`  IBOV observations: ${ibovObs.length}`);
  console.log(`  3K paired intervals: ${alignment.pairedObservationCount}`);
  console.log(`  CDI observations: ${cdiObs.length}`);
  console.log(`  historical valuations (civil calcDates): ${civil.length}`);
  console.log(`  IBOV provider calls: ${ibovCalls}`);
  console.log(`  CDI provider calls: ${cdiCalls}`);
}

async function main(): Promise<void> {
  console.log('=== ACTIVE PERFORMANCE / SCALE AUDIT (business-day model, end 2026-09-22) ===');
  const end = LocalDate.from('2026-09-22');
  await measure('1M', LocalDate.from('2026-08-23'), end);
  await measure('1Y', LocalDate.from('2025-09-22'), end);
  await measure('5Y', LocalDate.from('2021-09-22'), end);
  console.log('\n[active-performance-smoke] DONE');
}

main().catch((err) => {
  console.error(
    '[active-performance-smoke] FAIL:',
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
