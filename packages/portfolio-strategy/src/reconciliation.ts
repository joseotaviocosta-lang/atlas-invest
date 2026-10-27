import { DomainError } from '@atlas/domain';
import { createHash } from 'node:crypto';
import { canonicalDecimal } from './scenario';

export class InvalidReconciliationInputError extends DomainError {
  constructor(message: string) {
    super(message, 'PORTFOLIO.INVALID_RECONCILIATION');
    this.name = 'InvalidReconciliationInputError';
  }
}

/**
 * Phase 5S-B — reconciliation comparison (pure, zero I/O).
 *
 * Semantic field-level comparison between a source fact and a local
 * canonical fact. Exact decimal/date/identity math only.
 * Matching reasons are factual equalities only.
 */

export const RECONCILIATION_STATES = [
  'MATCHED',
  'DIVERGENT',
  'MISSING_LOCAL',
  'MISSING_SOURCE',
  'UNRESOLVED',
] as const;
export type ReconciliationState = (typeof RECONCILIATION_STATES)[number];

export const DIFFERENCE_KINDS = [
  'DATE_DIFFERENCE',
  'AMOUNT_DIFFERENCE',
  'QUANTITY_DIFFERENCE',
  'TYPE_DIFFERENCE',
  'ASSET_DIFFERENCE',
  'CURRENCY_DIFFERENCE',
] as const;
export type DifferenceKind = (typeof DIFFERENCE_KINDS)[number];

export interface SourceFact {
  source: string;
  reference: string | null;
  type: string | null;
  date: string | null;
  assetId: string | null;
  ticker: string | null;
  quantity: string | null;
  amount: string | null;
  currency: string | null;
}

export interface LocalFact {
  transactionId: string;
  type: string | null;
  tradeDate: string | null;
  assetId: string | null;
  ticker: string | null;
  quantity: string | null;
  amount: string | null;
  currency: string | null;
}

export interface FieldDifference {
  field: 'date' | 'type' | 'asset' | 'quantity' | 'amount' | 'currency';
  kind: DifferenceKind;
  sourceValue: string | null;
  localValue: string | null;
}

export interface ReconciliationComparison {
  state: ReconciliationState;
  differences: FieldDifference[];
  matchingFacts: Array<
    'SAME_DATE' | 'SAME_TYPE' | 'SAME_ASSET' | 'SAME_QUANTITY' | 'SAME_AMOUNT' | 'SAME_CURRENCY'
  >;
}

function decimalsEqual(a: string, b: string): boolean {
  try {
    return canonicalDecimal(a) === canonicalDecimal(b);
  } catch {
    return false;
  }
}

/** Canonical civil-date equality on `YYYY-MM-DD` prefixes. Garbage never matches. */
function datesEqual(a: string | null, b: string | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}/.test(a) || !/^\d{4}-\d{2}-\d{2}/.test(b)) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

/** Asset identity: canonical assetId wins; ticker alone never confirms. */
function assetsEqual(
  a: { assetId: string | null; ticker: string | null },
  b: { assetId: string | null; ticker: string | null },
): 'MATCH' | 'MISMATCH' | 'UNKNOWN' {
  if (a.assetId !== null && b.assetId !== null) {
    return a.assetId === b.assetId ? 'MATCH' : 'MISMATCH';
  }
  return 'UNKNOWN';
}

function assetLabel(fact: { assetId: string | null; ticker: string | null }): string | null {
  return fact.assetId ?? fact.ticker;
}

const FIELD_ORDER = ['date', 'type', 'asset', 'quantity', 'amount', 'currency'] as const;

/**
 * Compares one source fact against one local fact field by field.
 * Missing (null) sides yield no difference and no matching reason for
 * that field — absence of data is reported by the caller, never guessed.
 */
