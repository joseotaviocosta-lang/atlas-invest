import { createHash } from 'node:crypto';
import { Currency, Money } from '@atlas/domain';
import { stableStringify } from './high-income-minimum-tax';
import { roundMoneyToCents } from './high-income-minimum-tax-calculation';

/**
 * Phase 4I.3 — Corporate effective-tax redutor (art. 16-B) legal foundation.
 *
 * Pure, deterministic, zero-I/O. Freezes the payer-scoped redutor mechanics from
 * primary law (Lei 15.270/2025; Lei 9.250/1995 art. 16-B) and never invents a rule.
 */

export const HIGH_INCOME_CORPORATE_REDUTOR_VERSION = 'high-income-corporate-redutor-v1';

export type CorporatePayerType =
  'STANDARD_CORPORATE' | 'INSURANCE_CAPITALIZATION_REGULATED' | 'FINANCIAL_INSTITUTION' | 'UNKNOWN';

export const CORPORATE_PAYER_TYPES: readonly CorporatePayerType[] = Object.freeze([
  'STANDARD_CORPORATE',
  'INSURANCE_CAPITALIZATION_REGULATED',
  'FINANCIAL_INSTITUTION',
  'UNKNOWN',
]);

export interface CorporateReferenceRateDefinition {
  readonly payerType: CorporatePayerType;
  readonly ratePercentage: string;
  readonly legalReference: string;
}

/** Nominal-cap matrix, art. 16-B §1º. No unexplained literals. */
export const HIGH_INCOME_CORPORATE_REFERENCE_RATES: Readonly<
  Record<Exclude<CorporatePayerType, 'UNKNOWN'>, CorporateReferenceRateDefinition>
> = Object.freeze({
  STANDARD_CORPORATE: Object.freeze({
    payerType: 'STANDARD_CORPORATE',
    ratePercentage: '34',
    legalReference: 'Lei 9.250/1995, art. 16-B, §1º, I',
  }),
  INSURANCE_CAPITALIZATION_REGULATED: Object.freeze({
    payerType: 'INSURANCE_CAPITALIZATION_REGULATED',
    ratePercentage: '40',
    legalReference:
      'Lei 9.250/1995, art. 16-B, §1º, II (seguros privados, capitalização e LC 105, art. 1º, §1º, II–X)',
  }),
  FINANCIAL_INSTITUTION: Object.freeze({
    payerType: 'FINANCIAL_INSTITUTION',
    ratePercentage: '45',
    legalReference: 'Lei 9.250/1995, art. 16-B, §1º, III (LC 105, art. 1º, §1º, I)',
  }),
});

export type CorporateEvidenceAuthority =
  'AUTHORITATIVE' | 'REQUIRES_CONFIRMATION' | 'MISSING' | 'CONFLICTING' | 'UNSUPPORTED';

export type CorporateEvidenceSource =
  'PJ_FINANCIAL_STATEMENTS' | 'RFB_PREFILLED' | 'TAXPAYER_CONFIRMED' | 'NONE';

/** Sources that can sustain an authoritative reduction (§4 + §7). */
export const AUTHORITATIVE_CORPORATE_EVIDENCE_SOURCES: readonly CorporateEvidenceSource[] =
  Object.freeze(['PJ_FINANCIAL_STATEMENTS', 'RFB_PREFILLED']);

export type CorporateEvidenceMode = 'FULL' | 'SIMPLIFIED';

export interface CorporatePayerEvidenceInput {
  readonly evidenceId: string;
  readonly payerId: string;
  readonly payerType: CorporatePayerType;
  readonly profitPeriodExercise: number;
  readonly mode: CorporateEvidenceMode;
  /** FULL: lucro contábil (§3, III). SIMPLIFIED: certified §6 profit. */
  readonly accountingProfit: string | Money;
  readonly irDue: string | Money;
  readonly csllDue: string | Money;
  /** Prouni scholarships counted as tax paid (§8); explicit evidenced add-on only. */
  readonly prouniTaxCredit?: string | Money | null;
  /** SIMPLIFIED: certified revenue, for audit only (Atlas does not recompute §6). */
  readonly simplifiedRevenue?: string | Money | null;
  readonly consolidatedStatements?: boolean;
  readonly evidenceAuthority: CorporateEvidenceAuthority;
  readonly evidenceSource: CorporateEvidenceSource;
  readonly sourceFingerprint?: string;
}

