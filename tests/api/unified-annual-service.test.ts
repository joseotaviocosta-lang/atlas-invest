import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { UnifiedAnnualIrpfService } from '../../apps/api/src/application/fiscal/get-unified-annual-irpf.use-case';
import type { AnnualPositionReportReadModel } from '../../apps/api/src/application/fiscal/annual-position.read-model';
import type { AnnualCapitalMarketFiscalSummaryReadModel } from '../../apps/api/src/application/fiscal/annual-capital-market-summary.read-model';
import type { AnnualInvestmentIncomeSummaryReadModel } from '../../apps/api/src/application/fiscal/annual-investment-income.read-model';
import type { AnnualTaxReadinessReadModel } from '../../apps/api/src/application/fiscal/annual-tax-readiness.read-model';
import type { AnnualHighIncomeAssessmentReadModel } from '../../apps/api/src/application/fiscal/annual-high-income.read-model';

/**
 * Phase 4J.1 — service-level unit tests for the unified annual orchestration.
 *
 * These exercise the composing service directly against hand-built native read
 * models (NO database): the fail-closed status adapters (position fold +
 * readiness mapper), the scoped-memo query budget, the correlated stale-evidence
 * gate (positive + negative CROSS-TYPE), the outer rebuild-once fence
 * (FISCAL.UNIFIED_ANNUAL_INCONSISTENT), the inner snapshot-inconsistent mapping
 * (FISCAL.SNAPSHOT_INCONSISTENT -> HIGH_INCOME BLOCKED), MODULE_LOAD_FAILED, and
 * genuine PersistenceError propagation.
 */

const YEAR = 2026;
const SUBJECT = 'user-1';

// ---------------------------------------------------------------------------
// Minimal native read-model builders (only the fields the service reads).
// ---------------------------------------------------------------------------

function capitalMarket(
  overrides: Partial<AnnualCapitalMarketFiscalSummaryReadModel> = {},
): AnnualCapitalMarketFiscalSummaryReadModel {
  return {
    calendarYear: YEAR,
    declarationExercise: YEAR + 1,
    taxSubjectId: SUBJECT,
    currency: 'BRL',
    isComplete: true,
    qualityIssues: [],
    months: [],
    fingerprint: 'cap-fp',
    ...overrides,
  } as AnnualCapitalMarketFiscalSummaryReadModel;
}

function income(
  overrides: Partial<AnnualInvestmentIncomeSummaryReadModel> = {},
): AnnualInvestmentIncomeSummaryReadModel {
  return {
    calendarYear: YEAR,
    declarationExercise: YEAR + 1,
    isComplete: true,
    status: 'COMPLETE',
    currency: 'BRL',
    qualityIssues: [],
    blockingReasons: [],
    totalGrossIncome: '1000.00',
    totalWithheldTax: '0.00',
    payers: [{ payerId: 'PETR4' }],
    months: [],
    fingerprint: 'inc-fp',
    ...overrides,
  } as unknown as AnnualInvestmentIncomeSummaryReadModel;
}

function readiness(
  overrides: Partial<AnnualTaxReadinessReadModel> = {},
): AnnualTaxReadinessReadModel {
  return {
    calendarYear: YEAR,
    declarationExercise: YEAR + 1,
    overallStatus: 'READY',
    isReadyForDirpf: true,
    sections: [],
    requirements: [],
    confirmations: [],
    blockingReasons: [],
    fingerprint: 'rdy-fp',
    ...overrides,
  } as unknown as AnnualTaxReadinessReadModel;
}

function positionReport(
  overrides: Partial<AnnualPositionReportReadModel> = {},
): AnnualPositionReportReadModel {
  return {
    portfolioId: 'pf-1',
    taxSubjectId: SUBJECT,
    calendarYear: YEAR,
    version: 'ANNUAL_POSITIONS_V1',
    positions: [],
    summary: {
      asOfDate: `${YEAR}-12-31`,
      totalAssetsCount: 1,
      completePositionsCount: 1,
      blockedPositionsCount: 0,
      requiresConfirmationCount: 0,
      totalHistoricalCostKnown: '1000.00',
      currency: 'BRL',
      completenessStatus: 'COMPLETE',
    },
    generatedAt: `${YEAR}-12-31T00:00:00.000Z`,
    ...overrides,
  } as unknown as AnnualPositionReportReadModel;
}

