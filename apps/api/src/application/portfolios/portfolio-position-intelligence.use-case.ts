import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type { Transaction } from '@atlas/domain';
import type {
  IAssetRepository,
  IPortfolioRepository,
  ITransactionRepository,
} from '@atlas/database';
import {
  ASSET_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import { GetPortfolioAllocationUseCase } from '../valuation/get-portfolio-allocation.use-case';
import { GetPortfolioValuationUseCase } from '../valuation/get-portfolio-valuation.use-case';
import { GetPortfolioHistoryUseCase } from './get-portfolio-history.use-case';
import {
  aggregatePositionIncome,
  derivePositionActivity,
  POSITION_RECENT_ACTIVITY_LIMIT,
  type PositionActivityRow,
  type PositionIncomeEvent,
  type PositionIncomeTotals,
  type PositionLedgerRow,
} from './portfolio-position-intelligence.compose';

export interface PositionRealizedDisposal {
  transactionId: string;
  tradeDate: string;
  quantity: string;
  grossProceeds: { amount: string; currency: string };
  sellingCosts: { amount: string; currency: string };
  netProceeds: { amount: string; currency: string };
  costBasisRemoved: { amount: string; currency: string } | null;
  realizedGainLoss: { amount: string; currency: string } | null;
  realizedReturnPercentage: string | null;
  status: string;
}

type RawLedgerValue = {
  id?: { toString(): string };
  type?: string;
  tradeDate?: { toString(): string };
  currency?: string;
  createdAt?: Date | string;
  quantity?: { value?: string };
  unitPrice?: { amount?: string };
  amount?: { amount?: string };
};

function toLedgerRow(tx: Transaction): PositionLedgerRow | null {
  const candidate = tx as unknown as RawLedgerValue;
  const id = candidate.id?.toString();
  const tradeDate = candidate.tradeDate?.toString();
  if (
    typeof id !== 'string' ||
    typeof candidate.type !== 'string' ||
    typeof tradeDate !== 'string' ||
    typeof candidate.currency !== 'string'
  ) {
    return null;
  }
  const createdAt =
    candidate.createdAt instanceof Date
      ? candidate.createdAt.toISOString()
      : typeof candidate.createdAt === 'string'
        ? candidate.createdAt
        : '';
  return {
    id,
    type: candidate.type,
    tradeDate,
    currency: candidate.currency,
    createdAt,
    quantity: candidate.quantity?.value ?? null,
    unitPrice: candidate.unitPrice?.amount ?? null,
    amount: candidate.amount?.amount ?? null,
  };
}

/**
 * Phase 5R-A — position intelligence (read-only composition).
 *
 * One integrated answer per open position, composed from canonical
 * sources only: replay state + valuation + allocation + ledger scan +
 * history (realized disposals). No new engine, no persistence, no
 * recommendations. Per-position performance does not exist canonically,
 * so performance is always null with an explicit limitation (5R-B
 * material). Closed/never-held assets 404.
 */
@Injectable()
export class GetPortfolioPositionIntelligenceUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assets: IAssetRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactions: ITransactionRepository,
    @Inject(GetPortfolioValuationUseCase)
    private readonly valuation: GetPortfolioValuationUseCase,
    @Inject(GetPortfolioAllocationUseCase)
    private readonly allocation: GetPortfolioAllocationUseCase,
    @Inject(GetPortfolioHistoryUseCase)
    private readonly history: GetPortfolioHistoryUseCase,
  ) {}

  async execute(params: { portfolioId: string; assetId: string; userId: string }): Promise<{
    portfolioId: string;
    assetId: string;
    generatedAt: string;
    marketDataAsOf: string | null;
    asset: {
      id: string;
      ticker: string | null;
      name: string | null;
      type: string | null;
      currency: string | null;
    } | null;
    position: {
      quantity: string;
      currency: string;
      costBasisStatus: 'KNOWN' | 'INCOMPLETE';
      totalCost: { amount: string; currency: string } | null;
      averageCost: { amount: string; currency: string } | null;
      isOpen: boolean;
    };
    valuation: {
      status: string;
      price: { amount: string; currency: string; asOf: string } | null;
      marketValue: { amount: string; currency: string } | null;
      unrealizedGainLoss: { amount: string; currency: string } | null;
      unrealizedGainLossPercent: string | null;
      quoteFreshness: string | null;
      quoteStatus: string | null;
    };
    allocation: {
      weightPercent: string | null;
      weightDenominator: { amount: string; currency: string } | null;
      translatedWeightPercent: string | null;
      reportingMarketValue: { amount: string; currency: string } | null;
      reportingCurrency: string | null;
      coveragePercent: string;
      partialCoverage: boolean;
    };
    performance: null;
    income: {
      totalsByCurrency: PositionIncomeTotals[];
      recent: PositionIncomeEvent[];
    };
    realizedDisposals: PositionRealizedDisposal[];
    recentActivity: PositionActivityRow[];
    dataQuality: {
      valuationStatus: string;
      priceAsOf: string | null;
      quoteFreshness: string | null;
      quoteStatus: string | null;
      valuationCoveragePercent: string;
      partialCoverage: boolean;
    };
    limitations: string[];
  }> {
    const portfolio = params.userId
      ? await this.portfolios.findByIdAndUserId(params.portfolioId, params.userId)
      : await this.portfolios.findById(params.portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', params.portfolioId);
    }

    const [valuation, allocation, asset, ledger, realized] = await Promise.all([
      this.valuation.execute({ portfolioId: params.portfolioId, userId: params.userId }),
      this.allocation.execute({ portfolioId: params.portfolioId, userId: params.userId }),
      this.assets.findById(params.assetId),
      this.transactions.findByPortfolioId(params.portfolioId, { assetId: params.assetId }),
      this.history.execute({
        portfolioId: params.portfolioId,
        userId: params.userId,
        assetId: params.assetId,
        type: 'realized',
        limit: POSITION_RECENT_ACTIVITY_LIMIT,
      }),
    ]);

    const position = valuation.positions.find((row) => row.assetId === params.assetId);
    if (!position) {
      // Closed or never-held assets have no current position: 404, never a
      // zeroed generic position.
      throw new EntityNotFoundError('Position', params.assetId);
    }

    const bucket = allocation.currencies[position.currency];
    const bucketWeight = bucket?.byAsset.find((row) => row.assetId === params.assetId) ?? null;
    const translated =
      allocation.translatedAllocation?.status === 'AVAILABLE'
        ? (allocation.translatedAllocation.byAsset.find((row) => row.assetId === params.assetId) ??
          null)
        : null;

    const ledgerRows: PositionLedgerRow[] = [];
    for (const tx of ledger) {
      const row = toLedgerRow(tx);
      if (row) ledgerRows.push(row);
    }
    const income = aggregatePositionIncome(ledgerRows);
    const recentActivity = derivePositionActivity(ledgerRows);

    const realizedDisposals: PositionRealizedDisposal[] = [];
    for (const item of realized.items) {
      if (item.kind !== 'REALIZED_DISPOSAL') continue;
      const details = item.details as Record<string, unknown>;
      const money = (value: unknown): { amount: string; currency: string } | null => {
        if (
          typeof value === 'object' &&
          value !== null &&
          typeof (value as { amount?: unknown }).amount === 'string' &&
          typeof (value as { currency?: unknown }).currency === 'string'
        ) {
          return {
            amount: (value as { amount: string }).amount,
            currency: (value as { currency: string }).currency,
          };
        }
        return null;
      };
      const grossProceeds = money(details['grossProceeds']);
      const sellingCosts = money(details['sellingCosts']);
      const netProceeds = money(details['netProceeds']);
      if (
        typeof details['quantity'] !== 'string' ||
        !grossProceeds ||
        !sellingCosts ||
        !netProceeds
      ) {
        continue;
      }
      realizedDisposals.push({
        transactionId: item.transactionId,
        tradeDate: item.tradeDate,
        quantity: details['quantity'] as string,
        grossProceeds,
        sellingCosts,
        netProceeds,
        costBasisRemoved: money(details['costBasisRemoved']),
        realizedGainLoss: money(details['realizedGainLoss']),
        realizedReturnPercentage:
          typeof details['realizedReturnPercentage'] === 'string'
            ? (details['realizedReturnPercentage'] as string)
            : null,
        status: typeof details['status'] === 'string' ? (details['status'] as string) : 'UNKNOWN',
      });
    }

    const limitations: string[] = [];
    if (position.status === 'QUOTE_UNAVAILABLE') limitations.push('MISSING_PRICE');
    if (position.status === 'QUOTE_STALE') limitations.push('STALE_PRICE');
    // Reporting currency is the portfolio base currency; the translated
    // allocation only carries converted values when fully available.
    const baseCurrency = (portfolio as { baseCurrency?: unknown }).baseCurrency;
    const reportingCurrency =
      allocation.translatedAllocation?.reportingCurrency ??
      (typeof baseCurrency === 'string' && baseCurrency !== '' ? baseCurrency : null) ??
      position.currency;
    if (position.currency !== reportingCurrency && translated === null) {
      limitations.push('NO_FX_TRANSLATION');
    }
    const partialCoverage = allocation.status !== 'COMPLETE';
    if (partialCoverage) limitations.push('PARTIAL_PORTFOLIO_VALUATION');
    // 5R-A has no canonical per-position performance engine: always null.
    limitations.push('POSITION_PERFORMANCE_NOT_AVAILABLE');
    if (position.costBasisStatus === 'INCOMPLETE') limitations.push('COST_BASIS_NOT_AVAILABLE');
    if (income.totalsByCurrency.length === 0) limitations.push('NO_INCOME_HISTORY');

    return {
      portfolioId: params.portfolioId,
      assetId: params.assetId,
      generatedAt: new Date().toISOString(),
      marketDataAsOf: valuation.asOf,
      asset: asset
        ? {
            id: String(asset.id),
            ticker: asset.ticker,
            name: asset.name,
            type: String(asset.type),
            currency: String(asset.currency),
          }
        : null,
      position: {
        quantity: position.quantity,
        currency: position.currency,
        costBasisStatus: position.costBasisStatus,
        totalCost: position.totalCost,
        averageCost: position.averageCost,
        isOpen: true,
      },
      valuation: {
        status: position.status,
        price: position.quote
          ? {
              amount: position.quote.price,
              currency: position.quote.currency,
              asOf: position.quote.asOf,
            }
          : null,
        marketValue: position.marketValue,
        unrealizedGainLoss: position.unrealizedGainLoss,
        unrealizedGainLossPercent: position.unrealizedGainLossPercent,
        quoteFreshness: position.quoteFreshness,
        quoteStatus: position.quoteStatus,
      },
      allocation: {
        weightPercent: bucketWeight?.allocationPercent ?? null,
        weightDenominator: bucket?.totalMarketValue ?? null,
        translatedWeightPercent: translated?.allocationPercent ?? null,
        reportingMarketValue: translated?.reportingMarketValue ?? null,
        reportingCurrency,
        coveragePercent: allocation.valuationCoveragePercent,
        partialCoverage,
      },
      performance: null,
      income,
      realizedDisposals,
      recentActivity,
      dataQuality: {
        valuationStatus: position.status,
        priceAsOf: position.quote?.asOf ?? null,
        quoteFreshness: position.quoteFreshness,
        quoteStatus: position.quoteStatus,
        valuationCoveragePercent: allocation.valuationCoveragePercent,
        partialCoverage,
      },
      limitations,
    };
  }
}
