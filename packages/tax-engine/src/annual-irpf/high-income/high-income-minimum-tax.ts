import { createHash } from 'node:crypto';
import { Currency, Money } from '@atlas/domain';

/**
 * Phase 4I.1 — High-Income Minimum Tax legal & data foundation (Lei nº 15.270/2025).
 *
 * This module is a PURE, deterministic, zero-I/O fiscal foundation. It consumes
 * authoritative annual facts produced by Phase 4H and classifies them against the
 * statutory minimum-tax regime introduced by Lei nº 15.270/2025 (arts. 16-A and
 * 16-B added to Lei nº 9.250/1995).
 *
 * HARD BOUNDARY: this phase does NOT compute the final payable minimum tax, the
 * final effective rate, refunds, annual adjustment, or payment obligations. It
 * only performs classification, eligibility, rule selection, data-requirement
 * assessment and completeness assessment (ADR-305).
 */

/** Explicit, auditable marker: final payable minimum tax is never computed in 4I.1. */
export const HIGH_INCOME_MINIMUM_TAX_CALCULATION_BOUNDARY = 'NO_FINAL_TAX_CALCULATION' as const;

/** Version of the canonical high-income tax data snapshot contract. */
export const HIGH_INCOME_TAX_SNAPSHOT_VERSION = 'HIGH_INCOME_TAX_DATA_SNAPSHOT_V1' as const;

/** Legal effectivity: the regime applies from calendar year 2026, declaration exercise 2027. */
export const HIGH_INCOME_MINIMUM_TAX_FIRST_CALENDAR_YEAR = 2026;
export const HIGH_INCOME_MINIMUM_TAX_FIRST_DECLARATION_EXERCISE = 2027;

/**
 * Phase 4I.1A — OQ-1 reconciliation: the R$ 600.000,00 applicability threshold is
 * measured against the TOTAL annual income received (statute caput, art. 16-A:
 * "soma de todos os rendimentos recebidos no ano-calendário"), not the reduced
 * minimum-tax base computed after the § 1º exclusions (which feeds the § 2º rate).
 * Validated against Lei 15.270/2025, the Senate committee report, the RFB
 * Perguntas e Respostas and the Ministry of Finance official FAQ.
 */
export const HIGH_INCOME_MINIMUM_TAX_THRESHOLD_METRIC = 'TOTAL_ANNUAL_INCOME' as const;

export type HighIncomeThresholdMetric = typeof HIGH_INCOME_MINIMUM_TAX_THRESHOLD_METRIC;

export type HighIncomeMinimumTaxApplicabilityStatus =
  'APPLICABLE' | 'NOT_APPLICABLE' | 'REQUIRES_CONFIRMATION' | 'BLOCKED' | 'UNSUPPORTED_YEAR';

/** Reused from Phase 4H.5 semantics (no conflicting readiness vocabulary is invented). */
export type HighIncomeMinimumTaxCompletenessStatus =
  'READY' | 'PARTIAL' | 'REQUIRES_CONFIRMATION' | 'BLOCKED' | 'NO_ACTIVITY';

export type HighIncomeIncomeClassification =
  'INCLUDED' | 'EXCLUDED' | 'CONDITIONAL' | 'REQUIRES_CONFIRMATION' | 'UNSUPPORTED';

export type HighIncomeRateBand = 'BELOW_THRESHOLD' | 'TRANSITION' | 'MAXIMUM';

/**
 * Canonical income categories known to Atlas upstream (Phase 4H/Portfolio Engine).
 * Only categories with an explicit legal mapping are classified; anything unknown
 * fails closed as UNSUPPORTED.
 */
export type HighIncomeIncomeCategory =
  | 'DIVIDEND'
  | 'DIVIDEND_TRANSITION'
  | 'JCP'
  | 'FII_INCOME'
  | 'EQUITY_CAPITAL_GAIN'
  | 'EQUITY_DAY_TRADE_GAIN'
  | 'FII_CAPITAL_GAIN'
  | 'EXCLUSIVE_WITHHOLDING_INCOME'
  | 'SAVINGS_INCOME'
  | 'EXEMPT_SECURITIES_INCOME'
  | 'FOREIGN_INCOME'
  | 'RURAL_ACTIVITY'
  | 'DONATION_INHERITANCE'
  | 'INDEMNITY'
  | 'UNKNOWN';

