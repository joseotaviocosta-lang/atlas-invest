import { describe, expect, it } from 'vitest';
import {
  buildAnnualTaxReadinessAssessment,
  computeReadinessFingerprint,
  TaxpayerConfirmation,
} from '../../packages/tax-engine/src/annual-irpf';

describe('Tax Engine: Annual Tax Readiness Scale Benchmarks (Phase 4H.5)', () => {
  it('evaluates scale workload of 5,000 requirements and confirmations under 1,000ms', () => {
    const COUNT = 5000;
    const year = 2026;

    const transitionReqs: Array<{
      assetId: string;
      ticker: string;
      isVerified: boolean;
      sourceFingerprint: string;
    }> = [];
    const confirmations: TaxpayerConfirmation[] = [];

    for (let i = 0; i < COUNT; i++) {
      const assetId = `asset-scale-${i}`;
      const fp = computeReadinessFingerprint({ assetId, calendarYear: year });

      transitionReqs.push({
        assetId,
        ticker: `TK${i}`,
        isVerified: false,
        sourceFingerprint: fp,
      });

      if (i % 2 === 0) {
        confirmations.push({
          id: `conf-scale-${i}`,
          userId: 'user-scale',
          calendarYear: year,
          scope: 'DIVIDEND_TRANSITION_EVIDENCE',
          subjectId: assetId,
          status: 'CONFIRMED',
          sourceFingerprint: fp,
          revision: 1,
          confirmedAt: '2026-03-01T00:00:00Z',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        });
      }
    }

    const t0 = Date.now();
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: year,
      transitionEvidence: { requirements: transitionReqs },
      taxpayerConfirmations: confirmations,
    });
    const elapsed = Date.now() - t0;

    expect(assessment.requirements).toHaveLength(COUNT);
    expect(assessment.overallStatus).toBe('REQUIRES_CONFIRMATION');
    expect(elapsed).toBeLessThan(1000);
  });
});
