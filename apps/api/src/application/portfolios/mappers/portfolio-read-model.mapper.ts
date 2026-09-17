import {
  ReplayResult,
  AssetState,
  AccountState,
  RealizedSummary,
  IncomeSummary,
  CashFlowSummary,
} from '@atlas/portfolio-engine';
import { Currency } from '@atlas/domain';
import { BadRequestException } from '@nestjs/common';
import {
  PortfolioStateReadModel,
  PortfolioPositionReadModel,
  PortfolioPositionsReadModel,
  AccountStateReadModel,
  RealizedSummaryReadModel,
  IncomeSummaryReadModel,
  CashFlowSummaryReadModel,
  PortfolioHistoryItemReadModel,
  PortfolioHistoryReadModel,
} from '../read-models/types';

export interface HistoryFilterOptions {
  type?: 'realized' | 'income' | 'cash-flow' | 'corporate-action' | 'transfer';
  from?: string;
  to?: string;
  accountId?: string;
  assetId?: string;
  cursor?: string;
  limit?: number;
}

export class PortfolioReadModelMapper {
  static toStateReadModel(
    result: ReplayResult,
    portfolioId: string,
    asOfDate?: string | null,
  ): PortfolioStateReadModel {
    // 1. Consolidated positions sorted by assetId ASC
    const positions = Array.from<AssetState>(result.state.assets.values())
      .sort((a, b) => String(a.assetId).localeCompare(String(b.assetId)))
      .map(PortfolioReadModelMapper.mapPosition);

    // 2. Account states sorted by accountId ASC
    const accounts = Array.from<AccountState>(result.state.accounts.values())
      .sort((a, b) => String(a.accountId).localeCompare(String(b.accountId)))
      .map((acc: AccountState): AccountStateReadModel => {
        const accPositions = Array.from<AssetState>(acc.assets.values())
          .sort((a, b) => String(a.assetId).localeCompare(String(b.assetId)))
          .map(PortfolioReadModelMapper.mapPosition);

        return {
          accountId: String(acc.accountId),
          positions: accPositions,
          realizedSummaries: PortfolioReadModelMapper.mapRealizedSummaries(acc.realizedSummary),
          incomeSummaries: PortfolioReadModelMapper.mapIncomeSummaries(acc.incomeSummary),
          cashFlowSummaries: PortfolioReadModelMapper.mapCashFlowSummaries(acc.cashFlowSummary),
        };
      });

    // 3. Consolidated summaries
    const realizedSummaries = PortfolioReadModelMapper.mapRealizedSummaries(
      result.state.realizedSummary,
    );
    const incomeSummaries = PortfolioReadModelMapper.mapIncomeSummaries(result.state.incomeSummary);
    const cashFlowSummaries = PortfolioReadModelMapper.mapCashFlowSummaries(
      result.state.cashFlowSummary,
    );

    // 4. Completeness
    const hasIncompleteCostBasis = Array.from<AssetState>(result.state.assets.values()).some(
      (pos: AssetState) => pos.costBasisStatus === 'INCOMPLETE',
    );

    return {
      portfolioId,
      asOfDate: asOfDate ?? null,
      engineVersion: result.engineVersion,
      completeness: {
        costBasis: hasIncompleteCostBasis ? 'INCOMPLETE' : 'COMPLETE',
      },
      positions,
      accounts,
      realizedSummaries,
      incomeSummaries,
      cashFlowSummaries,
      replayMetadata: {
        engineVersion: result.engineVersion,
        asOfDate: asOfDate ?? null,
        processedTransactionCount: result.totalProcessedCount,
        appliedTransactionCount: result.appliedTransactions.length,
        deferredTransactionCount: result.deferredEvents.length,
        hasIncompleteCostBasis,
      },
    };
  }

  static toPositionsReadModel(
    result: ReplayResult,
    portfolioId: string,
    accountId?: string | null,
    asOfDate?: string | null,
  ): PortfolioPositionsReadModel {
    let rawPositions: AssetState[] = [];

    if (accountId) {
      const acc = result.state.accounts.get(accountId);
      if (acc) {
        rawPositions = Array.from<AssetState>(acc.assets.values());
      }
    } else {
      rawPositions = Array.from<AssetState>(result.state.assets.values());
    }

    const positions = rawPositions
      .sort((a, b) => String(a.assetId).localeCompare(String(b.assetId)))
      .map(PortfolioReadModelMapper.mapPosition);

    return {
      portfolioId,
      accountId: accountId ?? null,
      asOfDate: asOfDate ?? null,
      positions,
    };
  }