export type HighIncomeEvidenceRequirementCode =
  | 'ANNUAL_INCOME_TOTAL'
  | 'DIVIDEND_SOURCE_CLASSIFICATION'
  | 'TRANSITION_ELIGIBILITY'
  | 'FII_ELIGIBILITY'
  | 'CORPORATE_EFFECTIVE_TAX_EVIDENCE'
  | 'FOREIGN_TAX_CREDIT_EVIDENCE'
  | 'WITHHOLDING_EVIDENCE'
  | 'ANNUAL_ADJUSTMENT_TAX_DUE';

export type HighIncomeEvidenceRequirementStatus = 'SATISFIED' | 'PENDING' | 'WAIVED';

/** Kinds of already-paid tax facts that the statute allows as deductions (art. 16-A §3). */
export type HighIncomeTaxPaidFactKind =
  | 'ANNUAL_ADJUSTMENT_IRPF_DUE'
  | 'EXCLUSIVE_SOURCE_WITHHOLDING'
  | 'FOREIGN_INCOME_IRPF_14754'
  | 'DEFINITIVE_IRPF_PAID'
  | 'ART_6A_ANTICIPATED_WITHHOLDING'
  | 'ART_16B_REDUTOR';

export interface HighIncomeOfficialSourceReference {
  readonly label: string;
  readonly article: string;
  readonly url: string;
  readonly retrievedAt: string;
}

export interface HighIncomeNominalCorporateRate {
  readonly entityGroup: string;
  readonly ratePercentage: string;
  readonly legalReference: string;
}

export interface HighIncomeMinimumTaxRuleSet {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly ruleVersion: string;
  readonly effectiveFrom: string; // YYYY-MM-DD civil
  readonly effectiveTo: string | null; // null = open-ended
  readonly eligibilityThresholdMetric: HighIncomeThresholdMetric;
  readonly applicabilityThreshold: string; // gross annual income, strictly greater than
  readonly maximumEffectiveRatePercentage: string;
  readonly transitionBandUpperBound: string;
  readonly nominalCorporateRates: readonly HighIncomeNominalCorporateRate[];
  readonly supported: boolean;
  readonly status: 'APPLICABLE' | 'PROVISIONAL' | 'UNSUPPORTED';
  readonly officialSourceReferences: readonly HighIncomeOfficialSourceReference[];
}

export interface HighIncomeIncomeItemInput {
  readonly itemId: string;
  readonly category: HighIncomeIncomeCategory;
  readonly amount: string | Money;
  readonly currency?: Currency;
  readonly payerId?: string | null;
  readonly payerDisplayName?: string | null;
  readonly paymentDate?: string | null; // YYYY-MM-DD economic date
  readonly competence?: string | null; // YYYY-MM
  readonly transitionEligibility?: 'ELIGIBLE' | 'INELIGIBLE' | 'REQUIRES_CONFIRMATION';
  readonly fiiEligibility?: 'ELIGIBLE' | 'INELIGIBLE' | 'REQUIRES_CONFIRMATION';
  readonly securitiesIsCorporateParticipation?: boolean;
  readonly source?: string;
  readonly sourceFingerprint?: string;
}

export interface HighIncomeIncomeClassificationResult {
  readonly itemId: string;
  readonly category: HighIncomeIncomeCategory;
  readonly classification: HighIncomeIncomeClassification;
  readonly amount: Money;
  readonly currency: Currency;
  readonly payerId: string | null;
  readonly paymentDate: string | null;
  readonly competence: string | null;
  readonly legalReference: string;
  readonly requiredEvidence: readonly HighIncomeEvidenceRequirementCode[];
  readonly limitations: readonly string[];
  readonly sourceFingerprint: string;
}

export interface HighIncomeTaxPaidFactInput {
  readonly factId: string;
  readonly kind: HighIncomeTaxPaidFactKind;
  readonly amount: string | Money;
  readonly currency?: Currency;
  readonly payerId?: string | null;
  readonly source?: string;
}

export interface HighIncomeTaxPaidFact {
  readonly factId: string;
  readonly kind: HighIncomeTaxPaidFactKind;
  readonly amount: Money;
  readonly payerId: string | null;
  readonly source: string;
  readonly sourceFingerprint: string;
}

export interface HighIncomeEvidenceStateInput {
  readonly requirement: HighIncomeEvidenceRequirementCode;
  readonly status: HighIncomeEvidenceRequirementStatus;
  readonly subjectId?: string;
  readonly sourceFingerprint?: string;
}

export interface HighIncomeEvidenceState {
  readonly requirement: HighIncomeEvidenceRequirementCode;
  readonly status: HighIncomeEvidenceRequirementStatus;
  readonly subjectId: string;
  readonly sourceFingerprint: string;
}

