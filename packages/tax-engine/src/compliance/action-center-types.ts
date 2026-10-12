/**
 * Phase 4K.4 — Tax Compliance Action Center & Calendar Foundation.
 *
 * Derived orchestration contracts over 4K.1 obligations, 4K.2 payment hints,
 * 4K.3 reminders and annual review state. Priority and next-action are
 * product UX policy, never tax law. Current action state is derived and
 * never independently persisted.
 */
import type { TaxComplianceObligationSeverity } from './compliance-types';

export const TAX_COMPLIANCE_ACTION_ITEM_KINDS = [
  'PAY_TAX',
  'REVIEW_PAYMENT_EVIDENCE',
  'REVIEW_CHANGED_OBLIGATION',
  'PROVIDE_CONFIRMATION',
  'REVIEW_ANNUAL_FILING',
  'RESOLVE_BLOCKER',
  'COMPLETE_COMPLIANCE_ACTION',
  'INFORMATIONAL',
] as const;

export type TaxComplianceActionItemKind = (typeof TAX_COMPLIANCE_ACTION_ITEM_KINDS)[number];

export const TAX_COMPLIANCE_OPERATIONAL_STATUSES = [
  'ACTION_REQUIRED',
  'UPCOMING',
  'DUE_TODAY',
  'OVERDUE',
  'WAITING_USER',
  'REQUIRES_REVIEW',
  'COMPLETED',
  'SUPERSEDED',
  'INFORMATIONAL',
] as const;

export type TaxComplianceOperationalStatus = (typeof TAX_COMPLIANCE_OPERATIONAL_STATUSES)[number];

export const TAX_COMPLIANCE_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

export type TaxCompliancePriority = (typeof TAX_COMPLIANCE_PRIORITIES)[number];

export const TAX_COMPLIANCE_NEXT_ACTIONS = [
  'REVIEW_OBLIGATION',
  'PREPARE_PAYMENT',
  'ADD_PAYMENT_EVIDENCE',
  'REVIEW_STALE_EVIDENCE',
  'CONFIRM_INFORMATION',
  'OPEN_ANNUAL_REVIEW',
  'ACKNOWLEDGE_REMINDER',
  'VIEW_DETAILS',
] as const;

export type TaxComplianceNextAction = (typeof TAX_COMPLIANCE_NEXT_ACTIONS)[number];

export const TAX_COMPLIANCE_CALENDAR_EVENT_TYPES = [
  'OBLIGATION_DUE',
  'REMINDER',
  'PAYMENT_EVIDENCE_REVIEW',
  'ANNUAL_REVIEW',
  'USER_SNOOZE',
] as const;

export type TaxComplianceCalendarEventType = (typeof TAX_COMPLIANCE_CALENDAR_EVENT_TYPES)[number];

/** Canonical engine version stamped on every derived action item. */
export const TAX_COMPLIANCE_ACTION_CENTER_SOURCE_VERSION = '4K.4' as const;

/**
 * Derived operational action item. Identity is semantic and deterministic:
 * actionKey = `${obligationKey}:${kind}:${sourceFingerprint}`.
 * Business identity never uses random UUIDs.
 */
export interface TaxComplianceActionItem {
  readonly actionKey: string;
  readonly taxSubjectId: string;
  readonly obligationKey: string;
  /** Fingerprint of the upstream source this item was derived from. */
  readonly sourceFingerprint: string;
  readonly kind: TaxComplianceActionItemKind;
  /** Period string: "YYYY-MM" (monthly) or "YYYY" (annual). */
  readonly period: string;
  readonly calendarYear: number;
  /** Declaration exercise year for annual items; null otherwise. */
  readonly exercise: number | null;
  /** Authoritative civil due date (YYYY-MM-DD) or null. Never derived here. */
  readonly dueDate: string | null;
  readonly priority: TaxCompliancePriority;
  readonly operationalStatus: TaxComplianceOperationalStatus;
  /** Lock-screen-safe title: never carries amounts or credentials. */
  readonly title: string;
  /** In-app summary. Upstream strings verbatim; never recomputed figures. */
  readonly summary: string;
  readonly nextAction: TaxComplianceNextAction;
  readonly actionTarget: string;
  /** Exact decimal string or null, verbatim from upstream. Never computed. */
  readonly amount: string | null;
  readonly currency: string | null;
  readonly revenueCode: string | null;
  readonly paymentSupportStatus: string | null;
  readonly paymentEvidenceStatus: string | null;
  readonly reminderStatus: string | null;
  readonly annualReviewStatus: string | null;
  readonly isStale: boolean;
  readonly isSuperseded: boolean;
  readonly blockingReasons: readonly string[];
  readonly sourceReferences: ReadonlyArray<{ label: string; ref: string }>;
  readonly sourceVersion: typeof TAX_COMPLIANCE_ACTION_CENTER_SOURCE_VERSION;
}

export interface TaxComplianceActionCenterSummary {
  readonly needsAttention: number;
  readonly overdue: number;
  readonly dueToday: number;
  readonly upcoming: number;
  readonly requiresReview: number;
  readonly completed: number;
  readonly annualReview: number;
  readonly informational: number;
  readonly total: number;
}

export interface TaxComplianceCalendarEvent {
  /** Deterministic identity: `${sourceKey}:${eventType}:${eventDate}`. */
  readonly eventKey: string;
  readonly taxSubjectId: string;
  readonly obligationKey: string | null;
  readonly actionKey: string | null;
  readonly sourceFingerprint: string;
  readonly eventType: TaxComplianceCalendarEventType;
  /** Civil date (YYYY-MM-DD), always from authoritative upstream dates. */
  readonly eventDate: string;
  /** Lock-screen-safe title: never carries amounts. */
  readonly title: string;
  readonly status: string;
  readonly severity: TaxComplianceObligationSeverity;
  readonly actionTarget: string;
}
