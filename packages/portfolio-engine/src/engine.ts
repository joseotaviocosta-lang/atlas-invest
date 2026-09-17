import {
  createPortfolioId,
  createAccountId,
  createAssetId,
  LocalDate,
  Quantity,
  Money,
  Percentage,
  Currency,
  Transaction,
} from '@atlas/domain';
import {
  PortfolioState,
  AccountState,
  AssetState,
  CostBasisStatus,
  RealizedDisposal,
  RealizedSummary,
  IncomeEvent,
  IncomeSummary,
  CashFlowEvent,
  CashFlowSummary,
  ReplayResult,
  ReplayOptions,
} from './types';
import { PORTFOLIO_ENGINE_VERSION } from './version';
import { compareTransactionsChronologically } from './ordering';
import { ReplayContext, dispatchTransaction } from './dispatcher';
import { CrossPortfolioTransactionError, DuplicateTransactionError } from './errors';

/**
 * Pure, deterministic, stateless Portfolio Replay Engine.
 * Reconstructs derived portfolio and account state by evaluating ledger transactions.
 */
export class PortfolioReplayEngine {
  readonly version = PORTFOLIO_ENGINE_VERSION;

  /**
   * Replays a sequence of transactions for a portfolio up to an optional as-of date.
   *
   * Invariants guaranteed:
   * - Deterministic output: 1,000 runs produce identical results.
   * - Input immutability: The source transaction array is never mutated.
   * - Output immutability: All returned maps, arrays, and objects are deeply frozen.
   * - Canonical ordering: Events are ordered by (tradeDate, createdAt, id).
   * - Zero IEEE 754 float: Exact decimal quantity arithmetic throughout.
   */
  replay(options: ReplayOptions): ReplayResult {
    const portfolioId = createPortfolioId(String(options.portfolioId));
    const asOfDate = options.asOfDate
      ? options.asOfDate instanceof LocalDate
        ? options.asOfDate
        : LocalDate.from(String(options.asOfDate))
      : undefined;

    const rawTransactions = options.transactions;

    // 1. Input Integrity: Validate portfolio isolation and detect duplicate IDs
    const seenIds = new Set<string>();
    for (const tx of rawTransactions) {
      const txId = String(tx.id);
      if (seenIds.has(txId)) {
        throw new DuplicateTransactionError(txId);
      }
      seenIds.add(txId);

      if (String(tx.portfolioId) !== String(portfolioId)) {
        throw new CrossPortfolioTransactionError(String(portfolioId), txId, String(tx.portfolioId));
      }
    }

    // 2. Filter by asOfDate on a shallow copy to guarantee input immutability
    const filtered: Transaction[] = [];
    for (const tx of rawTransactions) {
      if (asOfDate) {
        if (tx.tradeDate.compare(asOfDate) <= 0) {
          filtered.push(tx);
        }
      } else {
        filtered.push(tx);
      }
    }

    // 3. Canonical Sorting: Sort copy according to the deterministic 3-tuple
    filtered.sort(compareTransactionsChronologically);

    // 4. Execution: Dispatch each transaction to internal replay context
    const ctx = new ReplayContext(portfolioId);
    for (const tx of filtered) {
      dispatchTransaction(ctx, tx);
    }

    // 5. Finalize Immutable Derived State
    const accountsMap = new Map<string, AccountState>();

    interface AggregatedAssetHolder {
      totalQuantity: Quantity;
      totalCost: Money;
      currency?: Currency;
      hasIncomplete: boolean;
    }
    const aggregatedAssets = new Map<string, AggregatedAssetHolder>();

    for (const [accIdStr, assetMap] of ctx.accounts.entries()) {
      const accountAssets = new Map<string, AssetState>();

      for (const [assetIdStr, pos] of assetMap.entries()) {
        if (!pos.quantity.isZero()) {
          const assetState: AssetState = Object.freeze({
            assetId: createAssetId(assetIdStr),
            quantity: pos.quantity,
            totalCost: pos.totalCost,
            averageCost: pos.averageCost,
            currency: pos.currency,
            costBasisStatus: pos.costBasisStatus,
          });
          accountAssets.set(assetIdStr, assetState);

          // Aggregate for portfolio view
          let agg = aggregatedAssets.get(assetIdStr);
          if (!agg) {
            agg = {
              totalQuantity: Quantity.zero(),
              totalCost: Money.zero(pos.currency),
              currency: pos.currency,
              hasIncomplete: false,
            };
            aggregatedAssets.set(assetIdStr, agg);
          }

          // Validate multi-currency consistency at portfolio level
          if (agg.currency !== pos.currency) {
            throw new CrossPortfolioTransactionError(
              String(portfolioId),
              `Currency mismatch for asset '${assetIdStr}': portfolio contains accounts with divergent currencies '${agg.currency}' and '${pos.currency}'`,
              String(portfolioId),
            );
          }

          agg.totalQuantity = agg.totalQuantity.add(pos.quantity);
          if (pos.costBasisStatus === 'INCOMPLETE' || !pos.totalCost) {
            agg.hasIncomplete = true;
          } else {
            agg.totalCost = agg.totalCost.add(pos.totalCost);
          }
        }
      }

      const accountDisposals = Object.freeze(
        ctx.realizedDisposals.filter((d) => String(d.accountId) === accIdStr),
      );
      const accountRealizedSummary = buildRealizedSummaries(accountDisposals);
      const accountCorporateActions = Object.freeze(
        ctx.appliedCorporateActions.filter((ca) => String(ca.accountId) === accIdStr),
      );
      const accountIncomeEvents = Object.freeze(
        ctx.incomeEvents.filter((e) => String(e.accountId) === accIdStr),
      );
      const accountIncomeSummary = buildIncomeSummaries(accountIncomeEvents);
      const accountCashFlowEvents = Object.freeze(
        ctx.cashFlowEvents.filter((e) => String(e.accountId) === accIdStr),
      );
      const accountCashFlowSummary = buildCashFlowSummaries(accountCashFlowEvents);

      const accountState: AccountState = Object.freeze({
        accountId: createAccountId(accIdStr),
        assets: Object.freeze(accountAssets),
        realizedDisposals: accountDisposals,
        realizedSummary: accountRealizedSummary,
        appliedCorporateActions: accountCorporateActions,
        incomeEvents: accountIncomeEvents,
        incomeSummary: accountIncomeSummary,
        cashFlowEvents: accountCashFlowEvents,
        cashFlowSummary: accountCashFlowSummary,
      });
      accountsMap.set(accIdStr, accountState);
    }

    // Build portfolio aggregated asset state (ADR-042: weighted cost aggregation, never average-of-averages)
    const portfolioAssetsMap = new Map<string, AssetState>();
    for (const [assetIdStr, agg] of aggregatedAssets.entries()) {
      if (!agg.totalQuantity.isZero()) {
        const isKnown = !agg.hasIncomplete;
        const totalCost = isKnown ? agg.totalCost : undefined;
        const averageCost = isKnown ? agg.totalCost.divide(agg.totalQuantity) : undefined;
        const costBasisStatus: CostBasisStatus = isKnown ? 'KNOWN' : 'INCOMPLETE';

        portfolioAssetsMap.set(
          assetIdStr,
          Object.freeze({
            assetId: createAssetId(assetIdStr),
            quantity: agg.totalQuantity,
            totalCost,
            averageCost,
            currency: agg.currency,
            costBasisStatus,
          }),
        );
      }
    }

    const portfolioDisposals = Object.freeze([...ctx.realizedDisposals]);
    const portfolioRealizedSummary = buildRealizedSummaries(portfolioDisposals);
    const portfolioCorporateActions = Object.freeze([...ctx.appliedCorporateActions]);
    const portfolioIncomeEvents = Object.freeze([...ctx.incomeEvents]);
    const portfolioIncomeSummary = buildIncomeSummaries(portfolioIncomeEvents);
    const portfolioCashFlowEvents = Object.freeze([...ctx.cashFlowEvents]);
    const portfolioCashFlowSummary = buildCashFlowSummaries(portfolioCashFlowEvents);

    const portfolioState: PortfolioState = Object.freeze({
      portfolioId,
      asOfDate,
      accounts: Object.freeze(accountsMap),
      assets: Object.freeze(portfolioAssetsMap),
      realizedDisposals: portfolioDisposals,
      realizedSummary: portfolioRealizedSummary,
      appliedCorporateActions: portfolioCorporateActions,
      incomeEvents: portfolioIncomeEvents,
      incomeSummary: portfolioIncomeSummary,
      cashFlowEvents: portfolioCashFlowEvents,
      cashFlowSummary: portfolioCashFlowSummary,
      processedTransactionCount: filtered.length,
      appliedTransactionCount: ctx.appliedTransactions.length,
      deferredTransactionCount: ctx.deferredEvents.length,
    });

    return Object.freeze({
      engineVersion: this.version,
      state: portfolioState,
      appliedTransactions: Object.freeze([...ctx.appliedTransactions]),
      deferredEvents: Object.freeze([...ctx.deferredEvents]),
      totalProcessedCount: filtered.length,
    });
  }
}