export interface CorporatePayerEvidence {
  readonly evidenceId: string;
  readonly payerId: string;
  readonly payerType: CorporatePayerType;
  readonly profitPeriodExercise: number;
  readonly mode: CorporateEvidenceMode;
  readonly accountingProfit: Money;
  readonly irDue: Money;
  readonly csllDue: Money;
  readonly prouniTaxCredit: Money | null;
  readonly simplifiedRevenue: Money | null;
  readonly consolidatedStatements: boolean;
  readonly evidenceAuthority: CorporateEvidenceAuthority;
  readonly evidenceSource: CorporateEvidenceSource;
  readonly sourceFingerprint: string;
}

export type CorporatePayerRedutorStatus =
  | 'NOT_APPLICABLE'
  | 'APPLICABLE'
  | 'REQUIRES_EVIDENCE'
  | 'BLOCKED'
  | 'UNSUPPORTED_PAYER_TYPE'
  | 'UNSUPPORTED_YEAR';

export interface CorporatePayerRedutorInput {
  readonly payerId: string;
  readonly payerType: CorporatePayerType;
  /** Eligible dividends of this payer included in the 16-A base (exact). */
  readonly eligibleDividends: Money;
  /** Beneficiary-level PF effective rate percentage (exact, §3, II). */
  readonly pfEffectiveRatePercentage: string;
  readonly evidence: CorporatePayerEvidence | null;
  readonly currency: Currency;
  /** Set when duplicate evidence records conflict for this payer+period. */
  readonly hasConflictingEvidence?: boolean;
}

export interface CorporatePayerRedutorResult {
  readonly payerId: string;
  readonly payerType: CorporatePayerType;
  readonly status: CorporatePayerRedutorStatus;
  readonly referenceRatePercentage: string | null;
  readonly corporateEffectiveRatePercentage: string | null;
  readonly pfEffectiveRatePercentage: string;
  readonly eligibleDividends: Money;
  /** Exact per-payer reduction (unrounded; rounding happens once at the global final). */
  readonly reductionExact: Money;
  readonly evidenceStatus: CorporateEvidenceAuthority;
  readonly blockingReasons: readonly string[];
  readonly limitations: readonly string[];
  readonly sourceFingerprint: string | null;
}

