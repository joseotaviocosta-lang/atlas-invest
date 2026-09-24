/* eslint-disable no-console */
import { LocalDate } from '@atlas/domain';
import {
  BcbRateBenchmarkDataProvider,
  calculateRateBenchmarkReturn,
  BENCHMARK_DEFINITIONS,
} from '@atlas/benchmark-engine';

async function main() {
  const getArg = (name: string, fallback: string): string => {
    const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
    if (eq) return eq.split('=')[1] ?? fallback;
    const idx = process.argv.indexOf(`--${name}`);
    if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1]!;
    return fallback;
  };

  const benchmarkArg = getArg('benchmark', 'CDI');
  const startStr = getArg('start', '2026-01-02');
  const endStr = getArg('end', '2026-09-18');

  if (benchmarkArg !== 'CDI') {
    console.error(`[RateSmoke] Only CDI supported, got ${benchmarkArg}`);
    process.exit(1);
  }

  const def = BENCHMARK_DEFINITIONS['CDI'];
  const provider = new BcbRateBenchmarkDataProvider({ timeoutMs: 15000 });
  const start = LocalDate.from(startStr);
  const end = LocalDate.from(endStr);

  console.log('[RateSmoke] CDI audit via BCB');
  console.log(`Provider: ${provider.provider}`);
  console.log(`Institution: ${provider.institution}`);
  console.log(`Canonical benchmark: ${def.id}`);
  console.log(`Provider series code: ${provider.providerSeriesCode}`);
  console.log(`Series name: ${provider.seriesName}`);
  console.log(`Payload type: BCB SGS JSON ({ data: 'dd/mm/yyyy', valor: 'decimal' })`);
  console.log(`Rate unit: ${provider.unit}`);
  console.log(`Frequency: ${provider.frequency}`);
  console.log(`Currency: ${def.currency}`);
  console.log(`Requested start: ${startStr}`);
  console.log(`Requested end: ${endStr}`);

  try {
    const observations = await provider.getRateObservations('CDI', start, end);
    if (observations.length === 0) {
      console.error('[RateSmoke] FAIL: observationCount 0');
      process.exit(1);
    }
    const sorted = [...observations].sort((a, b) => a.date.compare(b.date));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;

    const rateReturn = calculateRateBenchmarkReturn({
      benchmarkId: 'CDI',
      observations,
      startDate: start,
      endDate: end,
    });

    console.log(`First observation date: ${first.date.toString()}`);
    console.log(`First observation value: ${first.rate.toString()}`);
    console.log(`Last observation date: ${last.date.toString()}`);
    console.log(`Last observation value: ${last.rate.toString()}`);
    console.log(`Observation count: ${rateReturn.observationCount}`);
    console.log(`Accumulated factor: ${rateReturn.accumulatedFactor.toString()}`);
    console.log(`Return percentage: ${rateReturn.returnPercentage.value}`);
    console.log(`Status: ${rateReturn.status}`);
    console.log(`Source: ${provider.provider}`);
    console.log(`HTTP/provider result: SUCCESS`);

    if (rateReturn.observationCount === 0) {
      console.error('[RateSmoke] FAIL: observationCount 0 after calc');
      process.exit(1);
    }
    const _payloadOk = observations.every((o) => o.unit === 'DAILY_PERCENT' && o.source === 'BCB');
    if (!_payloadOk) {
      console.error('[RateSmoke] FAIL: unit/source mismatch');
      process.exit(1);
    }

    console.log('[RateSmoke] PASS — CDI DAILY_PERCENT verified');
  } catch (err) {
    console.error('[RateSmoke] FAIL:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
