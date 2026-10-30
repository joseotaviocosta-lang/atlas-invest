/**
 * Phase R1 — B3 Movimentação (custody movement statement) parser & classifier.
 *
 * Pure, deterministic, zero I/O. Reads the official 8-column B3 movement
 * layout (Entrada/Saída | Data | Movimentação | Produto | Instituição |
 * Quantidade | Preço unitário | Valor da Operação) and routes every row to
 * exactly one outcome:
 *
 * - a ledger `NormalizedCandidate` (only for classes the ledger can represent
 *   honestly: BONUS with unknown cost, fraction-auction SELL, plain custody
 *   TRANSFER legs, and SUBSCRIPTION exercises with a factual exercise price),
 *   or
 * - a `MovementNotice` (cash-only, informational, review-required,
 *   unsupported) that can NEVER reach the ledger — confirm ignores notices
 *   structurally (PART P: no mass import).
 *
 * Hard invariants:
 * - Unknown cost is never zero (bonus carries no assignedCost; the engine
 *   keeps INCOMPLETE per ADR-049).
 * - A priced "bonus" never auto-converts (BONUS_WITH_PRICE → NEEDS_REVIEW).
 * - Settlement shadows never become trades (explicit matcher, else REVIEW).
 * - Pre-baseline trades never auto-persist (COVERED_BY_OPENING_SNAPSHOT gate).
 * - Unknown movement labels fail closed to REVIEW_REQUIRED, never silent.
 * - Exact decimals (strings) and civil dates only. Zero floats.
 */

import type ExcelJS from 'exceljs';
import { LocalDate } from '@atlas/domain';
import { normalizeDecimalString } from './normalize';
import { normalizeB3InstitutionName } from './b3-institutions';
import { applyPreBaselineSnapshotGate } from './pre-baseline';
import {
  MAX_IMPORT_ROWS,
  type ClassifiedCandidate,
  type ExistingLedgerRow,
  type ImportIssue,
  type ImportRowStatus,
  type NormalizedCandidate,
} from './types';

export const MOVEMENT_PREVIEW_GROUPS = [
  'SUPPORTED_CUSTODY_EVENT',
  'SETTLEMENT_SHADOW',
  'CASH_ONLY',
  'INFORMATIONAL',
  'REVIEW_REQUIRED',
  'UNSUPPORTED',
] as const;
export type MovementPreviewGroup = (typeof MOVEMENT_PREVIEW_GROUPS)[number];

export interface B3MovementRow {
  readonly rowNumber: number;
  readonly direction: 'CREDITO' | 'DEBITO';
  readonly tradeDate: string;
  readonly movement: string;
  readonly ticker: string;
  readonly product: string;
  readonly institution: string;
  readonly quantity: string | null;
  readonly unitPrice: string | null;
  readonly operationValue: string | null;
}

export interface MovementNotice {
  readonly rowNumber: number;
  readonly group: MovementPreviewGroup;
  readonly movement: string;
  readonly ticker: string;
  readonly tradeDate: string | null;
  readonly quantity: string | null;
  readonly reasonCode: string;
  readonly message: string;
}

export interface ParsedMovementSheet {
  readonly rows: readonly B3MovementRow[];
}

function normHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function cellString(cell: ExcelJS.Cell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  const val = cell.value;
  if (typeof val === 'object') {
    if (val instanceof Date) {
      const y = val.getUTCFullYear();
      const m = String(val.getUTCMonth() + 1).padStart(2, '0');
      const d = String(val.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if ('result' in val && val.result !== undefined && val.result !== null) {
      return String(val.result).trim();
    }
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText
        .map((chunk) => chunk.text)
        .join('')
        .trim();
    }
    if ('text' in val && typeof val.text === 'string') {
      return val.text.trim();
    }
  }
  return String(val).trim();
}

function parseDecimalOrNull(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') return null;
  if (trimmed.includes(',')) {
    const withoutThousands = trimmed.replace(/\./g, '');
    const withDot = withoutThousands.replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(withDot) ? withDot : null;
  }
  if (/^-?\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    const withoutThousands = trimmed.replace(/\./g, '');
    return /^-?\d+$/.test(withoutThousands) ? withoutThousands : null;
  }
  return normalizeDecimalString(trimmed);
}

function parseCivilDateOrNull(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') return null;
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = brMatch ? `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}` : trimmed;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  try {
    LocalDate.from(iso);
    return iso;
  } catch {
    return null;
  }
}

function tickerOf(product: string): string {
  return (product.split(' ')[0] ?? '').split('-')[0]!.trim().toUpperCase();
}

export function extractMovementRows(
  worksheet: ExcelJS.Worksheet,
  maxRows: number = MAX_IMPORT_ROWS,
): B3MovementRow[] {
  let headerRowNum = -1;
  const colMap: Record<string, number> = {};
  for (let r = 1; r <= Math.min(10, worksheet.rowCount); r++) {
    const row = worksheet.getRow(r);
    const cells: Array<{ col: number; norm: string }> = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      cells.push({ col: colNumber, norm: normHeader(cellString(cell)) });
    });
    const hasInOut = cells.some((c) => c.norm === 'entradasaida');
    const hasMov = cells.some((c) => c.norm === 'movimentacao');
    const hasVal = cells.some((c) => c.norm === 'valordaoperacao');
    if (hasInOut && hasMov && hasVal) {
      headerRowNum = r;
      for (const c of cells) {
        if (c.norm === 'entradasaida') colMap.direction = c.col;
        if (c.norm === 'data') colMap.date = c.col;
        if (c.norm === 'movimentacao') colMap.movement = c.col;
        if (c.norm === 'produto') colMap.product = c.col;
        if (c.norm === 'instituicao') colMap.institution = c.col;
        if (c.norm === 'quantidade') colMap.quantity = c.col;
        if (c.norm === 'precounitario') colMap.price = c.col;
        if (c.norm === 'valordaoperacao') colMap.value = c.col;
      }
      break;
    }
  }
  if (
    headerRowNum === -1 ||
    !colMap.direction ||
    !colMap.date ||
    !colMap.movement ||
    !colMap.product ||
    !colMap.quantity
  ) {
    throw new Error(
      'Colunas obrigatórias da Movimentação B3 ausentes (Entrada/Saída, Data, Movimentação, Produto, Quantidade).',
    );
  }

  const rows: B3MovementRow[] = [];
  let processed = 0;
  for (let r = headerRowNum + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const get = (col?: number): string => (col ? cellString(row.getCell(col)) : '');
    const directionRaw = get(colMap.direction);
    const dateRaw = get(colMap.date);
    const movementRaw = get(colMap.movement);
    const productRaw = get(colMap.product);
    const qtyRaw = get(colMap.quantity);
    if (!directionRaw && !dateRaw && !movementRaw && !productRaw && !qtyRaw) continue;
    const normFirst = normHeader(dateRaw);
    if (normFirst.startsWith('total') || normFirst.startsWith('subtotal') || normFirst === 'data') {
      continue;
    }
    processed++;
    if (processed > maxRows) {
      throw new Error(`Arquivo excede o limite de ${maxRows} linhas por importação.`);
    }
    const dirUpper = directionRaw.trim().toUpperCase();
    rows.push({
      rowNumber: r,
      direction: dirUpper.startsWith('DEB') ? 'DEBITO' : 'CREDITO',
      tradeDate: parseCivilDateOrNull(dateRaw) ?? '',
      movement: movementRaw.trim(),
      ticker: tickerOf(productRaw),
      product: productRaw.trim().slice(0, 80),
      institution: get(colMap.institution).trim(),
      quantity: parseDecimalOrNull(qtyRaw),
      unitPrice: parseDecimalOrNull(get(colMap.price)),
      operationValue: parseDecimalOrNull(get(colMap.value)),
    });
  }
  return rows;
}

export type MappedMovementOutcome =
  | { readonly kind: 'candidate'; readonly candidate: NormalizedCandidate }
  | { readonly kind: 'notice'; readonly notice: MovementNotice };