export interface CorporateRedutorAggregateResult {
  readonly aggregateVersion: typeof HIGH_INCOME_CORPORATE_REDUTOR_VERSION;
  readonly payerCount: number;
  readonly computedPayerCount: number;
  readonly status: CorporatePayerRedutorStatus;
  readonly totalEligibleDividends: Money;
  /** Exact aggregate reduction (unrounded). */
  readonly totalReductionExact: Money;
  /** Authoritative rounded aggregate reduction (single final rounding). */
  readonly totalSupportedReduction: Money | null;
  readonly payers: readonly CorporatePayerRedutorResult[];
  readonly blockingPayers: readonly string[];
  readonly blockingReasons: readonly string[];
  readonly limitations: readonly string[];
  readonly sourceFingerprint: string;
  readonly calculationFingerprint: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function toMoney(value: string | Money, currency: Currency): Money {
  return typeof value === 'string' ? Money.from(value, currency) : value;
}

function evidenceSignature(input: CorporatePayerEvidenceInput, currency: Currency): string {
  const pick = (value: string | Money | null | undefined): string =>
    value === null || value === undefined
      ? 'NULL'
      : typeof value === 'string'
        ? Money.from(value, currency).amount
        : value.amount;
  return [
    input.payerId,
    input.payerType,
    String(input.profitPeriodExercise),
    input.mode,
    pick(input.accountingProfit),
    pick(input.irDue),
    pick(input.csllDue),
    pick(input.prouniTaxCredit),
    pick(input.simplifiedRevenue),
    String(input.consolidatedStatements ?? false),
    input.evidenceAuthority,
    input.evidenceSource,
  ].join('|');
}

export interface DeduplicatedCorporateEvidence {
  readonly evidence: readonly CorporatePayerEvidence[];
  readonly conflictingPayerIds: readonly string[];
}

/**
 * Deduplicates corporate evidence by (payerId, profitPeriodExercise). Identical
 * records collapse; conflicting records for the same payer+period fail closed.
 * Records for distinct profit periods of the same payer are UNSUPPORTED
 * (the statute provides no multi-exercise splitting rule).
 */
export function deduplicateCorporateEvidence(
  inputs: readonly CorporatePayerEvidenceInput[],
  currency: Currency,
): DeduplicatedCorporateEvidence {
  const byKey = new Map<string, { signature: string; record: CorporatePayerEvidence }>();
  const conflicting = new Set<string>();
  const multiPeriod = new Map<string, Set<number>>();
  for (const raw of inputs) {
    const key = `${raw.payerId}::${raw.profitPeriodExercise}`;
    const signature = evidenceSignature(raw, currency);
    const record: CorporatePayerEvidence = Object.freeze({
      evidenceId: raw.evidenceId,
      payerId: raw.payerId,
      payerType: raw.payerType,
      profitPeriodExercise: raw.profitPeriodExercise,
      mode: raw.mode,
      accountingProfit: toMoney(raw.accountingProfit, currency),
      irDue: toMoney(raw.irDue, currency),
      csllDue: toMoney(raw.csllDue, currency),
      prouniTaxCredit:
        raw.prouniTaxCredit === null || raw.prouniTaxCredit === undefined
          ? null
          : toMoney(raw.prouniTaxCredit, currency),
      simplifiedRevenue:
        raw.simplifiedRevenue === null || raw.simplifiedRevenue === undefined
          ? null
          : toMoney(raw.simplifiedRevenue, currency),
      consolidatedStatements: raw.consolidatedStatements ?? false,
      evidenceAuthority: raw.evidenceAuthority,
      evidenceSource: raw.evidenceSource,
      sourceFingerprint:
        raw.sourceFingerprint ??
        createHash('sha256').update(`corporate-evidence:${signature}`).digest('hex'),
    });
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { signature, record });
    } else if (existing.signature !== signature) {
      conflicting.add(raw.payerId);
    }
    const periods = multiPeriod.get(raw.payerId) ?? new Set<number>();
    periods.add(raw.profitPeriodExercise);
    multiPeriod.set(raw.payerId, periods);
  }
  const multiPeriodPayers = Array.from(multiPeriod.entries())
    .filter(([, periods]) => periods.size > 1)
    .map(([payerId]) => payerId);
  for (const payerId of multiPeriodPayers) {
    conflicting.add(payerId);
  }
  return Object.freeze({
    evidence: Object.freeze(Array.from(byKey.values()).map((entry) => entry.record)),
    conflictingPayerIds: Object.freeze(Array.from(conflicting).sort()),
  });
}

/**
 * Pure payer-level redutor engine (art. 16-B §§1º–3º).
 * reduction = eligibleDividends × max(0, effPJ + effPF − cap). Never negative.
 */
