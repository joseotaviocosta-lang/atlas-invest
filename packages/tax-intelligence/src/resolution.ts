/**
 * Pure tax-cost resolution over VERIFIED documentary evidence (ADR-312, CTE-1).
 *
 * Answers, for one portfolio/account/asset scope: what cost quantity is known
 * from ledger lots, what quantity is safely complemented by VERIFIED evidence,
 * what remains unresolved, and whether the scope is tax-cost complete.
 *
 * The resolver NEVER calculates tax, NEVER touches I/O, NEVER reads the clock
 * (asOfDate is injected), and performs NO floating-point math — Quantity and
 * Money (Decimal, 40 digits) exclusively. Ledger-known cost always wins;
 * unknown cost is never zero; ambiguity fails closed to BLOCKED.
 */
import {
  assertValidCurrency,
  computeCostLotKey,
  LocalDate,
  Money,
  Quantity,
  DomainError,
} from '@atlas/domain';

export const TAX_COST_RESOLUTION_VERSION = '0.1.0';

export class InvalidTaxCostResolutionInput extends DomainError {
  constructor(message: string) {
    super(message, 'TAX_COST_RESOLUTION.INVALID_INPUT');
  }
}

export type TaxCostResolutionStatus =
  | 'COMPLETE_LEDGER_ONLY'
  | 'COMPLETE_WITH_VERIFIED_EVIDENCE'
  | 'PARTIAL'
  | 'BLOCKED'
  | 'UNKNOWN';

export type TaxCostLotSource = 'LEDGER' | 'VERIFIED_EVIDENCE';

/** Normalized ledger-known cost contribution (adapter input, PART G). */
export interface TaxResolutionLedgerLotInput {
  readonly transactionId: string;
  readonly quantity: string;
  readonly acquisitionDate: string;
  readonly unitCost?: string;
  readonly totalCost: string;
  readonly currency: string;
}

/** Normalized evidence row (adapter input; currency decided from supersedesId). */
export interface TaxResolutionEvidenceRowInput {
  readonly evidenceId: string;
  readonly evidenceVersion: number;
  readonly evidenceFingerprint: string;
  readonly evidenceType?: string;
  readonly accountId: string;
  readonly assetId: string;
  readonly acquisitionDate?: string | null;
  readonly quantityCovered: string;
  readonly unitCost?: string | null;
  readonly totalCost?: string | null;
  readonly currency: string;
  readonly status: string;
  readonly supersedesId?: string | null;
  readonly verifiedBy?: string | null;
  readonly verifiedAt?: string | null;
}

export interface ResolveTaxCostInput {
  readonly portfolioId: string;
  readonly accountId: string;
  readonly assetId: string;
  readonly positionQuantity: string;
  readonly positionCurrency: string;
  readonly ledgerLots: readonly TaxResolutionLedgerLotInput[];
  readonly evidenceRows: readonly TaxResolutionEvidenceRowInput[];
  /** Civil date scope for future disposal-date resolution (PART V/W). */
  readonly asOfDate?: string;
}

export interface TaxCostLot {
  readonly portfolioId: string;
  readonly accountId: string;
  readonly assetId: string;
  readonly quantity: string;
  readonly acquisitionDate: string;
  readonly currency: string;
  readonly unitCost: string;
  readonly totalCost: string;
  readonly sourceKind: TaxCostLotSource;
  readonly transactionId?: string;
  readonly evidenceId?: string;
  readonly evidenceVersion?: number;
  readonly evidenceFingerprint?: string;
}

export interface TaxCostResolutionSource {
  readonly kind: 'LEDGER' | 'VERIFIED_EVIDENCE';
  readonly label: string;
}

export interface TaxCostResolutionIssue {
  readonly code: string;
  readonly message: string;
}

