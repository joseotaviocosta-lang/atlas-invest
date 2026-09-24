import {
  createPortfolioId,
  createAccountId,
  createAssetId,
  PortfolioId,
  AccountId,
  LocalDate,
  Quantity,
  Money,
  Percentage,
  Currency,
  Transaction,
  TransferTransaction,
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
  PortfolioTimelineOptions,
  PortfolioTimelineResult,
  PortfolioTimelineSnapshot,
} from './types';
import { PORTFOLIO_ENGINE_VERSION } from './version';
import { compareTransactionsChronologically } from './ordering';
import {
  ReplayContext,
  dispatchTransaction,
  ResolvedTransferPair,
  RuntimeTransferState,
} from './dispatcher';
import {
  CrossPortfolioTransactionError,
  DuplicateTransactionError,
  TransferPairMismatchError,
  DuplicateTransferLegError,
  InvalidTransferGroupError,
  CrossAssetTransferError,
  TransferCurrencyMismatchError,
} from './errors';

/**
 * Validates input integrity for a replay execution: portfolio isolation and
 * duplicate transaction IDs. Extracted verbatim from replay() so the single
 * timeline and single-date replays share the identical check.
 */
function validateTransactionLedger(
  transactions: readonly Transaction[],
  portfolioId: PortfolioId,
): void {
  const seenIds = new Set<string>();
  for (const tx of transactions) {
    const txId = String(tx.id);
    if (seenIds.has(txId)) {
      throw new DuplicateTransactionError(txId);
    }
    seenIds.add(txId);

    if (String(tx.portfolioId) !== String(portfolioId)) {
      throw new CrossPortfolioTransactionError(String(portfolioId), txId, String(tx.portfolioId));
    }
  }
}

/**
 * Validates a matched transfer pair: distinct accounts, same asset/currency/
 * quantity, and causal date ordering. Shared by single-date replay and the
 * multi-date timeline so pair validation is identical.
 */
function validateTransferPair(
  groupId: string,
  outLeg: TransferTransaction,
  inLeg: TransferTransaction,
): void {
  // Origin and destination accounts must be distinct
  if (String(outLeg.accountId) === String(inLeg.accountId)) {
    throw new InvalidTransferGroupError(
      groupId,
      `Origin account and destination account must be distinct (both are '${outLeg.accountId}').`,
    );
  }

  // Asset must match
  if (String(outLeg.assetId) !== String(inLeg.assetId)) {
    throw new CrossAssetTransferError(groupId, String(outLeg.assetId), String(inLeg.assetId));
  }

  // Currency must match
  if (outLeg.currency !== inLeg.currency) {
    throw new TransferCurrencyMismatchError(groupId, outLeg.currency, inLeg.currency);
  }

  // Quantity must match exactly
  if (!outLeg.quantity.equals(inLeg.quantity)) {
    throw new TransferPairMismatchError(groupId, outLeg.quantity.value, inLeg.quantity.value);
  }

  // Causal trade date ordering: destination cannot arrive before origin departure
  if (inLeg.tradeDate.compare(outLeg.tradeDate) < 0) {
    throw new InvalidTransferGroupError(
      groupId,
      `TRANSFER_IN tradeDate '${inLeg.tradeDate}' cannot precede TRANSFER_OUT tradeDate '${outLeg.tradeDate}'.`,
    );
  }
}

/**
 * Builds and validates transfer-group pair resolution for a replay execution.
 * Extracted verbatim from replay(): identical duplicate-leg detection and
 * matched-pair validation. The multi-date timeline resolves pairs
 * incrementally from the cumulative dispatched subset (see replayTimeline).
 */