export function compareReconciliationFacts(
  source: SourceFact | null,
  local: LocalFact | null,
): ReconciliationComparison {
  if (source === null && local === null) {
    return { state: 'UNRESOLVED', differences: [], matchingFacts: [] };
  }
  if (source === null) {
    return { state: 'MISSING_SOURCE', differences: [], matchingFacts: [] };
  }
  if (local === null) {
    return { state: 'MISSING_LOCAL', differences: [], matchingFacts: [] };
  }

  const differences: FieldDifference[] = [];
  const matchingFacts: ReconciliationComparison['matchingFacts'] = [];

  if (source.date !== null || local.tradeDate !== null) {
    if (datesEqual(source.date, local.tradeDate)) {
      matchingFacts.push('SAME_DATE');
    } else if (source.date !== null && local.tradeDate !== null) {
      differences.push({
        field: 'date',
        kind: 'DATE_DIFFERENCE',
        sourceValue: source.date.slice(0, 10),
        localValue: local.tradeDate.slice(0, 10),
      });
    }
  }

  if (source.type !== null || local.type !== null) {
    if (source.type !== null && source.type === local.type) {
      matchingFacts.push('SAME_TYPE');
    } else if (source.type !== null && local.type !== null) {
      differences.push({
        field: 'type',
        kind: 'TYPE_DIFFERENCE',
        sourceValue: source.type,
        localValue: local.type,
      });
    }
  }

  const assetVerdict = assetsEqual(source, local);
  if (assetVerdict === 'MATCH') {
    matchingFacts.push('SAME_ASSET');
  } else if (assetVerdict === 'MISMATCH') {
    differences.push({
      field: 'asset',
      kind: 'ASSET_DIFFERENCE',
      sourceValue: assetLabel(source),
      localValue: assetLabel(local),
    });
  }

  if (source.quantity !== null || local.quantity !== null) {
    if (
      source.quantity !== null &&
      local.quantity !== null &&
      decimalsEqual(source.quantity, local.quantity)
    ) {
      matchingFacts.push('SAME_QUANTITY');
    } else if (source.quantity !== null && local.quantity !== null) {
      differences.push({
        field: 'quantity',
        kind: 'QUANTITY_DIFFERENCE',
        sourceValue: source.quantity,
        localValue: local.quantity,
      });
    }
  }

  if (source.amount !== null || local.amount !== null) {
    if (source.amount !== null && local.amount !== null) {
      if (decimalsEqual(source.amount, local.amount)) {
        matchingFacts.push('SAME_AMOUNT');
      } else {
        differences.push({
          field: 'amount',
          kind: 'AMOUNT_DIFFERENCE',
          sourceValue: source.amount,
          localValue: local.amount,
        });
      }
    }
  }

  if (source.currency !== null || local.currency !== null) {
    if (source.currency !== null && source.currency === local.currency) {
      matchingFacts.push('SAME_CURRENCY');
    } else if (source.currency !== null && local.currency !== null) {
      differences.push({
        field: 'currency',
        kind: 'CURRENCY_DIFFERENCE',
        sourceValue: source.currency,
        localValue: local.currency,
      });
    }
  }

  differences.sort((a, b) => FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field));

  return {
    state: differences.length > 0 ? 'DIVERGENT' : 'MATCHED',
    differences,
    matchingFacts,
  };
}

/** Workflow state of one review pair set. Derived only, never persisted. */
export const PAIR_REVIEW_STATUSES = [
  'PENDING',
  'PARTIALLY_RESOLVED',
  'RESOLVED',
  'NOT_ACTIONABLE',
] as const;
export type PairReviewStatus = (typeof PAIR_REVIEW_STATUSES)[number];

export interface PairReviewSummary {
  status: PairReviewStatus;
  totalPairs: number;
  decidedPairs: number;
}

/**
 * Derives the pair-review state from counts only. NOT_ACTIONABLE covers
 * runs without decidable pairs (historical aggregate-only reviews):
 * they are never counted as pending human work. Decided counts clamp
 * to the total so races can never report impossible progress.
 */
export function derivePairReview(totalPairs: number, decidedPairs: number): PairReviewSummary {
  const total = Math.max(0, Math.floor(totalPairs));
  const decided = Math.min(Math.max(0, Math.floor(decidedPairs)), total);
  if (total === 0) return { status: 'NOT_ACTIONABLE', totalPairs: 0, decidedPairs: 0 };
  if (decided === 0) return { status: 'PENDING', totalPairs: total, decidedPairs: 0 };
  if (decided < total)
    return { status: 'PARTIALLY_RESOLVED', totalPairs: total, decidedPairs: decided };
  return { status: 'RESOLVED', totalPairs: total, decidedPairs: decided };
}

/** Deterministic vocabulary for human reconciliation decisions. */
export const RECONCILIATION_DECISIONS = ['CONFIRM_MATCH', 'NOT_A_MATCH'] as const;
export type ReconciliationDecision = (typeof RECONCILIATION_DECISIONS)[number];

export function isReconciliationDecision(value: string): value is ReconciliationDecision {
  return (RECONCILIATION_DECISIONS as readonly string[]).includes(value);
}