export interface TaxCostResolution {
  readonly portfolioId: string;
  readonly accountId: string;
  readonly assetId: string;
  readonly asOfDate?: string;
  readonly positionQuantity: string;
  readonly ledgerKnownQuantity: string;
  readonly evidenceKnownQuantity: string;
  readonly coveredQuantity: string;
  readonly uncoveredQuantity: string;
  readonly currency: string | null;
  readonly resolvedCost: string | null;
  readonly resolvedAverageCost: string | null;
  readonly status: TaxCostResolutionStatus;
  readonly lots: readonly TaxCostLot[];
  readonly sources: readonly TaxCostResolutionSource[];
  readonly issues: readonly TaxCostResolutionIssue[];
}

function fail(message: string): never {
  throw new InvalidTaxCostResolutionInput(message);
}

function requireId(value: string, field: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) fail(`Missing scope identity: '${field}' is required`);
  return trimmed;
}

interface ParsedLedgerLot {
  readonly transactionId: string;
  readonly quantity: Quantity;
  readonly acquisitionDate: LocalDate;
  readonly unitCost?: Money;
  readonly totalCost: Money;
  readonly lotKey: string;
}

interface ParsedEvidence {
  readonly row: TaxResolutionEvidenceRowInput;
  readonly quantity: Quantity;
  readonly acquisitionDate: LocalDate;
  readonly unitCost?: Money;
  readonly totalCost: Money;
  readonly lotKey: string;
}

