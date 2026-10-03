import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import {
  ITaxpayerConfirmationRepository,
  IPortfolioRepository,
} from '@atlas/database';
import {
  TAXPAYER_CONFIRMATION_REPOSITORY,
  PORTFOLIO_REPOSITORY,
} from '../../database/tokens';
import {
  buildAnnualTaxReportingPackage,
  isValidCalendarYear,
} from '@atlas/tax-engine';
import { mapTaxpayerConfirmationRowToDomain } from './annual-tax-readiness.read-model';
import { GetAnnualCapitalMarketSummaryUseCase } from './get-annual-capital-market-summary.use-case';
import { GetAnnualInvestmentIncomeSummaryUseCase } from './get-annual-investment-income-summary.use-case';
import { GetAnnualPositionReportUseCase } from './get-annual-position-report.use-case';
import {
  AnnualTaxReportingReadModel,
  mapReportingPackageToReadModel,
} from './annual-tax-reporting.read-model';

export interface GetAnnualTaxReportingQuery {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
}

@Injectable()
export class GetAnnualTaxReportingPackageUseCase {
  constructor(
    @Inject(TAXPAYER_CONFIRMATION_REPOSITORY)
    private readonly confirmationRepo: ITaxpayerConfirmationRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepo: IPortfolioRepository,
    @Inject(GetAnnualCapitalMarketSummaryUseCase)
    private readonly capitalMarketSummaryUseCase: GetAnnualCapitalMarketSummaryUseCase,
    @Inject(GetAnnualInvestmentIncomeSummaryUseCase)
    private readonly investmentIncomeSummaryUseCase: GetAnnualInvestmentIncomeSummaryUseCase,
    @Inject(GetAnnualPositionReportUseCase)
    private readonly positionReportUseCase: GetAnnualPositionReportUseCase,
  ) {}

