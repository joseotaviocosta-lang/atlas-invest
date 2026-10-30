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
  { value: 'DIVIDEND', label: 'Dividendo' },
  { value: 'JCP', label: 'Juros sobre Capital Próprio (JCP)' },
  { value: 'FII_INCOME', label: 'Rendimento FII' },
];

export type ManualOperationType = 'BUY' | 'SELL' | 'DIVIDEND' | 'JCP' | 'FII_INCOME';

export const OPERATION_TYPE_LABELS: Record<string, string> = {
  BUY: 'Compra',
  SELL: 'Venda',
  DIVIDEND: 'Dividendo',
  JCP: 'Juros sobre Capital Próprio',
  FII_INCOME: 'Rendimento FII',
  TRANSFER_IN: 'Transferência de entrada',
  TRANSFER_OUT: 'Transferência de saída',
  SPLIT: 'Desdobramento',
  REVERSE_SPLIT: 'Grupamento',
  BONUS: 'Bonificação',
  AMORTIZATION: 'Amortização',
  SUBSCRIPTION: 'Subscrição',
  RECEIPT_CONVERSION: 'Conversão de recibo',
  DEPOSIT: 'Depósito',
  WITHDRAWAL: 'Retirada',
  FEE: 'Taxa',
  TAX: 'Tributo',
};

/**
 * Determine if a transaction is an opening position baseline from B3 or other annual reports.
 *
 * Provenance is notes-based: the B3 annual-report importer persists candidates
 * with `rawOperation: 'POSICAO_INICIAL'` and notes `Posição em DD/MM/AAAA ...`,
 * and confirm-portfolio-import appends those notes to
 * `Importado de <arquivo> (linha N) — ...`. `TransactionSource` carries only
 * 'B3' (never a per-report source), so source alone cannot identify baselines.
 */
export function isOpeningPositionTransaction(tx: {
  type: string;
  notes?: string | null;
  source?: string | null;
  provider?: string | null;
}): boolean {
  if (tx.type !== 'TRANSFER_IN') return false;
  const notes = tx.notes ?? '';
  return (
    notes.includes('Posição em') ||
    notes.includes('Posição inicial') ||
    notes.includes('Posição Inicial') ||
    notes.includes('relatorio-consolidado-anual') ||
    notes.includes('Posição de Abertura')
  );
}

/**
 * Human-readable operation label respecting opening position provenance.
 */
export function formatOperationTypeLabel(tx: {
  type: string;
  notes?: string | null;
  source?: string | null;
  provider?: string | null;
}): string {
  if (tx.type === 'TRANSFER_IN') {
    return isOpeningPositionTransaction(tx) ? 'Posição inicial' : 'Transferência de entrada';
  }
  if (tx.type === 'TRANSFER_OUT') {
    return 'Transferência de saída';
  }
  return OPERATION_TYPE_LABELS[tx.type] ?? tx.type;
}

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
