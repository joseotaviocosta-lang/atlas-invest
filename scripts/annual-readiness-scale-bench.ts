/* eslint-disable no-console */
import {
  buildAnnualTaxReadinessAssessment,
  computeReadinessFingerprint,
  type TaxpayerConfirmation,
} from '@atlas/tax-engine';

/**
 * Phase 4I.3A — Annual readiness scale benchmark harness.
 *
 * Builds the exact 10,000-confirmation fixture used by
 * `tests/tax-engine/annual-tax-readiness-scale.test.ts` (fixture construction
 * is OUTSIDE the measured window, exactly like the test), then measures the
 * pure `buildAnnualTaxReadinessAssessment` call with warmup + repetitions and
 * reports full statistics. Also verifies correctness on every run.
 *
 * Observed development/test evidence, not a production SLA.
 */

const COUNT = Number(process.argv[4] ?? 10000);
const YEAR = 2026;

interface Fixture {
  reqs: Array<{ assetId: string; ticker: string; isVerified: boolean; sourceFingerprint: string }>;
  confs: TaxpayerConfirmation[];
}

function buildFixture(): Fixture {
  const reqs: Fixture['reqs'] = [];
  const confs: TaxpayerConfirmation[] = [];
  for (let i = 0; i < COUNT; i++) {
    const assetId = `asset-scale-10k-${i}`;
    const fp = computeReadinessFingerprint({ assetId, calendarYear: YEAR });
    reqs.push({ assetId, ticker: `TK10K_${i}`, isVerified: false, sourceFingerprint: fp });
    confs.push({
      id: `conf-10k-${i}`,
      userId: 'user-10k',
      calendarYear: YEAR,
      scope: 'DIVIDEND_TRANSITION_EVIDENCE',
      subjectId: assetId,
      status: 'CONFIRMED',
      sourceFingerprint: fp,
      revision: (i % 3) + 1,
      confirmedAt: '2026-03-01T00:00:00Z',
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    });
  }
  return { reqs, confs };
}

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const mean = sum / sorted.length;
  const variance = sorted.reduce((acc, value) => acc + (value - mean) ** 2, 0) / sorted.length;
  const quantile = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    min: sorted[0],
    median: quantile(0.5),
    mean: Math.round(mean * 100) / 100,
    p90: quantile(0.9),
    p95: quantile(0.95),
    max: sorted[sorted.length - 1],
    stddev: Math.round(Math.sqrt(variance) * 100) / 100,
  };
}

function run(label: string, warmups: number, reps: number) {
  const { reqs, confs } = buildFixture();
  for (let w = 0; w < warmups; w++) {
    buildAnnualTaxReadinessAssessment({
      calendarYear: YEAR,
      transitionEvidence: { requirements: reqs },
      taxpayerConfirmations: confs,
    });
  }
  const samples: number[] = [];
  let referenceFingerprint = '';
  for (let r = 0; r < reps; r++) {
    const memBefore = process.memoryUsage().heapUsed;
    const t0 = Date.now();
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: YEAR,
      transitionEvidence: { requirements: reqs },
      taxpayerConfirmations: confs,
    });
    const elapsed = Date.now() - t0;
    const memAfter = process.memoryUsage().heapUsed;
    // correctness on every run
    if (assessment.requirements.length !== COUNT) {
      throw new Error(`requirement count mismatch: ${assessment.requirements.length}`);
    }
    if (assessment.overallStatus !== 'READY') {
      throw new Error(`status mismatch: ${assessment.overallStatus}`);
    }
    if (r === 0) {
      referenceFingerprint = assessment.fingerprint;
    } else if (assessment.fingerprint !== referenceFingerprint) {
      throw new Error('fingerprint instability across runs');
    }
    samples.push(elapsed);
    if (r === reps - 1) {
      console.log(
        `[${label}] memDeltaLastRunMb=${Math.round(((memAfter - memBefore) / 1024 / 1024) * 100) / 100}`,
      );
    }
  }
  console.log(`[${label}] samples=${samples.join(',')}`);
  console.table([{ label, reps, ...stats(samples) }]);
}

const [, , warmupArg, repArg] = process.argv;
run(`readiness-${COUNT}`, Number(warmupArg ?? 2), Number(repArg ?? 10));