export interface MapMovementOptions {
  readonly fileName: string;
  readonly today: string;
}

function notice(
  row: B3MovementRow,
  group: MovementPreviewGroup,
  reasonCode: string,
  message: string,
): MappedMovementOutcome {
  return {
    kind: 'notice',
    notice: {
      rowNumber: row.rowNumber,
      group,
      movement: row.movement,
      ticker: row.ticker,
      tradeDate: row.tradeDate === '' ? null : row.tradeDate,
      quantity: row.quantity,
      reasonCode,
      message,
    },
  };
}

function movementExternalId(fileName: string, row: B3MovementRow, extra = ''): string {
  return `B3MOV|${fileName}|${row.rowNumber}|${row.tradeDate}|${row.movement}|${row.ticker}|${row.quantity ?? ''}|${row.direction}${extra}`;
}

function movementNotes(fileName: string, row: B3MovementRow, suffix = ''): string {
  return `B3 Movimentação ${fileName} (linha ${row.rowNumber}) — ${row.movement}${suffix}`;
}

function baseCandidate(
  row: B3MovementRow,
  fileName: string,
  operation: NormalizedCandidate['operation'],
  quantity: string,
  unitPrice: string,
  extraNotes = '',
): NormalizedCandidate {
  const broker = row.institution;
  return {
    rowNumber: row.rowNumber,
    tradeDate: row.tradeDate,
    ticker: row.ticker,
    operation,
    rawOperation: row.movement,
    quantity,
    unitPrice,
    fees: '0',
    currency: 'BRL',
    ...(broker === '' ? {} : { brokerLabel: broker }),
    ...(broker === '' ? {} : { normalizedInstitution: normalizeB3InstitutionName(broker) }),
    externalId: movementExternalId(fileName, row),
    notes: movementNotes(fileName, row, extraNotes),
    status: 'READY' as ImportRowStatus,
    issues: [] as ImportIssue[],
  };
}

function isPositiveDecimal(value: string | null): value is string {
  if (value === null) return false;
  if (!/^\d+(\.\d+)?$/.test(value)) return false;
  return !/^0+(\.0+)?$/.test(value);
}

const CASH_ONLY_LABELS = new Set([
  'DIVIDENDO',
  'JUROS SOBRE CAPITAL PROPRIO',
  'RENDIMENTO',
  'REEMBOLSO',
  'RESTITUICAO DE CAPITAL',
  'JUROS SOBRE CAPITAL PROPRIO - TRANSFERIDO',
  'RENDIMENTO - TRANSFERIDO',
]);

const SUBSCRIPTION_LIFECYCLE_LABELS = new Set([
  'DIREITO DE SUBSCRICAO',
  'DIREITO SOBRAS DE SUBSCRICAO',
  'DIREITO SOBRAS DE SUBSCRICAO - NAO EXERCIDO',
  'DIREITOS DE SUBSCRICAO - NAO EXERCIDO',
  'RECIBO DE SUBSCRICAO',
  'SOLICITACAO DE SUBSCRICAO',
  'CESSAO DE DIREITOS',
  'CESSAO DE DIREITOS - SOLICITADA',
]);

