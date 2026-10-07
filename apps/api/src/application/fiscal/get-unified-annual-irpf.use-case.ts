import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Money } from '@atlas/domain';
import { EntityNotFoundError, IPortfolioRepository, PersistenceError } from '@atlas/database';
import {
  buildRequirementKey,
  buildUnifiedAnnualIrpfState,
  detectUnifiedConsistencyIssues,
  isValidCalendarYear,
  normalizeSubjectReference,
  type ConsistencyInput,
  type ConsistencyModuleIdentity,
  type UnifiedAnnualIrpfState,
  type UnifiedBlockingReason,
  type UnifiedConsistencyIssue,
  type UnifiedModuleContribution,
  type UnifiedModuleStatus,
  type UnifiedRequirement,
  type UnifiedRuleVersions,
} from '@atlas/tax-engine';
import { PORTFOLIO_REPOSITORY } from '../../database/tokens';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import { GetAnnualPositionReportUseCase } from './get-annual-position-report.use-case';
import { GetAnnualCapitalMarketSummaryUseCase } from './get-annual-capital-market-summary.use-case';
import { GetAnnualInvestmentIncomeSummaryUseCase } from './get-annual-investment-income-summary.use-case';
import { GetAnnualTaxReadinessUseCase } from './get-annual-tax-readiness.use-case';
import { GetAnnualHighIncomeAssessmentUseCase } from './get-annual-high-income-assessment.use-case';
import type { AnnualPositionReportReadModel } from './annual-position.read-model';
import type { AnnualCapitalMarketFiscalSummaryReadModel } from './annual-capital-market-summary.read-model';
import type { AnnualInvestmentIncomeSummaryReadModel } from './annual-investment-income.read-model';
import type { AnnualTaxReadinessReadModel } from './annual-tax-readiness.read-model';
import type { AnnualHighIncomeAssessmentReadModel } from './annual-high-income.read-model';

export interface GetUnifiedAnnualIrpfInput {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
}

/**
 * The already-loaded native read models for a request, plus the derived
 * ANNUAL_POSITIONS fold. The composed loads are performed once; the outer
 * fence re-reads source markers from a second composed load.
 */
interface LoadedState {
  readonly positions: PositionsFold;
  readonly capitalMarket: AnnualCapitalMarketFiscalSummaryReadModel;
  readonly income: AnnualInvestmentIncomeSummaryReadModel;
  readonly readiness: AnnualTaxReadinessReadModel;
  readonly highIncome: HighIncomeLoad;
}

interface PositionsFold {
  readonly status: UnifiedModuleStatus;
  readonly sourceFingerprint: string;
  readonly loadFailed: boolean;
}

interface HighIncomeLoad {
  readonly assessment: AnnualHighIncomeAssessmentReadModel | null;
  readonly snapshotInconsistent: boolean;
}

const SENTINEL_ANNUAL = '_ANNUAL_';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Phase 4J.1 — Unified Annual IRPF Orchestration application service.
 *
 * Composes the already-computed authoritative outputs of 4H (positions,
 * capital markets, investment income, readiness/evidence) and 4I (high-income
 * minimum tax) into one deterministic unified annual state via the PURE
 * `buildUnifiedAnnualIrpfState` assembler. It performs NO tax math, re-reads
 * NO ledger, injects NO fiscal evidence/confirmation repository, and persists
 * nothing. Only `PORTFOLIO_REPOSITORY` (for the positions fan-out) and
 * `FISCAL_CLOCK` (for the deterministic `generatedAt`) are injected directly;
 * every other fact is reached transitively through the five Get*UseCase
 * classes.
 */