/**
 * Factory function for creating a new stateless PortfolioReplayEngine instance.
 */
export function createPortfolioReplayEngine(): PortfolioReplayEngine {
  return new PortfolioReplayEngine();
}

/**
 * Convenience functional entry-point to execute a deterministic replay.
 */
export function replayPortfolio(options: ReplayOptions): ReplayResult {
  const engine = new PortfolioReplayEngine();
  return engine.replay(options);
}

/**
 * Aggregates realized disposals into deterministic per-currency summaries (ADR-045).
 * - Guarantees portfolio totals equal the sum of account totals per currency.
 * - Prevents averaging of returns across accounts or sales (strictly computes totalRealizedGainLoss / totalCostBasisRemoved).
 * - Propagates INCOMPLETE status if any disposal in the currency has an unknown cost basis (ADR-046).
 */
function buildRealizedSummaries(
  disposals: readonly RealizedDisposal[],
): ReadonlyMap<Currency, RealizedSummary> {
  const byCurrency = new Map<Currency, RealizedDisposal[]>();
  for (const disposal of disposals) {
    let list = byCurrency.get(disposal.currency);
    if (!list) {
      list = [];
      byCurrency.set(disposal.currency, list);
    }
    list.push(disposal);
  }

  const result = new Map<Currency, RealizedSummary>();
  for (const [currency, currencyDisposals] of byCurrency.entries()) {
    let grossProceeds = Money.zero(currency);
    let sellingCosts = Money.zero(currency);
    let netProceeds = Money.zero(currency);
    let costBasisRemovedSum = Money.zero(currency);
    let realizedGainLossSum = Money.zero(currency);
    let hasIncomplete = false;

    for (const d of currencyDisposals) {
      grossProceeds = grossProceeds.add(d.grossProceeds);
      sellingCosts = sellingCosts.add(d.sellingCosts);
      netProceeds = netProceeds.add(d.netProceeds);

      if (d.status === 'INCOMPLETE' || !d.costBasisRemoved || !d.realizedGainLoss) {
        hasIncomplete = true;
      } else {
        costBasisRemovedSum = costBasisRemovedSum.add(d.costBasisRemoved);
        realizedGainLossSum = realizedGainLossSum.add(d.realizedGainLoss);
      }
    }

    if (hasIncomplete) {
      result.set(
        currency,
        Object.freeze({
          currency,
          status: 'INCOMPLETE',
          grossProceeds,
          sellingCosts,
          netProceeds,
          costBasisRemoved: undefined,
          realizedGainLoss: undefined,
          realizedReturnPercentage: undefined,
          disposalCount: currencyDisposals.length,
        }),
      );
    } else {
      let realizedReturnPercentage: Percentage | undefined;
      if (costBasisRemovedSum.isPositive()) {
        const ratio = Quantity.from(realizedGainLossSum.amount)
          .divide(Quantity.from(costBasisRemovedSum.amount))
          .multiply('100');
        realizedReturnPercentage = Percentage.from(ratio.value);
      }
      result.set(
        currency,
        Object.freeze({
          currency,
          status: 'KNOWN',
          grossProceeds,
          sellingCosts,
          netProceeds,
          costBasisRemoved: costBasisRemovedSum,
          realizedGainLoss: realizedGainLossSum,
          realizedReturnPercentage,
          disposalCount: currencyDisposals.length,
        }),
      );
    }
  }

  return Object.freeze(result);
}

