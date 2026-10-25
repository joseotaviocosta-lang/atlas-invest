import { addDecimals } from '@atlas/portfolio-strategy';

/**
 * Phase 5R-A — position intelligence composition helpers (pure, zero I/O).
 *
 * Aggregates canonical per-asset ledger rows (income events, activity)
 * with exact decimal math. No replay, no price lookup, no FX — the
 * callers supply already-scoped canonical rows. Currencies are never
 * mixed: totals group by currency.
 */

export const POSITION_RECENT_ACTIVITY_LIMIT = 10;
export const POSITION_RECENT_INCOME_LIMIT = 5;

export const POSITION_INCOME_TYPES = ['DIVIDEND', 'JCP', 'FII_INCOME'] as const;
export type PositionIncomeType = (typeof POSITION_INCOME_TYPES)[number];

export function isPositionIncomeType(type: string): type is PositionIncomeType {
  return (POSITION_INCOME_TYPES as readonly string[]).includes(type);
}

export interface PositionLedgerRow {
  id: string;
  type: string;
  tradeDate: string;
  currency: string;
  createdAt: string;
  quantity?: string | null;
  unitPrice?: string | null;
  amount?: string | null;
}

export interface PositionIncomeTotals {
  currency: string;
  dividends: string;
  jcp: string;
  fiiIncome: string;
  total: string;
}

export interface PositionIncomeEvent {
  transactionId: string;
  tradeDate: string;
  type: PositionIncomeType;
  amount: string;
  currency: string;
}

export interface PositionActivityRow {
  transactionId: string;
  tradeDate: string;
  type: string;
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
  currency: string;
}

function compareLedgerRowsDesc(
  a: { tradeDate: string; createdAt: string; id: string },
  b: { tradeDate: string; createdAt: string; id: string },
): number {
  if (a.tradeDate !== b.tradeDate) return a.tradeDate < b.tradeDate ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? -1 : 1;
}

/**
 * Income totals per currency (inception, exact sums) plus the most recent
 * income events. Zero income with no events yields empty totals — the
 * caller adds NO_INCOME_HISTORY instead of inventing a zero.
 */
export function aggregatePositionIncome(rows: readonly PositionLedgerRow[]): {
  totalsByCurrency: PositionIncomeTotals[];
  recent: PositionIncomeEvent[];
} {
  const income = rows.filter((row) => isPositionIncomeType(row.type));
  const totalsByCurrency = new Map<string, PositionIncomeTotals>();
  for (const row of income) {
    if (typeof row.amount !== 'string') continue;
    const existing = totalsByCurrency.get(row.currency) ?? {
      currency: row.currency,
      dividends: '0',
      jcp: '0',
      fiiIncome: '0',
      total: '0',
    };
    if (row.type === 'DIVIDEND') existing.dividends = addDecimals(existing.dividends, row.amount);
    if (row.type === 'JCP') existing.jcp = addDecimals(existing.jcp, row.amount);
    if (row.type === 'FII_INCOME') existing.fiiIncome = addDecimals(existing.fiiIncome, row.amount);
    existing.total = addDecimals(existing.total, row.amount);
    totalsByCurrency.set(row.currency, existing);
  }
  const recent = [...income]
    .filter((row): row is PositionLedgerRow & { amount: string } => typeof row.amount === 'string')
    .sort(compareLedgerRowsDesc)
    .slice(0, POSITION_RECENT_INCOME_LIMIT)
    .map((row) => ({
      transactionId: row.id,
      tradeDate: row.tradeDate,
      type: row.type as PositionIncomeType,
      amount: row.amount,
      currency: row.currency,
    }));
  return {
    totalsByCurrency: [...totalsByCurrency.values()].sort((a, b) =>
      a.currency < b.currency ? -1 : 1,
    ),
    recent,
  };
}

/**
 * Most recent activity rows, newest first, bounded. Corporate actions,
 * transfers, trades and income all stay visible — cash movements carry no
 * assetId and never reach this function (callers scope by asset).
 */
export function derivePositionActivity(
  rows: readonly PositionLedgerRow[],
  limit: number = POSITION_RECENT_ACTIVITY_LIMIT,
): PositionActivityRow[] {
  return [...rows]
    .sort(compareLedgerRowsDesc)
    .slice(0, limit)
    .map((row) => ({
      transactionId: row.id,
      tradeDate: row.tradeDate,
      type: row.type,
      quantity: row.quantity ?? null,
      unitPrice: row.unitPrice ?? null,
      amount: row.amount ?? null,
      currency: row.currency,
    }));
}
