/**
 * Phase 4K.5 — Tax Compliance Period Close, Evidence Binder & Professional
 * Handoff Foundation.
 *
 * Derived closeout/packaging/auditability contracts over 4K.1 obligations,
 * 4K.2 payment hints/evidence, 4K.3 reminders, 4K.4 action center and annual
 * review state. Closeout is OPERATIONAL ONLY: it never means legal
 * settlement, Receita verification, official filing acceptance or debt
 * extinguishment.
 */

export const TAX_COMPLIANCE_CLOSE_SCOPES = ['MONTHLY', 'ANNUAL'] as const;

export type TaxComplianceCloseScope = (typeof TAX_COMPLIANCE_CLOSE_SCOPES)[number];

export const TAX_COMPLIANCE_CLOSE_READINESS_STATUSES = [
  'READY_TO_CLOSE',
  'REQUIRES_REVIEW',
  'PARTIAL',
  'BLOCKED',
  'NO_ACTIVITY',
  'STALE',
] as const;

export type TaxComplianceCloseReadinessStatus =
  (typeof TAX_COMPLIANCE_CLOSE_READINESS_STATUSES)[number];

/**
 * Frozen precedence, worst wins: BLOCKED > STALE > REQUIRES_REVIEW >
 * PARTIAL > READY_TO_CLOSE > NO_ACTIVITY.
 */
export const TAX_COMPLIANCE_CLOSE_READINESS_PRECEDENCE: readonly TaxComplianceCloseReadinessStatus[] =
  Object.freeze([
    'BLOCKED',
    'STALE',
    'REQUIRES_REVIEW',
    'PARTIAL',
    'READY_TO_CLOSE',
    'NO_ACTIVITY',
  ]);

export const TAX_COMPLIANCE_CLOSE_CHECKLIST_CATEGORIES = [
  'OBLIGATIONS_REVIEWED',
  'ACTION_ITEMS_RESOLVED',
  'PAYMENT_SUPPORT_REVIEWED',
  'PAYMENT_EVIDENCE_RECONCILED',
  'STALE_ITEMS_REVIEWED',
  'ANNUAL_CONFIRMATIONS_RESOLVED',
  'BLOCKERS_CLEARED',
] as const;

export type TaxComplianceCloseChecklistCategory =
  (typeof TAX_COMPLIANCE_CLOSE_CHECKLIST_CATEGORIES)[number];

export const TAX_COMPLIANCE_CLOSE_CHECKLIST_STATES = [
  'COMPLETE',
  'INCOMPLETE',
  'NOT_APPLICABLE',
  'BLOCKED',
  'REQUIRES_REVIEW',
] as const;

export type TaxComplianceCloseChecklistState =
  (typeof TAX_COMPLIANCE_CLOSE_CHECKLIST_STATES)[number];

export const TAX_COMPLIANCE_CLOSE_MODES = ['CLEAN'] as const;

export type TaxComplianceCloseMode = (typeof TAX_COMPLIANCE_CLOSE_MODES)[number];

export const TAX_COMPLIANCE_CLOSE_RECORD_STATUSES = ['CLOSED', 'REOPENED'] as const;

export type TaxComplianceCloseRecordStatus = (typeof TAX_COMPLIANCE_CLOSE_RECORD_STATUSES)[number];

/** Engine version stamped on every derived closeout artifact. */
export const TAX_COMPLIANCE_PERIOD_CLOSE_SOURCE_VERSION = '4K.5' as const;

export interface TaxComplianceCloseChecklistEntry {
  readonly category: TaxComplianceCloseChecklistCategory;
  readonly state: TaxComplianceCloseChecklistState;
  /** Human-readable, data-derived explanation (upstream strings verbatim). */
  readonly detail: string;
  /** Count of items behind this entry (small-int arithmetic only). */
  readonly itemCount: number;
}

export interface TaxComplianceUnresolvedItem {
  /** Stable reference: obligationKey or actionKey. */
  readonly ref: string;
  readonly kind: string;
  readonly title: string;
  readonly reason: string;
  readonly severity: string;
}