/**
 * Aggregates income events into deterministic per-currency summaries.
 * Segregates dividends, JCP, and FII income per currency.
 */
function buildIncomeSummaries(
  events: readonly IncomeEvent[],
): ReadonlyMap<Currency, IncomeSummary> {
  const byCurrency = new Map<Currency, IncomeEvent[]>();
  for (const event of events) {
    let list = byCurrency.get(event.currency);
    if (!list) {
      list = [];
      byCurrency.set(event.currency, list);
    }
    list.push(event);
  }

  const result = new Map<Currency, IncomeSummary>();
  for (const [currency, currencyEvents] of byCurrency.entries()) {
    let totalDividends = Money.zero(currency);
    let totalJcp = Money.zero(currency);
    let totalFiiIncome = Money.zero(currency);

    for (const e of currencyEvents) {
      if (e.type === 'DIVIDEND') {
        totalDividends = totalDividends.add(e.amount);
      } else if (e.type === 'JCP') {
        totalJcp = totalJcp.add(e.amount);
      } else if (e.type === 'FII_INCOME') {
        totalFiiIncome = totalFiiIncome.add(e.amount);
      }
    }

    const totalIncome = totalDividends.add(totalJcp).add(totalFiiIncome);

    result.set(
      currency,
      Object.freeze({
        currency,
        totalDividends,
        totalJcp,
        totalFiiIncome,
        totalIncome,
      }),
    );
  }

  return Object.freeze(result);
}