  static toHistoryReadModel(
    result: ReplayResult,
    options: HistoryFilterOptions = {},
  ): PortfolioHistoryReadModel {
    const allItems: PortfolioHistoryItemReadModel[] = [];

    // 1. Realized Disposals
    if (!options.type || options.type === 'realized') {
      for (const d of result.state.realizedDisposals) {
        allItems.push({
          id: `rd_${d.transactionId}`,
          kind: 'REALIZED_DISPOSAL',
          transactionId: String(d.transactionId),
          tradeDate: d.tradeDate.toString(),
          accountId: String(d.accountId),
          assetId: String(d.assetId),
          currency: d.currency,
          details: {
            quantity: d.quantity.value,
            grossProceeds: { amount: d.grossProceeds.amount, currency: d.currency },
            sellingCosts: { amount: d.sellingCosts.amount, currency: d.currency },
            netProceeds: { amount: d.netProceeds.amount, currency: d.currency },
            costBasisRemoved: d.costBasisRemoved
              ? { amount: d.costBasisRemoved.amount, currency: d.currency }
              : null,
            realizedGainLoss: d.realizedGainLoss
              ? { amount: d.realizedGainLoss.amount, currency: d.currency }
              : null,
            realizedReturnPercentage: d.realizedReturnPercentage
              ? d.realizedReturnPercentage.value
              : null,
            status: d.status,
          },
        });
      }
    }

    // 2. Income Events
    if (!options.type || options.type === 'income') {
      for (const inc of result.state.incomeEvents) {
        allItems.push({
          id: `inc_${inc.transactionId}`,
          kind: 'INCOME',
          transactionId: String(inc.transactionId),
          tradeDate: inc.tradeDate.toString(),
          accountId: String(inc.accountId),
          assetId: String(inc.assetId),
          currency: inc.currency,
          details: {
            type: inc.type,
            amount: { amount: inc.amount.amount, currency: inc.currency },
            grossAmount: { amount: inc.grossAmount.amount, currency: inc.currency },
            status: inc.status,
          },
        });
      }
    }

    // 3. Cash Flow Events
    if (!options.type || options.type === 'cash-flow') {
      for (const cf of result.state.cashFlowEvents) {
        allItems.push({
          id: `cf_${cf.transactionId}`,
          kind: 'CASH_FLOW',
          transactionId: String(cf.transactionId),
          tradeDate: cf.tradeDate.toString(),
          accountId: String(cf.accountId),
          assetId: cf.relatedAssetId ? String(cf.relatedAssetId) : null,
          currency: cf.currency,
          details: {
            type: cf.type,
            direction: cf.direction,
            category: cf.category,
            amount: { amount: cf.amount.amount, currency: cf.currency },
          },
        });
      }
    }

    // 4. Applied Corporate Actions
    if (!options.type || options.type === 'corporate-action') {
      for (const ca of result.state.appliedCorporateActions) {
        allItems.push({
          id: `ca_${ca.transactionId}`,
          kind: 'CORPORATE_ACTION',
          transactionId: String(ca.transactionId),
          tradeDate: ca.tradeDate.toString(),
          accountId: String(ca.accountId),
          assetId: String(ca.assetId),
          currency: ca.beforeTotalCost?.currency ?? ca.afterTotalCost?.currency ?? null,
          details: {
            type: ca.type,
            beforeQuantity: ca.beforeQuantity.value,
            afterQuantity: ca.afterQuantity.value,
            beforeTotalCost: ca.beforeTotalCost
              ? { amount: ca.beforeTotalCost.amount, currency: ca.beforeTotalCost.currency }
              : null,
            afterTotalCost: ca.afterTotalCost
              ? { amount: ca.afterTotalCost.amount, currency: ca.afterTotalCost.currency }
              : null,
            beforeAverageCost: ca.beforeAverageCost
              ? { amount: ca.beforeAverageCost.amount, currency: ca.beforeAverageCost.currency }
              : null,
            afterAverageCost: ca.afterAverageCost
              ? { amount: ca.afterAverageCost.amount, currency: ca.afterAverageCost.currency }
              : null,
            status: ca.status,
          },
        });
      }
    }

    // 5. Applied Transfers
    if (!options.type || options.type === 'transfer') {
      for (const tr of result.state.appliedTransfers) {
        allItems.push({
          id: `tr_${tr.transactionId}`,
          kind: 'TRANSFER',
          transactionId: String(tr.transactionId),
          tradeDate: tr.tradeDate.toString(),
          accountId: String(tr.accountId),
          assetId: String(tr.assetId),
          currency: tr.carriedCost?.currency ?? null,
          details: {
            type: tr.type,
            status: tr.status,
            transferGroupId: tr.transferGroupId ?? null,
            counterpartyAccountId: tr.counterpartyAccountId
              ? String(tr.counterpartyAccountId)
              : null,
            quantity: tr.quantity.value,
            carriedCost: tr.carriedCost
              ? { amount: tr.carriedCost.amount, currency: tr.carriedCost.currency }
              : null,
            costBasisStatus: tr.costBasisStatus,
          },
        });
      }
    }

    // Filter by criteria
    let filtered = allItems;
    if (options.accountId) {
      filtered = filtered.filter((item) => item.accountId === options.accountId);
    }
    if (options.assetId) {
      filtered = filtered.filter((item) => item.assetId === options.assetId);
    }
    if (options.from) {
      filtered = filtered.filter((item) => item.tradeDate >= options.from!);
    }
    if (options.to) {
      filtered = filtered.filter((item) => item.tradeDate <= options.to!);
    }

    // Deterministic reverse-chronological sort for history: tradeDate DESC, then id DESC
    filtered.sort((a, b) => {
      const cmpDate = b.tradeDate.localeCompare(a.tradeDate);
      if (cmpDate !== 0) return cmpDate;
      return b.id.localeCompare(a.id);
    });

    const totalCount = filtered.length;
    const limit = Math.max(1, Math.min(200, options.limit ?? 50));

    let startIndex = 0;
    if (options.cursor) {
      const idx = filtered.findIndex((item) => item.id === options.cursor);
      if (idx === -1) {
        throw new BadRequestException({
          message: `Invalid pagination cursor '${options.cursor}'`,
          code: 'PORTFOLIO.INVALID_PAGINATION_CURSOR',
        });
      }
      startIndex = idx + 1;
    }

    const pageItems = filtered.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < filtered.length;
    const nextCursor =
      hasMore && pageItems.length > 0 ? (pageItems[pageItems.length - 1]?.id ?? null) : null;

    return {
      items: pageItems,
      meta: {
        limit,
        cursor: options.cursor ?? null,
        nextCursor,
        hasMore,
        totalCount,
      },
    };
  }

