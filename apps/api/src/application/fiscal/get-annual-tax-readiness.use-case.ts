import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import {
  ITaxpayerConfirmationRepository,
  IAnnualOpeningPositionRepository,
  ITaxObligationRepository,
  IPortfolioRepository,
} from '@atlas/database';
import {
  TAXPAYER_CONFIRMATION_REPOSITORY,
  ANNUAL_OPENING_POSITION_REPOSITORY,
  TAX_OBLIGATION_REPOSITORY,
  PORTFOLIO_REPOSITORY,
} from '../../database/tokens';
import { buildAnnualTaxReadinessAssessment, isValidCalendarYear } from '@atlas/tax-engine';
import { GetAnnualCapitalMarketSummaryUseCase } from './get-annual-capital-market-summary.use-case';
import { GetAnnualInvestmentIncomeSummaryUseCase } from './get-annual-investment-income-summary.use-case';
import type { UnifiedLoadScope } from './in-flight-memo';
import {
  AnnualTaxReadinessReadModel,
  mapAssessmentToReadModel,
  mapTaxpayerConfirmationRowToDomain,
} from './annual-tax-readiness.read-model';

export interface GetAnnualTaxReadinessQuery {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  /**
   * Optional composed-load scope (Phase 4J.1) forwarded to the transitive
   * capital-market / investment-income calls so the unified orchestration
   * de-duplicates them against one load snapshot. Absent for the standalone
   * 4H.5 route.
   */
  readonly scope?: UnifiedLoadScope;
}

@Injectable()
export class GetAnnualTaxReadinessUseCase {
  constructor(
    @Inject(TAXPAYER_CONFIRMATION_REPOSITORY)
    private readonly confirmationRepo: ITaxpayerConfirmationRepository,
    @Inject(ANNUAL_OPENING_POSITION_REPOSITORY)
    private readonly openingPositionRepo: IAnnualOpeningPositionRepository,
    @Inject(TAX_OBLIGATION_REPOSITORY)
    private readonly obligationRepo: ITaxObligationRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepo: IPortfolioRepository,
    @Inject(GetAnnualCapitalMarketSummaryUseCase)
    private readonly capitalMarketSummaryUseCase: GetAnnualCapitalMarketSummaryUseCase,
    @Inject(GetAnnualInvestmentIncomeSummaryUseCase)
    private readonly investmentIncomeSummaryUseCase: GetAnnualInvestmentIncomeSummaryUseCase,
  ) {}

