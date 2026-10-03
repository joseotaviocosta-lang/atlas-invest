import { describe, expect, it } from 'vitest';
import {
  buildAnnualTaxReadinessAssessment,
  computeReadinessFingerprint,
  READINESS_STATUS_SEVERITY,
  TaxpayerConfirmation,
} from '../../packages/tax-engine/src/annual-irpf';

describe('Tax Engine: Annual Tax Readiness 10,000-Case Fuzz & Invariant Verification (Phase 4H.5)', () => {
  it(
    'runs 10,000 deterministic randomized readiness scenarios and validates precedence and structural invariants',
    { timeout: 60000 },
    () => {
      // Deterministic LCG
      let seed = 987654321;
      function rand(): number {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }

      const ITERATIONS = 10000;
      const startTime = Date.now();

      for (let iteration = 0; iteration < ITERATIONS; iteration++) {
        const year = 2020 + Math.floor(rand() * 10); // 2020 to 2029

        const hasOpeningIncomplete = rand() < 0.2;
        const hasOpeningConfirmed = hasOpeningIncomplete && rand() < 0.5;

        const hasAnnualBlocked = rand() < 0.15;
        const cmStatus =
          rand() < 0.2
            ? 'BLOCKED'
            : rand() < 0.4
              ? 'PARTIAL'
              : rand() < 0.8
                ? 'READY'
                : 'NO_ACTIVITY';
        const hasOverdue6015 = rand() < 0.2;
        const hasOverdue6015Confirmed = hasOverdue6015 && rand() < 0.5;

        const hasTransitionReq = year >= 2026 && rand() < 0.3;
        const hasTransitionConfirmed = hasTransitionReq && rand() < 0.5;

        const hasFiiReq = rand() < 0.25;
        const hasFiiConfirmed = hasFiiReq && rand() < 0.5;

        const confirmations: TaxpayerConfirmation[] = [];

        // Opening confirmation

        if (hasOpeningIncomplete && hasOpeningConfirmed) {
          const fp = computeReadinessFingerprint({
            assetId: 'asset-fuzz-op',
            costBasisStatus: 'INCOMPLETE',
          });
          confirmations.push({
            id: `conf-op-${iteration}`,
            userId: 'user-fuzz',
            calendarYear: year,
            scope: 'OPENING_COST_BASIS',
            subjectId: 'asset-fuzz-op',
            status: 'CONFIRMED',
            sourceFingerprint: fp,
            revision: 1,
            confirmedAt: '2026-01-01T00:00:00Z',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          });
        }

        // 6015 confirmation
        if (hasOverdue6015 && hasOverdue6015Confirmed) {
          const fp = computeReadinessFingerprint({
            competence: `${year}-03`,
            status: 'OVERDUE',
            balancePayable: '100.00',
          });
          confirmations.push({
            id: `conf-6015-${iteration}`,
            userId: 'user-fuzz',
            calendarYear: year,
            scope: 'GENERAL_TAX_DATA',
            subjectId: `6015_${year}-03`,
            status: 'CONFIRMED',
            sourceFingerprint: fp,
            revision: 1,
            confirmedAt: '2026-01-01T00:00:00Z',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          });
        }

        // Transition confirmation
        if (hasTransitionReq && hasTransitionConfirmed) {
          const fp = computeReadinessFingerprint({
            assetId: 'asset-fuzz-trans',
            calendarYear: year,
          });
          confirmations.push({
            id: `conf-trans-${iteration}`,
            userId: 'user-fuzz',
            calendarYear: year,
            scope: 'DIVIDEND_TRANSITION_EVIDENCE',
            subjectId: 'asset-fuzz-trans',
            status: 'CONFIRMED',
            sourceFingerprint: fp,
            revision: 1,
            confirmedAt: '2026-01-01T00:00:00Z',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          });
        }

        // FII confirmation
        if (hasFiiReq && hasFiiConfirmed) {
          const fp = computeReadinessFingerprint({
            assetId: 'asset-fuzz-fii',
            ticker: 'FII11',
            calendarYear: year,
          });
          confirmations.push({
            id: `conf-fii-${iteration}`,
            userId: 'user-fuzz',
            calendarYear: year,
            scope: 'FII_EXEMPTION_REQUIREMENTS',
            subjectId: 'asset-fuzz-fii',
            status: 'CONFIRMED',
            sourceFingerprint: fp,
            revision: 1,
            confirmedAt: '2026-01-01T00:00:00Z',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          });
        }

        const assessment = buildAnnualTaxReadinessAssessment({
          calendarYear: year,
          openingPositions: hasOpeningIncomplete
            ? {
                positions: [
                  { assetId: 'asset-fuzz-op', status: 'CONFIRMED', costBasisStatus: 'INCOMPLETE' },
                ],
              }
            : null,
          annualPositions: hasAnnualBlocked
            ? { positions: [{ assetId: 'asset-fuzz-ap', isBlocked: true }] }
            : null,
          capitalMarketSummary: { overallStatus: cmStatus },
          payments6015: hasOverdue6015
            ? {
                obligations: [
                  { competence: `${year}-03`, status: 'OVERDUE', balancePayable: '100.00' },
                ],
              }
            : null,
          transitionEvidence: hasTransitionReq
            ? {
                requirements: [
                  { assetId: 'asset-fuzz-trans', ticker: 'TRANS4', isVerified: false },
                ],
              }
            : null,
          fiiEligibility: hasFiiReq
            ? {
                items: [
                  {
                    assetId: 'asset-fuzz-fii',
                    ticker: 'FII11',
                    isExempt: false,
                    requiresConfirmation: true,
                  },
                ],
              }
            : null,
          taxpayerConfirmations: confirmations,
        });

        // 1. Structure invariant: exactly 9 sections
        expect(assessment.sections).toHaveLength(9);

        // 2. Precedence invariant: overallStatus severity equals max section severity
        const maxSectionSeverity = Math.max(
          ...assessment.sections.map((s) => READINESS_STATUS_SEVERITY[s.status]),
        );
        expect(READINESS_STATUS_SEVERITY[assessment.overallStatus]).toBe(maxSectionSeverity);

        // 3. DIRPF readiness invariant
        if (assessment.overallStatus === 'READY' || assessment.overallStatus === 'NO_ACTIVITY') {
          expect(assessment.isReadyForDirpf).toBe(true);
        } else {
          expect(assessment.isReadyForDirpf).toBe(false);
        }

        // 4. Fingerprint invariant: non-empty string
        expect(assessment.fingerprint).toBeDefined();
        expect(assessment.fingerprint.length).toBe(64);
      }

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(10000);
    },
  );
});
