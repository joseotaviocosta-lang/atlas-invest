/**
 * Phase 4G.2 — Brazilian listed-equity trade classification & day-trade matching
 * (pure domain). Implements the FROZEN legal semantics (research checkpoint
 * 903f06d; IN RFB nº 1.585/2015, art. 65, §§ 1º-3º):
 *
 *  - day trade = same trading day + same asset + same institution, quantity
 *    settled total or partially;
 *  - matching is FIFO chronological (`1º negócio de compra com o 1º de venda ou
 *    o 1º de venda com o 1º de compra, sucessivamente`);
 *  - pre-existing inventory is EXCLUDED from day-trade matching (§2º);
 *  - sale-before-buy may form day trade (§3º);
 *  - different institutions never match.
 *
 * No tax math here beyond exact-decimal quantity/amount arithmetic. No I/O,
 * no Prisma, no React, no network, no AI, no ticker identity.
 */
import { Money, Quantity } from '@atlas/domain';
import { isCanonicalCivilDate } from './deadlines';

export const EQUITY_TAX_CATEGORIES = ['EQUITY_NORMAL', 'EQUITY_DAY_TRADE'] as const;
export type EquityTaxCategory = (typeof EQUITY_TAX_CATEGORIES)[number];

export const EQUITY_LEG_CLASSIFICATIONS = ['DAY_TRADE', 'NORMAL'] as const;
export type EquityLegClassification = (typeof EQUITY_LEG_CLASSIFICATIONS)[number];

export const EQUITY_TRADE_CLASSIFICATION_OUTCOMES = [
  'NORMAL',
  'DAY_TRADE',
  'PARTIAL_NORMAL_AND_DAY_TRADE',
  'BLOCKED',
] as const;
export type EquityTradeClassificationOutcome =
  (typeof EQUITY_TRADE_CLASSIFICATION_OUTCOMES)[number];

/** Canonical, ordered same-day execution input. */
export interface EquityExecution {
  readonly transactionId: string;
  readonly assetId: string;
  readonly institutionId: string;
  /** Civil trading day `YYYY-MM-DD`. */
  readonly tradeDate: string;
  readonly side: 'BUY' | 'SELL';
  /** Exact decimal string. */
  readonly quantity: string;
  /** Exact decimal string. */
  readonly unitPrice: string;
  /** Canonical execution ordering within the day (must be unique per day). */
  readonly sequence: number;
}

/** A tax-derived leg. Never mutates the source transaction. */
export interface EquityTaxLeg {
  readonly legId: string;
  readonly sourceTransactionId: string;
  readonly assetId: string;
  readonly institutionId: string;
  readonly tradeDate: string;
  readonly classification: EquityLegClassification;
  readonly side: 'BUY' | 'SELL';
  /** Exact decimal string. */
  readonly quantity: string;
  readonly unitPrice: string;
  /** Exact decimal string = quantity × unitPrice. */
  readonly grossAmount: string;
  readonly legIndex: number;
}

export interface EquityTradeClassificationSummary {
  readonly assetId: string;
  readonly institutionId: string;
  readonly tradeDate: string;
  readonly outcome: EquityTradeClassificationOutcome;
  /** Exact decimal strings. */
  readonly dayTradeQuantity: string;
  readonly normalBuyQuantity: string;
  readonly normalSellQuantity: string;
}

export interface EquityTradeClassificationResult {
  readonly legs: readonly EquityTaxLeg[];
  readonly summaries: readonly EquityTradeClassificationSummary[];
}

export const EQUITY_TAX_PROJECTION_VERSION = 'equity-tax-projection-v1';

function makeLegId(
  sourceTransactionId: string,
  classification: EquityLegClassification,
  legIndex: number,
): string {
  return `${EQUITY_TAX_PROJECTION_VERSION}:${sourceTransactionId}:${classification}:${legIndex}`;
}

function isPositiveDecimal(value: string): boolean {
  return Quantity.from(value).isPositive();
}

/**
 * Deterministic FIFO day-trade matching across same-day executions, grouped by
 * (asset, institution, tradeDate). Pre-existing inventory never participates.
 * Fails closed (throws `EquityTradeClassificationError`) on malformed input.
 */