  async execute(query: GetAnnualTaxReadinessQuery): Promise<AnnualTaxReadinessReadModel> {
    if (!isValidCalendarYear(query.calendarYear)) {
      throw new BadRequestException(
        `Invalid calendar year: ${query.calendarYear}. Must be an integer between 1900 and 2100.`,
      );
    }

    const { taxSubjectId, calendarYear } = query;

    // Concurrently fetch inputs
    const [
      confirmationRows,
      openingPositionRows,
      obligations,
      capitalMarketSummary,
      investmentIncomeSummary,
      portfolios,
    ] = await Promise.all([
      this.confirmationRepo.listByYear({ taxSubjectId, calendarYear }),
      this.openingPositionRepo.listBySubject({ taxSubjectId }),
      this.obligationRepo.list(taxSubjectId),
      this.capitalMarketSummaryUseCase
        .execute({ taxSubjectId, calendarYear, scope: query.scope })
        .catch(() => null),
      this.investmentIncomeSummaryUseCase
        .execute({ taxSubjectId, calendarYear, scope: query.scope })
        .catch(() => null),
      this.portfolioRepo.findByUserId(taxSubjectId),
    ]);

    const domainConfirmations = confirmationRows.map(mapTaxpayerConfirmationRowToDomain);

    // Map opening positions
    const relevantOpeningPositions = openingPositionRows.filter((p) => {
      const year = new Date(p.effectiveDate).getUTCFullYear();
      return year < calendarYear;
    });

    const openingPositionsInput =
      relevantOpeningPositions.length > 0
        ? {
            positions: relevantOpeningPositions.map((p) => ({
              assetId: p.assetId,
              status: p.status,
              isConfirmed: p.status === 'CONFIRMED',
              costBasisStatus:
                p.totalHistoricalCost === '0' || !p.totalHistoricalCost ? 'INCOMPLETE' : 'COMPLETE',
            })),
            blockingReasons: relevantOpeningPositions.some((p) => p.status === 'DRAFT')
              ? ['UNCONFIRMED_OPENING_POSITION']
              : [],
          }
        : null;

    // Map 6015 obligations for this year
    const yearObligations = obligations.filter((ob) =>
      ob.competence.startsWith(`${calendarYear}-`),
    );
    const payments6015Input =
      yearObligations.length > 0
        ? {
            obligations: yearObligations.map((ob) => ({
              status: ob.status,
              competence: ob.competence,
              balancePayable: ob.principalAmount ?? undefined,
            })),
            blockingReasons: [],
          }
        : null;

    // Transition evidence requirements from income summary (2026+)
    const transitionEvidenceRequirements: Array<{
      assetId: string;
      ticker?: string;
      isVerified: boolean;
      sourceFingerprint?: string;
    }> = [];

    if (calendarYear >= 2026 && investmentIncomeSummary) {
      for (const payer of investmentIncomeSummary.payers ?? []) {
        if (payer.dividendGross !== '0' && !payer.isComplete) {
          transitionEvidenceRequirements.push({
            assetId: payer.payerId,
            ticker: payer.payerDisplayName,
            isVerified: false,
          });
        }
      }
    }

    // FII eligibility requirements from income summary
    const fiiEligibilityItems: Array<{
      assetId: string;
      ticker: string;
      isExempt: boolean;
      requiresConfirmation: boolean;
      sourceFingerprint?: string;
    }> = [];

    if (investmentIncomeSummary) {
      for (const payer of investmentIncomeSummary.payers ?? []) {
        if (payer.fiiIncomeGross !== '0') {
          fiiEligibilityItems.push({
            assetId: payer.payerId,
            ticker: payer.payerDisplayName,
            isExempt: false,
            requiresConfirmation: !payer.isComplete,
          });
        }
      }
    }

    const hasCapitalMarketActivity =
      capitalMarketSummary &&
      (capitalMarketSummary.normalEquities.totalGrossSales !== '0' ||
        capitalMarketSummary.normalEquities.totalTaxableProfits !== '0' ||
        capitalMarketSummary.dayTrade.totalGrossProfits !== '0' ||
        capitalMarketSummary.fii.totalGrossProfits !== '0' ||
        capitalMarketSummary.obligations6015.monthsWithLiabilityCount > 0);

    const hasIncomeActivity =
      investmentIncomeSummary &&
      investmentIncomeSummary.payers &&
      investmentIncomeSummary.payers.length > 0 &&
      investmentIncomeSummary.totalGrossIncome !== '0';

    const assessment = buildAnnualTaxReadinessAssessment({
      calendarYear,
      openingPositions: openingPositionsInput,
      annualPositions:
        portfolios && portfolios.length > 0
          ? {
              positions: [],
              blockingReasons: [],
            }
          : null,
      capitalMarketSummary: capitalMarketSummary
        ? {
            overallStatus: !hasCapitalMarketActivity
              ? 'NO_ACTIVITY'
              : capitalMarketSummary.isComplete
                ? 'READY'
                : 'PARTIAL',
            blockingReasons: capitalMarketSummary.qualityIssues ?? [],
            months: capitalMarketSummary.months.map((m) => ({
              status:
                m.normalEquities.grossSaleAmount === '0' &&
                m.dayTrade.profitOrLoss === '0' &&
                m.fii.profitOrLoss === '0'
                  ? 'EMPTY'
                  : 'COMPLETE',
              month: m.month,
            })),
          }
        : null,
      payments6015: payments6015Input,
      transitionEvidence:
        transitionEvidenceRequirements.length > 0
          ? {
              requirements: transitionEvidenceRequirements,
              blockingReasons: [],
            }
          : null,
      fiiEligibility:
        fiiEligibilityItems.length > 0
          ? {
              items: fiiEligibilityItems,
              blockingReasons: [],
            }
          : null,
      withholdingEvidence: null,
      investmentIncomeSummary: investmentIncomeSummary
        ? {
            overallStatus: !hasIncomeActivity ? 'NO_ACTIVITY' : investmentIncomeSummary.status,
            blockingReasons: [],
            payers: investmentIncomeSummary.payers.map((p) => ({
              assetId: p.payerId,
              status: p.isComplete ? 'COMPLETE' : 'REQUIRES_CONFIRMATION',
            })),
          }
        : null,

      taxpayerConfirmations: domainConfirmations,
    });

    return mapAssessmentToReadModel(assessment, confirmationRows);
  }
}