  async execute(query: GetAnnualTaxReportingQuery): Promise<AnnualTaxReportingReadModel> {
    if (!isValidCalendarYear(query.calendarYear)) {
      throw new BadRequestException(
        `Invalid calendarYear: ${query.calendarYear}. Must be an integer between 1900 and 2100.`,
      );
    }

    const { taxSubjectId, calendarYear } = query;

    // Fetch user portfolios and baseline summaries concurrently
    const [
      capitalMarketSummary,
      investmentIncomeSummary,
      portfolios,
      confirmationRows,
    ] = await Promise.all([
      this.capitalMarketSummaryUseCase.execute({ taxSubjectId, calendarYear }).catch(() => null),
      this.investmentIncomeSummaryUseCase.execute({ taxSubjectId, calendarYear }).catch(() => null),
      this.portfolioRepo.findByUserId(taxSubjectId),
      this.confirmationRepo.listByYear({ taxSubjectId, calendarYear }),
    ]);

    const confirmations = confirmationRows.map(mapTaxpayerConfirmationRowToDomain);

    // Fetch position reports for all portfolios
    const positionReports = await Promise.all(
      (portfolios ?? []).map((p) =>
        this.positionReportUseCase
          .execute({ taxSubjectId, portfolioId: p.id, calendarYear })
          .catch(() => null),
      ),
    );

    const allPositions = positionReports
      .filter((pr): pr is NonNullable<typeof pr> => Boolean(pr))
      .flatMap((pr) => pr.positions);

    const positionsInput =
      allPositions.length > 0
        ? {
            positions: allPositions.map((p) => ({
              assetId: p.assetId,
              ticker: p.ticker,
              assetType: p.assetCategory,
              closingQuantity: p.quantity,
              closingTotalCost: p.totalHistoricalCost ?? '0.00',
              openingQuantity: p.quantity,
              openingTotalCost: p.totalHistoricalCost ?? '0.00',
              costBasisStatus: p.costBasisStatus,
              isBlocked: p.completenessStatus === 'BLOCKED',
              blockingReasons: p.blockingReasons,
              isSoldOut: p.quantity === '0' || !p.quantity,
            })),
            blockingReasons: positionReports
              .filter((pr): pr is NonNullable<typeof pr> => Boolean(pr))
              .flatMap((pr) => pr.summary.blockedPositionsCount > 0 ? ['BLOCKED_POSITIONS_PRESENT'] : []),
          }
        : null;

function isNonZero(val?: string | null): boolean {
  if (!val) return false;
  const s = val.trim();
  return s !== '0' && s !== '0.0' && s !== '0.00' && s !== '0.000000000000000000';
}

    const hasCapitalMarketActivity =
      Boolean(capitalMarketSummary) &&
      (isNonZero(capitalMarketSummary?.normalEquities?.totalGrossSales) ||
        isNonZero(capitalMarketSummary?.normalEquities?.totalTaxableProfits) ||
        isNonZero(capitalMarketSummary?.normalEquities?.totalLossesIncurred) ||
        isNonZero(capitalMarketSummary?.dayTrade?.totalGrossProfits) ||
        isNonZero(capitalMarketSummary?.fii?.totalGrossProfits) ||
        (capitalMarketSummary?.obligations6015?.monthsWithLiabilityCount ?? 0) > 0);

    const cmInput =
      capitalMarketSummary && hasCapitalMarketActivity
        ? {
            overallStatus: capitalMarketSummary.isComplete ? 'READY' : 'PARTIAL',
            blockingReasons: capitalMarketSummary.qualityIssues,
            normalEquities: {
              netGain: capitalMarketSummary.normalEquities?.totalTaxableProfits,
              exemptSalesGross: capitalMarketSummary.normalEquities?.totalGrossSales,
              exemptSalesNetGain: capitalMarketSummary.normalEquities?.totalExemptProfits,
              endingLossCarry: capitalMarketSummary.lossCarry?.normalEquities?.closingLossDecember31,
              irrfTotalWithheld: capitalMarketSummary.normalEquities?.totalIrrfDeducted,
              irrfTerminalBalance: capitalMarketSummary.normalEquities?.uncompensatedIrrf,
              irrfTerminalStatus: capitalMarketSummary.normalEquities?.uncompensatedIrrfTerminalState,
            },
            dayTrade: {
              netGain: capitalMarketSummary.dayTrade?.totalNetTaxableBase,
              endingLossCarry: capitalMarketSummary.lossCarry?.dayTrade?.closingLossDecember31,
              irrfTotalWithheld: capitalMarketSummary.dayTrade?.totalIrrfDeducted,
              irrfTerminalBalance: capitalMarketSummary.dayTrade?.uncompensatedIrrf,
              irrfTerminalStatus: capitalMarketSummary.dayTrade?.uncompensatedIrrfTerminalState,
            },
            fii: {
              netGain: capitalMarketSummary.fii?.totalNetTaxableBase,
              endingLossCarry: capitalMarketSummary.lossCarry?.fii?.closingLossDecember31,
            },
            obligations6015: {
              totalPaid: capitalMarketSummary.obligations6015?.totalPaid,
              totalBalancePayable: capitalMarketSummary.obligations6015?.totalPrincipalDue,
              items: (capitalMarketSummary.months ?? [])
                .filter((m) => m.darf6015 && m.darf6015.status !== 'EXEMPT')
                .map((m) => ({
                  competence: m.competence,
                  status: m.darf6015.status,
                  balancePayable: m.darf6015.principalAmount,
                  paidAmount: m.darf6015.paidAmount,
                })),
            },
          }
        : null;

    const hasIncomeActivity =
      Boolean(investmentIncomeSummary) &&
      Boolean(investmentIncomeSummary?.payers?.length) &&
      isNonZero(investmentIncomeSummary?.totalGrossIncome);

    const incomeInput =
      investmentIncomeSummary && hasIncomeActivity
        ? {
            overallStatus: investmentIncomeSummary.status,
            blockingReasons: investmentIncomeSummary.blockingReasons,
            payers: (investmentIncomeSummary.payers ?? []).flatMap((p) => {
              const items = [];
              if (p.dividendGross && p.dividendGross !== '0.00' && p.dividendGross !== '0') {
                items.push({
                  assetId: p.payerId,
                  ticker: p.payerDisplayName,
                  payerName: p.payerDisplayName,
                  payerDocument: p.payerId,
                  incomeType: 'DIVIDEND',
                  taxTreatment: 'EXEMPT',
                  grossAmount: p.dividendGross,
                  withheldAmount: '0.00',
                  netAmount: p.dividendGross,
                });
              }
              if (p.jcpGross && p.jcpGross !== '0.00' && p.jcpGross !== '0') {
                const withheld = p.jcpWithheld ?? '0.00';
                items.push({
                  assetId: p.payerId,
                  ticker: p.payerDisplayName,
                  payerName: p.payerDisplayName,
                  payerDocument: p.payerId,
                  incomeType: 'JCP',
                  taxTreatment: 'EXCLUSIVE',
                  grossAmount: p.jcpGross,
                  withheldAmount: withheld,
                  netAmount: p.jcpGross,
                });
              }
              if (p.fiiIncomeGross && p.fiiIncomeGross !== '0.00' && p.fiiIncomeGross !== '0') {
                items.push({
                  assetId: p.payerId,
                  ticker: p.payerDisplayName,
                  payerName: p.payerDisplayName,
                  payerDocument: p.payerId,
                  incomeType: 'FII_INCOME',
                  taxTreatment: 'EXEMPT',
                  grossAmount: p.fiiIncomeGross,
                  withheldAmount: '0.00',
                  netAmount: p.fiiIncomeGross,
                });
              }
              return items;
            }),
          }
        : null;

    const domainPackage = buildAnnualTaxReportingPackage({
      taxSubjectId,
      calendarYear,
      annualPositions: positionsInput,
      capitalMarketSummary: cmInput,
      investmentIncomeSummary: incomeInput,
      taxpayerConfirmations: confirmations,
    });

    return mapReportingPackageToReadModel(domainPackage);
  }
}
