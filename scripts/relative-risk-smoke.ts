/* eslint-disable no-console */
import { LocalDate, Percentage } from '@atlas/domain';
import { InMemoryBenchmarkDataProvider } from '@atlas/benchmark-engine';
import {
  alignBenchmarkRelativeReturns,
  buildBenchmarkIntervals,
  buildPortfolioIntervals,
  relativeRiskPairKey,
  RelativeRiskBenchmarkLevel,
  RelativeRiskInterval,
  RiskSubperiodReturn,
} from '@atlas/risk-engine';

function interval(start: string, end: string, ret: string): RelativeRiskInterval {
  return {
    startDate: LocalDate.from(start),
    endDate: LocalDate.from(end),
    returnPercentage: Percentage.from(ret),
  };
}

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

/** §1–§3 critical alignment proof. */
function criticalProof(): void {
  console.log('=== CRITICAL ALIGNMENT PROOF (ADR-139) ===');
  const cases: Array<{ label: string; p: RelativeRiskInterval[]; b: RelativeRiskInterval[] }> = [
    {
      label: '1) Fri->Tue portfolio vs Mon->Tue benchmark (MUST reject)',
      p: [interval('2026-01-02', '2026-01-06', '2')],
      b: [interval('2026-01-05', '2026-01-06', '1')],
    },
    {
      label: '2) Fri->Tue portfolio vs Fri->Tue benchmark (MUST pair)',
      p: [interval('2026-01-02', '2026-01-06', '2')],
      b: [interval('2026-01-02', '2026-01-06', '1')],
    },
    {
      label: '3) Fri->Mon portfolio vs Fri->Tue benchmark (MUST reject)',
      p: [interval('2026-01-02', '2026-01-05', '2')],
      b: [interval('2026-01-02', '2026-01-06', '1')],
    },
  ];
  for (const c of cases) {
    const r = alignBenchmarkRelativeReturns({
      portfolioIntervals: c.p,
      benchmarkIntervals: c.b,
    });
    console.log(`\n${c.label}`);
    console.log(`  portfolio pair key: ${c.p.map(relativeRiskPairKey).join(', ')}`);
    console.log(`  benchmark pair key: ${c.b.map(relativeRiskPairKey).join(', ')}`);
    console.log(`  pairedObservationCount: ${r.pairedObservationCount}`);
    console.log(
      `  droppedPortfolio: ${r.droppedPortfolioIntervalCount} droppedBenchmark: ${r.droppedBenchmarkIntervalCount} status: ${r.status}`,
    );
  }
}

/** §4 performance/scale audit for 1M / 1Y / 5Y. */
async function scaleAudit(): Promise<void> {
  console.log('\n=== PERFORMANCE / SCALE AUDIT (business-day model, end 2026-09-22) ===');
  const end = LocalDate.from('2026-09-22');
  const windows: Array<{ label: string; start: LocalDate }> = [
    { label: '1M', start: LocalDate.from('2026-08-23') },
    { label: '1Y', start: LocalDate.from('2025-09-22') },
    { label: '5Y', start: LocalDate.from('2021-09-22') },
  ];

  for (const w of windows) {
    const civil = civilDays(w.start, end);
    const business = businessDays(w.start, end);

    const provider = new InMemoryBenchmarkDataProvider();
    business.forEach((d, i) => {
      provider.seed({ benchmarkId: 'IBOV', date: d.toString(), value: String(100 + (i % 7)) });
    });

    // Portfolio TWR subperiods: one per civil date (Layer-A), alternating sign.
    const subperiods: RiskSubperiodReturn[] = civil.map((d, i) => ({
      date: d,
      returnPercentage: Percentage.from(i % 2 === 0 ? '0.1' : '-0.1'),
    }));

    // Portfolio economic boundaries = EXACT-valuation business days.
    const portfolioIntervals = buildPortfolioIntervals({
      boundaries: business,
      subperiodReturns: subperiods,
    });

    const callsBefore = provider.calls;
    const observations = await provider.getObservations('IBOV', w.start, end);
    const providerCalls = provider.calls - callsBefore;

    const levels: RelativeRiskBenchmarkLevel[] = observations.map((o) => ({
      date: o.date,
      level: o.value,
    }));
    const benchmarkIntervals = buildBenchmarkIntervals({
      boundaries: levels.map((l) => l.date),
      levels,
    });
    const alignment = alignBenchmarkRelativeReturns({
      portfolioIntervals,
      benchmarkIntervals,
    });

    console.log(`\n${w.label}`);
    console.log(`  portfolio economic intervals: ${portfolioIntervals.length}`);
    console.log(`  benchmark intervals: ${benchmarkIntervals.length}`);
    console.log(`  paired intervals: ${alignment.pairedObservationCount}`);
    console.log(`  historical valuations (civil calcDates): ${civil.length}`);
    console.log(`  Yahoo provider calls (range fetch): ${providerCalls}`);
  }
}

async function main(): Promise<void> {
  criticalProof();
  await scaleAudit();
  console.log('\n[relative-risk-smoke] DONE');
}

main().catch((err) => {
  console.error('[relative-risk-smoke] FAIL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