function normMovementLabel(movement: string): string {
  return movement
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Derives the parent asset ticker from an FII subscription-right ticker.
 * Rights trade as `<BASE>1[234]` (e.g. SNAG12, MXRF12) while the parent trades
 * as `<BASE>11`. Returns null for anything else (stock rights such as HYPE1
 * have no derivable parent and stay in manual review — never guessed).
 */
export function parentTickerOfSubscriptionRight(rightsTicker: string): string | null {
  const match = /^([A-Z0-9]{4,})1([234])$/.exec(rightsTicker.trim().toUpperCase());
  if (!match) return null;
  return `${match[1]}11`;
}

/**
 * Routes one movement row. Only BONUS (unknown cost), fraction-auction SELL,
 * SUBSCRIPTION exercises with factual price, and plain custody TRANSFER legs
 * become ledger candidates; everything else becomes a notice that confirm
 * ignores structurally.
 */
export function mapMovementRow(
  row: B3MovementRow,
  options: MapMovementOptions,
  fractionPairQty: string | null = null,
): MappedMovementOutcome {
  if (row.tradeDate === '') {
    return notice(
      row,
      'REVIEW_REQUIRED',
      'INVALID_MOVEMENT_ROW',
      'Linha sem data civil válida precisa de revisão; nada foi importado.',
    );
  }
  if (row.tradeDate > options.today) {
    return notice(
      row,
      'REVIEW_REQUIRED',
      'FUTURE_MOVEMENT_DATE',
      `Movimentação em ${row.tradeDate} é futura e precisa de revisão.`,
    );
  }
  if (row.ticker === '') {
    return notice(
      row,
      'REVIEW_REQUIRED',
      'MISSING_MOVEMENT_TICKER',
      'Linha sem identificador de ativo precisa de revisão.',
    );
  }

  const label = normMovementLabel(row.movement);

  // 1. Bonus: quantity-only corporate action, unknown cost (never zero).
  if (label === 'BONIFICACAO EM ATIVOS' || label === 'BONIFICACAO') {
    if (!isPositiveDecimal(row.quantity)) {
      return notice(
        row,
        'REVIEW_REQUIRED',
        'BONUS_WITHOUT_QUANTITY',
        'Bonificação sem quantidade positiva precisa de revisão.',
      );
    }
    if (row.unitPrice !== null && !/^0+(\.0+)?$/.test(row.unitPrice)) {
      return {
        kind: 'candidate',
        candidate: {
          ...baseCandidate(
            row,
            options.fileName,
            'BONUS',
            row.quantity,
            '0',
            ' | sem custo atribuído (custo desconhecido)',
          ),
          status: 'NEEDS_REVIEW',
          issues: [
            {
              code: 'BONUS_WITH_PRICE',
              field: 'unit_price',
              message: 'Bonificação com preço informado precisa de revisão (custo desconhecido)',
            },
          ],
        },
      };
    }
    return {
      kind: 'candidate',
      candidate: baseCandidate(
        row,
        options.fileName,
        'BONUS',
        row.quantity!,
        '0',
        ' | sem custo atribuído (custo desconhecido)',
      ),
    };
  }

  // 2. Subscription exercise (débito of rights with factual exercise price):
  // books an onerous SUBSCRIPTION on the PARENT asset (rights ticker → parent
  // ticker, e.g. SNAG12 → SNAG11). Quantity known + price unknown is never
  // READY; zero-price and inferred prices are impossible by construction.
  if (label === 'DIREITOS DE SUBSCRICAO - EXERCIDO') {
    const parent = parentTickerOfSubscriptionRight(row.ticker);
    if (parent === null) {
      return notice(
        row,
        'REVIEW_REQUIRED',
        'SUBSCRIPTION_PARENT_UNRESOLVED',
        `Subscrição exercida (${row.ticker}) sem ativo-mãe derivável precisa de revisão; nada foi importado.`,
      );
    }
    if (row.direction !== 'DEBITO') {
      return notice(
        row,
        'REVIEW_REQUIRED',
        'SUBSCRIPTION_UNEXPECTED_DIRECTION',
        `Subscrição exercida (${row.ticker}) fora do débito de direitos esperado precisa de revisão; nada foi importado.`,
      );
    }
    if (!isPositiveDecimal(row.quantity)) {
      return notice(
        row,
        'REVIEW_REQUIRED',
        'SUBSCRIPTION_WITHOUT_QUANTITY',
        'Subscrição exercida sem quantidade positiva precisa de revisão; nada foi importado.',
      );
    }
    if (!isPositiveDecimal(row.unitPrice)) {
      return notice(
        row,
        'REVIEW_REQUIRED',
        'SUBSCRIPTION_WITHOUT_PRICE',
        'Preço de exercício não encontrado na fonte B3. Este evento não será importado até que o custo seja informado/comprovado.',
      );
    }
    const broker = row.institution;
    return {
      kind: 'candidate',
      candidate: {
        rowNumber: row.rowNumber,
        tradeDate: row.tradeDate,
        ticker: parent,
        operation: 'SUBSCRIPTION',
        rawOperation: row.movement,
        quantity: row.quantity!,
        unitPrice: row.unitPrice!,
        fees: '0',
        currency: 'BRL',
        ...(broker === '' ? {} : { brokerLabel: broker }),
        ...(broker === '' ? {} : { normalizedInstitution: normalizeB3InstitutionName(broker) }),
        externalId: `${movementExternalId(options.fileName, row)}|PARENT:${parent}`,
        notes: `${movementNotes(options.fileName, row)} | direito ${row.ticker} exercido @ ${row.unitPrice}`,
        status: 'READY' as ImportRowStatus,
        issues: [] as ImportIssue[],
      },
    };
  }

  // 3. Fraction auction (crédito, qty + price): the auction IS the disposal.
  // The paired "Fração em Ativos" débito is consumed as provenance (fractionPairQty).
  if (label === 'LEILAO DE FRACAO') {
    if (!isPositiveDecimal(row.quantity) || !isPositiveDecimal(row.unitPrice)) {
      return notice(
        row,
        'REVIEW_REQUIRED',
        'FRACTION_AUCTION_INCOMPLETE',
        'Leilão de fração sem quantidade/preço precisa de revisão.',
      );
    }
    const pairNote =
      fractionPairQty !== null
        ? ` | fração correspondente ${fractionPairQty} (linha pareada)`
        : ' | débito de fração correspondente não localizado no arquivo (revisar)';
    return {
      kind: 'candidate',
      candidate: {
        ...baseCandidate(row, options.fileName, 'SELL', row.quantity!, row.unitPrice!, pairNote),
        ...(fractionPairQty === null
          ? {
              status: 'NEEDS_REVIEW' as ImportRowStatus,
              issues: [
                {
                  code: 'FRACTION_WITHOUT_DEBIT_PAIR',
                  field: 'quantity',
                  message:
                    'Leilão de fração sem débito de fração correspondente no arquivo precisa de revisão',
                } satisfies ImportIssue,
              ],
            }
          : {}),
      },
    };
  }

  // 4. Fraction debit alone: custody left with no proceeds in view → review.
  if (label === 'FRACAO EM ATIVOS') {
    return notice(
      row,
      'REVIEW_REQUIRED',
      'FRACTION_DEBIT_WITHOUT_AUCTION',
      'Baixa de fração sem leilão correspondente no arquivo precisa de revisão; nada foi importado.',
    );
  }

  // 5. Plain custody transfers (direction-mapped). Loan rolls and settlement
  // mirrors are downgraded later by ledger gates; never READY here.
  if (label === 'TRANSFERENCIA' || label === 'TRANSFERENCIA - LIQUIDACAO') {
    if (!isPositiveDecimal(row.quantity)) {
      return notice(
        row,
        'REVIEW_REQUIRED',
        'TRANSFER_WITHOUT_QUANTITY',
        'Transferência sem quantidade positiva precisa de revisão.',
      );
    }
    const operation = row.direction === 'DEBITO' ? 'TRANSFER_OUT' : 'TRANSFER_IN';
    const candidate = baseCandidate(
      row,
      options.fileName,
      operation,
      row.quantity!,
      row.unitPrice ?? '0',
    );
    if (row.unitPrice !== null && !/^0+(\.0+)?$/.test(row.unitPrice)) {
      return {
        kind: 'candidate',
        candidate: {
          ...candidate,
          status: 'NEEDS_REVIEW',
          issues: [
            {
              code: 'TRANSFER_WITH_PRICE',
              field: 'unit_price',
              message:
                'Transferência de custódia com preço informado precisa de revisão (venda? bonificação? liquidação de trade?)',
            },
          ],
        },
      };
    }
    return { kind: 'candidate', candidate };
  }

  // 6. Cash-only events: never custody explanations, never importable here.
  if (CASH_ONLY_LABELS.has(label)) {
    return notice(
      row,
      'CASH_ONLY',
      'CASH_ONLY_EVENT',
      `Evento de caixa (${row.movement}) não altera custódia; tratado em fase futura de cashflow/income.`,
    );
  }

  // 7. Informational markers: proven no-ops (Atualização mirrors custody).
  if (label === 'ATUALIZACAO') {
    return notice(
      row,
      'INFORMATIONAL',
      'INFORMATIONAL_POSITION_MARKER',
      'Marcador informacional de posição (Atualização); sem efeito econômico.',
    );
  }

  // 8. Stock-loan custody state: economic-neutral by construction.
  if (label === 'EMPRESTIMO') {
    if (row.quantity !== null && isPositiveDecimal(row.quantity)) {
      return notice(
        row,
        'INFORMATIONAL',
        'LOAN_CUSTODY_STATE',
        'Registro de empréstimo (doador) altera apenas disponibilidade/estado de empréstimo, nunca a propriedade econômica.',
      );
    }
    return notice(
      row,
      'CASH_ONLY',
      'LOAN_INTEREST_CASH',
      'Juros de empréstimo (quantidade zerada) são caixa, não custódia.',
    );
  }

  // 9. Subscription lifecycle: rights, requests, receipts, sobras, cessões.
  // Exercised rights WITH a factual price are handled by branch 2 above;
  // everything here lacks either a price or a conversion representation and
  // stays out of the ledger — never fabricate.
  if (SUBSCRIPTION_LIFECYCLE_LABELS.has(label)) {
    return notice(
      row,
      'REVIEW_REQUIRED',
      'SUBSCRIPTION_LIFECYCLE_MANUAL',
      `Ciclo de subscrição (${row.movement}): sem preço de exercício no arquivo e sem tipo de conversão de recibo no ledger; lançamento manual futuro com preço comprovado. Direitos cedidos/não exercidos não afetam o ativo-mãe.`,
    );
  }

  // 10. Fail closed: unknown labels need a human, never silent import.
  return notice(
    row,
    'REVIEW_REQUIRED',
    'UNKNOWN_MOVEMENT_LABEL',
    `Movimentação "${row.movement}" não classificada precisa de revisão; nada foi importado.`,
  );
}

export interface MappedMovementSheet {
  readonly candidates: readonly NormalizedCandidate[];
  readonly notices: readonly MovementNotice[];
}

/**
 * Maps a full movement sheet. Pairs fraction débitos with auction créditos
 * (ticker + exact qty) before routing, so the pair yields one SELL.
 */
export function mapMovementSheet(
  rows: readonly B3MovementRow[],
  options: MapMovementOptions,
): MappedMovementSheet {
  const auctionByKey = new Map<string, number>();
  rows.forEach((row, index) => {
    if (normMovementLabel(row.movement) === 'LEILAO DE FRACAO' && isPositiveDecimal(row.quantity)) {
      const key = `${row.ticker}|${row.quantity}`;
      if (!auctionByKey.has(key)) auctionByKey.set(key, index);
    }
  });
  const consumedDebits = new Set<number>();
  rows.forEach((row, index) => {
    if (normMovementLabel(row.movement) === 'FRACAO EM ATIVOS' && isPositiveDecimal(row.quantity)) {
      const key = `${row.ticker}|${row.quantity}`;
      if (auctionByKey.has(key)) consumedDebits.add(index);
    }
  });

  const candidates: NormalizedCandidate[] = [];
  const notices: MovementNotice[] = [];
  rows.forEach((row, index) => {
    const label = normMovementLabel(row.movement);
    if (label === 'FRACAO EM ATIVOS' && consumedDebits.has(index)) {
      return;
    }
    let pairQty: string | null = null;
    if (label === 'LEILAO DE FRACAO' && isPositiveDecimal(row.quantity)) {
      const hasPair = rows.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          normMovementLabel(other.movement) === 'FRACAO EM ATIVOS' &&
          other.ticker === row.ticker &&
          other.quantity === row.quantity,
      );
      pairQty = hasPair ? row.quantity : null;
    }
    const outcome = mapMovementRow(row, options, pairQty);
    if (outcome.kind === 'candidate') candidates.push(outcome.candidate);
    else notices.push(outcome.notice);
  });
  return { candidates, notices };
}