@Injectable()
export class UnifiedAnnualIrpfService {
  constructor(
    @Inject(GetAnnualPositionReportUseCase)
    private readonly positionReportUseCase: GetAnnualPositionReportUseCase,
    @Inject(GetAnnualCapitalMarketSummaryUseCase)
    private readonly capitalMarketUseCase: GetAnnualCapitalMarketSummaryUseCase,
    @Inject(GetAnnualInvestmentIncomeSummaryUseCase)
    private readonly incomeUseCase: GetAnnualInvestmentIncomeSummaryUseCase,
    @Inject(GetAnnualTaxReadinessUseCase)
    private readonly readinessUseCase: GetAnnualTaxReadinessUseCase,
    @Inject(GetAnnualHighIncomeAssessmentUseCase)
    private readonly highIncomeUseCase: GetAnnualHighIncomeAssessmentUseCase,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(FISCAL_CLOCK)
    private readonly clock: FiscalClock,
  ) {}

  async execute(input: GetUnifiedAnnualIrpfInput): Promise<UnifiedAnnualIrpfState> {
    if (!isValidCalendarYear(input.calendarYear)) {
      throw new BadRequestException({
        code: 'FISCAL.INVALID_YEAR',
        message: `Invalid calendar year: ${input.calendarYear}. Must be an integer between 1900 and 2100.`,
      });
    }

    // Outer rebuild-once fence over the composed source markers. Prevents a
    // mixed-state READY under TOCTOU across the composed loads. This is DISTINCT
    // from the inner 4I 400 fence (FISCAL.SNAPSHOT_INCONSISTENT), which is
    // caught per-module below.
    const first = await this.buildWithFence(input.taxSubjectId, input.calendarYear);
    if (first.consistent) {
      return first.state;
    }
    const second = await this.buildWithFence(input.taxSubjectId, input.calendarYear);
    if (second.consistent) {
      return second.state;
    }
    throw new UnprocessableEntityException({
      code: 'FISCAL.UNIFIED_ANNUAL_INCONSISTENT',
      message: 'Annual fiscal sources changed during orchestration; please retry.',
    });
  }

  private async buildWithFence(
    taxSubjectId: string,
    calendarYear: number,
  ): Promise<{ state: UnifiedAnnualIrpfState; consistent: boolean }> {
    const before = await this.load(taxSubjectId, calendarYear);
    const state = this.assemble(taxSubjectId, calendarYear, before);
    const after = await this.load(taxSubjectId, calendarYear);
    return {
      state,
      consistent: this.watermark(before) === this.watermark(after),
    };
  }

  /** Coherence watermark over the composed source markers. */
  private watermark(loaded: LoadedState): string {
    const hi = loaded.highIncome.assessment;
    return [
      loaded.positions.sourceFingerprint,
      loaded.capitalMarket.fingerprint,
      loaded.income.fingerprint,
      loaded.readiness.fingerprint,
      loaded.highIncome.snapshotInconsistent
        ? 'SNAPSHOT_INCONSISTENT'
        : (hi?.sourceFingerprint ?? 'NONE'),
      hi?.calculationFingerprint ?? 'NONE',
    ].join('|');
  }

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  private async load(taxSubjectId: string, calendarYear: number): Promise<LoadedState> {
    const [positions, capitalMarket, income, readiness, highIncome] = await Promise.all([
      this.loadPositions(taxSubjectId, calendarYear),
      this.capitalMarketUseCase.execute({ taxSubjectId, calendarYear }),
      this.incomeUseCase.execute({ taxSubjectId, calendarYear }),
      this.readinessUseCase.execute({ taxSubjectId, calendarYear }),
      this.loadHighIncome(taxSubjectId, calendarYear),
    ]);
    return { positions, capitalMarket, income, readiness, highIncome };
  }