function resolveTransferGroupPairs(
  transactions: readonly Transaction[],
): Map<string, ResolvedTransferPair> {
  const transferGroupPairs = new Map<
    string,
    { outLeg?: TransferTransaction; inLeg?: TransferTransaction }
  >();

  for (const tx of transactions) {
    if (tx.type === 'TRANSFER_OUT' || tx.type === 'TRANSFER_IN') {
      const transferTx = tx as TransferTransaction;
      if (transferTx.transferGroupId) {
        const groupId = transferTx.transferGroupId;
        let pair = transferGroupPairs.get(groupId);
        if (!pair) {
          pair = {};
          transferGroupPairs.set(groupId, pair);
        }

        if (transferTx.type === 'TRANSFER_OUT') {
          if (pair.outLeg) {
            throw new DuplicateTransferLegError(
              groupId,
              'TRANSFER_OUT',
              String(pair.outLeg.id),
              String(transferTx.id),
            );
          }
          pair.outLeg = transferTx;
        } else {
          if (pair.inLeg) {
            throw new DuplicateTransferLegError(
              groupId,
              'TRANSFER_IN',
              String(pair.inLeg.id),
              String(transferTx.id),
            );
          }
          pair.inLeg = transferTx;
        }
      }
    }
  }

  // Validate matched transfer pairs
  for (const [groupId, pair] of transferGroupPairs.entries()) {
    if (pair.outLeg && pair.inLeg) {
      validateTransferPair(groupId, pair.outLeg, pair.inLeg);
    }
  }

  const resolvedPairs = new Map<string, ResolvedTransferPair>();
  for (const [groupId, pair] of transferGroupPairs.entries()) {
    resolvedPairs.set(groupId, {
      transferGroupId: groupId,
      outLeg: pair.outLeg,
      inLeg: pair.inLeg,
    });
  }
  return resolvedPairs;
}

interface AggregatedAssetHolder {
  totalQuantity: Quantity;
  totalCost: Money;
  currency?: Currency;
  hasIncomplete: boolean;
}

/**
 * Finalizes immutable derived state from a replay context. Extracted verbatim
 * from replay(): the single-date replay and the multi-date timeline produce
 * byte-identical PortfolioState for the same dispatched prefix and asOfDate.
 */
function finalizeReplayState(input: {
  portfolioId: PortfolioId;
  ctx: ReplayContext;
  asOfDate: LocalDate | undefined;
  processedTransactionCount: number;
}): PortfolioState {
  const { portfolioId, ctx, asOfDate, processedTransactionCount } = input;
  const accountsMap = new Map<string, AccountState>();
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
    const accountTransfers = Object.freeze(
      ctx.appliedTransfers.filter((t) => String(t.accountId) === accIdStr),
    );

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
      appliedTransfers: accountTransfers,
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
  const portfolioTransfers = Object.freeze([...ctx.appliedTransfers]);

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
    appliedTransfers: portfolioTransfers,
    processedTransactionCount,
    appliedTransactionCount: ctx.appliedTransactions.length,
    deferredTransactionCount: ctx.deferredEvents.length,
  });

  return portfolioState;
}

/**
 * Normalizes requested asOf dates: parses strings, dedupes, and sorts
 * ascending. Pure; never mutates the input array.
 */
function dedupeAndSortAsOfDates(dates: readonly (LocalDate | string)[]): LocalDate[] {
  const seen = new Set<string>();
  const parsed: LocalDate[] = [];
  for (const date of dates) {
    const local = date instanceof LocalDate ? date : LocalDate.from(String(date));
    const key = local.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push(local);
  }
  return parsed.sort((a, b) => a.compare(b));
}

type MutableTransferPair = {
  transferGroupId: string;
  outLeg?: TransferTransaction;
  inLeg?: TransferTransaction;
};

function isGroupedTransferLeg(tx: Transaction): tx is TransferTransaction {
  return (
    (tx.type === 'TRANSFER_OUT' || tx.type === 'TRANSFER_IN') &&
    !!(tx as TransferTransaction).transferGroupId
  );
}

