import { Currency, Money } from '@atlas/domain';
import {
  HighIncomeEvidenceRequirement,
  HighIncomeIncomeCategory,
  HighIncomeIncomeClassification,
  HighIncomeIncomeClassificationResult,
  HighIncomeIncomeItemInput,
  HighIncomeMinimumTaxApplicabilityStatus,
  HighIncomeMinimumTaxRuleSet,
  HighIncomeRateBand,
  HighIncomeTaxPaidFactKind,
  stableStringify,
} from './high-income-minimum-tax';
import { createHash } from 'node:crypto';

/**
 * Phase 4I.2 — High-income minimum tax deterministic calculation core.
 *
 * Pure, deterministic, zero-I/O. Consumes the Phase 4I.1 legal/data foundation as
 * canonical and produces a transparent calculation with an explicit boundary
 * between GROSS tax (which may be known) and NET tax (authoritative only when every
 * required credit/reduction is supported and evidenced).
 *
 * It never persists, never touches the network, and never invents a legal rule.
 */

export const HIGH_INCOME_MINIMUM_TAX_CALCULATION_VERSION = 'high-income-minimum-tax-calculation-v1';

/** Currency scale applied ONCE at the final monetary boundary (centavos). */
export const HIGH_INCOME_MINIMUM_TAX_MONEY_SCALE = 2;

/** Rounding mode at the final monetary boundary. */
export const HIGH_INCOME_MINIMUM_TAX_MONEY_ROUNDING = 'ROUND_HALF_UP' as const;

/** Informational scale for the serialized rate percentage (not a monetary value). */
export const HIGH_INCOME_MINIMUM_TAX_RATE_SCALE = 10;

/** Phase 4I.2 scope marker: pure calculation only, no payment obligation. */
export const HIGH_INCOME_MINIMUM_TAX_SCOPE = 'PURE_CALCULATION_NO_PAYMENT' as const;

export type HighIncomeMinimumTaxCalculationStatus =
  | 'NOT_APPLICABLE'
  | 'CALCULABLE'
  | 'INCOMPLETE_CREDITS'
  | 'INCOMPLETE_REDUCTION_DATA'
  | 'REQUIRES_CONFIRMATION'
  | 'BLOCKED'
  | 'UNSUPPORTED_YEAR'
  | 'UNSUPPORTED_INPUT';

export type HighIncomeCreditRole = 'CREDIT' | 'REDUCTION';

export interface HighIncomeCreditSupportDefinition {
  readonly role: HighIncomeCreditRole;
  readonly supported: boolean;
  readonly legalReference: string;
  readonly description: string;
}

/**
 * Credit/reduction support matrix (art. 16-A §3 and §5). Supported credits are
 * subtractable authoritative amounts. The art. 16-B corporate reduction is a
 * REDUCTION whose formula is NOT frozen in 4I.1, therefore unsupported in 4I.2.
 */
export const HIGH_INCOME_CREDIT_SUPPORT_MATRIX: Readonly<
  Record<HighIncomeTaxPaidFactKind, HighIncomeCreditSupportDefinition>
> = Object.freeze({
  ANNUAL_ADJUSTMENT_IRPF_DUE: Object.freeze({
    role: 'CREDIT',
    supported: true,
    legalReference: 'Lei 9.250/1995, art. 16-A, § 3º, I',
    description: 'IRPF devido na declaração de ajuste anual',
  }),
  EXCLUSIVE_SOURCE_WITHHOLDING: Object.freeze({
    role: 'CREDIT',
    supported: true,
    legalReference: 'Lei 9.250/1995, art. 16-A, § 3º, II',
    description: 'IRPF retido exclusivamente na fonte sobre rendimentos da base',
  }),
  FOREIGN_INCOME_IRPF_14754: Object.freeze({
    role: 'CREDIT',
    supported: false,
    legalReference: 'Lei 9.250/1995, art. 16-A, § 3º, III; Lei 14.754/2023',
    description: 'IRPF da Lei 14.754/2023 — sem suporte upstream autoritativo no Atlas',
  }),
  DEFINITIVE_IRPF_PAID: Object.freeze({
    role: 'CREDIT',
    supported: true,
    legalReference: 'Lei 9.250/1995, art. 16-A, § 3º, IV',
    description: 'IRPF pago definitivamente sobre rendimentos da base',
  }),
  ART_6A_ANTICIPATED_WITHHOLDING: Object.freeze({
    role: 'CREDIT',
    supported: true,
    legalReference: 'Lei 9.250/1995, art. 16-A, § 5º',
    description: 'IRPFM antecipado na fonte (art. 6º-A)',
  }),
  ART_16B_REDUTOR: Object.freeze({
    role: 'REDUCTION',
    supported: false,
    legalReference: 'Lei 9.250/1995, art. 16-A, § 3º, V e art. 16-B',
    description: 'Redutor da carga efetiva corporativa — fórmula não congelada na fundação 4I.1',
  }),
});