export function calculateCorporatePayerRedutor(
  input: CorporatePayerRedutorInput,
): CorporatePayerRedutorResult {
  const currency = input.currency;
  const blockingReasons: string[] = [];
  const limitations: string[] = [];

  if (input.eligibleDividends.isNegative()) {
    return blocked(input, ['NEGATIVE_ELIGIBLE_DIVIDENDS'], limitations);
  }
  if (input.hasConflictingEvidence === true) {
    return blocked(input, ['CONFLICTING_CORPORATE_EVIDENCE'], limitations, 'BLOCKED');
  }
  if (input.eligibleDividends.isZero()) {
    return Object.freeze({
      payerId: input.payerId,
      payerType: input.payerType,
      status: 'NOT_APPLICABLE',
      referenceRatePercentage: null,
      corporateEffectiveRatePercentage: null,
      pfEffectiveRatePercentage: input.pfEffectiveRatePercentage,
      eligibleDividends: input.eligibleDividends,
      reductionExact: Money.zero(currency),
      evidenceStatus: input.evidence?.evidenceAuthority ?? 'MISSING',
      blockingReasons: Object.freeze([]),
      limitations: Object.freeze([]),
      sourceFingerprint: input.evidence?.sourceFingerprint ?? null,
    });
  }

  const evidence = input.evidence;
  if (!evidence) {
    return blocked(input, ['MISSING_CORPORATE_EVIDENCE'], limitations, 'REQUIRES_EVIDENCE');
  }
  if (input.payerType === 'UNKNOWN') {
    return blocked(input, ['UNSUPPORTED_PAYER_TYPE'], limitations, 'UNSUPPORTED_PAYER_TYPE');
  }
  if (
    evidence.evidenceAuthority !== 'AUTHORITATIVE' ||
    !AUTHORITATIVE_CORPORATE_EVIDENCE_SOURCES.includes(evidence.evidenceSource)
  ) {
    return blocked(
      input,
      ['CORPORATE_EVIDENCE_NOT_AUTHORITATIVE'],
      limitations,
      'REQUIRES_EVIDENCE',
    );
  }
  if (evidence.payerType !== input.payerType) {
    return blocked(input, ['PAYER_TYPE_MISMATCH'], limitations, 'BLOCKED');
  }
  if (evidence.accountingProfit.compare(Money.zero(currency)) <= 0) {
    return blocked(input, ['NON_POSITIVE_ACCOUNTING_PROFIT'], limitations, 'BLOCKED');
  }
  if (evidence.irDue.isNegative() || evidence.csllDue.isNegative()) {
    return blocked(input, ['NEGATIVE_CORPORATE_TAX_DUE'], limitations, 'BLOCKED');
  }
  if (evidence.prouniTaxCredit !== null && evidence.prouniTaxCredit.isNegative()) {
    return blocked(input, ['NEGATIVE_PROUNI_TAX_CREDIT'], limitations, 'BLOCKED');
  }

  const reference = HIGH_INCOME_CORPORATE_REFERENCE_RATES[input.payerType];
  const numerator = evidence.irDue
    .add(evidence.csllDue)
    .add(evidence.prouniTaxCredit ?? Money.zero(currency));
  // Statutory ratio expressed in percentage points (×100): IR+CSLL ÷ lucro contábil.
  const corporateEffective = numerator.divide(evidence.accountingProfit.amount).multiply('100');
  const excess = computeExcessPercentage(
    corporateEffective.amount,
    input.pfEffectiveRatePercentage,
    reference.ratePercentage,
    currency,
  );
  const excessIsPositive = Money.from(excess, currency).isPositive();
  const reductionExact = excessIsPositive
    ? input.eligibleDividends.multiply(excess).divide('100')
    : Money.zero(currency);

  if (evidence.mode === 'SIMPLIFIED') {
    limitations.push('SIMPLIFIED_ACCOUNTING_PROFIT_CERTIFIED');
  }
  if (evidence.consolidatedStatements) {
    limitations.push('CONSOLIDATED_STATEMENTS_USED');
  }

  return Object.freeze({
    payerId: input.payerId,
    payerType: input.payerType,
    status: 'APPLICABLE',
    referenceRatePercentage: reference.ratePercentage,
    corporateEffectiveRatePercentage: corporateEffective.amount,
    pfEffectiveRatePercentage: input.pfEffectiveRatePercentage,
    eligibleDividends: input.eligibleDividends,
    reductionExact,
    evidenceStatus: evidence.evidenceAuthority,
    blockingReasons: Object.freeze(blockingReasons),
    limitations: Object.freeze(limitations),
    sourceFingerprint: evidence.sourceFingerprint,
  });
}

function blocked(
  input: CorporatePayerRedutorInput,
  reasons: string[],
  limitations: string[],
  status: CorporatePayerRedutorStatus = 'BLOCKED',
): CorporatePayerRedutorResult {
  return Object.freeze({
    payerId: input.payerId,
    payerType: input.payerType,
    status,
    referenceRatePercentage: null,
    corporateEffectiveRatePercentage: null,
    pfEffectiveRatePercentage: input.pfEffectiveRatePercentage,
    eligibleDividends: input.eligibleDividends,
    reductionExact: Money.zero(input.currency),
    evidenceStatus: input.evidence?.evidenceAuthority ?? 'MISSING',
    blockingReasons: Object.freeze(reasons),
    limitations: Object.freeze(limitations),
    sourceFingerprint: input.evidence?.sourceFingerprint ?? null,
  });
}

