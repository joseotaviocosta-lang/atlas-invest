import { describe, expect, it } from 'vitest';
import {
  buildAnnualTaxReadinessAssessment,
  computeReadinessFingerprint,
} from '../../packages/tax-engine/src/annual-irpf';

describe('Domain Unit: Annual Tax Readiness Engine Fixtures (Phase 4H.5)', () => {
  it('Fixture A: Zero activity year produces NO_ACTIVITY status', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      openingPositions: null,
      annualPositions: null,
      capitalMarketSummary: null,
      payments6015: null,
      transitionEvidence: null,
      fiiEligibility: null,
      withholdingEvidence: null,
      investmentIncomeSummary: null,
      taxpayerConfirmations: [],
    });

    expect(assessment.calendarYear).toBe(2025);
    expect(assessment.declarationExercise).toBe(2026);
    expect(assessment.overallStatus).toBe('NO_ACTIVITY');
    expect(assessment.isReadyForDirpf).toBe(true);
    expect(assessment.requirements).toHaveLength(0);
    expect(assessment.sections).toHaveLength(9);
    expect(
      assessment.sections.every((s) => s.status === 'NO_ACTIVITY' || s.status === 'READY'),
    ).toBe(true);
  });

  it('Fixture B: Opening position with incomplete cost produces BLOCKED status', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      openingPositions: {
        positions: [{ assetId: 'asset-1', status: 'CONFIRMED', costBasisStatus: 'INCOMPLETE' }],
      },
    });

    expect(assessment.overallStatus).toBe('BLOCKED');
    expect(assessment.isReadyForDirpf).toBe(false);
    expect(assessment.requirements).toHaveLength(1);
    expect(assessment.requirements[0]?.status).toBe('PENDING');
    expect(assessment.requirements[0]?.blockingReason).toBe('UNKNOWN_OPENING_COST_BASIS');
    const opSec = assessment.sections.find((s) => s.section === 'OPENING_POSITIONS');
    expect(opSec?.status).toBe('BLOCKED');
  });

  it('Fixture C: Opening position with incomplete cost confirmed with matching fingerprint produces READY status', () => {
    const fp = computeReadinessFingerprint({
      assetId: 'asset-1',
      costBasisStatus: 'INCOMPLETE',
    });

    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      openingPositions: {
        positions: [{ assetId: 'asset-1', status: 'CONFIRMED', costBasisStatus: 'INCOMPLETE' }],
      },
      taxpayerConfirmations: [
        {
          id: 'conf-1',
          userId: 'user-1',
          calendarYear: 2025,
          scope: 'OPENING_COST_BASIS',
          subjectId: 'asset-1',
          status: 'CONFIRMED',
          sourceFingerprint: fp,
          revision: 1,
          confirmedAt: '2026-03-01T00:00:00Z',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
    });

    expect(assessment.overallStatus).toBe('READY');
    expect(assessment.isReadyForDirpf).toBe(true);
    expect(assessment.requirements).toHaveLength(1);
    expect(assessment.requirements[0]?.status).toBe('SATISFIED');
    expect(assessment.requirements[0]?.satisfiedByConfirmationId).toBe('conf-1');
  });

  it('Fixture D: Opening position confirmed with stale fingerprint produces REQUIRES_CONFIRMATION', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      openingPositions: {
        positions: [{ assetId: 'asset-1', status: 'CONFIRMED', costBasisStatus: 'INCOMPLETE' }],
      },
      taxpayerConfirmations: [
        {
          id: 'conf-old',
          userId: 'user-1',
          calendarYear: 2025,
          scope: 'OPENING_COST_BASIS',
          subjectId: 'asset-1',
          status: 'CONFIRMED',
          sourceFingerprint: 'fp_mismatch_old',
          revision: 1,
          confirmedAt: '2026-01-01T00:00:00Z',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    expect(assessment.overallStatus).toBe('REQUIRES_CONFIRMATION');
    expect(assessment.isReadyForDirpf).toBe(false);
    expect(assessment.requirements[0]?.status).toBe('STALE');
  });

  it('Fixture E: Annual position with blocked cost produces BLOCKED status', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      annualPositions: {
        positions: [{ assetId: 'asset-2', costBasisStatus: 'INCOMPLETE', isBlocked: true }],
      },
    });

    expect(assessment.overallStatus).toBe('BLOCKED');
    expect(assessment.sections.find((s) => s.section === 'ANNUAL_POSITIONS')?.status).toBe(
      'BLOCKED',
    );
  });

  it('Fixture F: Capital market summary BLOCKED produces overall BLOCKED status', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      capitalMarketSummary: {
        overallStatus: 'BLOCKED',
        blockingReasons: ['FIFO_CORRUPTED'],
        months: [{ month: 1, status: 'BLOCKED' }],
      },
    });

    expect(assessment.overallStatus).toBe('BLOCKED');
    expect(assessment.blockingReasons).toContain('FIFO_CORRUPTED');
  });

  it('Fixture G: Capital market summary PARTIAL produces overall PARTIAL status', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      capitalMarketSummary: {
        overallStatus: 'PARTIAL',
        months: [{ month: 1, status: 'READY' }],
      },
    });

    expect(assessment.overallStatus).toBe('PARTIAL');
  });

  it('Fixture H: Overdue 6015 obligation unconfirmed produces REQUIRES_CONFIRMATION', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      payments6015: {
        obligations: [{ competence: '2025-05', status: 'OVERDUE', balancePayable: '150.00' }],
      },
    });

    expect(assessment.overallStatus).toBe('REQUIRES_CONFIRMATION');
    expect(assessment.requirements).toHaveLength(1);
    expect(assessment.requirements[0]?.status).toBe('PENDING');
  });

  it('Fixture I: Overdue 6015 obligation confirmed produces READY status', () => {
    const fp = computeReadinessFingerprint({
      competence: '2025-05',
      status: 'OVERDUE',
      balancePayable: '150.00',
    });

    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      payments6015: {
        obligations: [{ competence: '2025-05', status: 'OVERDUE', balancePayable: '150.00' }],
      },
      taxpayerConfirmations: [
        {
          id: 'conf-6015',
          userId: 'user-1',
          calendarYear: 2025,
          scope: 'GENERAL_TAX_DATA',
          subjectId: '6015_2025-05',
          status: 'CONFIRMED',
          sourceFingerprint: fp,
          revision: 1,
          confirmedAt: '2026-03-01T00:00:00Z',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
    });

    expect(assessment.overallStatus).toBe('READY');
    expect(assessment.requirements[0]?.status).toBe('SATISFIED');
  });

  it('Fixture J: 2026 Dividend transition evidence unconfirmed produces REQUIRES_CONFIRMATION', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2026,
      transitionEvidence: {
        requirements: [{ assetId: 'asset-petr4', ticker: 'PETR4', isVerified: false }],
      },
    });

    expect(assessment.overallStatus).toBe('REQUIRES_CONFIRMATION');
    const sec = assessment.sections.find((s) => s.section === 'TRANSITION_EVIDENCE');
    expect(sec?.status).toBe('REQUIRES_CONFIRMATION');
    expect(assessment.requirements[0]?.blockingReason).toBe('TRANSITION_EVIDENCE_REQUIRED');
  });

  it('Fixture K: 2026 Dividend transition evidence confirmed produces READY status', () => {
    const fp = computeReadinessFingerprint({
      assetId: 'asset-petr4',
      calendarYear: 2026,
    });

    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2026,
      transitionEvidence: {
        requirements: [
          {
            assetId: 'asset-petr4',
            ticker: 'PETR4',
            isVerified: false,
            sourceFingerprint: fp,
          },
        ],
      },
      taxpayerConfirmations: [
        {
          id: 'conf-petr4',
          userId: 'user-1',
          calendarYear: 2026,
          scope: 'DIVIDEND_TRANSITION_EVIDENCE',
          subjectId: 'asset-petr4',
          status: 'CONFIRMED',
          sourceFingerprint: fp,
          revision: 1,
          confirmedAt: '2026-04-01T00:00:00Z',
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      ],
    });

    expect(assessment.overallStatus).toBe('READY');
    expect(assessment.requirements[0]?.status).toBe('SATISFIED');
  });

  it('Fixture L: FII requiring eligibility confirmation unconfirmed produces REQUIRES_CONFIRMATION', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      fiiEligibility: {
        items: [
          {
            assetId: 'asset-hglg11',
            ticker: 'HGLG11',
            isExempt: false,
            requiresConfirmation: true,
          },
        ],
      },
    });

    expect(assessment.overallStatus).toBe('REQUIRES_CONFIRMATION');
    expect(assessment.requirements[0]?.blockingReason).toBe('FII_ELIGIBILITY_UNVERIFIED');
  });

  it('Fixture M: FII requiring eligibility confirmed produces READY status', () => {
    const fp = computeReadinessFingerprint({
      assetId: 'asset-hglg11',
      ticker: 'HGLG11',
      calendarYear: 2025,
    });

    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      fiiEligibility: {
        items: [
          {
            assetId: 'asset-hglg11',
            ticker: 'HGLG11',
            isExempt: false,
            requiresConfirmation: true,
            sourceFingerprint: fp,
          },
        ],
      },
      taxpayerConfirmations: [
        {
          id: 'conf-hglg',
          userId: 'user-1',
          calendarYear: 2025,
          scope: 'FII_EXEMPTION_REQUIREMENTS',
          subjectId: 'asset-hglg11',
          status: 'CONFIRMED',
          sourceFingerprint: fp,
          revision: 1,
          confirmedAt: '2026-03-01T00:00:00Z',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
    });

    expect(assessment.overallStatus).toBe('READY');
    expect(assessment.requirements[0]?.status).toBe('SATISFIED');
  });
});