export function resolveTaxCost(input: ResolveTaxCostInput): TaxCostResolution {
  const portfolioId = requireId(input.portfolioId, 'portfolioId');
  const accountId = requireId(input.accountId, 'accountId');
  const assetId = requireId(input.assetId, 'assetId');
  const currency = assertValidCurrency(input.positionCurrency);
  const asOf = input.asOfDate !== undefined ? LocalDate.from(input.asOfDate) : undefined;

  let positionQty: Quantity;
  try {
    positionQty = Quantity.from(input.positionQuantity);
  } catch {
    fail(`Invalid position quantity '${input.positionQuantity}'`);
    throw new Error('unreachable');
  }
  if (!positionQty.isPositive()) {
    return unknownResolution(input, 'UNKNOWN_POSITION_QUANTITY', 'Position quantity is missing or not positive; cost cannot be resolved.');
  }

  const issues: TaxCostResolutionIssue[] = [];
  const block = (code: string, message: string): void => {
    issues.push({ code, message });
  };
  let blocked = false;

  // --- Ledger lots: parse, currency-gate, as-of scope ---
  const ledgerLots: ParsedLedgerLot[] = [];
  const ledgerKeys = new Set<string>();
  for (const lot of input.ledgerLots) {
    let quantity: Quantity;
    let totalCost: Money;
    let acquisitionDate: LocalDate;
    try {
      quantity = Quantity.from(lot.quantity);
      totalCost = Money.from(lot.totalCost, lot.currency);
      acquisitionDate = LocalDate.from(lot.acquisitionDate);
    } catch {
      blocked = true;
      block('INVALID_LOT_INPUT', `Ledger lot '${lot.transactionId}' has malformed quantity, cost or date.`);
      continue;
    }
    if (!quantity.isPositive()) {
      blocked = true;
      block('INVALID_LOT_INPUT', `Ledger lot '${lot.transactionId}' has non-positive quantity.`);
      continue;
    }
    if (lot.currency !== currency) {
      blocked = true;
      block('LEDGER_CURRENCY_MISMATCH', `Ledger lot '${lot.transactionId}' currency '${lot.currency}' differs from position currency '${currency}'.`);
      continue;
    }
    if (asOf && acquisitionDate.toString() > asOf.toString()) continue;
    let unitCost: Money | undefined;
    if (lot.unitCost !== undefined) {
      try {
        unitCost = Money.from(lot.unitCost, currency);
      } catch {
        blocked = true;
        block('INVALID_LOT_INPUT', `Ledger lot '${lot.transactionId}' has malformed unit cost.`);
        continue;
      }
    }
    const lotKey = computeCostLotKey({
      assetId, accountId, acquisitionDate: acquisitionDate.toString(),
      quantityCovered: quantity.value, unitCost: unitCost?.amount,
      totalCost: totalCost.amount, currency,
    });
    ledgerLots.push({ transactionId: lot.transactionId, quantity, acquisitionDate, unitCost, totalCost, lotKey });
    ledgerKeys.add(lotKey);
  }

  // --- Evidence: currency set = current (un-superseded) rows ---
  const superseded = new Set<string>();
  for (const row of input.evidenceRows) {
    if (row.supersedesId) superseded.add(row.supersedesId);
  }
  const eligible: ParsedEvidence[] = [];
  const seenLotKeys = new Set<string>();
  for (const row of input.evidenceRows) {
    if (row.accountId !== accountId || row.assetId !== assetId) continue;
    if (superseded.has(row.evidenceId)) {
      block('EVIDENCE_NOT_CURRENT', `Evidence '${row.evidenceId}' was superseded and no longer contributes.`);
      continue;
    }
    if (row.status !== 'VERIFIED') {
      block('EVIDENCE_NOT_VERIFIED', `Evidence '${row.evidenceId}' status '${row.status}' is not VERIFIED.`);
      continue;
    }
    if (!row.acquisitionDate) {
      block('EVIDENCE_MISSING_ACQUISITION_DATE', `Evidence '${row.evidenceId}' has no exact acquisition date.`);
      continue;
    }
    let acquisitionDate: LocalDate;
    try {
      acquisitionDate = LocalDate.from(row.acquisitionDate);
    } catch {
      block('EVIDENCE_MISSING_ACQUISITION_DATE', `Evidence '${row.evidenceId}' has an invalid acquisition date.`);
      continue;
    }
    if (asOf && acquisitionDate.toString() > asOf.toString()) {
      block('EVIDENCE_TEMPORALLY_INVALID', `Evidence '${row.evidenceId}' acquisition ${acquisitionDate.toString()} is after scope date ${asOf.toString()}.`);
      continue;
    }
    if (row.currency !== currency) {
      blocked = true;
      block('EVIDENCE_CURRENCY_MISMATCH', `Evidence '${row.evidenceId}' currency '${row.currency}' differs from position currency '${currency}'.`);
      continue;
    }
    let quantity: Quantity;
    try {
      quantity = Quantity.from(row.quantityCovered);
    } catch {
      block('INVALID_LOT_INPUT', `Evidence '${row.evidenceId}' has malformed quantity.`);
      continue;
    }
    if (!quantity.isPositive()) {
      block('INVALID_LOT_INPUT', `Evidence '${row.evidenceId}' has non-positive quantity.`);
      continue;
    }
    const unitCost = row.unitCost ? checkedMoney(row.unitCost, currency, row.evidenceId, 'unit cost', issues) : undefined;
    const totalCost = row.totalCost ? checkedMoney(row.totalCost, currency, row.evidenceId, 'total cost', issues) : undefined;
    if (!unitCost && !totalCost) {
      block('INVALID_LOT_INPUT', `Evidence '${row.evidenceId}' carries no cost side.`);
      continue;
    }
    const resolvedTotal = totalCost ?? unitCost!.multiply(quantity.value);
    const resolvedUnit = unitCost ?? resolvedTotal.divide(quantity.value);
    if (unitCost && totalCost && !unitCost.multiply(quantity.value).equals(totalCost)) {
      blocked = true;
      block('EVIDENCE_CONFLICT', `Evidence '${row.evidenceId}' unit cost × quantity disagrees with its total cost.`);
      continue;
    }
    const lotKey = computeCostLotKey({
      assetId, accountId, acquisitionDate: acquisitionDate.toString(),
      quantityCovered: quantity.value, unitCost: resolvedUnit.amount,
      totalCost: resolvedTotal.amount, currency,
    });
    // Ledger precedence: restated known lots are redundant, never re-added.
    if (ledgerKeys.has(lotKey)) {
      block('EVIDENCE_REDUNDANT', `Evidence '${row.evidenceId}' restates a ledger-known lot and was excluded.`);
      continue;
    }
    // Same economics, different cost, against a known lot → conflict.
    // (Same date+quantity+currency with a different total.)
    if (seenLotKeys.has(lotKey)) {
      block('EVIDENCE_DUPLICATE', `Evidence '${row.evidenceId}' duplicates an already-counted lot and was excluded.`);
      continue;
    }
    seenLotKeys.add(lotKey);
    eligible.push({ row, quantity, acquisitionDate, unitCost: resolvedUnit, totalCost: resolvedTotal, lotKey });
  }

  // Cross-check: evidence claiming different cost for ledger-known (date, qty).
  for (const ev of eligible) {
    for (const lot of ledgerLots) {
      const sameEconomics =
        lot.acquisitionDate.toString() === ev.acquisitionDate.toString() &&
        lot.quantity.value === ev.quantity.value &&
        lot.totalCost.currency === currency;
      if (sameEconomics && lot.totalCost.amount !== ev.totalCost.amount) {
        blocked = true;
        block('EVIDENCE_CONFLICT', `Evidence '${ev.row.evidenceId}' disagrees with ledger-known cost for the same lot.`);
      }
    }
  }

  // Cross-check: two eligible evidence rows with identical economics but
  // incompatible costs (PART T) — no arbitrary winner, fail closed.
  const economicsGroups = new Map<string, Set<string>>();
  const economicsWitness = new Map<string, string>();
  for (const ev of eligible) {
    const key = [accountId, assetId, ev.acquisitionDate.toString(), ev.quantity.value, currency].join('|');
    const costs = economicsGroups.get(key) ?? new Set<string>();
    costs.add(ev.totalCost.amount);
    economicsGroups.set(key, costs);
    if (!economicsWitness.has(key)) economicsWitness.set(key, ev.row.evidenceId);
  }
  for (const [key, costs] of economicsGroups) {
    if (costs.size > 1) {
      blocked = true;
      block('EVIDENCE_CONFLICT', `Conflicting evidence costs for the same acquisition (${key}) starting at '${economicsWitness.get(key)}'.`);
    }
  }

  const ledgerQty = ledgerLots.reduce((acc, lot) => acc.add(lot.quantity), Quantity.zero());
  const evidenceQty = eligible.reduce((acc, ev) => acc.add(ev.quantity), Quantity.zero());
  const covered = ledgerQty.add(evidenceQty);
  if (covered.compare(positionQty) > 0) {
    blocked = true;
    block('EVIDENCE_OVER_COVERAGE', `Covered quantity '${covered.value}' exceeds position quantity '${positionQty.value}'.`);
  }
  if (ledgerQty.compare(positionQty) > 0) {
    blocked = true;
    block('EVIDENCE_QUANTITY_CONFLICT', `Ledger-known quantity '${ledgerQty.value}' exceeds position quantity '${positionQty.value}'.`);
  }
  const uncovered = positionQty.subtract(covered);

  let resolvedCost: Money | null = null;
  if (!blocked) {
    let sum = Money.zero(currency);
    for (const lot of ledgerLots) sum = sum.add(lot.totalCost);
    for (const ev of eligible) sum = sum.add(ev.totalCost);
    resolvedCost = sum;
  }

  let status: TaxCostResolutionStatus;
  if (blocked) {
    status = 'BLOCKED';
  } else if (uncovered.isZero()) {
    status = evidenceQty.isZero() ? 'COMPLETE_LEDGER_ONLY' : 'COMPLETE_WITH_VERIFIED_EVIDENCE';
  } else {
    status = 'PARTIAL';
  }

  // Average only on full coverage — never imply a whole-position average early.
  const resolvedAverageCost =
    !blocked && uncovered.isZero() && !covered.isZero()
      ? resolvedCost!.divide(covered.value)
      : null;

  const lots: TaxCostLot[] = [];
  if (!blocked) {
    for (const lot of ledgerLots) {
      lots.push({
        portfolioId, accountId, assetId,
        quantity: lot.quantity.value,
        acquisitionDate: lot.acquisitionDate.toString(),
        currency,
        unitCost: lot.unitCost ? lot.unitCost.amount : lot.totalCost.divide(lot.quantity.value).amount,
        totalCost: lot.totalCost.amount,
        sourceKind: 'LEDGER',
        transactionId: lot.transactionId,
      });
    }
    for (const ev of eligible) {
      lots.push({
        portfolioId, accountId, assetId,
        quantity: ev.quantity.value,
        acquisitionDate: ev.acquisitionDate.toString(),
        currency,
        unitCost: ev.unitCost!.amount,
        totalCost: ev.totalCost.amount,
        sourceKind: 'VERIFIED_EVIDENCE',
        evidenceId: ev.row.evidenceId,
        evidenceVersion: ev.row.evidenceVersion,
        evidenceFingerprint: ev.row.evidenceFingerprint,
      });
    }
  }

  const sources = [];
  if (ledgerLots.length > 0 && !blocked) {
    sources.push({ kind: 'LEDGER', label: `${ledgerLots.length} ledger lot(s)` } as const);
  }
  if (eligible.length > 0 && !blocked) {
    sources.push({ kind: 'VERIFIED_EVIDENCE', label: `${eligible.length} evidence lot(s)` } as const);
  }

  const result: TaxCostResolution = {
    portfolioId, accountId, assetId,
    ...(asOf ? { asOfDate: asOf.toString() } : {}),
    positionQuantity: positionQty.value,
    ledgerKnownQuantity: ledgerQty.value,
    evidenceKnownQuantity: evidenceQty.value,
    coveredQuantity: covered.value,
    uncoveredQuantity: uncovered.value,
    currency,
    resolvedCost: resolvedCost ? resolvedCost.amount : null,
    resolvedAverageCost: resolvedAverageCost ? resolvedAverageCost.amount : null,
    status,
    lots: Object.freeze(lots),
    sources: Object.freeze(sources),
    issues: Object.freeze([...issues]),
  };
  return Object.freeze(result);
}