/** Exact (effPJ + effPF − cap) in percentage points, as a canonical decimal string. */
export function computeExcessPercentage(
  corporateEffectiveRatePercentage: string,
  pfEffectiveRatePercentage: string,
  referenceRatePercentage: string,
  currency: Currency = 'BRL',
): string {
  const effPJ = Money.from(corporateEffectiveRatePercentage, currency);
  const effPF = Money.from(pfEffectiveRatePercentage, currency);
  const cap = Money.from(referenceRatePercentage, currency);
  return effPJ.add(effPF).subtract(cap).amount;
}

/**
 * Pure deterministic aggregation across payers. Payer boundaries are preserved:
 * no cross-payer offset (each payer floored independently upstream).
 */
export function aggregateCorporateRedutor(
  payers: readonly CorporatePayerRedutorResult[],
  currency: Currency,
): CorporateRedutorAggregateResult {
  const sorted = [...payers].sort((a, b) => a.payerId.localeCompare(b.payerId));
  let totalEligible = Money.zero(currency);
  let totalExact = Money.zero(currency);
  let computedCount = 0;
  const blockingPayers = new Set<string>();
  const blockingReasons = new Set<string>();
  const limitations = new Set<string>();

  let status: CorporatePayerRedutorStatus = 'APPLICABLE';
  const precedence: CorporatePayerRedutorStatus[] = [
    'BLOCKED',
    'UNSUPPORTED_YEAR',
    'UNSUPPORTED_PAYER_TYPE',
    'REQUIRES_EVIDENCE',
    'NOT_APPLICABLE',
    'APPLICABLE',
  ];
  let worst = precedence.length - 1;
  for (const payer of sorted) {
    totalEligible = totalEligible.add(payer.eligibleDividends);
    if (payer.status === 'APPLICABLE') {
      computedCount += 1;
      totalExact = totalExact.add(payer.reductionExact);
    } else if (payer.status !== 'NOT_APPLICABLE') {
      blockingPayers.add(payer.payerId);
      for (const reason of payer.blockingReasons) {
        blockingReasons.add(`${payer.payerId}:${reason}`);
      }
    }
    for (const limitation of payer.limitations) {
      limitations.add(`${payer.payerId}:${limitation}`);
    }
    const rank = precedence.indexOf(payer.status);
    if (rank !== -1 && rank < worst) {
      worst = rank;
    }
  }
  status = precedence[worst]!;
  if (sorted.length === 0) {
    status = 'NOT_APPLICABLE';
  }

  const totalSupportedReduction = status === 'APPLICABLE' ? roundMoneyToCents(totalExact) : null;

  const sourceFingerprint = createHash('sha256')
    .update(`corporate-redutor:${sorted.map((p) => p.sourceFingerprint ?? 'NULL').join('|')}`)
    .digest('hex');
  const calculationFingerprint = createHash('sha256')
    .update(
      stableStringify({
        version: HIGH_INCOME_CORPORATE_REDUTOR_VERSION,
        status,
        payers: sorted.map((p) => ({
          payerId: p.payerId,
          payerType: p.payerType,
          status: p.status,
          referenceRatePercentage: p.referenceRatePercentage,
          corporateEffectiveRatePercentage: p.corporateEffectiveRatePercentage,
          pfEffectiveRatePercentage: p.pfEffectiveRatePercentage,
          eligibleDividends: p.eligibleDividends.amount,
          reductionExact: p.reductionExact.amount,
        })),
        totalExact: totalExact.amount,
      }),
    )
    .digest('hex');

  return Object.freeze({
    aggregateVersion: HIGH_INCOME_CORPORATE_REDUTOR_VERSION,
    payerCount: sorted.length,
    computedPayerCount: computedCount,
    status,
    totalEligibleDividends: totalEligible,
    totalReductionExact: totalExact,
    totalSupportedReduction,
    payers: Object.freeze(sorted),
    blockingPayers: Object.freeze(Array.from(blockingPayers).sort()),
    blockingReasons: Object.freeze(Array.from(blockingReasons).sort()),
    limitations: Object.freeze(Array.from(limitations).sort()),
    sourceFingerprint,
    calculationFingerprint,
  });
}
