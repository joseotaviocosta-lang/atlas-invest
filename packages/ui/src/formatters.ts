/**
 * Safe Financial and Date Formatters for Project Atlas.
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. Formatting ≠ Financial Calculation:
 *    These formatters are strictly for visual presentation and NEVER mutate the underlying canonical value.
 * 2. Precision Safety:
 *    Avoids IEEE 754 floating point arithmetic distortion by parsing exact decimal strings and using
 *    arbitrary-precision BigInt for visual rounding.
 * 3. Prohibited in canonical financial path:
 *    Number(value), parseFloat(value), +value for calculating amounts.
 */

export interface FormatCurrencyOptions {
  currencyCode?: string;
  decimalPlaces?: number;
}

export interface FormatPercentageOptions {
  showSign?: boolean;
  decimalPlaces?: number;
}

/**
 * Parses and formats an exact decimal string to N decimal places with standard half-up rounding,
 * using BigInt to prevent floating point precision loss.
 */
function roundAndFormatDecimal(
  rawInput: string | number,
  decimalPlaces: number,
): { integerPart: string; fractionalPart: string; isNegative: boolean; isZero: boolean } | null {
  const str = String(rawInput).trim();
  if (str === '') return null;

  // Handle scientific notation safely if a JS number was provided
  let normalizedStr = str;
  if (normalizedStr.includes('e') || normalizedStr.includes('E')) {
    const num = Number(normalizedStr);
    if (!Number.isFinite(num)) return null;
    normalizedStr = num.toFixed(20).replace(/\.?0+$/, '');
  }

  const isNegative = normalizedStr.startsWith('-');
  const clean = isNegative ? normalizedStr.slice(1) : normalizedStr;

  // Validate exact decimal format: integer with optional fractional digits
  if (!/^\d+(\.\d+)?$/.test(clean)) {
    return null;
  }

  const [intStr = '0', fracStr = ''] = clean.split('.');

  if (decimalPlaces === 0) {
    if (fracStr.length > 0 && Number(fracStr[0]) >= 5) {
      const roundedInt = (BigInt(intStr) + 1n).toString();
      return {
        integerPart: roundedInt,
        fractionalPart: '',
        isNegative,
        isZero: roundedInt === '0',
      };
    }
    const isZero = BigInt(intStr) === 0n;
    return {
      integerPart: intStr,
      fractionalPart: '',
      isNegative: isZero ? false : isNegative,
      isZero,
    };
  }

  if (fracStr.length <= decimalPlaces) {
    const paddedFrac = fracStr.padEnd(decimalPlaces, '0');
    const isZero = BigInt(intStr) === 0n && BigInt(paddedFrac) === 0n;
    return {
      integerPart: intStr,
      fractionalPart: paddedFrac,
      isNegative: isZero ? false : isNegative,
      isZero,
    };
  }

  // Round half-up at index = decimalPlaces using integer arithmetic
  const truncatedFrac = fracStr.slice(0, decimalPlaces);
  const nextDigit = Number(fracStr[decimalPlaces]);
  const combined = BigInt(intStr + truncatedFrac);

  let finalCombined = combined;
  if (nextDigit >= 5) {
    finalCombined = combined + 1n;
  }

  const combinedStr = finalCombined.toString().padStart(intStr.length + decimalPlaces, '0');
  const splitIndex = combinedStr.length - decimalPlaces;
  const newInt = combinedStr.slice(0, splitIndex) || '0';
  const newFrac = combinedStr.slice(splitIndex);

  const isZero = finalCombined === 0n;
  return {
    integerPart: newInt,
    fractionalPart: newFrac,
    isNegative: isZero ? false : isNegative,
    isZero,
  };
}

/**
 * Formats an exact decimal string (or number) into localized Brazilian Real (or other) currency.
 * Visual presentation rounds half-up to 2 decimal places by default without altering the source value.
 *
 * E.g.
 * - "1250.50" -> "R$ 1.250,50"
 * - "1234.567891" -> "R$ 1.234,57"
 * - "0" -> "R$ 0,00"
 * - "-10.1234" -> "-R$ 10,12"
 * - null / undefined / "" -> "—"
 */
export function formatCurrency(
  value: string | number | null | undefined,
  currencyCodeOrOptions: string | FormatCurrencyOptions = 'BRL',
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const options: FormatCurrencyOptions =
    typeof currencyCodeOrOptions === 'string'
      ? { currencyCode: currencyCodeOrOptions, decimalPlaces: 2 }
      : { currencyCode: 'BRL', decimalPlaces: 2, ...currencyCodeOrOptions };

  const currencyCode = options.currencyCode || 'BRL';
  const decimalPlaces = options.decimalPlaces ?? 2;

  const result = roundAndFormatDecimal(value, decimalPlaces);
  if (!result) {
    return '—';
  }

  const { integerPart, fractionalPart, isNegative } = result;

  // Insert dots for thousands separator in Brazilian format
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  const prefix = currencyCode === 'BRL' ? 'R$ ' : `${currencyCode} `;
  const sign = isNegative ? '-' : '';

  if (decimalPlaces === 0) {
    return `${sign}${prefix}${formattedInteger}`;
  }

  return `${sign}${prefix}${formattedInteger},${fractionalPart}`;
}

/**
 * Formats an exact decimal percentage string into localized percentage.
 * Visual presentation rounds half-up without altering the canonical source value.
 *
 * E.g.
 * - "5.25" -> "+5,25%" (if showSign is true)
 * - "-1.2" -> "-1,20%"
 * - "0.00000001" -> "0,00%" (with 2 decimal places)
 */
export function formatPercentage(
  value: string | number | null | undefined,
  options: FormatPercentageOptions = {},
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const { showSign = false, decimalPlaces = 2 } = options;

  const result = roundAndFormatDecimal(value, decimalPlaces);
  if (!result) {
    return '—';
  }

  const { integerPart, fractionalPart, isNegative, isZero } = result;

  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  let sign = '';
  if (isNegative) {
    sign = '-';
  } else if (showSign && !isZero) {
    sign = '+';
  }

  if (decimalPlaces === 0) {
    return `${sign}${formattedInteger}%`;
  }

  return `${sign}${formattedInteger},${fractionalPart}%`;
}

/**
 * Formats an ISO date string or Date object into Brazilian format (DD/MM/YYYY).
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
