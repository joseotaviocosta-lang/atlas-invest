/* eslint-disable no-console */
import { LocalDate } from '@atlas/domain';
import { YahooBenchmarkDataProvider } from '@atlas/benchmark-engine';

async function main() {
  const benchmark = (process.argv.find((a) => a.startsWith('--benchmark='))?.split('=')[1] ??
    'IBOV') as never;
  const startStr =
    process.argv.find((a) => a.startsWith('--start='))?.split('=')[1] ?? '2026-01-02';
  const endStr = process.argv.find((a) => a.startsWith('--end='))?.split('=')[1] ?? '2026-09-18';

  const provider = new YahooBenchmarkDataProvider({ timeoutMs: 15000 });
  const start = LocalDate.from(startStr);
  const end = LocalDate.from(endStr);

  console.log(`[Smoke] Fetching ${benchmark} from ${startStr} to ${endStr} via YAHOO...`);
  try {
    const startObs = await provider.getObservation(benchmark, start);
    const endObs = await provider.getObservation(benchmark, end);
    const { calculateBenchmarkReturn } = await import('@atlas/benchmark-engine');
    const ret = calculateBenchmarkReturn({
      benchmarkId: benchmark,
      startLevel: startObs.value,
      endLevel: endObs.value,
    });
    console.log('[Smoke] Result:');
    console.log(`  benchmark: ${benchmark}`);
    console.log(`  requested start: ${startStr}`);
    console.log(`  resolved start: ${startObs.date.toString()}`);
    console.log(`  start level: ${startObs.value.toString()}`);
    console.log(`  requested end: ${endStr}`);
    console.log(`  resolved end: ${endObs.date.toString()}`);
    console.log(`  end level: ${endObs.value.toString()}`);
    console.log(`  return: ${ret.value}%`);
    console.log(`  source: ${startObs.source} / ${endObs.source}`);
    console.log('[Smoke] PASS');
  } catch (err) {
    console.error('[Smoke] FAIL:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
