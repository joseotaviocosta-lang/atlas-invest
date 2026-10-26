import { DomainError } from '@atlas/domain';
import { addDecimals, canonicalDecimal, ratioToBasisPoints } from './scenario';

export class InvalidCompositionInputError extends DomainError {
  constructor(message: string) {
    super(message, 'PORTFOLIO.INVALID_COMPOSITION');
    this.name = 'InvalidCompositionInputError';
  }
}

export const COMPOSITION_DIMENSIONS = ['ASSET', 'ASSET_CLASS', 'CURRENCY', 'EXCHANGE'] as const;
export type CompositionDimensionCode = (typeof COMPOSITION_DIMENSIONS)[number];

export type CompositionBasis = 'REPORTING_CURRENCY' | 'SINGLE_CURRENCY' | 'PER_CURRENCY';

/** Placeholder bucket key for positions missing a classification value. Never dropped silently. */
export const UNCLASSIFIED_KEY = 'UNCLASSIFIED';

export interface CompositionBucketInput {
  /** Stable key (assetId, category code, currency code, exchange or null). */
  key: string | null;
  label: string;
  /** Canonical decimal market value in the basis currency. */
  value: string;
  /** Distinct positions aggregated into this bucket. */
  positionCount: number;
}

export interface CompositionBucket {
  key: string;
  label: string;
  marketValue: string;
  /** Integer basis points vs the known denominator, or null when it cannot be computed. */
  weightBp: number | null;
  positionCount: number;
  unclassified: boolean;
}

export interface CompositionDimension {
  code: CompositionDimensionCode;
  /** Basis currency (reporting or single-bucket); null when per-currency without weights. */
  currency: string | null;
  /** Known denominator value in basis currency, or null when unavailable. */
  totalKnownValue: string | null;
  /** Classified share of the known total as "100.00"-style percent, or null. */
  coveragePercent: string | null;
  buckets: CompositionBucket[];
  unclassified: CompositionBucket | null;
  positionCount: number;
}

/**
 * Builds one composition dimension from pre-aggregated buckets sharing a
 * single denomination. Weights are exact integer basis points
 * (ROUND_HALF_UP) — never float. Buckets with unknown keys merge into an
 * explicit UNCLASSIFIED bucket instead of being dropped or renormalized
 * away. Ordering is deterministic: weight desc, then key asc.
 */
