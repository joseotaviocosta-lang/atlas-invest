import { Inject, Injectable } from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository, IAssetRepository } from '@atlas/database';
import {
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
  ASSET_REPOSITORY,
} from '../../database/tokens';
import {
  buildAnnualInvestmentIncomeSummary,
  IncomeEventInputData,
  IncomeType,
} from '@atlas/tax-engine';
import type { UnifiedLoadScope } from './in-flight-memo';
import {
  AnnualInvestmentIncomeSummaryReadModel,
  mapAnnualInvestmentIncomeSummaryToReadModel,
} from './annual-investment-income.read-model';

export interface GetAnnualInvestmentIncomeSummaryInput {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  /**
   * Optional composed-load scope (Phase 4J.1). When present, the unified
   * orchestration service de-duplicates the direct and transitive calls to this
   * use-case within one load snapshot. Absent for every standalone 4H.4 route,
   * which computes directly (NO process-wide memo).
   */
  readonly scope?: UnifiedLoadScope;
}

@Injectable()
export class GetAnnualInvestmentIncomeSummaryUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
  ) {}

  async execute(
    input: GetAnnualInvestmentIncomeSummaryInput,
  ): Promise<AnnualInvestmentIncomeSummaryReadModel> {
    if (input.scope) {
      return input.scope.memo.run(`INCOME:${input.taxSubjectId}:${input.calendarYear}`, () =>
        this.compute(input),
      );
    }
    return this.compute(input);
  }

  private async compute(
    input: GetAnnualInvestmentIncomeSummaryInput,
  ): Promise<AnnualInvestmentIncomeSummaryReadModel> {
    const calendarYear = input.calendarYear;
    const taxSubjectId = input.taxSubjectId;

    // Fetch user portfolios
    const portfolios = await this.portfolioRepository.findByUserId(taxSubjectId);
    if (!portfolios || portfolios.length === 0) {
      const emptySummary = buildAnnualInvestmentIncomeSummary({
        calendarYear,
        taxSubjectId,
        events: [],
      });
      return mapAnnualInvestmentIncomeSummaryToReadModel(emptySummary);
    }

    const incomeEvents: IncomeEventInputData[] = [];
    const assetIdSet = new Set<string>();

    const startDate = `${calendarYear}-01-01`;
    const endDate = `${calendarYear}-12-31`;

    for (const portfolio of portfolios) {
      const transactions = await this.transactionRepository.findByPortfolioId(portfolio.id);
      for (const tx of transactions) {
        const txDate =
          tx.tradeDate instanceof Date
            ? tx.tradeDate.toISOString().slice(0, 10)
            : String(tx.tradeDate);
        if (txDate >= startDate && txDate <= endDate) {
          if (tx.type === 'DIVIDEND' || tx.type === 'JCP' || tx.type === 'FII_INCOME') {
            const incomeTx = tx as {
              id: string;
              type: IncomeType;
              assetId: { value?: string } | string;
              amount: { amount: string; currency: string } | string;
              tradeDate: { toString(): string } | string;
            };

            const assetIdStr =
              typeof incomeTx.assetId === 'string'
                ? incomeTx.assetId
                : (incomeTx.assetId.value ?? String(incomeTx.assetId));

            assetIdSet.add(assetIdStr);

            incomeEvents.push({
              incomeEventId: incomeTx.id,
              incomeType: incomeTx.type,
              assetId: assetIdStr,
              paymentDate: txDate,
              grossAmount:
                typeof incomeTx.amount === 'string' ? incomeTx.amount : incomeTx.amount.amount,
              currency:
                typeof incomeTx.amount === 'string'
                  ? 'BRL'
                  : (incomeTx.amount.currency as 'BRL' | 'USD'),
            });
          }
        }
      }
    }

    // Resolve Asset Metadata for payer details and FII eligibility
    const assetMap = new Map<string, { ticker: string; name: string; type: string }>();
    if (assetIdSet.size > 0) {
      const assetIds = Array.from(assetIdSet);
      const assets = await this.assetRepository.findByIds(assetIds as never);
      for (const a of assets) {
        const aId =
          typeof a.id === 'string' ? a.id : ((a.id as { value?: string }).value ?? String(a.id));
        assetMap.set(aId, {
          ticker: a.ticker,
          name: a.name,
          type: a.type,
        });
      }
    }

    const enrichedEvents: IncomeEventInputData[] = incomeEvents.map((evt) => {
      const asset = assetMap.get(evt.assetId);
      const isFii = asset?.type === 'FII' || evt.incomeType === 'FII_INCOME';

      return {
        ...evt,
        payerId: asset?.ticker ?? evt.assetId,
        payerDisplayName: asset?.name ?? asset?.ticker ?? evt.assetId,
        fiiEligibility: isFii
          ? {
              isListed: true,
              investorCountAtLeast100: true,
              beneficiaryOwnershipLessThan10Percent: true,
              isVerified: true,
            }
          : undefined,
      };
    });

    const domainSummary = buildAnnualInvestmentIncomeSummary({
      calendarYear,
      taxSubjectId,
      events: enrichedEvents,
    });

    return mapAnnualInvestmentIncomeSummaryToReadModel(domainSummary);
  }
}