/**
 * Adds one transfer leg to the timeline's cumulative pair map, with the same
 * duplicate-leg detection and pair validation as replay(asOf=D). The pair map
 * therefore always equals the pair resolution that replay() would build from
 * {tx : tradeDate <= current date} — never future knowledge.
 */
function timelineAddTransferLeg(
  pairMap: Map<string, MutableTransferPair>,
  leg: TransferTransaction,
): void {
  const groupId = leg.transferGroupId!;
  let pair = pairMap.get(groupId);
  if (!pair) {
    pair = { transferGroupId: groupId };
    pairMap.set(groupId, pair);
  }
  if (leg.type === 'TRANSFER_OUT') {
    if (pair.outLeg) {
      throw new DuplicateTransferLegError(
        groupId,
        'TRANSFER_OUT',
        String(pair.outLeg.id),
        String(leg.id),
      );
    }
    pair.outLeg = leg;
  } else {
    if (pair.inLeg) {
      throw new DuplicateTransferLegError(
        groupId,
        'TRANSFER_IN',
        String(pair.inLeg.id),
        String(leg.id),
      );
    }
    pair.inLeg = leg;
  }
  if (pair.outLeg && pair.inLeg) {
    validateTransferPair(groupId, pair.outLeg, pair.inLeg);
  }
}

/**
 * Restores the out-leg's historical carried cost into runtime state before a
 * TRANSFER_IN that completes a pair whose out-leg was dispatched at an earlier
 * date. Without this, the in-leg would recompute cost from the origin's
 * CURRENT (post-outflow, possibly post-intervening-trades) position instead of
 * the out-leg-time carried cost that replay(asOf=D) uses. No-op when the
 * out-leg has not been dispatched yet (same-date in-before-out order).
 */
function backfillRuntimeTransferStateFromOutLeg(ctx: ReplayContext, groupId: string): void {
  if (ctx.runtimeTransferState.has(groupId)) return;
  const outAudit = ctx.appliedTransfers.find(
    (t) => t.transferGroupId === groupId && t.type === 'TRANSFER_OUT',
  );
  if (!outAudit) return;
  const restored: RuntimeTransferState = {
    carriedCost: outAudit.carriedCost,
    costBasisStatus: outAudit.costBasisStatus,
    outProcessed: true,
    inProcessed: false,
  };
  ctx.runtimeTransferState.set(groupId, restored);
}

/**
 * Promotes a previously-recorded UNMATCHED_OUT audit to MATCHED once its pair
 * is complete and both legs are dispatched — exactly the audit that
 * replay(asOf >= inLeg date) emits. No-op otherwise.
 */
