/**
 * Safe Financial and Date Formatters for Project Atlas.
 * Avoids IEEE 754 floating point arithmetic distortion by parsing exact decimal strings.
 */

/**
 * Formats a decimal string (or number) into Brazilian Real currency format.
 * E.g. "1250.50" -> "R$ 1.250,50", "0" -> "R$ 0,00", null/undefined -> "—"
 */
export function formatCurrency(
  value: string | number | null | undefined,
  currencyCode = 'BRL',
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const str = String(value).trim();
  if (str === '' || isNaN(Number(str))) {
    return '—';
  }

  const isNegative = str.startsWith('-');
  const cleanStr = isNegative ? str.slice(1) : str;
  const parts = cleanStr.split('.');
  const integerPart = parts[0] || '0';
  let fractionalPart = parts[1] || '00';

  if (fractionalPart.length < 2) {
    fractionalPart = fractionalPart.padEnd(2, '0');
  } else if (fractionalPart.length > 2) {
    fractionalPart = fractionalPart.slice(0, 2);
  }

  // Insert dots for thousands
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  const prefix = currencyCode === 'BRL' ? 'R$ ' : `${currencyCode} `;
  const sign = isNegative ? '-' : '';

  return `${sign}${prefix}${formattedInteger},${fractionalPart}`;
}

/**
 * Formats a decimal percentage string into localized percentage.
 * E.g. "5.25" -> "+5,25%" (if showSign is true), "-1.2" -> "-1,20%"
 */
export function formatPercentage(
  value: string | number | null | undefined,
  options: { showSign?: boolean; decimalPlaces?: number } = {},
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const str = String(value).trim();
  if (str === '' || isNaN(Number(str))) {
    return '—';
  }

  const { showSign = false, decimalPlaces = 2 } = options;
  const num = Number(str);
  const isZero = num === 0;
  const isNegative = num < 0;

  const absNum = Math.abs(num);
  const fixed = absNum.toFixed(decimalPlaces).replace('.', ',');

  let sign = '';
  if (isNegative) {
    sign = '-';
  } else if (showSign && !isZero) {
    sign = '+';
  }

  return `${sign}${fixed}%`;
}

/**
 * Formats ISO date string or Date into Brazilian format (DD/MM/YYYY).
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';

  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';

    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();

    return `${day}/${month}/${year}`;
  } catch {
    return '—';
  }
}