export interface HighIncomeEvidenceRequirement {
  readonly requirementId: string;
  readonly requirement: HighIncomeEvidenceRequirementCode;
  readonly subjectId: string;
  readonly title: string;
  readonly status: HighIncomeEvidenceRequirementStatus;
  readonly legalReference: string;
  readonly blockingReason: string | null;
  readonly sourceFingerprint: string;
}

export interface HighIncomeTaxDataSnapshot {
  readonly snapshotVersion: typeof HIGH_INCOME_TAX_SNAPSHOT_VERSION;
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly taxSubjectId: string;
  readonly currency: Currency;
  readonly ruleVersion: string;
  readonly items: readonly HighIncomeIncomeClassificationResult[];
  readonly taxPaidFacts: readonly HighIncomeTaxPaidFact[];
  readonly payerIdentities: readonly string[];
  readonly evidenceStates: readonly HighIncomeEvidenceState[];
  readonly sourceFingerprints: readonly string[];
  readonly isComplete: boolean;
  readonly completenessStatus: HighIncomeMinimumTaxCompletenessStatus;
  readonly limitations: readonly string[];
  readonly fingerprint: string;
}

// ---------------------------------------------------------------------------
// Canonical glossary (mirrors statutory terminology; no informal naming).
// ---------------------------------------------------------------------------
export const HIGH_INCOME_MINIMUM_TAX_GLOSSARY: Readonly<Record<string, string>> = Object.freeze({
  highIncomeMinimumTax:
    'Tributação mínima do Imposto sobre a Renda das Pessoas Físicas (IRPFM) — Lei 15.270/2025, art. 16-A da Lei 9.250/1995.',
  minimumTaxBase:
    'Base de cálculo da tributação mínima: rendimentos recebidos no ano-calendário, inclusive exclusivos/definitivos e isentos, deduzidas as exclusões legais do art. 16-A, § 1º.',
  minimumEffectiveRate:
    'Alíquota da tributação mínima: 0% a 10% na faixa de transição e 10% a partir de R$ 1.200.000,00 (art. 16-A, § 2º).',
  taxCredit:
    'Deduções do valor devido: IRPF do ajuste anual, IRRF exclusivo, IRPF da Lei 14.754/2023, IRPF pago definitivamente e redutor do art. 16-B (art. 16-A, § 3º).',
  anticipatedWithholding:
    'Retenção na fonte de que trata o art. 6º-A, deduzida do valor apurado (art. 16-A, § 5º).',
  excludedIncome:
    'Rendimentos e ganhos expressamente deduzidos da base (art. 16-A, § 1º, I a XII).',
  reduction:
    'Redutor da tributação mínima vinculado à carga efetiva da pessoa jurídica distribuidora (art. 16-B).',
  corporateEffectiveTaxAdjustment:
    'Mecanismo do art. 16-B: soma da alíquota efetiva dos lucros da PJ com a alíquota efetiva da PF beneficiária, limitada à soma das alíquotas nominais de IRPJ e CSLL.',
  transitionIncome:
    'Lucros e dividendos relativos a resultados apurados até 2025, com distribuição aprovada até 31/12/2025 e pagos em 2026-2028 (art. 16-A, § 1º, XII).',
});

// ---------------------------------------------------------------------------
// Pure deterministic helpers
// ---------------------------------------------------------------------------

/** Deterministic recursive JSON serialization with sorted object keys. */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

/** Canonical money projection for deterministic fingerprinting. */
export function moneyFingerprintValue(amount: Money): { amount: string; currency: Currency } {
  return { amount: amount.amount, currency: amount.currency };
}

/**
 * Classifies a single canonical income item against the verified statutory rules.
 * Unknown or upstream-unsupported categories fail closed.
 */