function promoteOutLegAuditToMatched(
  ctx: ReplayContext,
  groupId: string,
  counterpartyAccountId: AccountId,
): void {
  const idx = ctx.appliedTransfers.findIndex(
    (t) => t.transferGroupId === groupId && t.type === 'TRANSFER_OUT',
  );
  if (idx < 0) return;
  const old = ctx.appliedTransfers[idx]!;
  if (old.status === 'MATCHED') return;
  ctx.appliedTransfers[idx] = Object.freeze({
    ...old,
    status: 'MATCHED' as const,
    counterpartyAccountId,
  });
}

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
    validateTransactionLedger(rawTransactions, portfolioId);

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

    const resolvedPairs = resolveTransferGroupPairs(filtered);

    // 5. Execution: Dispatch each transaction to internal replay context
    const ctx = new ReplayContext(portfolioId, resolvedPairs);
    for (const tx of filtered) {
      dispatchTransaction(ctx, tx);
    }

    const portfolioState = finalizeReplayState({
      portfolioId,
      ctx,
      asOfDate,
      processedTransactionCount: filtered.length,
    });

    return Object.freeze({
      engineVersion: this.version,
      state: portfolioState,
      appliedTransactions: Object.freeze([...ctx.appliedTransactions]),
      deferredEvents: Object.freeze([...ctx.deferredEvents]),
      totalProcessedCount: filtered.length,
    });
  }

  /**
   * Replays the ledger ONCE in canonical order and materializes immutable
   * state at each requested asOf date (additive 3P performance capability).
   *
   * Temporal equivalence (valid ledgers): transfer pairs are resolved
   * incrementally from the cumulative dispatched subset, EXACTLY as
   * replay(asOf=D) resolves them from {tx : tradeDate <= D}. An out-leg
   * dispatched before its in-leg arrives records UNMATCHED_OUT; when the
   * in-leg later completes the pair, its historical carried cost is restored
   * from the out-leg's audit record (matching replay's runtime state) and the
   * out-leg audit is promoted to MATCHED. Same-date in-before-out order takes
   * the identical recompute path as replay. No future knowledge: a snapshot at
   * D reflects only transactions and pair resolutions with tradeDate <= D.
   *
   * Guarantees:
   * - Each transaction is dispatched exactly once; the ledger is validated and
   *   sorted a single time.
   * - `snapshots[i].state` is deeply equivalent to
   *   `replay({ transactions, asOfDate: snapshots[i].asOfDate }).state`,
   *   including transfer audit metadata.
   * - Deterministic, input-immutable, deeply frozen outputs.
   */
  replayTimeline(options: PortfolioTimelineOptions): PortfolioTimelineResult {
    const portfolioId = createPortfolioId(String(options.portfolioId));
    const asOfDates = dedupeAndSortAsOfDates(options.asOfDates);

    validateTransactionLedger(options.transactions, portfolioId);

    const sorted = [...options.transactions];
    sorted.sort(compareTransactionsChronologically);

    const transferLegs = sorted.filter(isGroupedTransferLeg);

    // Cumulative pair map: always equals the pair resolution replay(asOf=D)
    // would build from {tx : tradeDate <= D}. Mutations are visible to ctx.
    const pairMap = new Map<string, MutableTransferPair>();
    const ctx = new ReplayContext(
      portfolioId,
      pairMap as unknown as ReadonlyMap<string, ResolvedTransferPair>,
    );

    const snapshots: PortfolioTimelineSnapshot[] = [];
    let txCursor = 0;
    let legCursor = 0;
    let dispatchedCount = 0;
    for (const asOfDate of asOfDates) {
      while (
        legCursor < transferLegs.length &&
        transferLegs[legCursor]!.tradeDate.compare(asOfDate) <= 0
      ) {
        timelineAddTransferLeg(pairMap, transferLegs[legCursor]!);
        legCursor += 1;
      }
      while (txCursor < sorted.length && sorted[txCursor]!.tradeDate.compare(asOfDate) <= 0) {
        const tx = sorted[txCursor]!;
        if (tx.type === 'TRANSFER_IN') {
          const groupId = (tx as TransferTransaction).transferGroupId;
          if (groupId) backfillRuntimeTransferStateFromOutLeg(ctx, groupId);
        }
        dispatchTransaction(ctx, tx);
        if (tx.type === 'TRANSFER_IN') {
          const groupId = (tx as TransferTransaction).transferGroupId;
          if (groupId) promoteOutLegAuditToMatched(ctx, groupId, tx.accountId);
        }
        txCursor += 1;
        dispatchedCount += 1;
      }
      const state = finalizeReplayState({
        portfolioId,
        ctx,
        asOfDate,
        processedTransactionCount: dispatchedCount,
      });
      snapshots.push(Object.freeze({ asOfDate, state }));
    }

    return Object.freeze({
      engineVersion: this.version,
      snapshots: Object.freeze(snapshots) as readonly PortfolioTimelineSnapshot[],
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
 * Convenience functional entry-point for a multi-date timeline replay.
 */
export function replayPortfolioTimeline(
  options: PortfolioTimelineOptions,
): PortfolioTimelineResult {
  const engine = new PortfolioReplayEngine();
  return engine.replayTimeline(options);
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