export interface MovementLedgerGateInput {
  readonly candidates: readonly ClassifiedCandidate[];
  readonly existing: readonly ExistingLedgerRow[];
}

const SETTLEMENT_WINDOW_DAYS = 5;

function isoAddDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function decimalEq(a: string | null, b: string | null): boolean {
  const norm = (v: string | null): string => {
    if (v === null || v.trim() === '') return '0';
    const t = v.trim();
    const neg = t.startsWith('-');
    const u = neg ? t.slice(1) : t;
    const [i = '', f = ''] = u.split('.');
    const ni = i.replace(/^0+(?=\d)/, '') || '0';
    const nf = f.replace(/0+$/, '');
    const c = nf === '' ? ni : `${ni}.${nf}`;
    if (c === '0') return '0';
    return neg ? `-${c}` : c;
  };
  return norm(a) === norm(b);
}

function normRawLabel(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, ' ');
}

/**
 * Post-classification ledger gates for movement candidates. Downgrades only —
 * a gate never upgrades a row to READY. Pure; no I/O.
 *
 * - SETTLEMENT_SHADOW: 'Transferência - Liquidação' with price matching a
 *   ledger BUY (crédito) / SELL (débito) on asset+account+qty+price within the
 *   settlement window → UNSUPPORTED (already represented, PART P).
 * - LOAN_CUSTODY_STATE: débito+crédito Transferência pair (same ticker/date/qty)
 *   → UNSUPPORTED (loan-roll signature, economic-neutral).
 * - PRE_BASELINE_COVERED_BY_OPENING_SNAPSHOT: BUY/SELL/BONUS/SUBSCRIPTION dated on/before an
 *   existing opening TRANSFER_IN for the same asset+account → NEEDS_REVIEW.
 *   Confirming as-is would double-count (canonical replay orders by tradeDate
 *   ahead of the snapshot); KCRE11-style settlement-after-baseline cases need
 *   explicit owner decision with 2025-report evidence, never silent import.
 */