  /**
   * ANNUAL_POSITIONS fan-out over the subject's portfolios with a worst-status
   * fold. A per-portfolio recoverable not-found/race is tolerated (contributes
   * nothing); a genuine PersistenceError degrades the module to BLOCKED via
   * MODULE_LOAD_FAILED (never a blanket `() => null`).
   */
  private async loadPositions(taxSubjectId: string, calendarYear: number): Promise<PositionsFold> {
    const portfolios = await this.portfolioRepository.findByUserId(taxSubjectId);
    if (!portfolios || portfolios.length === 0) {
      return {
        status: 'NO_ACTIVITY',
        sourceFingerprint: this.positionsMarker('NO_ACTIVITY', []),
        loadFailed: false,
      };
    }

    const reports: AnnualPositionReportReadModel[] = [];
    let loadFailed = false;

    const results = await Promise.all(
      portfolios.map((portfolio) =>
        this.positionReportUseCase
          .execute({ taxSubjectId, portfolioId: portfolio.id, calendarYear })
          .then((report) => ({ ok: true as const, report }))
          .catch((error: unknown) => {
            // Recoverable: portfolio vanished mid-request / not found for subject.
            if (error instanceof NotFoundException || error instanceof EntityNotFoundError) {
              return { ok: false as const, failed: false };
            }
            // Genuine persistence fault: degrade this module to BLOCKED.
            if (error instanceof PersistenceError) {
              return { ok: false as const, failed: true };
            }
            throw error;
          }),
      ),
    );

    for (const result of results) {
      if (result.ok) {
        reports.push(result.report);
      } else if (result.failed) {
        loadFailed = true;
      }
    }

    if (loadFailed) {
      return {
        status: 'BLOCKED',
        sourceFingerprint: this.positionsMarker('BLOCKED', reports),
        loadFailed: true,
      };
    }

    const status = this.foldPositionStatus(reports);
    return {
      status,
      sourceFingerprint: this.positionsMarker(status, reports),
      loadFailed: false,
    };
  }

  private foldPositionStatus(
    reports: readonly AnnualPositionReportReadModel[],
  ): UnifiedModuleStatus {
    const totalAssets = reports.reduce((sum, r) => sum + r.summary.totalAssetsCount, 0);
    if (reports.length === 0 || totalAssets === 0) {
      return 'NO_ACTIVITY';
    }
    const statuses = reports.map((r) => r.summary.completenessStatus);
    if (statuses.includes('BLOCKED')) return 'BLOCKED';
    if (statuses.includes('REQUIRES_CONFIRMATION')) return 'REQUIRES_CONFIRMATION';
    if (statuses.includes('PARTIAL')) return 'PARTIAL';
    return 'READY';
  }

  /**
   * Derive a stable per-module marker from the folded status + per-portfolio
   * summary counts, sorted by portfolioId (order-independent). Never includes
   * `generatedAt`.
   */
  private positionsMarker(
    status: UnifiedModuleStatus,
    reports: readonly AnnualPositionReportReadModel[],
  ): string {
    const perPortfolio = reports
      .map((r) => ({
        // Hash the portfolioId so the raw DB UUID never reaches the wire while
        // the marker stays order-independent and revision-sensitive.
        portfolioKey: sha256Hex(r.portfolioId).slice(0, 16),
        completenessStatus: r.summary.completenessStatus,
        blockedPositionsCount: r.summary.blockedPositionsCount,
        requiresConfirmationCount: r.summary.requiresConfirmationCount,
        completePositionsCount: r.summary.completePositionsCount,
        totalAssetsCount: r.summary.totalAssetsCount,
      }))
      .sort((a, b) =>
        a.portfolioKey < b.portfolioKey ? -1 : a.portfolioKey > b.portfolioKey ? 1 : 0,
      );
    return sha256Hex(`ANNUAL_POSITIONS:${status}:${JSON.stringify(perPortfolio)}`);
  }

  /**
   * Load the 4I assessment, catching only its specific inner-fence 400
   * (FISCAL.SNAPSHOT_INCONSISTENT) and mapping it to a BLOCKED module. Any other
   * error (including a PersistenceError) propagates.
   */
  private async loadHighIncome(
    taxSubjectId: string,
    calendarYear: number,
  ): Promise<HighIncomeLoad> {
    try {
      const assessment = await this.highIncomeUseCase.execute({ taxSubjectId, calendarYear });
      return { assessment, snapshotInconsistent: false };
    } catch (error: unknown) {
      if (
        error instanceof BadRequestException &&
        this.errorCode(error) === 'FISCAL.SNAPSHOT_INCONSISTENT'
      ) {
        return { assessment: null, snapshotInconsistent: true };
      }
      throw error;
    }
  }