  private static mapPosition(pos: AssetState): PortfolioPositionReadModel {
    return {
      assetId: String(pos.assetId),
      quantity: pos.quantity.value,
      costBasisStatus: pos.costBasisStatus,
      currency: pos.currency,
      totalCost: pos.totalCost
        ? { amount: pos.totalCost.amount, currency: pos.totalCost.currency }
        : null,
      averageCost: pos.averageCost
        ? { amount: pos.averageCost.amount, currency: pos.averageCost.currency }
        : null,
    };
  }

  private static mapRealizedSummaries(
    map: ReadonlyMap<Currency, RealizedSummary>,
  ): RealizedSummaryReadModel[] {
    return Array.from(map.values())
      .sort((a, b) => a.currency.localeCompare(b.currency))
      .map((s): RealizedSummaryReadModel => ({
        currency: s.currency,
        status: s.status,
        grossProceeds: { amount: s.grossProceeds.amount, currency: s.grossProceeds.currency },
        sellingCosts: { amount: s.sellingCosts.amount, currency: s.sellingCosts.currency },
        netProceeds: { amount: s.netProceeds.amount, currency: s.netProceeds.currency },
        costBasisRemoved: s.costBasisRemoved
          ? { amount: s.costBasisRemoved.amount, currency: s.costBasisRemoved.currency }
          : null,
        realizedGainLoss: s.realizedGainLoss
          ? { amount: s.realizedGainLoss.amount, currency: s.realizedGainLoss.currency }
          : null,
        realizedReturnPercentage: s.realizedReturnPercentage
          ? s.realizedReturnPercentage.value
          : null,
        disposalCount: s.disposalCount,
      }));
  }

  private static mapIncomeSummaries(
    map: ReadonlyMap<Currency, IncomeSummary>,
  ): IncomeSummaryReadModel[] {
    return Array.from(map.values())
      .sort((a, b) => a.currency.localeCompare(b.currency))
      .map((s): IncomeSummaryReadModel => ({
        currency: s.currency,
        totalDividends: { amount: s.totalDividends.amount, currency: s.totalDividends.currency },
        totalJcp: { amount: s.totalJcp.amount, currency: s.totalJcp.currency },
        totalFiiIncome: { amount: s.totalFiiIncome.amount, currency: s.totalFiiIncome.currency },
        totalIncome: { amount: s.totalIncome.amount, currency: s.totalIncome.currency },
      }));
  }

  private static mapCashFlowSummaries(
    map: ReadonlyMap<Currency, CashFlowSummary>,
  ): CashFlowSummaryReadModel[] {
    return Array.from(map.values())
      .sort((a, b) => a.currency.localeCompare(b.currency))
      .map((s): CashFlowSummaryReadModel => ({
        currency: s.currency,
        totalInflows: { amount: s.totalInflows.amount, currency: s.totalInflows.currency },
        totalOutflows: { amount: s.totalOutflows.amount, currency: s.totalOutflows.currency },
        netExternalFlow: { amount: s.netExternalFlow.amount, currency: s.netExternalFlow.currency },
        totalExternalContributions: {
          amount: s.totalExternalContributions.amount,
          currency: s.totalExternalContributions.currency,
        },
        totalExternalWithdrawals: {
          amount: s.totalExternalWithdrawals.amount,
          currency: s.totalExternalWithdrawals.currency,
        },
        totalCapitalReturns: {
          amount: s.totalCapitalReturns.amount,
          currency: s.totalCapitalReturns.currency,
        },
        totalFees: { amount: s.totalFees.amount, currency: s.totalFees.currency },
        totalTaxes: { amount: s.totalTaxes.amount, currency: s.totalTaxes.currency },
      }));
  }
}
