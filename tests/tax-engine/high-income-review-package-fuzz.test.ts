import { describe, expect, it } from 'vitest';
import {
  buildHighIncomeAnnualReviewPackage,
  exportHighIncomeReviewPackageToCsv,
  serializeHighIncomeReviewPackageToJson,
  type HighIncomeReviewAssessmentInput,
  type HighIncomeReviewEvidenceStateInput,
  type HighIncomeReviewPayerInput,
} from '../../packages/tax-engine/src/annual-irpf';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const APPLICABILITIES = [
  'APPLICABLE',
  'NOT_APPLICABLE',
  'REQUIRES_CONFIRMATION',
  'BLOCKED',
  'UNSUPPORTED_YEAR',
];
const STATUSES = [
  'CALCULABLE',
  'NOT_APPLICABLE',
  'INCOMPLETE_CREDITS',
  'INCOMPLETE_REDUCTION_DATA',
  'REQUIRES_CONFIRMATION',
  'BLOCKED',
  'UNSUPPORTED_YEAR',
  'UNSUPPORTED_INPUT',
];
const CONFLICTS = ['NONE', 'CONFLICT', 'UNSUPPORTED'];

/**
 * Recursively scans a serialized package object. Every leaf must be string,
 * boolean, null, or an INTEGER number (whitelisted counters). No float allowed.
 */