/**
 * Aggregates cash flow events into deterministic per-currency summaries.
 * Classifies inflows vs outflows and separates external contributions/withdrawals,
 * capital returns, fees, and taxes without heuristic conflation.
 */
function buildCashFlowSummaries(
  events: readonly CashFlowEvent[],
): ReadonlyMap<Currency, CashFlowSummary> {
  const byCurrency = new Map<Currency, CashFlowEvent[]>();
  for (const event of events) {
    let list = byCurrency.get(event.currency);
    if (!list) {
      list = [];
      byCurrency.set(event.currency, list);
    }
    list.push(event);
  }

  const result = new Map<Currency, CashFlowSummary>();
  for (const [currency, currencyEvents] of byCurrency.entries()) {
    let totalInflows = Money.zero(currency);
    let totalOutflows = Money.zero(currency);
    let totalExternalContributions = Money.zero(currency);
    let totalExternalWithdrawals = Money.zero(currency);
    let totalCapitalReturns = Money.zero(currency);
    let totalFees = Money.zero(currency);
    let totalTaxes = Money.zero(currency);

    for (const e of currencyEvents) {
      if (e.direction === 'INFLOW') {
        totalInflows = totalInflows.add(e.amount);
      } else {
        totalOutflows = totalOutflows.add(e.amount);
      }

      if (e.category === 'EXTERNAL_CONTRIBUTION') {
        totalExternalContributions = totalExternalContributions.add(e.amount);
      } else if (e.category === 'EXTERNAL_WITHDRAWAL') {
        totalExternalWithdrawals = totalExternalWithdrawals.add(e.amount);
      } else if (e.category === 'CAPITAL_RETURN') {
        totalCapitalReturns = totalCapitalReturns.add(e.amount);
      } else if (e.category === 'OPERATIONAL_EXPENSE' || e.category === 'FEE') {
        totalFees = totalFees.add(e.amount);
      } else if (e.category === 'TAX_PAYMENT' || e.category === 'TAX_CHARGE') {
        totalTaxes = totalTaxes.add(e.amount);
      }
    }

    const netExternalFlow = totalExternalContributions.subtract(totalExternalWithdrawals);

    result.set(
      currency,
      Object.freeze({
        currency,
        totalInflows,
        totalOutflows,
        netExternalFlow,
        totalExternalContributions,
        totalExternalWithdrawals,
        totalCapitalReturns,
        totalFees,
        totalTaxes,
      }),
    );
  }

  return Object.freeze(result);
}