export function buildCompositionDimension(input: {
  code: CompositionDimensionCode;
  currency: string | null;
  entries: ReadonlyArray<CompositionBucketInput>;
  denominator: string;
  unclassifiedLabel?: string;
}): CompositionDimension {
  const normalized = input.entries.map((entry) => ({
    key: entry.key === null || entry.key === '' ? UNCLASSIFIED_KEY : entry.key,
    label:
      entry.key === null || entry.key === ''
        ? (input.unclassifiedLabel ?? 'Não classificado')
        : entry.label,
    value: canonicalDecimal(entry.value),
    positionCount: entry.positionCount,
    unclassified: entry.key === null || entry.key === '',
  }));

  const totalsByKey = new Map<
    string,
    { label: string; value: string; positionCount: number; unclassified: boolean }
  >();
  for (const entry of normalized) {
    const existing = totalsByKey.get(entry.key);
    if (existing) {
      totalsByKey.set(entry.key, {
        label: existing.label,
        value: addDecimals(existing.value, entry.value),
        positionCount: existing.positionCount + entry.positionCount,
        unclassified: existing.unclassified,
      });
    } else {
      totalsByKey.set(entry.key, {
        label: entry.label,
        value: entry.value,
        positionCount: entry.positionCount,
        unclassified: entry.unclassified,
      });
    }
  }

  const denominator = canonicalDecimal(input.denominator);
  const denominatorIsZero = denominator === '0' || denominator === '0.0';
  const buckets: CompositionBucket[] = [];
  let classifiedValue = '0';
  let unclassifiedValue = '0';
  let unclassifiedCount = 0;
  let unclassifiedWeightBp: number | null = 0;
  let hasUnclassified = false;
  for (const [key, entry] of totalsByKey) {
    const weightBp = denominatorIsZero ? null : ratioToBasisPoints(entry.value, denominator);
    const bucket: CompositionBucket = {
      key,
      label: entry.label,
      marketValue: entry.value,
      weightBp,
      positionCount: entry.positionCount,
      unclassified: entry.unclassified,
    };
    if (entry.unclassified) {
      hasUnclassified = true;
      unclassifiedValue = addDecimals(unclassifiedValue, entry.value);
      unclassifiedCount += entry.positionCount;
      if (weightBp === null || unclassifiedWeightBp === null) {
        unclassifiedWeightBp = null;
      } else {
        unclassifiedWeightBp = unclassifiedWeightBp + weightBp;
      }
    } else {
      classifiedValue = addDecimals(classifiedValue, entry.value);
      buckets.push(bucket);
    }
  }
  buckets.sort((a, b) => {
    if ((b.weightBp ?? -1) !== (a.weightBp ?? -1)) return (b.weightBp ?? -1) - (a.weightBp ?? -1);
    return a.key < b.key ? -1 : 1;
  });
  const unclassifiedBucket: CompositionBucket | null = hasUnclassified
    ? {
        key: UNCLASSIFIED_KEY,
        label: input.unclassifiedLabel ?? 'Não classificado',
        marketValue: unclassifiedValue,
        weightBp: unclassifiedWeightBp,
        positionCount: unclassifiedCount,
        unclassified: true,
      }
    : null;
  if (unclassifiedBucket) buckets.push(unclassifiedBucket);

  let coveragePercent: string | null = null;
  if (!denominatorIsZero) {
    const coverageBp = ratioToBasisPoints(classifiedValue, denominator);
    coveragePercent = `${Math.floor(coverageBp / 100)}.${String(coverageBp % 100).padStart(2, '0')}`;
  }

  return {
    code: input.code,
    currency: input.currency,
    totalKnownValue: denominatorIsZero ? null : denominator,
    coveragePercent,
    buckets,
    unclassified: unclassifiedBucket,
    positionCount: [...totalsByKey.values()].reduce((sum, entry) => sum + entry.positionCount, 0),
  };
}

export interface TopPositionEntry {
  assetId: string;
  ticker: string | null;
  marketValue: string;
  weightBp: number | null;
  rank: number;
}

/**
 * Largest positions by weight, deterministic (weight desc, assetId asc).
 * Facts only, deterministic ordering.
 */
export function topPositions(
  items: ReadonlyArray<{
    assetId: string;
    ticker: string | null;
    value: string;
    weightBp: number | null;
  }>,
  limit: number,
): TopPositionEntry[] {
  return [...items]
    .sort((a, b) => {
      if ((b.weightBp ?? -1) !== (a.weightBp ?? -1)) {
        return (b.weightBp ?? -1) - (a.weightBp ?? -1);
      }
      return a.assetId < b.assetId ? -1 : 1;
    })
    .slice(0, Math.max(0, limit))
    .map((item, index) => ({
      assetId: item.assetId,
      ticker: item.ticker,
      marketValue: item.value,
      weightBp: item.weightBp,
      rank: index + 1,
    }));
}

export interface ConcentrationFact {
  dimension: CompositionDimensionCode;
  key: string;
  label: string;
  weightBp: number | null;
}

/**
 * Largest bucket per dimension. Neutral facts (key + weight) only.
 */
export function largestBucket(
  dimension: Pick<CompositionDimension, 'code' | 'buckets'>,
): ConcentrationFact | null {
  const ranked = dimension.buckets.filter((bucket) => !bucket.unclassified);
  if (ranked.length === 0) return null;
  const top = [...ranked].sort((a, b) => {
    if ((b.weightBp ?? -1) !== (a.weightBp ?? -1)) return (b.weightBp ?? -1) - (a.weightBp ?? -1);
    return a.key < b.key ? -1 : 1;
  })[0];
  if (!top) return null;
  return { dimension: dimension.code, key: top.key, label: top.label, weightBp: top.weightBp };
}