export interface TaxCompliancePreviousCloseRef {
  readonly revision: number;
  readonly recordStatus: TaxComplianceCloseRecordStatus;
  readonly sourceFingerprint: string;
  readonly binderFingerprint: string;
  readonly closedAt: string | null;
}

/**
 * Deterministic close-readiness assessment for one (scope, period).
 * READY_TO_CLOSE means: "Atlas has no currently known unresolved
 * operational compliance item for this support period according to the
 * available authoritative data." It NEVER means Receita confirmation.
 */
export interface TaxCompliancePeriodCloseReadiness {
  readonly taxSubjectId: string;
  readonly scope: TaxComplianceCloseScope;
  /** Canonical period: "YYYY-MM" (monthly) or "YYYY" (annual). */
  readonly period: string;
  readonly calendarYear: number;
  readonly month: string | null;
  readonly exercise: number | null;
  readonly readiness: TaxComplianceCloseReadinessStatus;
  readonly checklist: readonly TaxComplianceCloseChecklistEntry[];
  readonly unresolvedItems: readonly TaxComplianceUnresolvedItem[];
  /** Current semantic source fingerprint (order-invariant, no timestamps). */
  readonly sourceFingerprint: string;
  readonly previousClose: TaxCompliancePreviousCloseRef | null;
  /** True when a preserved CLOSED record exists for an older fingerprint. */
  readonly isStaleVsPreviousClose: boolean;
  readonly cleanCloseAllowed: boolean;
  readonly sourceVersion: typeof TAX_COMPLIANCE_PERIOD_CLOSE_SOURCE_VERSION;
}

/**
 * Historical close event. Immutable once written; reopen/reclose append
 * new revisions. Audit fields only — never fiscal truth.
 */
export interface TaxCompliancePeriodCloseRecord {
  readonly id: string;
  readonly taxSubjectId: string;
  readonly scope: TaxComplianceCloseScope;
  readonly period: string;
  readonly calendarYear: number;
  readonly month: string | null;
  readonly exercise: number | null;
  readonly revision: number;
  readonly recordStatus: TaxComplianceCloseRecordStatus;
  readonly statusAtClose: TaxComplianceCloseReadinessStatus | null;
  readonly closeMode: TaxComplianceCloseMode | null;
  readonly sourceFingerprint: string;
  readonly binderFingerprint: string;
  readonly reason: string | null;
  readonly closedAt: string | null;
  readonly createdAt: string;
}

export interface TaxComplianceEvidenceBinderSection {
  readonly code: string;
  readonly title: string;
  /** Pre-rendered deterministic lines (verbatim upstream strings). */
  readonly lines: readonly string[];
}

export interface TaxComplianceEvidenceBinder {
  readonly taxSubjectId: string;
  readonly scope: TaxComplianceCloseScope;
  readonly period: string;
  readonly calendarYear: number;
  readonly month: string | null;
  readonly exercise: number | null;
  readonly readiness: TaxComplianceCloseReadinessStatus;
  readonly sections: readonly TaxComplianceEvidenceBinderSection[];
  readonly binderFingerprint: string;
  readonly generatedAt: string;
  readonly sourceVersion: typeof TAX_COMPLIANCE_PERIOD_CLOSE_SOURCE_VERSION;
}

/**
 * Display-only support disclaimer. Every binder/export carries it verbatim.
 * Closeout never claims legal discharge, Receita acceptance or filing.
 */
export const TAX_COMPLIANCE_CLOSE_SUPPORT_DISCLAIMER =
  'Este pacote é material de apoio produzido pelo Atlas com base nos dados disponíveis e nas informações registradas pelo usuário. ' +
  'Não constitui declaração transmitida à Receita Federal, DARF oficial, comprovante de pagamento governamental ou certificação de regularidade fiscal.';

/** Short operational-close notice: close is Atlas-internal only. */
export const TAX_COMPLIANCE_CLOSE_OPERATIONAL_NOTICE =
  'Fechamento operacional interno do Atlas. Não equivale a quitação de tributo, homologação pela Receita Federal ou entrega de declaração.';

/** Stale-close warning shown when the source changed after a close. */
export const TAX_COMPLIANCE_CLOSE_STALE_MESSAGE =
  'Este fechamento ficou desatualizado porque os dados de origem mudaram.';