export interface HighIncomeCreditAssessment {
  readonly kind: HighIncomeTaxPaidFactKind;
  readonly role: HighIncomeCreditRole;
  readonly supported: boolean;
  readonly provided: boolean;
  readonly amount: Money | null;
  readonly applied: boolean;
  readonly requiredForNet: boolean;
  readonly legalReference: string;
  readonly reason: string;
}

export interface HighIncomeIncomeBreakdownEntry {
  readonly category: HighIncomeIncomeCategory;
  readonly classification: HighIncomeIncomeClassification;
  readonly grossAmount: Money;
  readonly includedAmount: Money;
  readonly excludedAmount: Money;
  readonly itemCount: number;
  readonly payerIds: readonly string[];
  readonly reason: string;
  readonly legalReference: string;
  readonly evidenceStatus: string | null;
}

export interface HighIncomeMinimumTaxCalculationResult {
  readonly calculationVersion: typeof HIGH_INCOME_MINIMUM_TAX_CALCULATION_VERSION;
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly taxSubjectId: string;
  readonly currency: Currency;
  readonly ruleVersion: string;
  readonly status: HighIncomeMinimumTaxCalculationStatus;
  readonly applicability: HighIncomeMinimumTaxApplicabilityStatus;
  readonly totalAnnualIncome: Money | null;
  readonly applicabilityThreshold: string | null;
  readonly minimumTaxBase: Money | null;
  readonly rateBand: HighIncomeRateBand | null;
  readonly minimumRatePercentage: string | null;
  readonly grossMinimumTax: Money | null;
  readonly credits: readonly HighIncomeCreditAssessment[];
  readonly supportedCreditsTotal: Money | null;
  readonly reductions: readonly HighIncomeCreditAssessment[];
  readonly supportedReductionsTotal: Money | null;
  readonly netMinimumTax: Money | null;
  readonly creditExcess: Money | null;
  readonly incomeBreakdown: readonly HighIncomeIncomeBreakdownEntry[];
  readonly evidenceRequirements: readonly HighIncomeEvidenceRequirement[];
  readonly blockingReasons: readonly string[];
  readonly limitations: readonly string[];
  readonly sourceFingerprint: string;
  readonly calculationFingerprint: string;
  readonly scope: typeof HIGH_INCOME_MINIMUM_TAX_SCOPE;
  readonly paymentBoundary: 'NO_PAYMENT_OBLIGATION';
  readonly refundBoundary: 'NO_REFUND_CALCULATION';
}

// ---------------------------------------------------------------------------
// Pure decimal helpers (no JS float, no Math.round)
// ---------------------------------------------------------------------------

/**
 * Exact ROUND_HALF_UP of a canonical decimal string to `scale` decimals.
 * Pure string/BigInt arithmetic. At `nextDigit >= 5` rounds away from zero.
 */
