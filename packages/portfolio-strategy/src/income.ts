import { DomainError } from '@atlas/domain';
import { addDecimals, ratioToBasisPoints } from './scenario';

export class InvalidIncomeInputError extends DomainError {
  constructor(message: string) {
    super(message, 'PORTFOLIO.INVALID_INCOME');
    this.name = 'InvalidIncomeInputError';
  }
}

/** Canonical income event types. AMORTIZATION, sales and transfers are never income. */
export const INCOME_EVENT_TYPES = ['DIVIDEND', 'JCP', 'FII_INCOME'] as const;
export type IncomeEventType = (typeof INCOME_EVENT_TYPES)[number];

export function isIncomeEventType(type: string): type is IncomeEventType {
  return (INCOME_EVENT_TYPES as readonly string[]).includes(type);
}

/** Hard bound so income timelines stay small no matter the requested range. */
export const MAX_INCOME_MONTHS = 120;

export interface IncomeLedgerRow {
  id: string;
  assetId: string | null;
  tradeDate: string;
  type: string;
  amount: string | null;
  currency: string;
  createdAt: string;
}

export interface IncomeTypeTotal {
  dividends: string;
  jcp: string;
  fiiIncome: string;
  total: string;
  eventCount: number;
}

export interface IncomeCurrencyTotal extends IncomeTypeTotal {
  currency: string;
}

/**
 * Sums canonical income rows grouped by currency, split by type.
 * Exact decimal math; never mixes currencies. Rows without a string
 * amount or with a non-income type are skipped (the caller owns filtering
 * semantics; validation of the ledger itself stays with the replay).
 */
export function aggregateIncomeTotals(rows: readonly IncomeLedgerRow[]): IncomeCurrencyTotal[] {
  const byCurrency = new Map<string, IncomeTypeTotal & { currency: string }>();
  const blank = (): IncomeTypeTotal => ({
    dividends: '0',
    jcp: '0',
    fiiIncome: '0',
    total: '0',
    eventCount: 0,
  });
  for (const row of rows) {
    if (!isIncomeEventType(row.type) || typeof row.amount !== 'string') continue;
    const existing = byCurrency.get(row.currency) ?? { currency: row.currency, ...blank() };
    if (row.type === 'DIVIDEND') existing.dividends = addDecimals(existing.dividends, row.amount);
    if (row.type === 'JCP') existing.jcp = addDecimals(existing.jcp, row.amount);
    if (row.type === 'FII_INCOME') existing.fiiIncome = addDecimals(existing.fiiIncome, row.amount);
    existing.total = addDecimals(existing.total, row.amount);
    existing.eventCount += 1;
    byCurrency.set(row.currency, existing);
  }
  return [...byCurrency.values()].sort((a, b) => (a.currency < b.currency ? -1 : 1));
}

function isZeroDecimal(value: string): boolean {
  const trimmed = value.trim().replace(/^[+-]/, '');
  const [intRaw = '0', fracRaw = ''] = trimmed.split('.');
  const intPart = intRaw.replace(/^0+/, '') || '0';
  return intPart === '0' && /^0*$/.test(fracRaw);
}

/**
 * Share of a part in a whole, in integer basis points, or null when the
 * whole is zero (never divide by zero, never invent a share).
 */
export function incomeShareBp(part: string, whole: string): string | null {
  if (isZeroDecimal(whole)) return null;
  return String(ratioToBasisPoints(part, whole));
}

export interface IncomeMonthBucket {
  month: string;
  totals: IncomeCurrencyTotal[];
}

/**
 * Buckets canonical income rows into calendar months. Every enumerated
 * month is present; months without events carry explicit zeros for each
 * observed currency (absence of events, not absence of data — the caller
 * supplies the currency universe via the rows). Deterministic order:
 * months ascending, then currencies ascending.
 */