export function applyMovementLedgerGates(input: MovementLedgerGateInput): ClassifiedCandidate[] {
  const { candidates, existing } = input;
  const pairKeys = new Map<string, { debito: number; credito: number }>();
  candidates.forEach((c) => {
    if (c.operation !== 'TRANSFER_IN' && c.operation !== 'TRANSFER_OUT') return;
    if (!/^TRANSFERENCIA/.test(normRawLabel(c.rawOperation))) return;
    const key = `${c.ticker}|${c.tradeDate}|${c.quantity}`;
    const entry = pairKeys.get(key) ?? { debito: 0, credito: 0 };
    if (c.operation === 'TRANSFER_OUT') entry.debito += 1;
    else entry.credito += 1;
    pairKeys.set(key, entry);
  });

  return candidates.map((candidate) => {
    const downgrade = (
      status: 'UNSUPPORTED' | 'NEEDS_REVIEW',
      code: string,
      message: string,
    ): ClassifiedCandidate => ({
      ...candidate,
      status,
      issues: [...candidate.issues, { code, message }],
    });

    // Pre-baseline gate (A4): shared snapshot-coverage check. Downgrades
    // only; eligible BUY/SELL rows are flagged for the owner-reviewed
    // unsettled-trade exception (never auto-imported).
    const [gated] = applyPreBaselineSnapshotGate({ candidates: [candidate], existing });
    if (gated!.status === 'NEEDS_REVIEW' && candidate.status === 'READY') {
      return gated!;
    }

    if (candidate.operation !== 'TRANSFER_IN' && candidate.operation !== 'TRANSFER_OUT') {
      return candidate;
    }

    const rawLabel = normRawLabel(candidate.rawOperation);
    const priced =
      candidate.unitPrice !== null &&
      candidate.unitPrice.trim() !== '' &&
      !/^0+(\.0+)?$/.test(candidate.unitPrice);

    // Settlement shadow: priced liquidation mirroring a ledger trade.
    if (rawLabel.startsWith('TRANSFERENCIA LIQUIDACAO') && priced) {
      const wantType = candidate.operation === 'TRANSFER_IN' ? 'BUY' : 'SELL';
      const from = isoAddDays(candidate.tradeDate, -SETTLEMENT_WINDOW_DAYS);
      const to = isoAddDays(candidate.tradeDate, SETTLEMENT_WINDOW_DAYS);
      const shadowOf = existing.find(
        (row) =>
          row.type === wantType &&
          row.assetId === candidate.assetId &&
          (candidate.accountId === null || row.accountId === candidate.accountId) &&
          row.tradeDate >= from &&
          row.tradeDate <= to &&
          decimalEq(row.quantity, candidate.quantity) &&
          decimalEq(row.unitPrice, candidate.unitPrice),
      );
      if (shadowOf) {
        return downgrade(
          'UNSUPPORTED',
          'SETTLEMENT_SHADOW_OF_TRADE',
          `Liquidação espelha ${wantType} ${shadowOf.quantity} @ ${shadowOf.tradeDate} já contabilizado; sem efeito no ledger.`,
        );
      }
      return downgrade(
        'NEEDS_REVIEW',
        'UNMATCHED_PRICED_SETTLEMENT',
        'Liquidação com preço sem trade correspondente no ledger precisa de revisão (trade fora da janela importada? empréstimo?). Nada foi importado.',
      );
    }

    // Loan-roll signature: mirrored débito+crédito pair, same ticker/date/qty.
    const pairKey = `${candidate.ticker}|${candidate.tradeDate}|${candidate.quantity}`;
    const pair = pairKeys.get(pairKey);
    if (pair && pair.debito > 0 && pair.credito > 0) {
      return downgrade(
        'UNSUPPORTED',
        'LOAN_CUSTODY_STATE',
        'Par espelhado débito+crédito (assinatura de giro de empréstimo); altera apenas disponibilidade, nunca a propriedade econômica.',
      );
    }

    return downgrade(
      'NEEDS_REVIEW',
      'TRANSFER_NEEDS_COUNTERPARTY',
      'Transferência sem contraparte identificável no arquivo precisa de revisão; nada foi importado.',
    );
  });
}

