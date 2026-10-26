import { LocalDate, Currency, Money, Quantity } from '@atlas/domain';
import { calculateTWR } from './index';

/**
 * Phase 5R-B — position performance orchestration primitives.
 *
 * Pure helpers shared by the position performance use-case. The TWR math
 * itself is always `calculateTWR` (same engine as the portfolio); these
 * helpers only prepare its inputs with position semantics and classify
 * capital flows exactly like the replay engine does.
 */

export const POSITION_PERFORMANCE_MAX_MONTHS = 120;

export interface PositionValuationPoint {
  date: LocalDate;
  /** Canonical decimal market value (quantity x price) at `date`. */
  value: string;
}

export interface PositionCapitalFlow {
  date: LocalDate;
  /** Canonical decimal, always positive magnitude. */
  amount: string;
  direction: 'INFLOW' | 'OUTFLOW';
}

export interface PositionFlowTransaction {
  type: string;
  tradeDate: string;
  /** Canonical decimals as stored on the ledger row. */
  quantity?: string | null;
  unitPrice?: string | null;
  fees?: string | null;
  taxes?: string | null;
  /** Carried cost resolved from the transfer audit (matched legs only). */
  carriedCost?: string | null;
  /** Whether the leg carries a known cost basis. */
  costKnown?: boolean;
}

/**
 * Classifies a position-scoped ledger row as a TWR capital flow, mirroring
 * the replay engine's economics exactly:
 * - BUY / SUBSCRIPTION: capital in (gross cost incl. attributable fees/taxes).
 * - SELL: capital out (net proceeds, net of fees/taxes).
 * - TRANSFER_IN / TRANSFER_OUT: capital moved at carried cost (no gain/loss).
 * - Income (DIVIDEND/JCP/FII_INCOME), corporate actions, standalone fees,
 *   amortizations and cash movements are NOT external flows — identical to
 *   the portfolio engine, which only counts DEPOSIT/WITHDRAWAL.
 * Returns null when the row is not a capital flow, or when its amount
 * cannot be known exactly (unmatched transfer without carried cost).
 */
export function toPositionCapitalFlow(
  tx: PositionFlowTransaction,
  currency: Currency,
): { date: LocalDate; amount: Money; direction: 'INFLOW' | 'OUTFLOW' } | null {
  const date = LocalDate.from(tx.tradeDate);
  switch (tx.type) {
    case 'BUY':
    case 'SUBSCRIPTION': {
      if (!tx.quantity || !tx.unitPrice) return null;
      let cost = Quantity.from(tx.unitPrice).multiply(Quantity.from(tx.quantity));
      if (tx.fees) cost = cost.add(Quantity.from(tx.fees));
      if (tx.type === 'BUY' && tx.taxes) {
        cost = cost.add(Quantity.from(tx.taxes));
      }
      return { date, amount: Money.from(cost.value, currency), direction: 'INFLOW' };
    }
    case 'SELL': {
      if (!tx.quantity || !tx.unitPrice) return null;
      let net = Quantity.from(tx.unitPrice).multiply(Quantity.from(tx.quantity));
      if (tx.fees) net = net.subtract(Quantity.from(tx.fees));
      if (tx.taxes) net = net.subtract(Quantity.from(tx.taxes));
      return { date, amount: Money.from(net.value, currency), direction: 'OUTFLOW' };
    }
    case 'TRANSFER_IN': {
      if (tx.costKnown !== true || !tx.carriedCost) return null;
      return { date, amount: Money.from(tx.carriedCost, currency), direction: 'INFLOW' };
    }
    case 'TRANSFER_OUT': {
      if (tx.costKnown !== true || !tx.carriedCost) return null;
      return { date, amount: Money.from(tx.carriedCost, currency), direction: 'OUTFLOW' };
    }
    default:
      return null;
  }
}

/**
 * Position TWR on precomputed observations and flows with the shared
 * engine. Thin by design: methodology lives in `calculateTWR`.
 */
export function calculatePositionTwr(input: {
  observations: PositionValuationPoint[];
  flows: PositionCapitalFlow[];
  startDate: LocalDate;
  endDate: LocalDate;
  currency: Currency;
}): ReturnType<typeof calculateTWR> {
  return calculateTWR({
    observations: input.observations.map((point) => ({
      date: point.date,
      value: Money.from(point.value, input.currency),
      currency: input.currency,
    })),
    cashFlows: input.flows.map((flow) => ({
      date: flow.date,
      amount: Money.from(flow.amount, input.currency),
      direction: flow.direction,
    })),
    period: { startDate: input.startDate, endDate: input.endDate },
    currency: input.currency,
  });
}
