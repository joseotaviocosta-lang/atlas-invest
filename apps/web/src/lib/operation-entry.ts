/**
 * Manual operation entry helpers (H5 first-transaction flow).
 *
 * Pure, dependency-free utilities for the portfolio Operações tab:
 * - decimal input normalization (comma decimal separator becomes a dot);
 * - string-only positivity checks (zero IEEE-754 float math);
 * - human-readable labels for operation types and money values.
 *
 * Financial values remain exact decimal strings end to end. These helpers
 * never multiply, sum, or otherwise compute financial results.
 */

export const OPERATION_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'BUY', label: 'Compra' },
  { value: 'SELL', label: 'Venda' },
];

export type ManualOperationType = 'BUY' | 'SELL';

export const OPERATION_TYPE_LABELS: Record<string, string> = {
  BUY: 'Compra',
  SELL: 'Venda',
};

export const OPERATION_CURRENCY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'BRL', label: 'BRL — Real brasileiro' },
  { value: 'USD', label: 'USD — Dólar americano' },
  { value: 'EUR', label: 'EUR — Euro' },
];

/**
 * Normalize user decimal input to the canonical API decimal-string form.
 * Trims whitespace and converts the Brazilian comma decimal separator to a dot.
 * String-only: performs no numeric conversion and no financial math.
 */
export function normalizeDecimalInput(raw: string): string {
  return raw.trim().replace(',', '.');
}

const POSITIVE_DECIMAL_RE = /^\d+(\.\d+)?$/;

/**
 * String-only positivity check (no parseFloat): accepts "10", "30.00" and
 * rejects "", "0", "0.00", "-5", "abc".
 */
export function isPositiveDecimalString(value: string): boolean {
  if (!POSITIVE_DECIMAL_RE.test(value)) return false;
  const [int = '', frac = ''] = value.split('.');
  return [...int].some((d) => d !== '0') || [...frac].some((d) => d !== '0');
}

/** String-only non-negativity check: accepts "0", "0.00", "30.00". */
export function isNonNegativeDecimalString(value: string): boolean {
  return POSITIVE_DECIMAL_RE.test(value);
}

export const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Render-only accessor for Money JSON ({ amount, currency }) or plain strings.
 * Displays exact server strings; never computes.
 */
export function moneyAmountOf(value: string | { amount: string } | undefined): string {
  if (typeof value === 'string') return value;
  return value?.amount ?? '—';
}

/** Human-readable asset label; never exposes the raw AssetId alone. */
export function assetOptionLabel(ticker: string, name: string): string {
  return `${ticker} — ${name}`;
}
