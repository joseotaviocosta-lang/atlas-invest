import { DomainError } from '@atlas/domain';
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
