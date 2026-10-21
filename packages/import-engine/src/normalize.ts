/**
 * Phase 5K — row normalizer.
 *
 * Converts raw string cells into canonical candidates with strict validation:
 * - civil dates (ISO canonical, BR DD/MM/YYYY accepted and normalized);
 * - decimal strings only (BR `1.234,56` and ISO `1234.56` accepted, never float);
 * - operation mapping (BUY/SELL supported; known others deferred; unknown invalid);
 * - currency defaults to BRL and must be supported.
 *
 * `today` is injected (YYYY-MM-DD) so future-date detection stays deterministic.
 */

import { LocalDate, assertValidCurrency } from '@atlas/domain';
import { mapHeaders, mapOperation, type MappedHeaders } from './template';
import type { ImportIssue, ImportRowStatus, NormalizedCandidate, RawImportRow } from './types';

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
const POSITIVE_DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BR_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function normalizeDecimalString(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.includes(',')) {
    const withoutThousands = trimmed.replace(/\./g, '');
    const withDot = withoutThousands.replace(',', '.');
    return DECIMAL_PATTERN.test(withDot) ? withDot : null;
  }
  return DECIMAL_PATTERN.test(trimmed) ? trimmed : null;
}

export function isPositiveDecimal(value: string): boolean {
  if (!POSITIVE_DECIMAL_PATTERN.test(value)) return false;
  return /^0+(\.0+)?$/.test(value) === false;
}

function normalizeDate(raw: string): { date: string } | { error: string } {
  const trimmed = raw.trim();
  const brMatch = BR_DATE_PATTERN.exec(trimmed);
  const iso = brMatch ? `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}` : trimmed;
  if (!ISO_DATE_PATTERN.test(iso)) {
    return { error: `data "${trimmed}" fora do formato esperado (AAAA-MM-DD ou DD/MM/AAAA)` };
  }
  try {
    LocalDate.from(iso);
    return { date: iso };
  } catch {
    return { error: `data "${trimmed}" não é uma data civil válida` };
  }
}

function cell(
  row: RawImportRow,
  mapping: MappedHeaders['mapping'],
  column: keyof MappedHeaders['mapping'],
): string {
  const index = mapping[column];
  if (index === undefined) return '';
  return row.cells[String(index)] ?? '';
}

export interface NormalizeOptions {
  today: string;
  defaultCurrency?: string;
}

