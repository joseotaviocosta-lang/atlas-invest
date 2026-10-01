import { Money } from '@atlas/domain';
import { resolveRevenueCodeForBucket, type TaxObligationBucket } from './revenue-codes';

/**
 * Phase 4G.2C — 6015 revenue-code composition.
 *
 * Category-level tax results remain internally distinct for loss buckets, IRRF
 * pools and trace (FII / EQUITY_NORMAL / EQUITY_DAY_TRADE). The *payment*
 * obligation, however, is composed by revenue code: all three categories are
 * aggregated into a single monthly `6015` amount. This module performs no rate,
 * loss or IRRF arithmetic — it only sums already-computed, server-authoritative
 * category net taxes. Unknown/partial/blocked components fail closed (ADR-264).
 */

export const COMPOSED_6015_CATEGORIES = ['FII', 'EQUITY_NORMAL', 'EQUITY_DAY_TRADE'] as const;
export type Composed6015Category = (typeof COMPOSED_6015_CATEGORIES)[number];

/** All three categories settle under the same federal revenue code. */
export const COMPOSED_6015_BUCKET: TaxObligationBucket = 'FII_SALE';

export const COMPOSED_6015_STATUSES = ['COMPLETE', 'PARTIAL', 'BLOCKED', 'NO_ACTIVITY'] as const;
export type Composed6015Status = (typeof COMPOSED_6015_STATUSES)[number];

export const COMPOSED_6015_REASON_CODES = [
  'COMPONENT_BLOCKED',
  'COMPONENT_PARTIAL',
  'NEGATIVE_COMPONENT',
  'CURRENCY_MISMATCH',
  'UNSUPPORTED_ACTIVITY',
  'MISSING_REVENUE_CODE',
] as const;
export type Composed6015ReasonCode = (typeof COMPOSED_6015_REASON_CODES)[number];

export type ComposedComponentStatus = 'COMPLETE' | 'PARTIAL' | 'BLOCKED';

export interface Composed6015ComponentInput {
  readonly category: Composed6015Category;
  readonly status: ComposedComponentStatus;
  readonly reasonCode?: string | null;
  /** Exact decimal net category tax (>= 0). Ignored unless status === COMPLETE. */
  readonly netTax?: string | null;
  readonly currency?: string;
  readonly sourceRuleId?: string | null;
  readonly sourceRuleVersion?: string | null;
  /** Stable identity of the upstream category result (double-use protection). */
  readonly sourceFingerprint: string;
  readonly traceReference?: string | null;
}

export interface Composed6015Component {
  readonly category: Composed6015Category;
  readonly revenueCode: string;
  readonly competence: string;
  readonly status: ComposedComponentStatus;
  /** Exact decimal; `null` when the component is not authoritative. */
  readonly netCategoryTax: string | null;
  readonly currency: string;
  readonly sourceRuleId: string | null;
  readonly sourceRuleVersion: string | null;
  readonly sourceFingerprint: string;
  readonly traceReference: string | null;
}

export interface Compose6015Input {
  readonly competence: string;
  readonly components: readonly Composed6015ComponentInput[];
  /** Currency expected for the composed obligation (defaults to `BRL`). */
  readonly currency?: string;
  /**
   * True when the month carries activity in a category outside the composed
   * set (FII + Brazilian equity). Such activity must fail the composition closed
   * rather than be silently dropped.
   */
  readonly unsupportedActivity?: boolean;
}

export interface Composed6015Result {
  readonly revenueCode: string;
  readonly bucket: TaxObligationBucket;
  readonly competence: string;
  readonly status: Composed6015Status;
  readonly reasonCode: Composed6015ReasonCode | null;
  readonly currency: string;
  /** Exact decimal total; `null` unless the composition is authoritative. */
  readonly total: string | null;
  readonly components: readonly Composed6015Component[];
  /** Canonical deterministic fingerprint (hashable by the application layer). */
  readonly fingerprint: string;
}

function isNegativeDecimal(value: string): boolean {
  return Money.from(value, 'BRL').isNegative();
}