  private errorCode(error: BadRequestException): string | undefined {
    const response = error.getResponse();
    if (response && typeof response === 'object' && 'code' in response) {
      const code = (response as { code?: unknown }).code;
      return typeof code === 'string' ? code : undefined;
    }
    return undefined;
  }

  // -------------------------------------------------------------------------
  // Assembly: native read models -> module contributions + consistency
  // -------------------------------------------------------------------------

  private assemble(
    taxSubjectId: string,
    calendarYear: number,
    loaded: LoadedState,
  ): UnifiedAnnualIrpfState {
    const positionsModule = this.mapPositions(loaded.positions);
    const capitalModule = this.mapCapitalMarket(loaded.capitalMarket);
    const incomeModule = this.mapIncome(loaded.income);
    const readinessModule = this.mapReadiness(taxSubjectId, loaded.readiness);
    const highIncomeModule = this.mapHighIncome(taxSubjectId, calendarYear, loaded.highIncome);

    const modules: UnifiedModuleContribution[] = [
      positionsModule,
      capitalModule,
      incomeModule,
      readinessModule,
      highIncomeModule,
    ];

    const consistencyIssues = this.detectConsistency(calendarYear, loaded, highIncomeModule);

    const ruleVersions: UnifiedRuleVersions = {
      annualPositions: null,
      capitalMarkets: null,
      investmentIncome: null,
      readinessEvidence: null,
      highIncome: loaded.highIncome.assessment?.ruleVersion ?? null,
    };

    return buildUnifiedAnnualIrpfState({
      calendarYear,
      taxSubjectId,
      generatedAt: `${this.clock.today()}T00:00:00.000Z`,
      ruleVersions,
      modules,
      consistencyIssues,
    });
  }

  private mapPositions(fold: PositionsFold): UnifiedModuleContribution {
    const blockingReasons: (UnifiedBlockingReason | string)[] = fold.loadFailed
      ? ['MODULE_LOAD_FAILED']
      : [];
    return {
      module: 'ANNUAL_POSITIONS',
      source: '4H.2',
      status: fold.status,
      authoritative: fold.status === 'READY',
      material: true,
      blockingReasons,
      requirements: [],
      sourceFingerprint: fold.sourceFingerprint,
      calculationFingerprint: null,
      evidenceFingerprints: [],
      declarationExercise: null,
    };
  }

  private mapCapitalMarket(
    summary: AnnualCapitalMarketFiscalSummaryReadModel,
  ): UnifiedModuleContribution {
    const status = this.capitalMarketStatus(summary);
    return {
      module: 'CAPITAL_MARKETS',
      source: '4H.3',
      status,
      authoritative: status === 'READY',
      material: true,
      blockingReasons: [],
      requirements: [],
      sourceFingerprint: summary.fingerprint,
      calculationFingerprint: null,
      evidenceFingerprints: [],
      declarationExercise: summary.declarationExercise,
    };
  }

  /**
   * Map from guaranteed fields only. NO_ACTIVITY is decided by a per-field
   * decimal-string zero check (`Money.isZero`) — never a sum/aggregation.
   */
  private capitalMarketStatus(
    summary: AnnualCapitalMarketFiscalSummaryReadModel,
  ): UnifiedModuleStatus {
    const noActivity =
      summary.months.length === 0 ||
      summary.months.every((m) =>
        [
          m.normalEquities.grossSaleAmount,
          m.normalEquities.profitOrLoss,
          m.dayTrade.grossSaleAmount,
          m.dayTrade.profitOrLoss,
          m.fii.grossSaleAmount,
          m.fii.profitOrLoss,
        ].every((value) => Money.from(value, 'BRL').isZero()),
      );
    if (noActivity) return 'NO_ACTIVITY';
    if (!summary.isComplete) return 'PARTIAL';
    return 'READY';
  }