export function bucketIncomeByMonth(
  rows: readonly IncomeLedgerRow[],
  months: readonly string[],
): IncomeMonthBucket[] {
  const currencies = [
    ...new Set(rows.filter((row) => isIncomeEventType(row.type)).map((row) => row.currency)),
  ].sort();
  const byMonth = new Map<string, IncomeLedgerRow[]>();
  for (const month of months) byMonth.set(month, []);
  for (const row of rows) {
    if (!isIncomeEventType(row.type)) continue;
    const month = row.tradeDate.slice(0, 7);
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(row);
  }
  return months.map((month) => {
    const bucket = byMonth.get(month) ?? [];
    const perCurrency = new Map<string, IncomeLedgerRow[]>();
    for (const row of bucket) {
      const list = perCurrency.get(row.currency);
      if (list) list.push(row);
      else perCurrency.set(row.currency, [row]);
    }
    const totals: IncomeCurrencyTotal[] = currencies.map((currency) => {
      const rowsForCurrency = perCurrency.get(currency) ?? [];
      let dividends = '0';
      let jcp = '0';
      let fiiIncome = '0';
      let total = '0';
      for (const row of rowsForCurrency) {
        if (typeof row.amount !== 'string') continue;
        if (row.type === 'DIVIDEND') dividends = addDecimals(dividends, row.amount);
        if (row.type === 'JCP') jcp = addDecimals(jcp, row.amount);
        if (row.type === 'FII_INCOME') fiiIncome = addDecimals(fiiIncome, row.amount);
        total = addDecimals(total, row.amount);
      }
      return {
        currency,
        dividends,
        jcp,
        fiiIncome,
        total,
        eventCount: rowsForCurrency.filter((row) => typeof row.amount === 'string').length,
      };
    });
    return { month, totals };
  });
}

export interface RankedIncomeRow<T> {
  rank: number;
  row: T;
}

function splitParts(value: string): { neg: boolean; int: string; frac: string } {
  const trimmed = value.trim();
  const first = trimmed.charAt(0);
  const neg = first === '-';
  const unsigned = neg || first === '+' ? trimmed.slice(1) : trimmed;
  const dot = unsigned.indexOf('.');
  const intRaw = dot === -1 ? unsigned : unsigned.slice(0, dot);
  const frac = dot === -1 ? '' : unsigned.slice(dot + 1);
  return { neg, int: intRaw.replace(/^0+(?=\d)/, '') || '0', frac };
}

/** Exact decimal comparison without floats. Treats -0 as 0. */
function compareDecimalStrings(a: string, b: string): -1 | 0 | 1 {
  const pa = splitParts(a);
  const pb = splitParts(b);
  const magnitude = (() => {
    if (pa.int.length !== pb.int.length) return pa.int.length < pb.int.length ? -1 : 1;
    if (pa.int !== pb.int) return pa.int < pb.int ? -1 : 1;
    const len = Math.max(pa.frac.length, pb.frac.length);
    const fa = (pa.frac + '0'.repeat(len)).slice(0, len);
    const fb = (pb.frac + '0'.repeat(len)).slice(0, len);
    if (fa !== fb) return fa < fb ? -1 : 1;
    return 0;
  })();
  if (magnitude === 0) return 0;
  if (pa.neg !== pb.neg) return pa.neg ? -1 : 1;
  return pa.neg ? (magnitude === 1 ? -1 : 1) : magnitude;
}

/**
 * Ranks rows by exact decimal total, ties broken by the key function.
 * Ranks are 1-based and deterministic. Factual ordering only.
 */
export function rankIncomeRows<T>(
  rows: readonly T[],
  totalOf: (row: T) => string,
  keyOf: (row: T) => string,
  limit: number,
): Array<RankedIncomeRow<T>> {
  return [...rows]
    .sort((a, b) => {
      const order = compareDecimalStrings(totalOf(a), totalOf(b));
      if (order !== 0) return -order;
      const ka = keyOf(a);
      const kb = keyOf(b);
      return ka < kb ? -1 : 1;
    })
    .slice(0, Math.max(0, limit))
    .map((row, index) => ({ rank: index + 1, row }));
}