function highIncome(
  overrides: Partial<AnnualHighIncomeAssessmentReadModel> = {},
): AnnualHighIncomeAssessmentReadModel {
  return {
    calendarYear: YEAR,
    declarationExercise: YEAR + 1,
    ruleVersion: 'HIGH_INCOME_V1',
    status: 'CALCULABLE',
    applicability: 'ABOVE_THRESHOLD',
    totalAnnualIncome: '1000000.00',
    applicabilityThreshold: '600000.00',
    minimumTaxBase: null,
    rateBand: null,
    minimumRatePercentage: null,
    grossMinimumTax: null,
    credits: [],
    supportedCreditsTotal: null,
    reductions: [],
    supportedReductionsTotal: null,
    corporateRedutor: null,
    netMinimumTax: null,
    creditExcess: null,
    incomeBreakdown: [],
    evidenceRequirements: [],
    evidence: [],
    blockingReasons: [],
    limitations: [],
    upstreamIncomeStatus: 'READY',
    upstreamIncomeFingerprint: 'inc-fp',
    upstreamCapitalMarketFingerprint: 'cap-fp',
    sourceFingerprint: 'hi-src-fp',
    calculationFingerprint: 'hi-calc-fp',
    ...overrides,
  } as unknown as AnnualHighIncomeAssessmentReadModel;
}

// ---------------------------------------------------------------------------
// Harness: build the service with per-use-case stubs.
// ---------------------------------------------------------------------------

interface Stubs {
  positions?: AnnualPositionReportReadModel | (() => Promise<AnnualPositionReportReadModel>);
  positionsError?: unknown;
  portfolios?: readonly { id: string }[];
  capitalMarket?: AnnualCapitalMarketFiscalSummaryReadModel;
  income?: AnnualInvestmentIncomeSummaryReadModel;
  readiness?: AnnualTaxReadinessReadModel;
  highIncome?: AnnualHighIncomeAssessmentReadModel;
  highIncomeError?: unknown;
  /** When set, the Nth capital-market mutation watermark changes mid-fence. */
  mutateCapitalFingerprintPerCall?: boolean;
}

function buildService(stubs: Stubs) {
  const capitalSpy = vi.fn(async () => {
    if (stubs.mutateCapitalFingerprintPerCall) {
      return capitalMarket({ fingerprint: `cap-fp-${capitalSpy.mock.calls.length}` });
    }
    return stubs.capitalMarket ?? capitalMarket();
  });
  const incomeSpy = vi.fn(async () => stubs.income ?? income());
  const readinessUseCase = {
    execute: vi.fn(async () => stubs.readiness ?? readiness()),
  };
  const highIncomeUseCase = {
    execute: vi.fn(async () => {
      if (stubs.highIncomeError) throw stubs.highIncomeError;
      return stubs.highIncome ?? highIncome();
    }),
  };
  const positionReportUseCase = {
    execute: vi.fn(async () => {
      if (stubs.positionsError) throw stubs.positionsError;
      const p = stubs.positions ?? positionReport();
      return typeof p === 'function' ? p() : p;
    }),
  };
  const capitalMarketUseCase = { execute: capitalSpy };
  const incomeUseCase = { execute: incomeSpy };
  const portfolioRepository = {
    findByUserId: vi.fn(async () => stubs.portfolios ?? [{ id: 'pf-1' }]),
  };
  const clock = { today: () => `${YEAR + 1}-04-01` };

  const service = new UnifiedAnnualIrpfService(
    positionReportUseCase as never,
    capitalMarketUseCase as never,
    incomeUseCase as never,
    readinessUseCase as never,
    highIncomeUseCase as never,
    portfolioRepository as never,
    clock as never,
  );
  return {
    service,
    capitalSpy,
    incomeSpy,
    readinessUseCase,
    highIncomeUseCase,
    positionReportUseCase,
    portfolioRepository,
  };
}