export interface MovementPreviewSummary {
  readonly totalRows: number;
  readonly supportedCustodyEvents: number;
  readonly settlementShadows: number;
  readonly cashOnly: number;
  readonly informational: number;
  readonly reviewRequired: number;
  readonly unsupported: number;
}

export function summarizeMovementPreview(
  candidates: readonly { status: ImportRowStatus; issues: readonly { code: string }[] }[],
  notices: readonly MovementNotice[],
): MovementPreviewSummary {
  const hasCode = (issues: readonly { code: string }[], ...codes: string[]): boolean =>
    issues.some((i) => codes.includes(i.code));
  let supportedCustodyEvents = 0;
  let settlementShadows = 0;
  let unsupported = 0;
  let reviewRequired = 0;
  for (const c of candidates) {
    if (c.status === 'READY') supportedCustodyEvents++;
    else if (hasCode(c.issues, 'SETTLEMENT_SHADOW_OF_TRADE')) settlementShadows++;
    else if (c.status === 'UNSUPPORTED') unsupported++;
    else reviewRequired++;
  }
  let cashOnly = 0;
  let informational = 0;
  for (const n of notices) {
    if (n.group === 'CASH_ONLY') cashOnly++;
    else if (n.group === 'INFORMATIONAL') informational++;
    else if (n.group === 'REVIEW_REQUIRED') reviewRequired++;
    else unsupported++;
  }
  return {
    totalRows: candidates.length + notices.length,
    supportedCustodyEvents,
    settlementShadows,
    cashOnly,
    informational,
    reviewRequired,
    unsupported,
  };
}
