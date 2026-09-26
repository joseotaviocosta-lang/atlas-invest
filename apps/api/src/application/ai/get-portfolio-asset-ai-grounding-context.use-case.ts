import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPortfolioAssetAiGroundingContext,
  PortfolioAssetAiGroundingContextV1,
  AssetPositionCanonicalData,
} from '@atlas/ai-engine';
import { ITransactionRepository, IAssetRepository } from '@atlas/database';
import { Money, Quantity, Percentage } from '@atlas/domain';
import { replayPortfolio } from '@atlas/portfolio-engine';
import { TRANSACTION_REPOSITORY, ASSET_REPOSITORY } from '../../database/tokens';
import { GetPortfolioIntelligenceSummaryUseCase } from '../performance/get-portfolio-intelligence-summary.use-case';
import { GetPortfolioValuationUseCase } from '../valuation/get-portfolio-valuation.use-case';

export interface GetPortfolioAssetAiGroundingContextParams {
  portfolioId: string;
  userId: string;
  assetId: string;
  startDate?: string;
  endDate?: string;
}

/**
 * GetPortfolioAssetAiGroundingContextUseCase (Phase 3W, ADR-210–ADR-215)
 *
 * Transports canonical asset position data into a versioned, bounded,
 * immutable AI grounding context for asset-scoped queries.
 *
 * Invariants:
 * - Portfolio ownership validated (anti-enumeration 404)
 * - Asset presence in portfolio verified (404 if not found in custody)
 * - Zero new financial calculation algorithms (all data from Portfolio & Valuation engines)
 * - Zero float math (uses Money, Quantity, Percentage)
 * - Exact-decimal representation
 */
@Injectable()
export class GetPortfolioAssetAiGroundingContextUseCase {
  constructor(
    @Inject(GetPortfolioIntelligenceSummaryUseCase)
    private readonly getIntelligenceSummaryUseCase: GetPortfolioIntelligenceSummaryUseCase,
    @Inject(GetPortfolioValuationUseCase)
    private readonly getPortfolioValuationUseCase: GetPortfolioValuationUseCase,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
  ) {}

  async execute(
    params: GetPortfolioAssetAiGroundingContextParams,
  ): Promise<PortfolioAssetAiGroundingContextV1> {
    // 1. Ownership & portfolio intelligence summary
    const summary = await this.getIntelligenceSummaryUseCase.execute({
      portfolioId: params.portfolioId,
      userId: params.userId,
      startDate: params.startDate,
      endDate: params.endDate,
    });

    // 2. Valuation read model (contains prices, market values, unrealized gain/loss)
    const valuation = await this.getPortfolioValuationUseCase.execute({
      portfolioId: params.portfolioId,
      userId: params.userId,
    });

    // 3. Find asset in custody
    const pos = valuation.positions.find((p) => p.assetId === params.assetId);
    if (!pos) {
      throw new NotFoundException({
        message: `Asset with id '${params.assetId}' not found in portfolio '${params.portfolioId}'`,
        code: 'PORTFOLIO.ASSET_NOT_FOUND',
      });
    }

    // 4. Asset metadata (name, ticker, etc.)
    const assetMeta = await this.assetRepository.findById(params.assetId);

    // 5. Replay portfolio ledger for realized disposals and income events of target asset
    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId);
    const replay = replayPortfolio({
      portfolioId: params.portfolioId,
      transactions,
    });

    // Asset-specific realized disposals
    const assetDisposals = replay.state.realizedDisposals.filter(
      (d) => String(d.assetId) === params.assetId,
    );
    let realizedGain: string | null | undefined = undefined;
    if (assetDisposals.length > 0) {
      const hasIncomplete = assetDisposals.some(
        (d) => d.status === 'INCOMPLETE' || !d.realizedGainLoss,
      );
      if (hasIncomplete) {
        realizedGain = null;
      } else {
        let totalGain = Money.zero(pos.currency);
        for (const d of assetDisposals) {
          if (d.realizedGainLoss) {
            totalGain = totalGain.add(d.realizedGainLoss);
          }
        }
        realizedGain = totalGain.amount;
      }
    }

    // Asset-specific income events
    const assetIncomeEvents = replay.state.incomeEvents.filter(
      (i) => String(i.assetId) === params.assetId,
    );
    let totalIncome: string | null | undefined = undefined;
    let dividends: string | null | undefined = undefined;
    let jcp: string | null | undefined = undefined;

    if (assetIncomeEvents.length > 0) {
      let divSum = Money.zero(pos.currency);
      let jcpSum = Money.zero(pos.currency);
      let totSum = Money.zero(pos.currency);

      for (const inc of assetIncomeEvents) {
        totSum = totSum.add(inc.amount);
        if (inc.type === 'DIVIDEND') {
          divSum = divSum.add(inc.amount);
        } else if (inc.type === 'JCP') {
          jcpSum = jcpSum.add(inc.amount);
        }
      }
      totalIncome = totSum.amount;
      dividends = divSum.amount;
      jcp = jcpSum.amount;
    }

    // Allocation percentage relative to currency total
    let portfolioPercentage: string | null | undefined = undefined;
    const currencyTotals = valuation.totalsByCurrency[pos.currency];
    if (pos.marketValue && currencyTotals?.marketValue) {
      try {
        const posQty = Quantity.from(pos.marketValue.amount);
        const totalQty = Quantity.from(currencyTotals.marketValue.amount);
        if (!totalQty.isZero()) {
          const ratio = posQty.divide(totalQty);
          const percentQty = ratio.multiply(Quantity.from('100'));
          portfolioPercentage = Percentage.from(percentQty.value).value;
        }
      } catch {
        portfolioPercentage = null;
      }
    }

    const canonicalAssetData: AssetPositionCanonicalData = {
      assetId: params.assetId,
      symbol: pos.ticker ?? assetMeta?.ticker ?? params.assetId,
      name: assetMeta?.name,
      assetType: pos.assetType ?? assetMeta?.type,
      currency: pos.currency,
      quantity: pos.quantity,
      averageCost: pos.averageCost ? pos.averageCost.amount : null,
      costBasis: pos.totalCost ? pos.totalCost.amount : null,
      marketPrice: pos.quote ? pos.quote.price : null,
      marketValue: pos.marketValue ? pos.marketValue.amount : null,
      unrealizedGain: pos.unrealizedGainLoss ? pos.unrealizedGainLoss.amount : null,
      unrealizedGainPercentage: pos.unrealizedGainLossPercent ?? null,
      realizedGain,
      totalIncome,
      dividends,
      jcp,
      portfolioPercentage,
      asOf: valuation.asOf ?? summary.asOf,
    };

    return buildPortfolioAssetAiGroundingContext(summary, canonicalAssetData);
  }
}