export function classifyHighIncomeIncomeItem(
  input: HighIncomeIncomeItemInput,
  defaultCurrency: Currency = 'BRL',
): HighIncomeIncomeClassificationResult {
  const currency = input.currency ?? defaultCurrency;
  const amount =
    typeof input.amount === 'string' ? Money.from(input.amount, currency) : input.amount;
  const payerId = input.payerId ?? null;
  const limitations: string[] = [];
  const requiredEvidence: HighIncomeEvidenceRequirementCode[] = [];

  let classification: HighIncomeIncomeClassification = 'INCLUDED';
  let legalReference = 'Lei 9.250/1995, art. 16-A, § 1º (caput)';
  const category = input.category;

  if (currency !== 'BRL') {
    // Atlas does not yet hold authoritative upstream support for foreign-currency income.
    classification = 'UNSUPPORTED';
    legalReference = 'Lei 14.754/2023; Lei 9.250/1995, art. 16-A, § 1º';
    limitations.push('UNSUPPORTED_FOREIGN_CURRENCY');
    requiredEvidence.push('FOREIGN_TAX_CREDIT_EVIDENCE');
  } else {
    switch (category) {
      case 'DIVIDEND': {
        classification = 'INCLUDED';
        legalReference = 'Lei 9.250/1995, art. 16-A, § 1º, XI (exceção de ações)';
        break;
      }
      case 'DIVIDEND_TRANSITION': {
        if (input.transitionEligibility === 'ELIGIBLE') {
          classification = 'EXCLUDED';
          legalReference = 'Lei 9.250/1995, art. 16-A, § 1º, XII';
        } else if (input.transitionEligibility === 'INELIGIBLE') {
          classification = 'INCLUDED';
          legalReference = 'Lei 9.250/1995, art. 16-A, § 1º, XI (exceção de ações)';
        } else {
          classification = 'REQUIRES_CONFIRMATION';
          legalReference = 'Lei 9.250/1995, art. 16-A, § 1º, XII (não comprovado)';
          limitations.push('TRANSITION_ELIGIBILITY_UNCONFIRMED');
          requiredEvidence.push('TRANSITION_ELIGIBILITY');
        }
        break;
      }
      case 'JCP': {
        classification = 'INCLUDED';
        legalReference = 'Lei 9.250/1995, art. 16-A, § 1º, II e XI (exceção de ações)';
        break;
      }
      case 'FII_INCOME': {
        if (input.fiiEligibility === 'ELIGIBLE') {
          classification = 'EXCLUDED';
          legalReference = 'Lei 9.250/1995, art. 16-A, § 1º, V, "i"';
        } else if (input.fiiEligibility === 'INELIGIBLE') {
          classification = 'INCLUDED';
          legalReference = 'Lei 9.250/1995, art. 16-A, § 1º (caput)';
        } else {
          classification = 'REQUIRES_CONFIRMATION';
          legalReference = 'Lei 9.250/1995, art. 16-A, § 1º, V, "i" (não comprovado)';
          limitations.push('FII_ELIGIBILITY_UNVERIFIED');
          requiredEvidence.push('FII_ELIGIBILITY');
        }
        break;
      }
      case 'EQUITY_CAPITAL_GAIN':
      case 'EQUITY_DAY_TRADE_GAIN':
      case 'FII_CAPITAL_GAIN': {
        classification = 'INCLUDED';
        legalReference = 'Lei 9.250/1995, art. 16-A, § 1º, I (exceção de bolsa / ganho líquido)';
        break;
      }
      case 'EXCLUSIVE_WITHHOLDING_INCOME': {
        classification = 'INCLUDED';
        legalReference =
          'Lei 9.250/1995, art. 16-A, § 1º (caput): tributados exclusiva/definitivamente';
        requiredEvidence.push('WITHHOLDING_EVIDENCE');
        break;
      }
      case 'SAVINGS_INCOME': {
        classification = 'EXCLUDED';
        legalReference = 'Lei 9.250/1995, art. 16-A, § 1º, IV';
        break;
      }
      case 'EXEMPT_SECURITIES_INCOME': {
        if (input.securitiesIsCorporateParticipation === true) {
          classification = 'INCLUDED';
          legalReference = 'Lei 9.250/1995, art. 16-A, § 1º, XI (exceção de ações)';
        } else if (input.securitiesIsCorporateParticipation === false) {
          classification = 'EXCLUDED';
          legalReference = 'Lei 9.250/1995, art. 16-A, § 1º, V, VI, VII e XI';
        } else {
          // Inclusion depends on whether the security is a share/corporate participation.
          classification = 'CONDITIONAL';
          legalReference = 'Lei 9.250/1995, art. 16-A, § 1º, XI (exceção de ações)';
          limitations.push('SECURITIES_CLASSIFICATION_UNCONFIRMED');
          requiredEvidence.push('DIVIDEND_SOURCE_CLASSIFICATION');
        }
        break;
      }
      case 'FOREIGN_INCOME': {
        classification = 'UNSUPPORTED';
        legalReference = 'Lei 14.754/2023; Lei 9.250/1995, art. 16-A, § 1º';
        limitations.push('UNSUPPORTED_UPSTREAM_DATA');
        requiredEvidence.push('FOREIGN_TAX_CREDIT_EVIDENCE');
        break;
      }
      case 'RURAL_ACTIVITY': {
        classification = 'UNSUPPORTED';
        legalReference = 'Lei 8.023/1990; Lei 9.250/1995, art. 16-A, § 1º e VIII';
        limitations.push('UNSUPPORTED_UPSTREAM_DATA');
        break;
      }
      case 'DONATION_INHERITANCE': {
        classification = 'EXCLUDED';
        legalReference = 'Lei 9.250/1995, art. 16-A, § 1º, III';
        break;
      }
      case 'INDEMNITY': {
        classification = 'EXCLUDED';
        legalReference = 'Lei 9.250/1995, art. 16-A, § 1º, IX';
        break;
      }
      case 'UNKNOWN':
      default: {
        classification = 'UNSUPPORTED';
        legalReference = 'Categoria não mapeada — falha fechada';
        limitations.push('UNSUPPORTED_INCOME_CATEGORY');
        break;
      }
    }
  }

  const payerRequired =
    category === 'DIVIDEND' ||
    category === 'DIVIDEND_TRANSITION' ||
    category === 'JCP' ||
    category === 'FII_INCOME' ||
    category === 'EXCLUSIVE_WITHHOLDING_INCOME';
  if (payerRequired && !payerId) {
    limitations.push('MISSING_CANONICAL_PAYER_IDENTITY');
    requiredEvidence.push('DIVIDEND_SOURCE_CLASSIFICATION');
  }

  const sourceFingerprint =
    input.sourceFingerprint ??
    createHash('sha256')
      .update(
        `${input.itemId}:${category}:${amount.amount}:${currency}:${payerId ?? 'NULL'}:${
          input.paymentDate ?? 'NULL'
        }:${classification}`,
      )
      .digest('hex');

  return Object.freeze({
    itemId: input.itemId,
    category,
    classification,
    amount,
    currency,
    payerId,
    paymentDate: input.paymentDate ?? null,
    competence: input.competence ?? null,
    legalReference,
    requiredEvidence: Object.freeze(requiredEvidence),
    limitations: Object.freeze(limitations),
    sourceFingerprint,
  });
}