export interface SourceItemKeyInput {
  portfolioId: string;
  source: string;
  runId: string;
  provider: string | null;
  externalId: string | null;
  type: string | null;
  tradeDate: string | null;
  assetId: string | null;
  quantity: string | null;
  amount: string | null;
  currency: string | null;
}

function canonicalMoney(value: string | null): string {
  if (typeof value !== 'string' || value === '') return '';
  try {
    return canonicalDecimal(value);
  } catch {
    return value;
  }
}

function sha256Hex(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Stable source-item key for one (run, transaction) pair claim.
 *
 * Server-derived only: when the linked transaction carries the import
 * identity (provider + externalId), the key reuses it normalized —
 * the same identity the ledger unique constraint already enforces.
 * Otherwise a canonical hash over canonical facts plus the run scope.
 * Identity and audit only: no credentials, tokens, private keys or raw
 * payloads enter the key. Duplicate-looking legitimate rows in the same
 * run share a key by design; the pair unique constraint keeps their
 * decisions distinct via the transaction id. Different runs never share keys.
 */
export function deriveSourceItemKey(input: SourceItemKeyInput): string {
  if (
    typeof input.provider === 'string' &&
    input.provider !== '' &&
    typeof input.externalId === 'string' &&
    input.externalId !== ''
  ) {
    return `${input.provider.trim().toUpperCase()}:${input.externalId.trim().toUpperCase()}`;
  }
  const canonical = [
    input.portfolioId,
    input.source,
    input.runId,
    input.type ?? '',
    typeof input.tradeDate === 'string' ? input.tradeDate.slice(0, 10) : '',
    input.assetId ?? '',
    canonicalMoney(input.quantity),
    canonicalMoney(input.amount),
    input.currency ?? '',
  ].join('|');
  return `hash:${sha256Hex(canonical)}`;
}

export interface RectificationPairLink {
  originalTransactionId: string;
  replacementTransactionId: string | null;
}

export type RectificationChainStatus = 'CURRENT' | 'SUPERSEDED';

/**
 * Resolves the current effective transaction of a rectification chain.
 * Follows original → replacement links to the terminal replacement.
 * Cycle-safe by construction (visited guard): replacements are always
 * freshly created, so a cycle indicates corrupt data and resolves to
 * null instead of looping.
 */
export function resolveEffectiveTransactionId(
  transactionId: string,
  links: readonly RectificationPairLink[],
): string | null {
  const next = new Map<string, string | null>();
  for (const link of links) {
    if (!next.has(link.originalTransactionId)) {
      next.set(link.originalTransactionId, link.replacementTransactionId);
    }
  }
  const visited = new Set<string>();
  let current: string | null = transactionId;
  while (current !== null && next.has(current)) {
    if (visited.has(current)) return null;
    visited.add(current);
    const following = next.get(current);
    if (following === undefined || following === null) return current;
    current = following;
  }
  return current;
}

export interface CanonicalTransactionFacts {
  type: string | null;
  tradeDate: string | null;
  assetId: string | null;
  accountId: string | null;
  quantity: string | null;
  unitPrice: string | null;
  fees: string | null;
  taxes: string | null;
  currency: string | null;
}

function equivalentDecimal(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = typeof a === 'string' && a !== '' ? a : '0';
  const right = typeof b === 'string' && b !== '' ? b : '0';
  try {
    return canonicalDecimal(left) === canonicalDecimal(right);
  } catch {
    return false;
  }
}

/**
 * Exact equivalence between an original and a candidate replacement
 * (all canonical fields; no floats; dates as YYYY-MM-DD prefixes).
 * Used to reject no-change rectifications before writing anything.
 */
export function isEquivalentReplacement(
  original: CanonicalTransactionFacts,
  replacement: CanonicalTransactionFacts,
): boolean {
  if ((original.type ?? null) !== (replacement.type ?? null)) return false;
  if (original.tradeDate !== null && replacement.tradeDate !== null) {
    if (!datesEqual(original.tradeDate, replacement.tradeDate)) return false;
  } else if (original.tradeDate !== replacement.tradeDate) {
    return false;
  }
  if ((original.assetId ?? null) !== (replacement.assetId ?? null)) return false;
  if ((original.accountId ?? null) !== (replacement.accountId ?? null)) return false;
  if ((original.currency ?? null) !== (replacement.currency ?? null)) return false;
  return (
    equivalentDecimal(original.quantity, replacement.quantity) &&
    equivalentDecimal(original.unitPrice, replacement.unitPrice) &&
    equivalentDecimal(original.fees, replacement.fees) &&
    equivalentDecimal(original.taxes, replacement.taxes)
  );
}
