import { describe, expect, it } from 'vitest';
import {
  buildAnnualTaxReadinessAssessment,
  computeReadinessFingerprint,
  TaxpayerConfirmation,
} from '../../packages/tax-engine/src/annual-irpf';

describe('Tax Engine: Annual Tax Readiness Scale Benchmarks (Phase 4H.5 / 4H.5A)', () => {
  it('1 Year Normal User: 10 requirements and confirmations', () => {
    const COUNT = 10;
    const year = 2026;
    const reqs = [];
    const confs: TaxpayerConfirmation[] = [];

    for (let i = 0; i < COUNT; i++) {
      const assetId = `asset-normal-${i}`;
      const fp = computeReadinessFingerprint({ assetId, calendarYear: year });
      reqs.push({ assetId, ticker: `NORM${i}`, isVerified: false, sourceFingerprint: fp });
      confs.push({
        id: `conf-norm-${i}`,
        userId: 'user-normal',
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

    const t0 = Date.now();
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: year,
      transitionEvidence: { requirements: reqs },
      taxpayerConfirmations: confs,
    });
    const elapsed = Date.now() - t0;

    expect(assessment.requirements).toHaveLength(COUNT);
    expect(assessment.overallStatus).toBe('READY');
    expect(elapsed).toBeLessThan(50);
  });

  it('1 Year Large User: 100 requirements and confirmations', () => {
    const COUNT = 100;
    const year = 2026;
    const reqs = [];
    const confs: TaxpayerConfirmation[] = [];

    for (let i = 0; i < COUNT; i++) {
      const assetId = `asset-large-${i}`;
      const fp = computeReadinessFingerprint({ assetId, calendarYear: year });
      reqs.push({ assetId, ticker: `LRG${i}`, isVerified: false, sourceFingerprint: fp });
      confs.push({
        id: `conf-lrg-${i}`,
        userId: 'user-large',
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

    const t0 = Date.now();
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: year,
      transitionEvidence: { requirements: reqs },
      taxpayerConfirmations: confs,
    });
    const elapsed = Date.now() - t0;

    expect(assessment.requirements).toHaveLength(COUNT);
    expect(assessment.overallStatus).toBe('READY');
    expect(elapsed).toBeLessThan(100);
  });

  it('Multi-Year Scale: 5, 10, and 20 consecutive annual assessments', () => {
    for (const numYears of [5, 10, 20]) {
      const t0 = Date.now();
      for (let y = 0; y < numYears; y++) {
        const year = 2020 + y;
        buildAnnualTaxReadinessAssessment({
          calendarYear: year,
          capitalMarketSummary: { overallStatus: 'READY' },
          investmentIncomeSummary: { overallStatus: 'READY' },
        });
      }
      const elapsed = Date.now() - t0;
      expect(elapsed).toBeLessThan(500);
    }
  });

  it('Stress: 1,000 evidence requirements evaluation under 300ms', () => {
    const COUNT = 1000;
    const year = 2026;
    const reqs = [];
    const confs: TaxpayerConfirmation[] = [];

    for (let i = 0; i < COUNT; i++) {
      const assetId = `asset-req-1k-${i}`;
      const fp = computeReadinessFingerprint({ assetId, calendarYear: year });
      reqs.push({ assetId, ticker: `TK${i}`, isVerified: false, sourceFingerprint: fp });
      if (i % 2 === 0) {
        confs.push({
          id: `conf-1k-${i}`,
          userId: 'user-1k',
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
      transitionEvidence: { requirements: reqs },
      taxpayerConfirmations: confs,
    });
    const elapsed = Date.now() - t0;

    expect(assessment.requirements).toHaveLength(COUNT);
    expect(elapsed).toBeLessThan(300);
  });

  it('Stress: 10,000 confirmations and revisions scale workload under 1,500ms', () => {
    const COUNT = 10000;
    const year = 2026;
    const reqs = [];
    const confs: TaxpayerConfirmation[] = [];

    for (let i = 0; i < COUNT; i++) {
      const assetId = `asset-scale-10k-${i}`;
      const fp = computeReadinessFingerprint({ assetId, calendarYear: year });
      reqs.push({ assetId, ticker: `TK10K_${i}`, isVerified: false, sourceFingerprint: fp });
      confs.push({
        id: `conf-10k-${i}`,
        userId: 'user-10k',
        calendarYear: year,
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

    const t0 = Date.now();
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: year,
      transitionEvidence: { requirements: reqs },
      taxpayerConfirmations: confs,
    });
    const elapsed = Date.now() - t0;

    expect(assessment.requirements).toHaveLength(COUNT);
    expect(assessment.overallStatus).toBe('READY');
    expect(elapsed).toBeLessThan(1500);
  });
});