export function roundHalfUp(value: string, scale: number): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid decimal string '${value}'`);
  }
  const sign = match[1] === '-' ? '-' : '';
  const intPart = match[2]!;
  const fracPart = match[3] ?? '';
  if (fracPart.length <= scale) {
    const padded = fracPart.padEnd(scale, '0');
    return scale > 0 ? `${sign}${intPart}.${padded}` : `${sign}${intPart}`;
  }
  const keep = fracPart.slice(0, scale);
  const nextDigit = fracPart.charCodeAt(scale) - 48;
  let big = BigInt(intPart + keep);
  if (nextDigit >= 5) {
    big += 1n;
  }
  let out = big.toString();
  if (scale > 0) {
    out = out.padStart(scale + 1, '0');
    out = `${out.slice(0, -scale)}.${out.slice(-scale)}`;
  }
  return `${sign}${out}`;
}

/** Rounds a Money value to centavos (2 decimals, ROUND_HALF_UP) at the output boundary. */
export function roundMoneyToCents(value: Money): Money {
  return Money.from(roundHalfUp(value.amount, HIGH_INCOME_MINIMUM_TAX_MONEY_SCALE), value.currency);
}

// ---------------------------------------------------------------------------
// Deterministic rate model (frozen 4I.1 legal formula)
// ---------------------------------------------------------------------------

/**
 * Statutory rate constants derived from the rule set (no magic 60.000 / 10):
 * offset = maximum effective rate (10); divisor = threshold / offset (600000 / 10 = 60000).
 */
export interface HighIncomeRateModel {
  readonly offsetPercentage: Money;
  readonly divisor: Money;
  readonly threshold: Money;
  readonly upperBound: Money;
}

export function buildHighIncomeRateModel(
  ruleSet: HighIncomeMinimumTaxRuleSet,
  currency: Currency,
): HighIncomeRateModel {
  const offsetPercentage = Money.from(ruleSet.maximumEffectiveRatePercentage, currency);
  const threshold = Money.from(ruleSet.applicabilityThreshold, currency);
  const upperBound = Money.from(ruleSet.transitionBandUpperBound, currency);
  const divisor = threshold.divide(offsetPercentage.amount);
  return Object.freeze({ offsetPercentage, divisor, threshold, upperBound });
}

export function resolveHighIncomeRateBandFromModel(
  model: HighIncomeRateModel,
  rend: Money,
): HighIncomeRateBand {
  if (rend.compare(model.threshold) <= 0) {
    return 'BELOW_THRESHOLD';
  }
  if (rend.compare(model.upperBound) < 0) {
    return 'TRANSITION';
  }
  return 'MAXIMUM';
}

/** Exact statutory rate percentage for a given REND (the minimum-tax base). */
export function resolveHighIncomeRatePercentage(model: HighIncomeRateModel, rend: Money): Money {
  if (rend.compare(model.threshold) <= 0) {
    return Money.zero(rend.currency);
  }
  if (rend.compare(model.upperBound) >= 0) {
    return model.offsetPercentage;
  }
  return rend.divide(model.divisor.amount).subtract(model.offsetPercentage);
}

// ---------------------------------------------------------------------------
// Deterministic calculation fingerprint
// ---------------------------------------------------------------------------

export interface HighIncomeCalculationFingerprintInput {
  readonly calculationVersion: string;
  readonly ruleVersion: string;
  readonly sourceFingerprint: string;
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly taxSubjectId: string;
  readonly currency: Currency;
  readonly status: HighIncomeMinimumTaxCalculationStatus;
  readonly totalAnnualIncome: Money | null;
  readonly minimumTaxBase: Money | null;
  readonly minimumRatePercentage: string | null;
  readonly grossMinimumTax: Money | null;
  readonly credits: readonly HighIncomeCreditAssessment[];
  readonly reductions: readonly HighIncomeCreditAssessment[];
  readonly netMinimumTax: Money | null;
  readonly blockingReasons: readonly string[];
}

export function computeHighIncomeCalculationFingerprint(
  input: HighIncomeCalculationFingerprintInput,
): string {
  const canonical = {
    calculationVersion: input.calculationVersion,
    ruleVersion: input.ruleVersion,
    sourceFingerprint: input.sourceFingerprint,
    calendarYear: input.calendarYear,
    declarationExercise: input.declarationExercise,
    taxSubjectId: input.taxSubjectId,
    currency: input.currency,
    status: input.status,
    totalAnnualIncome: moneyOrNull(input.totalAnnualIncome),
    minimumTaxBase: moneyOrNull(input.minimumTaxBase),
    minimumRatePercentage: input.minimumRatePercentage,
    grossMinimumTax: moneyOrNull(input.grossMinimumTax),
    credits: input.credits.map((credit) => ({
      kind: credit.kind,
      role: credit.role,
      amount: moneyOrNull(credit.amount),
      applied: credit.applied,
      requiredForNet: credit.requiredForNet,
    })),
    reductions: input.reductions.map((reduction) => ({
      kind: reduction.kind,
      role: reduction.role,
      amount: moneyOrNull(reduction.amount),
      applied: reduction.applied,
    })),
    netMinimumTax: moneyOrNull(input.netMinimumTax),
    blockingReasons: [...input.blockingReasons],
  };
  return createHash('sha256').update(stableStringify(canonical)).digest('hex');
}

function moneyOrNull(value: Money | null): { amount: string; currency: Currency } | null {
  return value === null ? null : { amount: value.amount, currency: value.currency };
}

export interface HighIncomeItemDeduplicationResult {
  readonly items: readonly HighIncomeIncomeItemInput[];
  readonly duplicateCount: number;
  readonly conflictingItemIds: readonly string[];
}

function highIncomeItemSignature(item: HighIncomeIncomeItemInput): string {
  const currency = item.currency ?? 'BRL';
  const amount =
    typeof item.amount === 'string' ? Money.from(item.amount, currency).amount : item.amount.amount;
  return [
    item.category,
    amount,
    currency,
    item.payerId ?? '',
    item.paymentDate ?? '',
    item.competence ?? '',
    item.transitionEligibility ?? '',
    item.fiiEligibility ?? '',
    item.securitiesIsCorporateParticipation === undefined
      ? ''
      : String(item.securitiesIsCorporateParticipation),
    item.sourceFingerprint ?? '',
  ].join('|');
}

/**
 * Deduplicates canonical items by `itemId`. Economically identical duplicates are
 * collapsed (no double counting); conflicting duplicates (same id, different
 * economics) are surfaced so the calculation can fail closed.
 */
export function deduplicateHighIncomeItems(
  items: readonly HighIncomeIncomeItemInput[],
): HighIncomeItemDeduplicationResult {
  const byId = new Map<string, { signature: string; item: HighIncomeIncomeItemInput }>();
  const conflicting = new Set<string>();
  let duplicateCount = 0;
  for (const item of items) {
    const signature = highIncomeItemSignature(item);
    const existing = byId.get(item.itemId);
    if (!existing) {
      byId.set(item.itemId, { signature, item });
    } else if (existing.signature === signature) {
      duplicateCount += 1;
    } else {
      conflicting.add(item.itemId);
    }
  }
  return Object.freeze({
    items: Object.freeze(Array.from(byId.values()).map((entry) => entry.item)),
    duplicateCount,
    conflictingItemIds: Object.freeze(Array.from(conflicting).sort()),
  });
}

/** Groups canonical classifications into a deterministic per-category breakdown. */
export function buildIncomeBreakdown(
  items: readonly HighIncomeIncomeClassificationResult[],
): HighIncomeIncomeBreakdownEntry[] {
  const groups = new Map<string, HighIncomeIncomeClassificationResult[]>();
  for (const item of items) {
    const key = `${item.category}::${item.classification}`;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  const entries: HighIncomeIncomeBreakdownEntry[] = [];
  for (const bucket of groups.values()) {
    const first = bucket[0]!;
    const currency = first.currency;
    let gross = Money.zero(currency);
    let included = Money.zero(currency);
    let excluded = Money.zero(currency);
    const payerIds = new Set<string>();
    for (const item of bucket) {
      gross = gross.add(item.amount);
      if (item.classification === 'INCLUDED') {
        included = included.add(item.amount);
      } else if (item.classification === 'EXCLUDED') {
        excluded = excluded.add(item.amount);
      }
      if (item.payerId) {
        payerIds.add(item.payerId);
      }
    }
    entries.push(
      Object.freeze({
        category: first.category,
        classification: first.classification,
        grossAmount: gross,
        includedAmount: included,
        excludedAmount: excluded,
        itemCount: bucket.length,
        payerIds: Object.freeze(Array.from(payerIds).sort()),
        reason: first.legalReference,
        legalReference: first.legalReference,
        evidenceStatus: null,
      }),
    );
  }
  return entries.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.classification.localeCompare(b.classification);
  });
}