  private mapIncome(income: AnnualInvestmentIncomeSummaryReadModel): UnifiedModuleContribution {
    const status = this.mapIncomeStatus(income);
    const blockingReasons: (UnifiedBlockingReason | string)[] =
      status === 'UNSUPPORTED' ? ['UNMAPPED_STATUS'] : [...income.blockingReasons];
    return {
      module: 'INVESTMENT_INCOME',
      source: '4H.4',
      status,
      authoritative: status === 'READY',
      material: true,
      blockingReasons,
      requirements: [],
      sourceFingerprint: income.fingerprint,
      calculationFingerprint: null,
      evidenceFingerprints: [],
      declarationExercise: income.declarationExercise,
    };
  }

  /**
   * 4H.4 completeness status is `COMPLETE | PARTIAL | BLOCKED |
   * REQUIRES_CONFIRMATION` (never READY/NO_ACTIVITY). NO_ACTIVITY is derived
   * from the absence of any income activity (no payers and zero gross — a
   * per-field decimal-string check, never a sum). An unknown value fails closed
   * to UNSUPPORTED (never READY).
   */
  private mapIncomeStatus(income: AnnualInvestmentIncomeSummaryReadModel): UnifiedModuleStatus {
    const hasActivity =
      income.payers.length > 0 && !Money.from(income.totalGrossIncome, 'BRL').isZero();
    if (!hasActivity && income.status === 'COMPLETE') {
      return 'NO_ACTIVITY';
    }
    switch (income.status) {
      case 'COMPLETE':
        return 'READY';
      case 'PARTIAL':
        return 'PARTIAL';
      case 'REQUIRES_CONFIRMATION':
        return 'REQUIRES_CONFIRMATION';
      case 'BLOCKED':
        return 'BLOCKED';
      default:
        return 'UNSUPPORTED';
    }
  }

  private mapReadiness(
    taxSubjectId: string,
    readiness: AnnualTaxReadinessReadModel,
  ): UnifiedModuleContribution {
    const status = this.mapReadinessStatus(readiness.overallStatus);
    const requirements = this.mapReadinessRequirements(taxSubjectId, readiness);
    const evidenceFingerprints = readiness.confirmations.map((c) => c.fingerprint);
    return {
      module: 'READINESS_EVIDENCE',
      source: '4H.5',
      status,
      authoritative: status === 'READY',
      material: true,
      blockingReasons: [...readiness.blockingReasons],
      requirements,
      sourceFingerprint: readiness.fingerprint,
      calculationFingerprint: null,
      evidenceFingerprints,
      declarationExercise: readiness.declarationExercise,
    };
  }

  private mapReadinessStatus(status: string): UnifiedModuleStatus {
    switch (status) {
      case 'READY':
        return 'READY';
      case 'PARTIAL':
        return 'PARTIAL';
      case 'REQUIRES_CONFIRMATION':
        return 'REQUIRES_CONFIRMATION';
      case 'BLOCKED':
        return 'BLOCKED';
      case 'NO_ACTIVITY':
        return 'NO_ACTIVITY';
      default:
        return 'UNSUPPORTED';
    }
  }

  private mapReadinessRequirements(
    taxSubjectId: string,
    readiness: AnnualTaxReadinessReadModel,
  ): UnifiedRequirement[] {
    return readiness.requirements.map((req) => {
      const category = req.section;
      const nativeType = req.section;
      const subjectReference = this.safeSubjectReference(taxSubjectId, req.subjectId);
      return {
        key: buildRequirementKey({
          module: 'READINESS_EVIDENCE',
          category,
          subjectReference,
          nativeType,
        }),
        module: 'READINESS_EVIDENCE',
        category,
        nativeType,
        subjectReference,
        status: req.status,
        blockingReason: req.blockingReason ?? null,
      };
    });
  }