describe('Phase 4J.1 — UnifiedAnnualIrpfService (service-level)', () => {
  it('composes a READY_FOR_REVIEW package from all-ready sources', async () => {
    const { service } = buildService({});
    const state = await service.execute({ taxSubjectId: SUBJECT, calendarYear: YEAR });
    expect(state.identity.status).toBe('READY_FOR_REVIEW');
    expect(state.modules.map((m) => m.module)).toEqual([
      'ANNUAL_POSITIONS',
      'CAPITAL_MARKETS',
      'INVESTMENT_INCOME',
      'READINESS_EVIDENCE',
      'HIGH_INCOME_MINIMUM_TAX',
    ]);
  });

  it('rejects an invalid calendar year with FISCAL.INVALID_YEAR', async () => {
    const { service } = buildService({});
    await expect(service.execute({ taxSubjectId: SUBJECT, calendarYear: 1800 })).rejects.toThrow(
      BadRequestException,
    );
  });

  // --- Finding 2: fail-closed position fold -------------------------------

  it('fails closed to UNSUPPORTED + UNMAPPED_STATUS on an unknown position completeness value', async () => {
    const { service } = buildService({
      positions: positionReport({
        summary: {
          asOfDate: `${YEAR}-12-31`,
          totalAssetsCount: 1,
          completePositionsCount: 0,
          blockedPositionsCount: 0,
          requiresConfirmationCount: 0,
          totalHistoricalCostKnown: null,
          currency: 'BRL',
          // Drifted/unknown native value — must NOT become READY.
          completenessStatus: 'SOME_NEW_STATUS' as never,
        },
      } as never),
    });
    const state = await service.execute({ taxSubjectId: SUBJECT, calendarYear: YEAR });
    const positions = state.modules.find((m) => m.module === 'ANNUAL_POSITIONS')!;
    expect(positions.status).toBe('UNSUPPORTED');
    expect(positions.blockingReasons).toContain('UNMAPPED_STATUS');
    // A material UNSUPPORTED module with other real state -> global cannot be READY.
    expect(state.identity.status).not.toBe('READY_FOR_REVIEW');
  });

  // --- Finding 1 (reviewer-B): ANNUAL_POSITIONS identity is cross-checked ---

  it('emits YEAR_MISMATCH when the ANNUAL_POSITIONS report drifts to a different calendar year', async () => {
    const { service } = buildService({
      positions: positionReport({
        calendarYear: YEAR - 1, // drifted period
        declarationExercise: YEAR, // = (YEAR-1)+1, internally self-consistent
      }),
    });
    const state = await service.execute({ taxSubjectId: SUBJECT, calendarYear: YEAR });
    expect(
      state.consistencyIssues.some(
        (i) => i.code === 'YEAR_MISMATCH' && i.modules.includes('ANNUAL_POSITIONS'),
      ),
    ).toBe(true);
    // A blocking identity issue must fail the whole package closed.
    expect(state.identity.status).toBe('BLOCKED');
  });

  it('emits EXERCISE_MISMATCH when the ANNUAL_POSITIONS report declares a non-canonical exercise', async () => {
    const { service } = buildService({
      positions: positionReport({
        calendarYear: YEAR,
        declarationExercise: YEAR + 2, // not calendarYear + 1
      }),
    });
    const state = await service.execute({ taxSubjectId: SUBJECT, calendarYear: YEAR });
    expect(
      state.consistencyIssues.some(
        (i) => i.code === 'EXERCISE_MISMATCH' && i.modules.includes('ANNUAL_POSITIONS'),
      ),
    ).toBe(true);
    expect(state.identity.status).toBe('BLOCKED');
  });

  it('does NOT emit a positions identity issue when the report period matches the requested year', async () => {
    const { service } = buildService({
      positions: positionReport({ calendarYear: YEAR, declarationExercise: YEAR + 1 }),
    });
    const state = await service.execute({ taxSubjectId: SUBJECT, calendarYear: YEAR });
    expect(
      state.consistencyIssues.some(
        (i) =>
          (i.code === 'YEAR_MISMATCH' || i.code === 'EXERCISE_MISMATCH') &&
          i.modules.includes('ANNUAL_POSITIONS'),
      ),
    ).toBe(false);
  });

  // --- Finding 2: fail-closed readiness mapper ----------------------------

  it('fails closed to UNSUPPORTED + UNMAPPED_STATUS on an unknown readiness overall status', async () => {
    const { service } = buildService({
      readiness: readiness({ overallStatus: 'TOTALLY_NEW' as never, blockingReasons: [] }),
    });
    const state = await service.execute({ taxSubjectId: SUBJECT, calendarYear: YEAR });
    const rdy = state.modules.find((m) => m.module === 'READINESS_EVIDENCE')!;
    expect(rdy.status).toBe('UNSUPPORTED');
    expect(rdy.blockingReasons).toContain('UNMAPPED_STATUS');
  });

  // --- Finding 1: correlated stale-evidence gate --------------------------

  it('STALE_CONFIRMATION fires when a stale CORPORATE_TAX row gates the OPEN corporate requirement (positive, payer-scoped)', async () => {
    const { service } = buildService({
      highIncome: highIncome({
        status: 'INCOMPLETE_REDUCTION_DATA',
        evidenceRequirements: [
          {
            requirementId: 'r1',
            requirement: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE',
            subjectId: SUBJECT,
            title: 't',
            status: 'PENDING',
            legalReference: 'l',
            blockingReason: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE_PENDING',
          },
        ] as never,
        evidence: [
          {
            id: 'e1',
            evidenceType: 'CORPORATE_TAX',
            payerId: 'PETR4',
            authority: 'AUTHORITATIVE',
            evidenceSource: 'MANUAL',
            conflictStatus: 'NONE',
            stale: true,
            revision: 1,
            supersedesId: null,
            sourceFingerprint: 's',
            fingerprint: 'f',
          },
        ] as never,
      }),
    });
    const state = await service.execute({ taxSubjectId: SUBJECT, calendarYear: YEAR });
    expect(state.consistencyIssues.some((i) => i.code === 'STALE_CONFIRMATION')).toBe(true);
    expect(state.identity.status).toBe('BLOCKED');
  });

  it('STALE_CONFIRMATION does NOT fire when an UNRELATED stale ANNUAL_INCOME_TOTAL row coexists with an open CORPORATE requirement (negative CROSS-TYPE)', async () => {
    const { service } = buildService({
      highIncome: highIncome({
        status: 'INCOMPLETE_REDUCTION_DATA',
        blockingReasons: ['CORPORATE_EFFECTIVE_TAX_REDUCTION_NOT_IMPLEMENTED'],
        evidenceRequirements: [
          {
            requirementId: 'r1',
            // The OPEN requirement is corporate — not satisfied by an income-total row.
            requirement: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE',
            subjectId: SUBJECT,
            title: 't',
            status: 'PENDING',
            legalReference: 'l',
            blockingReason: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE_PENDING',
          },
          {
            requirementId: 'r2',
            // The income-total requirement is already satisfied by canonical 4H income.
            requirement: 'ANNUAL_INCOME_TOTAL',
            subjectId: SUBJECT,
            title: 't',
            status: 'SATISFIED',
            legalReference: 'l',
            blockingReason: null,
          },
        ] as never,
        evidence: [
          {
            id: 'e1',
            // Stale, but it only feeds ANNUAL_INCOME_TOTAL (already satisfied).
            evidenceType: 'ANNUAL_INCOME_TOTAL',
            payerId: null,
            authority: 'AUTHORITATIVE',
            evidenceSource: 'MANUAL',
            conflictStatus: 'NONE',
            stale: true,
            revision: 1,
            supersedesId: null,
            sourceFingerprint: 's',
            fingerprint: 'f',
          },
        ] as never,
      }),
    });
    const state = await service.execute({ taxSubjectId: SUBJECT, calendarYear: YEAR });
    // The unrelated stale income-total row must NOT emit a BLOCKING stale confirmation.
    expect(state.consistencyIssues.some((i) => i.code === 'STALE_CONFIRMATION')).toBe(false);
    // The real open corporate requirement still makes the package actionable, not READY.
    expect(state.identity.status).toBe('REQUIRES_ACTION');
  });

  // --- Finding 4: inner snapshot-inconsistent mapping ---------------------

  it('maps the inner 4I FISCAL.SNAPSHOT_INCONSISTENT to HIGH_INCOME BLOCKED + UPSTREAM_SNAPSHOT_INCONSISTENT', async () => {
    const { service } = buildService({
      highIncomeError: new BadRequestException({
        code: 'FISCAL.SNAPSHOT_INCONSISTENT',
        message: 'changed',
      }),
    });
    const state = await service.execute({ taxSubjectId: SUBJECT, calendarYear: YEAR });
    const hi = state.modules.find((m) => m.module === 'HIGH_INCOME_MINIMUM_TAX')!;
    expect(hi.status).toBe('BLOCKED');
    expect(hi.blockingReasons).toContain('UPSTREAM_SNAPSHOT_INCONSISTENT');
    expect(state.identity.status).toBe('BLOCKED');
  });

  // --- Finding 4: outer rebuild-once fence --------------------------------

  it('throws FISCAL.UNIFIED_ANNUAL_INCONSISTENT when source markers keep changing across the fence', async () => {
    const { service } = buildService({ mutateCapitalFingerprintPerCall: true });
    await expect(
      service.execute({ taxSubjectId: SUBJECT, calendarYear: YEAR }),
    ).rejects.toMatchObject({
      response: { code: 'FISCAL.UNIFIED_ANNUAL_INCONSISTENT' },
    });
    await expect(
      service.execute({ taxSubjectId: SUBJECT, calendarYear: YEAR }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  // --- Finding 4: MODULE_LOAD_FAILED on a genuine persistence fault --------

  it('degrades ANNUAL_POSITIONS to BLOCKED + MODULE_LOAD_FAILED on a per-portfolio PersistenceError', async () => {
    const { service } = buildService({
      positionsError: { code: 'PERSISTENCE.QUERY_FAILED', message: 'db down' },
    });
    const state = await service.execute({ taxSubjectId: SUBJECT, calendarYear: YEAR });
    const positions = state.modules.find((m) => m.module === 'ANNUAL_POSITIONS')!;
    expect(positions.status).toBe('BLOCKED');
    expect(positions.blockingReasons).toContain('MODULE_LOAD_FAILED');
    expect(state.identity.status).toBe('BLOCKED');
  });

  it('tolerates a per-portfolio recoverable entity-not-found (contributes nothing, no MODULE_LOAD_FAILED)', async () => {
    const { service } = buildService({
      portfolios: [{ id: 'pf-1' }],
      positionsError: { code: 'PERSISTENCE.ENTITY_NOT_FOUND', message: 'gone' },
    });
    const state = await service.execute({ taxSubjectId: SUBJECT, calendarYear: YEAR });
    const positions = state.modules.find((m) => m.module === 'ANNUAL_POSITIONS')!;
    // No surviving report -> NO_ACTIVITY, not a load failure.
    expect(positions.status).toBe('NO_ACTIVITY');
    expect(positions.blockingReasons).not.toContain('MODULE_LOAD_FAILED');
  });

  // --- Finding 3: scoped-memo query budget --------------------------------

  it('computes capital-market and income exactly ONCE per composed load snapshot (two per fenced request)', async () => {
    const { service, capitalSpy, incomeSpy } = buildService({});
    await service.execute({ taxSubjectId: SUBJECT, calendarYear: YEAR });
    // Direct + transitive (readiness + high-income) calls collapse to one per
    // snapshot; the fence does a before + after read => exactly 2 computes each.
    expect(capitalSpy).toHaveBeenCalledTimes(2);
    expect(incomeSpy).toHaveBeenCalledTimes(2);
  });

  it('does NOT share a memo across requests (fresh scope per request, no cross-user cache)', async () => {
    const { service, capitalSpy } = buildService({});
    await service.execute({ taxSubjectId: SUBJECT, calendarYear: YEAR });
    await service.execute({ taxSubjectId: SUBJECT, calendarYear: YEAR });
    // Four composed loads total (2 per request) => 4 computes, never deduped
    // across requests.
    expect(capitalSpy).toHaveBeenCalledTimes(4);
  });
});