/** Classifies the statutory effective-rate band without computing a payable amount. */
export function resolveHighIncomeRateBand(
  ruleSet: HighIncomeMinimumTaxRuleSet,
  rend: Money,
): HighIncomeRateBand {
  const threshold = Money.from(ruleSet.applicabilityThreshold, rend.currency);
  if (rend.compare(threshold) <= 0) {
    return 'BELOW_THRESHOLD';
  }
  const upper = Money.from(ruleSet.transitionBandUpperBound, rend.currency);
  if (rend.compare(upper) < 0) {
    return 'TRANSITION';
  }
  return 'MAXIMUM';
}

export interface HighIncomeSnapshotFingerprintInput {
  readonly snapshotVersion: string;
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly taxSubjectId: string;
  readonly currency: Currency;
  readonly ruleVersion: string;
  readonly items: readonly HighIncomeIncomeClassificationResult[];
  readonly taxPaidFacts: readonly HighIncomeTaxPaidFact[];
  readonly payerIdentities: readonly string[];
  readonly evidenceStates: readonly HighIncomeEvidenceState[];
  readonly sourceFingerprints: readonly string[];
  readonly limitations: readonly string[];
}

/**
 * Deterministic SHA-256 fingerprint over the canonical snapshot content.
 * Same canonical input => same fingerprint; changed authoritative input => different.
 */
export function computeHighIncomeSnapshotFingerprint(
  input: HighIncomeSnapshotFingerprintInput,
): string {
  const canonical = {
    snapshotVersion: input.snapshotVersion,
    calendarYear: input.calendarYear,
    declarationExercise: input.declarationExercise,
    taxSubjectId: input.taxSubjectId,
    currency: input.currency,
    ruleVersion: input.ruleVersion,
    items: input.items.map((item) => ({
      itemId: item.itemId,
      category: item.category,
      classification: item.classification,
      amount: moneyFingerprintValue(item.amount),
      payerId: item.payerId,
      paymentDate: item.paymentDate,
      legalReference: item.legalReference,
      sourceFingerprint: item.sourceFingerprint,
    })),
    taxPaidFacts: input.taxPaidFacts.map((fact) => ({
      factId: fact.factId,
      kind: fact.kind,
      amount: moneyFingerprintValue(fact.amount),
      payerId: fact.payerId,
      sourceFingerprint: fact.sourceFingerprint,
    })),
    payerIdentities: [...input.payerIdentities],
    evidenceStates: input.evidenceStates.map((state) => ({
      requirement: state.requirement,
      status: state.status,
      subjectId: state.subjectId,
      sourceFingerprint: state.sourceFingerprint,
    })),
    sourceFingerprints: [...input.sourceFingerprints],
    limitations: [...input.limitations],
  };
  return createHash('sha256').update(stableStringify(canonical)).digest('hex');
}