/**
 * Composes the FII + normal-equity + day-trade category net taxes into a single
 * `6015` monthly amount. Pure and deterministic; preserves canonical category
 * ordering and never crosses category loss/IRRF semantics.
 */
export function compose6015(input: Compose6015Input): Composed6015Result {
  const currency = input.currency ?? 'BRL';
  const revenueCode = resolveRevenueCodeForBucket(COMPOSED_6015_BUCKET);

  if (!revenueCode) {
    // The canonical registry is the only source of the revenue code; an
    // unresolved bucket fails closed (never a hardcoded code).
    return Object.freeze({
      revenueCode: '',
      bucket: COMPOSED_6015_BUCKET,
      competence: input.competence,
      status: 'BLOCKED' as const,
      reasonCode: 'MISSING_REVENUE_CODE' as const,
      currency,
      total: null,
      components: Object.freeze([]),
      fingerprint: `composed-6015-v1|${input.competence}|missing-revenue-code`,
    });
  }

  const byCategory = new Map<Composed6015Category, Composed6015ComponentInput>();
  for (const component of input.components) {
    byCategory.set(component.category, component);
  }

  let blockedReason: Composed6015ReasonCode | null = null;
  let partial = false;
  let mismatch = false;

  const components: Composed6015Component[] = [];
  let total = Money.zero(currency);

  for (const category of COMPOSED_6015_CATEGORIES) {
    const source = byCategory.get(category) ?? {
      category,
      status: 'COMPLETE' as const,
      netTax: '0',
      currency,
      sourceFingerprint: `absent:${category}`,
    };
    const componentCurrency = source.currency ?? currency;
    if (componentCurrency !== currency) mismatch = true;

    let netCategoryTax: string | null = null;
    if (source.status === 'COMPLETE') {
      const net = source.netTax ?? '0';
      if (isNegativeDecimal(net)) {
        // A negative category tax must never reduce another category.
        blockedReason = blockedReason ?? 'NEGATIVE_COMPONENT';
        netCategoryTax = null;
      } else if (componentCurrency !== currency) {
        netCategoryTax = null;
      } else {
        netCategoryTax = Money.from(net, componentCurrency).amount;
        total = total.add(Money.from(net, componentCurrency));
      }
    } else if (source.status === 'BLOCKED') {
      blockedReason = blockedReason ?? 'COMPONENT_BLOCKED';
    } else {
      partial = true;
    }

    components.push(
      Object.freeze({
        category,
        revenueCode,
        competence: input.competence,
        status: source.status,
        netCategoryTax,
        currency: componentCurrency,
        sourceRuleId: source.sourceRuleId ?? null,
        sourceRuleVersion: source.sourceRuleVersion ?? null,
        sourceFingerprint: source.sourceFingerprint,
        traceReference: source.traceReference ?? null,
      }),
    );
  }

  if (mismatch) blockedReason = blockedReason ?? 'CURRENCY_MISMATCH';
  if (input.unsupportedActivity) blockedReason = blockedReason ?? 'UNSUPPORTED_ACTIVITY';

  let status: Composed6015Status;
  let reasonCode: Composed6015ReasonCode | null = null;
  let authoritativeTotal: string | null = null;
  if (blockedReason) {
    status = 'BLOCKED';
    reasonCode = blockedReason;
  } else if (partial) {
    status = 'PARTIAL';
    reasonCode = 'COMPONENT_PARTIAL';
  } else if (total.isZero()) {
    status = 'NO_ACTIVITY';
  } else {
    status = 'COMPLETE';
    authoritativeTotal = total.amount;
  }

  const fingerprint = [
    'composed-6015-v1',
    input.competence,
    revenueCode,
    currency,
    status,
    authoritativeTotal ?? '',
    components
      .map((c) => [c.category, c.status, c.netCategoryTax ?? '', c.sourceFingerprint].join(':'))
      .join(';'),
  ].join('|');

  return Object.freeze({
    revenueCode,
    bucket: COMPOSED_6015_BUCKET,
    competence: input.competence,
    status,
    reasonCode,
    currency,
    total: authoritativeTotal,
    components: Object.freeze(components),
    fingerprint,
  });
}
