/**
 * Phase 5K — row normalizer.
 *
 * Converts raw string cells into canonical candidates with strict validation:
 * - civil dates (ISO canonical, BR DD/MM/YYYY accepted and normalized);
 * - decimal strings only (BR `1.234,56` and ISO `1234.56` accepted, never float);
 * - operation mapping (BUY/SELL/SUBSCRIPTION-with-price/BONUS supported; known others deferred; unknown invalid);
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
      message: `Operação ${mapped.operation} ainda não é suportada na importação (somente compra, venda, subscrição exercida com preço, bonificação, transferência de custódia e rendimentos com valor informado)`,
    });
    status = 'UNSUPPORTED';
  }

  const isTransfer = mapped.kind === 'TRANSFER_IN' || mapped.kind === 'TRANSFER_OUT';
  const isIncome =
    mapped.kind === 'DIVIDEND' || mapped.kind === 'JCP' || mapped.kind === 'FII_INCOME';
  const isBonus = mapped.kind === 'BONUS';

  const quantityRaw = cell(row, mapping, 'quantity');
  const quantity = normalizeDecimalString(quantityRaw);
  if (isIncome) {
    // Income rows carry no quantity semantics at the ledger level (the
    // canonical income event is value-only). Shares-held figures are
    // informational: validated when present, never required, never persisted.
    if (quantityRaw.trim() !== '') {
      if (quantity === null) {
        fail('INVALID_QUANTITY', `Quantidade "${quantityRaw.trim()}" inválida`, 'quantity');
      } else if (!isPositiveDecimal(quantity)) {
        fail('INVALID_QUANTITY', 'Quantidade deve ser maior que zero', 'quantity');
      }
    }
  } else if (quantity === null) {
    fail('INVALID_QUANTITY', `Quantidade "${quantityRaw.trim()}" inválida`, 'quantity');
  } else if (!isPositiveDecimal(quantity)) {
    fail('INVALID_QUANTITY', 'Quantidade deve ser maior que zero', 'quantity');
  }

  const unitPriceRaw = cell(row, mapping, 'unit_price');
  const unitPrice = normalizeDecimalString(unitPriceRaw);
  if (mapped.kind === 'BUY' || mapped.kind === 'SELL' || mapped.kind === 'SUBSCRIPTION') {
    if (unitPrice === null) {
      fail('INVALID_UNIT_PRICE', `Preço unitário "${unitPriceRaw.trim()}" inválido`, 'unit_price');
    } else if (!isPositiveDecimal(unitPrice)) {
      // A subscription without a factual exercise price is never importable:
      // quantity known + price unknown != safe READY event (never zero,
      // never inferred from market/average prices).
      fail(
        'INVALID_UNIT_PRICE',
        mapped.kind === 'SUBSCRIPTION'
          ? 'Subscrição sem preço de exercício comprovado não pode ser importada'
          : 'Preço unitário deve ser maior que zero',
        'unit_price',
      );
    }
  } else if (isBonus && unitPrice !== null && !/^0+(\.0+)?$/.test(unitPrice)) {
    // A bonus carries no acquisition price: credited shares have unknown cost
    // (the engine keeps INCOMPLETE, never zero). A priced "bonus" is ambiguous
    // and must never auto-convert into cost basis.
    status = 'NEEDS_REVIEW';
    issues.push({
      code: 'BONUS_WITH_PRICE',
      field: 'unit_price',
      message: 'Bonificação com preço informado precisa de revisão (custo desconhecido)',
    });
  } else if ((isTransfer || isIncome) && unitPrice !== null && !/^0+(\.0+)?$/.test(unitPrice)) {
    // Custody moves and income events carry no price. A priced "transfer" or
    // "dividend" is ambiguous (sale? corporate action?) and must never
    // auto-convert.
    status = 'NEEDS_REVIEW';
    issues.push(
      isIncome
        ? {
            code: 'INCOME_WITH_PRICE',
            field: 'unit_price',
            message: 'Rendimento com preço informado precisa de revisão',
          }
        : {
            code: 'TRANSFER_WITH_PRICE',
            field: 'unit_price',
            message: 'Transferência de custódia com preço informado precisa de revisão',
          },
    );
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
  if ((isTransfer || isIncome) && !/^0+(\.0+)?$/.test(fees)) {
    // A custody leg or income row with fees attached is ambiguous: fees
    // belong to the economic event, never to the custody move or the payout
    // itself. Human review, no guessing.
    status = 'NEEDS_REVIEW';
    issues.push(
      isIncome
        ? {
            code: 'INCOME_WITH_FEES',
            field: 'fees',
            message: 'Rendimento com taxas informadas precisa de revisão',
          }
        : {
            code: 'TRANSFER_WITH_FEES',
            field: 'fees',
            message: 'Transferência de custódia com taxas informadas precisa de revisão',
          },
    );
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

  const operation =
    mapped.kind === 'BUY' ||
    mapped.kind === 'SELL' ||
    mapped.kind === 'TRANSFER_IN' ||
    mapped.kind === 'TRANSFER_OUT' ||
    mapped.kind === 'DIVIDEND' ||
    mapped.kind === 'JCP' ||
    mapped.kind === 'FII_INCOME' ||
    mapped.kind === 'BONUS' ||
    mapped.kind === 'SUBSCRIPTION'
      ? mapped.kind
      : 'BUY';

  if (isIncome && status === 'READY') {
    // The generic template carries no income-value cell: only source adapters
    // holding an exact amount (e.g. B3 `amount`) can complete the row. Without
    // it the row stays deferred — never zero, never a trade.
    status = 'UNSUPPORTED';
    issues.push({
      code: 'UNSUPPORTED_OPERATION',
      field: 'operation',
      message: `Operação ${mapped.kind} exige valor do rendimento informado pela fonte`,
    });
  }

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