function assertNoFloat(value: unknown, path: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    expect(Number.isInteger(value), `float found at ${path}: ${value}`).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoFloat(item, `${path}[${i}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      assertNoFloat(v, `${path}.${k}`);
    }
    return;
  }
  throw new Error(`unexpected leaf type at ${path}: ${typeof value}`);
}

describe('Phase 4I.6 — >=10,000-case deterministic fuzz', () => {
  it(
    'runs 10,000 randomized review-package scenarios and validates invariants',
    { timeout: 120000 },
    () => {
      let seed = 987654321;
      const rand = (): number => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };
      const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

      const ITERATIONS = 10000;

      for (let iteration = 0; iteration < ITERATIONS; iteration++) {
        const applicability = pick(APPLICABILITIES);
        const status = pick(STATUSES);
        const hasIncome = rand() < 0.8;
        const totalAnnualIncome = hasIncome ? '1200000.00' : null;
        const threshold = rand() < 0.9 ? '600000' : null;
        const hasNet = rand() < 0.5;
        const hasRedutor = rand() < 0.6;

        const payerCount = Math.floor(rand() * 4);
        const payers: HighIncomeReviewPayerInput[] = [];
        for (let p = 0; p < payerCount; p++) {
          // deliberately out of order to exercise shuffle sorting
          payers.push({
            payerId: `PAYER-${(payerCount - p).toString().padStart(3, '0')}`,
            payerType: 'CORPORATE',
            status: 'COMPUTED',
            referenceRatePercentage: rand() < 0.9 ? '34' : null,
            corporateEffectiveRatePercentage: rand() < 0.9 ? '20' : null,
            pfEffectiveRatePercentage: '10',
            eligibleDividends: '30000.00',
            reductionExact: '2000.00',
            evidenceStatus: 'AUTHORITATIVE',
            blockingReasons: rand() < 0.1 ? ['BLOCK'] : [],
            sourceFingerprint: rand() < 0.9 ? `fp-${p}` : null,
          });
        }

        const evidenceCount = Math.floor(rand() * 5);
        const evidence: HighIncomeReviewEvidenceStateInput[] = [];
        for (let e = 0; e < evidenceCount; e++) {
          const n = iteration * 100 + e;
          const hex = (x: number): string => (x % 16).toString(16);
          evidence.push({
            id: `${hex(n)}0000000-0000-4000-8000-00000000000${hex(e)}`,
            evidenceType: rand() < 0.5 ? 'CORPORATE_RATE' : 'INCOME',
            payerId: rand() < 0.6 ? `PAYER-${e}` : null,
            authority: 'TAXPAYER',
            evidenceSource: 'UPLOAD',
            conflictStatus: pick(CONFLICTS),
            stale: rand() < 0.3,
            revision: Math.floor(rand() * 5) + 1,
            supersedesId: rand() < 0.3 ? `aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee` : null,
            sourceFingerprint: `evs-${e}`,
            fingerprint: `evf-${e}`,
          });
        }

        const readModel: HighIncomeReviewAssessmentInput = {
          calendarYear: 2026,
          declarationExercise: 2027,
          ruleVersion: 'irpfm-2026.1',
          status,
          applicability,
          totalAnnualIncome,
          applicabilityThreshold: threshold,
          minimumTaxBase: hasIncome ? '1200000.00' : null,
          rateBand: 'BAND_10',
          minimumRatePercentage: '10',
          grossMinimumTax: hasIncome ? '120000.00' : null,
          credits: [],
          supportedCreditsTotal: rand() < 0.5 ? '30000.00' : null,
          reductions: [],
          supportedReductionsTotal: rand() < 0.5 ? '5000.00' : null,
          corporateRedutor: hasRedutor
            ? {
                aggregateVersion: 'v1',
                payerCount,
                computedPayerCount: payerCount,
                status: 'COMPUTED',
                totalEligibleDividends: '80000.00',
                totalReductionExact: '5000.00',
                totalSupportedReduction: rand() < 0.5 ? '5000.00' : null,
                payers,
                blockingPayers: [],
                blockingReasons: [],
                sourceFingerprint: 'redutor-src',
                calculationFingerprint: 'redutor-calc',
              }
            : null,
          netMinimumTax: hasNet ? '85000.00' : null,
          creditExcess: '0.00',
          incomeBreakdown: [
            {
              category: 'DIVIDENDS',
              classification: 'INCLUDED',
              grossAmount: '800000.00',
              includedAmount: '800000.00',
              excludedAmount: '0.00',
              itemCount: 3,
              payerIds: ['PAYER-A'],
              reason: 'r',
              legalReference: 'L',
            },
          ],
          evidenceRequirements:
            rand() < 0.5
              ? [
                  {
                    requirementId: 'REQ-1',
                    requirement: 'A',
                    subjectId: 'x',
                    title: 't',
                    status: rand() < 0.5 ? 'SATISFIED' : 'MISSING',
                    legalReference: 'L',
                    blockingReason: null,
                  },
                ]
              : [],
          evidence,
          blockingReasons: rand() < 0.15 ? ['BLOCK'] : [],
          limitations: [],
          upstreamIncomeStatus: rand() < 0.1 ? 'BLOCKED' : 'READY',
          upstreamIncomeFingerprint: 'income-fp',
          upstreamCapitalMarketFingerprint: 'cm-fp',
          sourceFingerprint: `src-${iteration}`,
          calculationFingerprint: `calc-${iteration}`,
        };

        const pkg = buildHighIncomeAnnualReviewPackage(readModel, {
          generatedAt: '2027-03-15T00:00:00.000Z',
        });

        // Invariant: no float anywhere (only integer counters as numbers).
        assertNoFloat(pkg, 'pkg');

        // Invariant: Section 7 count partition holds.
        const c = pkg.section7Readiness.counts;
        expect(c.total).toBe(c.ready + c.missing + c.stale + c.conflicting + c.unsupported);

        // Invariant: netMinimumTax never fabricated (null unless READY_FOR_REVIEW),
        // never negative.
        if (pkg.status !== 'READY_FOR_REVIEW') {
          expect(pkg.section4Calculation.netMinimumTax).toBeNull();
        }
        if (pkg.section4Calculation.netMinimumTax !== null) {
          expect(pkg.section4Calculation.netMinimumTax.startsWith('-')).toBe(false);
        }

        // Invariant: fingerprint excludes generatedAt (second build, different clock).
        const pkg2 = buildHighIncomeAnnualReviewPackage(readModel, {
          generatedAt: '2099-01-01T00:00:00.000Z',
        });
        expect(pkg2.packageFingerprint).toBe(pkg.packageFingerprint);

        // Invariant: fingerprint stable under payer-array shuffle.
        if (readModel.corporateRedutor !== null && payers.length > 1) {
          const shuffled: HighIncomeReviewAssessmentInput = {
            ...readModel,
            corporateRedutor: {
              ...readModel.corporateRedutor,
              payers: [...payers].reverse(),
            },
          };
          const pkg3 = buildHighIncomeAnnualReviewPackage(shuffled, {
            generatedAt: '2027-03-15T00:00:00.000Z',
          });
          expect(pkg3.packageFingerprint).toBe(pkg.packageFingerprint);
        }

        // Invariant: DB UUIDs never appear in serialized forms (spot-check a sample).
        if (iteration % 250 === 0 && evidence.length > 0) {
          const json = serializeHighIncomeReviewPackageToJson(pkg);
          const csv = exportHighIncomeReviewPackageToCsv(pkg);
          expect(json).not.toMatch(UUID_RE);
          expect(csv).not.toMatch(UUID_RE);
        }
      }
    },
  );
});