export function normalizeRow(
  row: RawImportRow,
  mapping: MappedHeaders['mapping'],
  options: NormalizeOptions,
): NormalizedCandidate {
  const issues: ImportIssue[] = [];
  let status: ImportRowStatus = 'READY';

  const fail = (code: string, message: string, field?: string): void => {
    issues.push({ code, field, message });
    status = 'INVALID';
  };

  const dateRaw = cell(row, mapping, 'date');
  let tradeDate = '';
  if (dateRaw === '') {
    fail('MISSING_DATE', 'Data da operação é obrigatória', 'date');
  } else {
    const parsed = normalizeDate(dateRaw);
    if ('error' in parsed) {
      fail('INVALID_DATE', parsed.error, 'date');
    } else {
      tradeDate = parsed.date;
    }
  }

  const ticker = cell(row, mapping, 'ticker').trim().toUpperCase();
  if (ticker === '') {
    fail('MISSING_TICKER', 'Ativo é obrigatório', 'ticker');
  }

  const operationRaw = cell(row, mapping, 'operation');
  const mapped = mapOperation(operationRaw);
  if (mapped.kind === 'UNKNOWN') {
    fail('UNKNOWN_OPERATION', `Operação "${operationRaw.trim()}" não reconhecida`, 'operation');
  } else if (mapped.kind === 'DEFERRED') {
    issues.push({
      code: 'UNSUPPORTED_OPERATION',
      field: 'operation',
      message: `Operação ${mapped.operation} ainda não é suportada na importação (somente compra e venda)`,
    });
    status = 'UNSUPPORTED';
  }

  const quantityRaw = cell(row, mapping, 'quantity');
  const quantity = normalizeDecimalString(quantityRaw);
  if (quantity === null) {
    fail('INVALID_QUANTITY', `Quantidade "${quantityRaw.trim()}" inválida`, 'quantity');
  } else if (!isPositiveDecimal(quantity)) {
    fail('INVALID_QUANTITY', 'Quantidade deve ser maior que zero', 'quantity');
  }

  const unitPriceRaw = cell(row, mapping, 'unit_price');
  const unitPrice = normalizeDecimalString(unitPriceRaw);
  if (mapped.kind === 'BUY' || mapped.kind === 'SELL') {
    if (unitPrice === null) {
      fail('INVALID_UNIT_PRICE', `Preço unitário "${unitPriceRaw.trim()}" inválido`, 'unit_price');
    } else if (!isPositiveDecimal(unitPrice)) {
      fail('INVALID_UNIT_PRICE', 'Preço unitário deve ser maior que zero', 'unit_price');
    }
  }

  const feesRaw = cell(row, mapping, 'fees');
  let fees = '0';
  if (feesRaw.trim() !== '') {
    const parsed = normalizeDecimalString(feesRaw);
    if (parsed === null || !POSITIVE_DECIMAL_PATTERN.test(parsed)) {
      fail('INVALID_FEES', `Taxas "${feesRaw.trim()}" inválidas`, 'fees');
    } else {
      fees = parsed;
    }
  }

  const currencyRaw = cell(row, mapping, 'currency').trim().toUpperCase();
  const currency = currencyRaw === '' ? (options.defaultCurrency ?? 'BRL') : currencyRaw;
  try {
    assertValidCurrency(currency);
  } catch {
    fail('INVALID_CURRENCY', `Moeda "${currencyRaw}" não suportada`, 'currency');
  }

  let settlementDate: string | undefined;
  const settlementRaw = cell(row, mapping, 'settlement_date');
  if (settlementRaw.trim() !== '') {
    const parsed = normalizeDate(settlementRaw);
    if ('error' in parsed) {
      fail('INVALID_SETTLEMENT_DATE', parsed.error, 'settlement_date');
    } else {
      settlementDate = parsed.date;
    }
  }

  const operation = mapped.kind === 'BUY' || mapped.kind === 'SELL' ? mapped.kind : 'BUY';

  const candidate: NormalizedCandidate = {
    rowNumber: row.rowNumber,
    tradeDate,
    ...(settlementDate ? { settlementDate } : {}),
    ticker,
    operation,
    rawOperation: operationRaw.trim(),
    quantity: quantity ?? '0',
    unitPrice: unitPrice ?? '0',
    fees,
    currency,
    ...(() => {
      const broker = cell(row, mapping, 'broker').trim();
      return broker === '' ? {} : { brokerLabel: broker };
    })(),
    ...(() => {
      const account = cell(row, mapping, 'account').trim();
      return account === '' ? {} : { accountLabel: account };
    })(),
    ...(() => {
      const externalId = cell(row, mapping, 'external_id').trim();
      return externalId === '' ? {} : { externalId };
    })(),
    ...(() => {
      const notes = cell(row, mapping, 'notes').trim();
      return notes === '' ? {} : { notes };
    })(),
    status,
    issues,
  };

  if (status === 'READY' && tradeDate !== '' && tradeDate > options.today) {
    candidate.status = 'NEEDS_REVIEW';
    candidate.issues.push({
      code: 'FUTURE_DATE',
      field: 'date',
      message: `Data ${tradeDate} é futura e precisa de revisão`,
    });
  }

  return Object.freeze({
    ...candidate,
    issues: Object.freeze(candidate.issues) as NormalizedCandidate['issues'],
  }) as NormalizedCandidate;
}

export function normalizeRows(
  headers: string[],
  rows: RawImportRow[],
  options: NormalizeOptions,
):
  { mapping: MappedHeaders['mapping']; candidates: NormalizedCandidate[] } | { missing: string[] } {
  const { mapping, missing } = mapHeaders(headers);
  if (missing.length > 0) {
    return { missing };
  }
  const candidates = rows.map((row) => normalizeRow(row, mapping, options));
  return { mapping, candidates };
}
