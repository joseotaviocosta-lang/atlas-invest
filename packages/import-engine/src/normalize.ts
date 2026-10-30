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

/**
 * Exact decimal check `target == quantity × ratio` using BigInt integer
 * arithmetic (no floats, no precision loss). Returns false on any malformed
 * input — callers fail closed.
 */
function conversionRatioHolds(quantity: string, ratio: string, target: string): boolean {
  const parse = (raw: string): { int: bigint; scale: number } | null => {
    const m = /^(\d+)(?:\.(\d+))?$/.exec(raw.trim());
    if (!m) return null;
    const digits = (m[1]! + (m[2] ?? '')).replace(/^0+(?=\d)/, '') || '0';
    return { int: BigInt(digits === '' ? '0' : digits), scale: (m[2] ?? '').length };
  };
  const q = parse(quantity);
  const r = parse(ratio);
  const t = parse(target);
  if (!q || !r || !t) return false;
  const left = q.int * r.int;
  const leftScale = q.scale + r.scale;
  const diff = leftScale - t.scale;
  if (diff >= 0) return left === t.int * 10n ** BigInt(diff);
  return left * 10n ** BigInt(-diff) === t.int;
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
  const isConversion = mapped.kind === 'RECEIPT_CONVERSION';

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
  } else if ((isTransfer || isIncome || isConversion) && unitPrice !== null && !/^0+(\.0+)?$/.test(unitPrice)) {
    // Custody moves, conversions and income events carry no price. A priced
    // "transfer", "conversion" or "dividend" is ambiguous (sale? corporate
    // action?) and must never auto-convert.
    status = 'NEEDS_REVIEW';
    issues.push(
      isIncome
        ? {
            code: 'INCOME_WITH_PRICE',
            field: 'unit_price',
            message: 'Rendimento com preço informado precisa de revisão',
          }
        : isConversion
          ? {
              code: 'CONVERSION_WITH_PRICE',
              field: 'unit_price',
              message: 'Conversão de recibo com preço informado precisa de revisão (conversão não tem preço)',
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
  if ((isTransfer || isIncome || isConversion) && !/^0+(\.0+)?$/.test(fees)) {
    // A custody leg, conversion or income row with fees attached is ambiguous:
    // fees belong to the economic event, never to the custody move, the
    // conversion itself or the payout. Human review, no guessing.
    status = 'NEEDS_REVIEW';
    issues.push(
      isIncome
        ? {
            code: 'INCOME_WITH_FEES',
            field: 'fees',
            message: 'Rendimento com taxas informadas precisa de revisão',
          }
        : isConversion
          ? {
              code: 'CONVERSION_WITH_FEES',
              field: 'fees',
              message: 'Conversão de recibo com taxas informadas precisa de revisão',
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
    mapped.kind === 'SUBSCRIPTION' ||
    mapped.kind === 'RECEIPT_CONVERSION'
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

  // Receipt-conversion cross-asset references (PART D/T/U). All quantities
  // and the ratio are exact decimal strings; consistency is verified with
  // integer arithmetic (never float). Only EXACT dates are importable.
  let targetTicker: string | undefined;
  let targetQuantity: string | undefined;
  let conversionRatio: string | undefined;
  let conversionType: string | undefined;
  let dateConfidence: 'EXACT' | 'BOUNDED' | 'UNKNOWN' = 'EXACT';
  if (isConversion) {
    const rawTarget = cell(row, mapping, 'target_ticker').trim().toUpperCase();
    if (rawTarget === '') {
      fail('MISSING_TARGET_ASSET', 'Conversão de recibo exige o ativo destino', 'target_ticker');
    } else if (rawTarget === ticker) {
      fail(
        'CONVERSION_SAME_ASSET',
        'Ativo origem e destino da conversão devem ser diferentes',
        'target_ticker',
      );
    } else {
      targetTicker = rawTarget;
    }
    const rawTargetQty = cell(row, mapping, 'target_quantity');
    const parsedTargetQty = normalizeDecimalString(rawTargetQty);
    if (parsedTargetQty === null || !isPositiveDecimal(parsedTargetQty)) {
      fail(
        'INVALID_TARGET_QUANTITY',
        `Quantidade destino "${rawTargetQty.trim()}" inválida`,
        'target_quantity',
      );
    } else {
      targetQuantity = parsedTargetQty;
    }
    const rawRatio = cell(row, mapping, 'conversion_ratio');
    const parsedRatio = normalizeDecimalString(rawRatio);
    if (parsedRatio === null || !isPositiveDecimal(parsedRatio)) {
      fail(
        'INVALID_CONVERSION_RATIO',
        `Proporção "${rawRatio.trim()}" inválida`,
        'conversion_ratio',
      );
    } else {
      conversionRatio = parsedRatio;
    }
    const rawKind = cell(row, mapping, 'conversion_type').trim().toUpperCase();
    if (rawKind === '') {
      conversionType = 'SUBSCRIPTION_RECEIPT';
    } else if (rawKind !== 'SUBSCRIPTION_RECEIPT') {
      fail(
        'UNKNOWN_CONVERSION_TYPE',
        `Tipo de conversão "${rawKind}" não suportado`,
        'conversion_type',
      );
    } else {
      conversionType = rawKind;
    }
    if (
      targetQuantity !== undefined &&
      conversionRatio !== undefined &&
      quantity !== null &&
      !conversionRatioHolds(quantity, conversionRatio, targetQuantity)
    ) {
      fail(
        'CONVERSION_RATIO_MISMATCH',
        'Quantidade destino inconsistente com quantidade origem × proporção',
        'target_quantity',
      );
    }
    const rawConfidence = cell(row, mapping, 'date_confidence').trim().toUpperCase();
    if (rawConfidence !== '' && rawConfidence !== 'EXACT' && rawConfidence !== 'BOUNDED' && rawConfidence !== 'UNKNOWN') {
      fail(
        'INVALID_DATE_CONFIDENCE',
        `Confiança de data "${rawConfidence}" inválida (EXACT, BOUNDED ou UNKNOWN)`,
        'date_confidence',
      );
    } else {
      if (rawConfidence === 'BOUNDED' || rawConfidence === 'UNKNOWN') {
        dateConfidence = rawConfidence;
      }
      if (status === 'READY' && dateConfidence !== 'EXACT') {
        status = 'NEEDS_REVIEW';
        issues.push({
          code: 'CONVERSION_DATE_UNVERIFIED',
          field: 'date',
          message:
            'Conversão de recibo identificada, mas a data exata não foi encontrada nas fontes disponíveis. O evento não será importado até que a data seja comprovada.',
        });
      }
    }
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
    ...(isConversion && targetTicker ? { targetTicker } : {}),
    ...(isConversion && targetQuantity ? { targetQuantity } : {}),
    ...(isConversion && conversionRatio ? { conversionRatio } : {}),
    ...(isConversion && conversionType ? { conversionType } : {}),
    ...(isConversion ? { dateConfidence } : {}),
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
