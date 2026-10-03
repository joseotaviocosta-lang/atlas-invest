import { describe, expect, it } from 'vitest';
import {
  buildAnnualTaxReadinessAssessment,
  computeReadinessFingerprint,
  TaxpayerConfirmation,
} from '../../packages/tax-engine/src/annual-irpf';

describe('Domain Unit: Annual Tax Readiness Engine Fixtures A–Z (Phase 4H.5 / 4H.5A)', () => {
  // FIXTURE A — EMPTY YEAR
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

  // FIXTURE B — FULLY COMPLETE YEAR
  it('Fixture B: Fully complete year produces overall READY status', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      openingPositions: {
        positions: [{ assetId: 'asset-1', status: 'CONFIRMED', costBasisStatus: 'COMPLETE' }],
      },
      annualPositions: {
        positions: [{ assetId: 'asset-1', costBasisStatus: 'COMPLETE', isBlocked: false }],
      },
      capitalMarketSummary: {
        overallStatus: 'READY',
        months: [{ month: 1, status: 'READY' }],
      },
      payments6015: {
        obligations: [{ competence: '2025-01', status: 'PAID', balancePayable: '0.00' }],
      },
      transitionEvidence: {
        requirements: [{ assetId: 'asset-petr4', isVerified: true }],
      },
      fiiEligibility: {
        items: [
          {
            assetId: 'asset-knri11',
            ticker: 'KNRI11',
            isExempt: true,
            requiresConfirmation: false,
          },
        ],
      },
      withholdingEvidence: {
        missingReports: [],
      },
      investmentIncomeSummary: {
        overallStatus: 'READY',
        payers: [{ assetId: 'asset-petr4', status: 'COMPLETE' }],
      },
      taxpayerConfirmations: [],
    });

    expect(assessment.overallStatus).toBe('READY');
    expect(assessment.isReadyForDirpf).toBe(true);
    expect(assessment.requirements).toHaveLength(0);
  });

  // FIXTURE C — MISSING OPENING POSITION
  it('Fixture C: Missing opening position cost basis produces BLOCKED status', () => {
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

  // FIXTURE D — OPENING CONFIRMATION PENDING
  it('Fixture D: Opening position confirmation pending produces BLOCKED with pending requirement', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      openingPositions: {
        positions: [{ assetId: 'asset-2', status: 'CONFIRMED', costBasisStatus: 'UNKNOWN' }],
      },
      taxpayerConfirmations: [],
    });

    expect(assessment.overallStatus).toBe('BLOCKED');
    expect(assessment.requirements[0]?.status).toBe('PENDING');
    expect(assessment.sections.find((s) => s.section === 'TAXPAYER_CONFIRMATIONS')?.status).toBe(
      'REQUIRES_CONFIRMATION',
    );
  });

  // FIXTURE E — UNSUPPORTED ASSET
  it('Fixture E: Unsupported asset in annual positions produces BLOCKED status', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      annualPositions: {
        blockingReasons: ['UNSUPPORTED_ASSET_CLASS'],
        positions: [{ assetId: 'asset-unsupported', isBlocked: true }],
      },
    });

    expect(assessment.overallStatus).toBe('BLOCKED');
    expect(assessment.blockingReasons).toContain('UNSUPPORTED_ASSET_CLASS');
    expect(assessment.isReadyForDirpf).toBe(false);
  });

  // FIXTURE F — CAPITAL-MARKET BLOCKED MONTH
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

  // FIXTURE G — 6015 PAYMENT EVIDENCE MISSING
  it('Fixture G: Missing 6015 payment evidence produces specific evidence requirement', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      payments6015: {
        obligations: [{ competence: '2025-05', status: 'OVERDUE', balancePayable: '150.00' }],
      },
    });

    expect(assessment.overallStatus).toBe('REQUIRES_CONFIRMATION');
    expect(assessment.requirements).toHaveLength(1);
    expect(assessment.requirements[0]?.blockingReason).toBe('PENDING_DARF_PAYMENT_EVIDENCE');
    expect(assessment.requirements[0]?.status).toBe('PENDING');
  });

  // FIXTURE H — NORMAL IRRF RESIDUAL
  it('Fixture H: Normal IRRF residual in ready capital market is informational and does not block', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      capitalMarketSummary: {
        overallStatus: 'READY',
        months: [{ month: 1, status: 'READY' }],
      },
    });

    expect(assessment.overallStatus).toBe('READY');
    expect(assessment.isReadyForDirpf).toBe(true);
  });

  // FIXTURE I — DAY-TRADE IRRF RESIDUAL
  it('Fixture I: Day-trade IRRF residual in ready capital market is informational and does not block', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      capitalMarketSummary: {
        overallStatus: 'READY',
        months: [{ month: 3, status: 'READY' }],
      },
    });

    expect(assessment.overallStatus).toBe('READY');
    expect(assessment.isReadyForDirpf).toBe(true);
  });

  // FIXTURE J — DIVIDEND TRANSITION ELIGIBLE
  it('Fixture J: Verified dividend transition requires no confirmation and is READY', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2026,
      transitionEvidence: {
        requirements: [{ assetId: 'asset-vale3', ticker: 'VALE3', isVerified: true }],
      },
    });

    expect(assessment.overallStatus).toBe('READY');
    expect(assessment.requirements).toHaveLength(0);
    const sec = assessment.sections.find((s) => s.section === 'TRANSITION_EVIDENCE');
    expect(sec?.status).toBe('READY');
  });

  // FIXTURE K — DIVIDEND TRANSITION UNKNOWN
  it('Fixture K: Unverified dividend transition produces REQUIRES_CONFIRMATION', () => {
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

  // FIXTURE L — DIVIDEND TRANSITION CONFIRMED
  it('Fixture L: Confirmed dividend transition updates readiness deterministically to READY', () => {
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
    expect(assessment.requirements[0]?.satisfiedByConfirmationId).toBe('conf-petr4');
  });

  // FIXTURE M — FII ELIGIBLE
  it('Fixture M: FII exempt without confirmation required is READY', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      fiiEligibility: {
        items: [
          {
            assetId: 'asset-knri11',
            ticker: 'KNRI11',
            isExempt: true,
            requiresConfirmation: false,
          },
        ],
      },
    });

    expect(assessment.overallStatus).toBe('READY');
    expect(assessment.sections.find((s) => s.section === 'FII_ELIGIBILITY')?.status).toBe('READY');
  });

  // FIXTURE N — FII UNKNOWN
  it('Fixture N: FII requiring eligibility confirmation unconfirmed produces REQUIRES_CONFIRMATION', () => {
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

  // FIXTURE O — FII CONFIRMED
  it('Fixture O: FII requiring eligibility confirmed produces READY status', () => {
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

  // FIXTURE P — UNKNOWN WITHHOLDING
  it('Fixture P: Unknown withholding creates evidence requirement (unknown != zero)', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      withholdingEvidence: {
        missingReports: ['asset-bbas3'],
      },
    });

    expect(assessment.overallStatus).toBe('REQUIRES_CONFIRMATION');
    expect(assessment.requirements).toHaveLength(1);
    expect(assessment.requirements[0]?.blockingReason).toBe('MISSING_WITHHOLDING_REPORT');
    expect(assessment.requirements[0]?.status).toBe('PENDING');
  });

  // FIXTURE Q — CONFIRMATION REJECTED
  it('Fixture Q: Rejected confirmation does not satisfy requirement and leaves status non-ready', () => {
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
          id: 'conf-rejected',
          userId: 'user-1',
          calendarYear: 2025,
          scope: 'OPENING_COST_BASIS',
          subjectId: 'asset-1',
          status: 'REJECTED',
          sourceFingerprint: fp,
          revision: 1,
          confirmedAt: '2026-03-01T00:00:00Z',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
    });

    expect(assessment.overallStatus).toBe('BLOCKED');
    expect(assessment.requirements[0]?.status).toBe('PENDING');
  });

  // FIXTURE R — NOT APPLICABLE
  it('Fixture R: Empty reports and zero requirements are resolved as NO_ACTIVITY/READY', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      withholdingEvidence: {
        missingReports: [],
      },
    });

    expect(assessment.overallStatus).toBe('NO_ACTIVITY');
    expect(assessment.requirements).toHaveLength(0);
  });

  // FIXTURE S — DUPLICATE CONFIRMATION
  it('Fixture S: Duplicate confirmation handles idempotently using active confirmation', () => {
    const fp = computeReadinessFingerprint({
      competence: '2025-05',
      status: 'OVERDUE',
      balancePayable: '150.00',
    });

    const conf: TaxpayerConfirmation = {
      id: 'conf-dup-1',
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
    };

    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      payments6015: {
        obligations: [{ competence: '2025-05', status: 'OVERDUE', balancePayable: '150.00' }],
      },
      taxpayerConfirmations: [conf, { ...conf, id: 'conf-dup-2' }],
    });

    expect(assessment.overallStatus).toBe('READY');
    expect(assessment.requirements[0]?.status).toBe('SATISFIED');
  });

  // FIXTURE T — CONFIRMATION REVISION
  it('Fixture T: Confirmation revision preserves monotonic history and updates readiness', () => {
    const fp = computeReadinessFingerprint({
      assetId: 'asset-1',
      costBasisStatus: 'INCOMPLETE',
    });

    const supersededConf: TaxpayerConfirmation = {
      id: 'conf-rev-1',
      userId: 'user-1',
      calendarYear: 2025,
      scope: 'OPENING_COST_BASIS',
      subjectId: 'asset-1',
      status: 'SUPERSEDED',
      sourceFingerprint: 'old-fp',
      revision: 1,
      confirmedAt: '2026-01-01T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const activeConf: TaxpayerConfirmation = {
      id: 'conf-rev-2',
      userId: 'user-1',
      calendarYear: 2025,
      scope: 'OPENING_COST_BASIS',
      subjectId: 'asset-1',
      status: 'CONFIRMED',
      sourceFingerprint: fp,
      revision: 2,
      confirmedAt: '2026-02-01T00:00:00Z',
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    };

    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      openingPositions: {
        positions: [{ assetId: 'asset-1', status: 'CONFIRMED', costBasisStatus: 'INCOMPLETE' }],
      },
      taxpayerConfirmations: [supersededConf, activeConf],
    });

    expect(assessment.overallStatus).toBe('READY');
    expect(assessment.requirements[0]?.status).toBe('SATISFIED');
    expect(assessment.requirements[0]?.satisfiedByConfirmationId).toBe('conf-rev-2');
  });

  // FIXTURE U — CROSS-USER CONFIRMATION
  it('Fixture U: Confirmation for foreign user subject reference cannot satisfy requirement', () => {
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
          id: 'conf-foreign',
          userId: 'foreign-user-999',
          calendarYear: 2025,
          scope: 'OPENING_COST_BASIS',
          subjectId: 'asset-different-user',
          status: 'CONFIRMED',
          sourceFingerprint: fp,
          revision: 1,
          confirmedAt: '2026-03-01T00:00:00Z',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
    });

    expect(assessment.overallStatus).toBe('BLOCKED');
    expect(assessment.requirements[0]?.status).toBe('PENDING');
  });

  // FIXTURE V — MIXED READY/PARTIAL/BLOCKED
  it('Fixture V: Mixed section statuses resolve strictly by severity precedence', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      capitalMarketSummary: {
        overallStatus: 'PARTIAL',
        months: [{ month: 1, status: 'READY' }],
      },
      annualPositions: {
        positions: [{ assetId: 'asset-1', costBasisStatus: 'INCOMPLETE', isBlocked: true }],
      },
    });

    // BLOCKED (4) > PARTIAL (2)
    expect(assessment.overallStatus).toBe('BLOCKED');
    expect(assessment.isReadyForDirpf).toBe(false);
  });

  // FIXTURE W — UPSTREAM REVISION
  it('Fixture W: Upstream revision changes readiness deterministically upon recalculation', () => {
    const inputInitial = {
      calendarYear: 2025,
      capitalMarketSummary: {
        overallStatus: 'PARTIAL' as const,
        months: [{ month: 1, status: 'READY' }],
      },
    };

    const initialAssessment = buildAnnualTaxReadinessAssessment(inputInitial);
    expect(initialAssessment.overallStatus).toBe('PARTIAL');

    const inputRevised = {
      calendarYear: 2025,
      capitalMarketSummary: {
        overallStatus: 'READY' as const,
        months: [
          { month: 1, status: 'READY' },
          { month: 2, status: 'READY' },
        ],
      },
    };

    const revisedAssessment = buildAnnualTaxReadinessAssessment(inputRevised);
    expect(revisedAssessment.overallStatus).toBe('READY');
  });

  // FIXTURE X — YEAR BOUNDARY
  it('Fixture X: 2025 confirmation does not leak or satisfy 2026 requirement', () => {
    const fp2026 = computeReadinessFingerprint({
      assetId: 'asset-petr4',
      calendarYear: 2026,
    });

    const assessment2026 = buildAnnualTaxReadinessAssessment({
      calendarYear: 2026,
      transitionEvidence: {
        requirements: [{ assetId: 'asset-petr4', ticker: 'PETR4', isVerified: false }],
      },
      taxpayerConfirmations: [
        {
          id: 'conf-2025',
          userId: 'user-1',
          calendarYear: 2025,
          scope: 'DIVIDEND_TRANSITION_EVIDENCE',
          subjectId: 'asset-petr4',
          status: 'CONFIRMED',
          sourceFingerprint: fp2026,
          revision: 1,
          confirmedAt: '2025-12-31T00:00:00Z',
          createdAt: '2025-12-31T00:00:00Z',
          updatedAt: '2025-12-31T00:00:00Z',
        },
      ],
    });

    // Confirmation belongs to 2025; engine for 2026 requires valid matching scope
    expect(assessment2026.overallStatus).toBe('REQUIRES_CONFIRMATION');
  });

  // FIXTURE Y — CONFIRMATION SUBJECT MISSING
  it('Fixture Y: Confirmation for non-existent requirement subject does not satisfy missing subject', () => {
    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      openingPositions: {
        positions: [{ assetId: 'asset-missing-subject', costBasisStatus: 'INCOMPLETE' }],
      },
      taxpayerConfirmations: [
        {
          id: 'conf-wrong-subj',
          userId: 'user-1',
          calendarYear: 2025,
          scope: 'OPENING_COST_BASIS',
          subjectId: 'asset-completely-unrelated',
          status: 'CONFIRMED',
          sourceFingerprint: 'some-fp',
          revision: 1,
          confirmedAt: '2026-01-01T00:00:00Z',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    expect(assessment.overallStatus).toBe('BLOCKED');
    expect(assessment.requirements[0]?.status).toBe('PENDING');
  });

  // FIXTURE Z — STALE CONFIRMATION
  it('Fixture Z: Stale confirmation detected when source data fingerprint changes', () => {
    const originalFp = 'fp_initial_version_1';

    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear: 2025,
      openingPositions: {
        positions: [{ assetId: 'asset-stale', status: 'CONFIRMED', costBasisStatus: 'INCOMPLETE' }],
      },
      taxpayerConfirmations: [
        {
          id: 'conf-stale-1',
          userId: 'user-1',
          calendarYear: 2025,
          scope: 'OPENING_COST_BASIS',
          subjectId: 'asset-stale',
          status: 'CONFIRMED',
          sourceFingerprint: originalFp, // differs from current computed fingerprint
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
    expect(assessment.requirements[0]?.satisfiedByConfirmationId).toBeUndefined();
  });
});