  private mapHighIncome(
    taxSubjectId: string,
    calendarYear: number,
    load: HighIncomeLoad,
  ): UnifiedModuleContribution {
    // In-window materiality: IRPFM applies from ano-calendário 2026.
    const material = calendarYear >= 2026;

    if (load.snapshotInconsistent || load.assessment === null) {
      return {
        module: 'HIGH_INCOME_MINIMUM_TAX',
        source: '4I',
        status: 'BLOCKED',
        authoritative: false,
        material,
        blockingReasons: ['UPSTREAM_SNAPSHOT_INCONSISTENT'],
        requirements: [],
        sourceFingerprint: 'HIGH_INCOME:UPSTREAM_SNAPSHOT_INCONSISTENT',
        calculationFingerprint: null,
        evidenceFingerprints: [],
        declarationExercise: null,
      };
    }

    const assessment = load.assessment;
    const status = this.mapHighIncomeStatus(assessment.status);
    const requirements = this.mapHighIncomeRequirements(taxSubjectId, assessment);
    const evidenceFingerprints = assessment.evidence.map((e) => e.fingerprint);
    const blockingReasons: (UnifiedBlockingReason | string)[] =
      status === 'UNSUPPORTED' &&
      assessment.status !== 'UNSUPPORTED_YEAR' &&
      assessment.status !== 'UNSUPPORTED_INPUT'
        ? ['UNMAPPED_STATUS']
        : [...assessment.blockingReasons];

    return {
      module: 'HIGH_INCOME_MINIMUM_TAX',
      source: '4I',
      status,
      authoritative: status === 'READY',
      material: material && status !== 'NOT_APPLICABLE',
      blockingReasons,
      requirements,
      sourceFingerprint: assessment.sourceFingerprint,
      calculationFingerprint: assessment.calculationFingerprint,
      evidenceFingerprints,
      declarationExercise: assessment.declarationExercise,
    };
  }

  private mapHighIncomeStatus(status: string): UnifiedModuleStatus {
    switch (status) {
      case 'NOT_APPLICABLE':
        return 'NOT_APPLICABLE';
      case 'UNSUPPORTED_YEAR':
      case 'UNSUPPORTED_INPUT':
        return 'UNSUPPORTED';
      case 'BLOCKED':
        return 'BLOCKED';
      case 'REQUIRES_CONFIRMATION':
        return 'REQUIRES_CONFIRMATION';
      case 'INCOMPLETE_CREDITS':
      case 'INCOMPLETE_REDUCTION_DATA':
        return 'PARTIAL';
      case 'CALCULABLE':
        return 'READY';
      default:
        return 'UNSUPPORTED';
    }
  }

  private mapHighIncomeRequirements(
    taxSubjectId: string,
    assessment: AnnualHighIncomeAssessmentReadModel,
  ): UnifiedRequirement[] {
    return assessment.evidenceRequirements.map((req) => {
      const category = req.requirement;
      const nativeType = req.requirement;
      const subjectReference = this.safeSubjectReference(taxSubjectId, req.subjectId);
      return {
        key: buildRequirementKey({
          module: 'HIGH_INCOME_MINIMUM_TAX',
          category,
          subjectReference,
          nativeType,
        }),
        module: 'HIGH_INCOME_MINIMUM_TAX',
        category,
        nativeType,
        subjectReference,
        status: req.status,
        blockingReason: req.blockingReason ?? null,
      };
    });
  }

  /**
   * Produce a non-leaking, normalized subject reference for a requirement key.
   * The subject-wide subject (the taxSubjectId itself) collapses to the
   * `_ANNUAL_` sentinel; any raw DB UUID is replaced by a stable non-reversible
   * short marker (keeps dedup deterministic without leaking the id); otherwise
   * the native reference (payer tickers etc.) is normalized verbatim.
   */
  private safeSubjectReference(taxSubjectId: string, subjectId: string): string {
    if (subjectId === taxSubjectId) {
      return SENTINEL_ANNUAL;
    }
    if (UUID_PATTERN.test(subjectId)) {
      return `_scoped_${sha256Hex(subjectId).slice(0, 12)}`;
    }
    return normalizeSubjectReference(subjectId);
  }