function checkedMoney(
  raw: string,
  currency: string,
  evidenceId: string,
  field: string,
  issues: TaxCostResolutionIssue[],
): Money | undefined {
  try {
    const money = Money.from(raw.trim(), currency);
    if (!money.isPositive() && !money.isZero()) {
      issues.push({ code: 'INVALID_LOT_INPUT', message: `Evidence '${evidenceId}' has negative ${field}.` });
      return undefined;
    }
    return money;
  } catch {
    issues.push({ code: 'INVALID_LOT_INPUT', message: `Evidence '${evidenceId}' has malformed ${field}.` });
    return undefined;
  }
}

function unknownResolution(
  input: ResolveTaxCostInput,
  code: string,
  message: string,
): TaxCostResolution {
  return Object.freeze({
    portfolioId: (input.portfolioId ?? '').trim(),
    accountId: (input.accountId ?? '').trim(),
    assetId: (input.assetId ?? '').trim(),
    ...(input.asOfDate ? { asOfDate: input.asOfDate } : {}),
    positionQuantity: (input.positionQuantity ?? '').trim(),
    ledgerKnownQuantity: Quantity.zero().value,
    evidenceKnownQuantity: Quantity.zero().value,
    coveredQuantity: Quantity.zero().value,
    uncoveredQuantity: Quantity.zero().value,
    currency: null,
    resolvedCost: null,
    resolvedAverageCost: null,
    status: 'UNKNOWN' as const,
    lots: Object.freeze([]),
    sources: Object.freeze([]),
    issues: Object.freeze([{ code, message }]),
  });
}