export function classifyEquityTradesForTax(
  executions: readonly EquityExecution[],
): EquityTradeClassificationResult {
  // 1) Group by (asset, institution, day).
  const groups = new Map<string, EquityExecution[]>();
  for (const execution of executions) {
    if (!isCanonicalCivilDate(execution.tradeDate)) {
      throw new EquityTradeClassificationError('INVALID_TRADE_DATE', execution.transactionId);
    }
    if (!execution.assetId || !execution.institutionId) {
      throw new EquityTradeClassificationError('MISSING_IDENTITY', execution.transactionId);
    }
    if (!isPositiveDecimal(execution.quantity)) {
      throw new EquityTradeClassificationError('INVALID_QUANTITY', execution.transactionId);
    }
    if (!Number.isInteger(execution.sequence)) {
      throw new EquityTradeClassificationError('MISSING_SEQUENCE', execution.transactionId);
    }
    const key = `${execution.assetId}|${execution.institutionId}|${execution.tradeDate}`;
    const list = groups.get(key);
    if (list) list.push(execution);
    else groups.set(key, [execution]);
  }

  const legs: EquityTaxLeg[] = [];
  const summaries: EquityTradeClassificationSummary[] = [];

  for (const [key, group] of groups) {
    const [assetId, institutionId, tradeDate] = key.split('|') as [string, string, string];
    const ordered = [...group].sort((a, b) => {
      if (a.sequence !== b.sequence) return a.sequence - b.sequence;
      return a.transactionId < b.transactionId ? -1 : a.transactionId > b.transactionId ? 1 : 0;
    });

    const buys = ordered.filter((e) => e.side === 'BUY');
    const sells = ordered.filter((e) => e.side === 'SELL');

    let bi = 0;
    let si = 0;
    let remainingBuy = buys.length ? Quantity.from(buys[0]!.quantity) : Quantity.zero();
    let remainingSell = sells.length ? Quantity.from(sells[0]!.quantity) : Quantity.zero();
    const legIndexByTransaction = new Map<string, number>();

    const pushLeg = (
      execution: EquityExecution,
      classification: EquityLegClassification,
      quantity: string,
    ): void => {
      const index = legIndexByTransaction.get(execution.transactionId) ?? 0;
      legIndexByTransaction.set(execution.transactionId, index + 1);
      const gross = Money.from(quantity, 'BRL').multiply(execution.unitPrice).amount;
      legs.push(
        Object.freeze({
          legId: makeLegId(execution.transactionId, classification, index),
          sourceTransactionId: execution.transactionId,
          assetId,
          institutionId,
          tradeDate,
          classification,
          side: execution.side,
          quantity,
          unitPrice: execution.unitPrice,
          grossAmount: gross,
          legIndex: index,
        }),
      );
    };

    let dayTradeQuantity = Quantity.zero();
    // 2) FIFO chronological matching of same-day buys vs sells.
    while (bi < buys.length && si < sells.length) {
      const buy = buys[bi]!;
      const sell = sells[si]!;
      const matched = remainingBuy.compare(remainingSell) <= 0 ? remainingBuy : remainingSell;
      if (matched.isPositive()) {
        pushLeg(buy, 'DAY_TRADE', matched.toString());
        pushLeg(sell, 'DAY_TRADE', matched.toString());
        dayTradeQuantity = dayTradeQuantity.add(matched);
      }
      remainingBuy = remainingBuy.subtract(matched);
      remainingSell = remainingSell.subtract(matched);
      if (remainingBuy.isZero()) {
        bi += 1;
        remainingBuy = bi < buys.length ? Quantity.from(buys[bi]!.quantity) : Quantity.zero();
      }
      if (remainingSell.isZero()) {
        si += 1;
        remainingSell = si < sells.length ? Quantity.from(sells[si]!.quantity) : Quantity.zero();
      }
    }

    // 3) Residual same-day quantities become NORMAL legs.
    let normalBuyQuantity = Quantity.zero();
    let normalSellQuantity = Quantity.zero();
    if (bi < buys.length && remainingBuy.isPositive()) {
      pushLeg(buys[bi]!, 'NORMAL', remainingBuy.toString());
      normalBuyQuantity = normalBuyQuantity.add(remainingBuy);
      bi += 1;
    }
    for (; bi < buys.length; bi += 1) {
      pushLeg(buys[bi]!, 'NORMAL', buys[bi]!.quantity);
      normalBuyQuantity = normalBuyQuantity.add(Quantity.from(buys[bi]!.quantity));
    }
    if (si < sells.length && remainingSell.isPositive()) {
      pushLeg(sells[si]!, 'NORMAL', remainingSell.toString());
      normalSellQuantity = normalSellQuantity.add(remainingSell);
      si += 1;
    }
    for (; si < sells.length; si += 1) {
      pushLeg(sells[si]!, 'NORMAL', sells[si]!.quantity);
      normalSellQuantity = normalSellQuantity.add(Quantity.from(sells[si]!.quantity));
    }

    const hasDayTrade = dayTradeQuantity.isPositive();
    const hasNormal = normalBuyQuantity.isPositive() || normalSellQuantity.isPositive();
    const outcome: EquityTradeClassificationOutcome =
      hasDayTrade && hasNormal
        ? 'PARTIAL_NORMAL_AND_DAY_TRADE'
        : hasDayTrade
          ? 'DAY_TRADE'
          : 'NORMAL';

    summaries.push(
      Object.freeze({
        assetId,
        institutionId,
        tradeDate,
        outcome,
        dayTradeQuantity: dayTradeQuantity.toString(),
        normalBuyQuantity: normalBuyQuantity.toString(),
        normalSellQuantity: normalSellQuantity.toString(),
      }),
    );
  }

  return Object.freeze({
    legs: Object.freeze(legs),
    summaries: Object.freeze(summaries),
  });
}

export class EquityTradeClassificationError extends Error {
  readonly code: string;
  readonly transactionId: string | null;
  constructor(code: string, transactionId: string | null = null) {
    super(`Equity trade classification failed: ${code}`);
    this.name = 'EquityTradeClassificationError';
    this.code = code;
    this.transactionId = transactionId;
  }
}

/**
 * Quantity-conservation invariant: for every source transaction, the sum of its
 * leg quantities equals the source quantity (no duplication, no loss, no
 * negatives).
 */
export function assertEquityLegQuantityConservation(
  executions: readonly EquityExecution[],
  result: EquityTradeClassificationResult,
): void {
  const sourceByTx = new Map<string, string>();
  for (const e of executions) sourceByTx.set(e.transactionId, e.quantity);
  const legSum = new Map<string, Quantity>();
  for (const leg of result.legs) {
    const current = legSum.get(leg.sourceTransactionId) ?? Quantity.zero();
    legSum.set(leg.sourceTransactionId, current.add(Quantity.from(leg.quantity)));
  }
  for (const [txId, sourceQty] of sourceByTx) {
    const sum = legSum.get(txId) ?? Quantity.zero();
    if (sum.compare(Quantity.from(sourceQty)) !== 0) {
      throw new EquityTradeClassificationError('QUANTITY_CONSERVATION_VIOLATION', txId);
    }
  }
}