  private detectConsistency(
    calendarYear: number,
    loaded: LoadedState,
    highIncomeModule: UnifiedModuleContribution,
  ): readonly UnifiedConsistencyIssue[] {
    const localDeclarationExercise = calendarYear + 1;
    const moduleIdentities: ConsistencyModuleIdentity[] = [
      {
        module: 'CAPITAL_MARKETS',
        calendarYear: loaded.capitalMarket.calendarYear,
        declarationExercise: loaded.capitalMarket.declarationExercise,
      },
      {
        module: 'INVESTMENT_INCOME',
        calendarYear: loaded.income.calendarYear,
        declarationExercise: loaded.income.declarationExercise,
      },
      {
        module: 'READINESS_EVIDENCE',
        calendarYear: loaded.readiness.calendarYear,
        declarationExercise: loaded.readiness.declarationExercise,
      },
    ];
    const assessment = loaded.highIncome.assessment;
    if (assessment !== null) {
      moduleIdentities.push({
        module: 'HIGH_INCOME_MINIMUM_TAX',
        calendarYear: assessment.calendarYear,
        declarationExercise: assessment.declarationExercise,
      });
    }

    // Provenance/payer checks only when HIGH_INCOME consumed upstream facts
    // (i.e. an authoritative-path status, not NOT_APPLICABLE / UNSUPPORTED).
    const consumesUpstream =
      assessment !== null &&
      highIncomeModule.status !== 'NOT_APPLICABLE' &&
      highIncomeModule.status !== 'UNSUPPORTED';

    const highIncome: ConsistencyInput['highIncome'] =
      consumesUpstream && assessment !== null
        ? {
            upstreamIncomeFingerprint: assessment.upstreamIncomeFingerprint,
            upstreamCapitalMarketFingerprint: assessment.upstreamCapitalMarketFingerprint,
            upstreamIncomeStatus: assessment.upstreamIncomeStatus,
            payerIds: this.highIncomePayerIds(assessment),
            hasConflictingEvidence: assessment.evidence.some(
              (e) => e.conflictStatus === 'CONFLICT',
            ),
            hasStaleRequiredEvidence: this.hasStaleRequiredHighIncomeEvidence(assessment),
            forcedUpstreamSnapshotInconsistent: false,
          }
        : loaded.highIncome.snapshotInconsistent
          ? {
              upstreamIncomeFingerprint: '',
              upstreamCapitalMarketFingerprint: '',
              upstreamIncomeStatus: 'BLOCKED',
              payerIds: [],
              hasConflictingEvidence: false,
              hasStaleRequiredEvidence: false,
              forcedUpstreamSnapshotInconsistent: true,
            }
          : null;

    const consistencyInput: ConsistencyInput = {
      requestedCalendarYear: calendarYear,
      localDeclarationExercise,
      moduleIdentities,
      highIncome,
      incomeFingerprint: consumesUpstream ? loaded.income.fingerprint : null,
      capitalMarketFingerprint: consumesUpstream ? loaded.capitalMarket.fingerprint : null,
      incomePayerIds: loaded.income.payers.map((p) => p.payerId),
      hasStaleRequiredConfirmation: loaded.readiness.requirements.some((r) => r.status === 'STALE'),
    };

    return detectUnifiedConsistencyIssues(consistencyInput);
  }

  private highIncomePayerIds(assessment: AnnualHighIncomeAssessmentReadModel): string[] {
    const ids = new Set<string>();
    for (const payer of assessment.corporateRedutor?.payers ?? []) {
      ids.add(payer.payerId);
    }
    for (const evidence of assessment.evidence) {
      if (evidence.payerId) ids.add(evidence.payerId);
    }
    return [...ids];
  }

  private hasStaleRequiredHighIncomeEvidence(
    assessment: AnnualHighIncomeAssessmentReadModel,
  ): boolean {
    const requiredSubjects = new Set(
      assessment.evidenceRequirements
        .filter((r) => r.status !== 'SATISFIED' && r.status !== 'WAIVED')
        .map((r) => r.subjectId),
    );
    return assessment.evidence.some(
      (e) =>
        e.stale &&
        (requiredSubjects.has(e.payerId ?? SENTINEL_ANNUAL) ||
          (e.payerId !== null && requiredSubjects.has(e.payerId))),
    );
  }
}
