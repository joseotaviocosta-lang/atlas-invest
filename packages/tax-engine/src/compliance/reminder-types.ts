/**
 * Phase 4K.3 — Tax Compliance Reminders & Deadline Notification Orchestration.
 *
 * Derived reminder identity, states, user-action types, delivery channels and
 * preference contracts. Reminders are a pure deterministic projection over the
 * authoritative 4K.1 compliance obligations and 4K.2 payment-support state.
 *
 * Product-UX policy (lead times, quiet cadence) lives here as data, never as
 * tax law. Reminder lead times are NOT tax rules and MUST NOT be confused
 * with legal deadlines, minimum-DARF thresholds, penalties or interest.
 */
import type { TaxComplianceObligationSeverity } from './compliance-types';

export const TAX_COMPLIANCE_REMINDER_KINDS = [
  'UPCOMING_DUE',
  'DUE_TODAY',
  'OVERDUE',
  'ACTION_REQUIRED',
  'EVIDENCE_REQUIRED',
  'PAYMENT_EVIDENCE_REVIEW',
  'STALE_SOURCE',
  'ANNUAL_REVIEW_REQUIRED',
] as const;

export type TaxComplianceReminderKind = (typeof TAX_COMPLIANCE_REMINDER_KINDS)[number];

export const TAX_COMPLIANCE_REMINDER_STATUSES = [
  'PENDING',
  'SCHEDULED',
  'DELIVERED',
  'ACKNOWLEDGED',
  'SNOOZED',
  'DISMISSED',
  'SUPERSEDED',
  'CANCELLED',
] as const;

export type TaxComplianceReminderStatus = (typeof TAX_COMPLIANCE_REMINDER_STATUSES)[number];

export const TAX_COMPLIANCE_REMINDER_ACTION_TYPES = ['ACKNOWLEDGE', 'SNOOZE', 'DISMISS'] as const;

export type TaxComplianceReminderActionType = (typeof TAX_COMPLIANCE_REMINDER_ACTION_TYPES)[number];

export const TAX_COMPLIANCE_REMINDER_CHANNELS = ['IN_APP', 'MOBILE_IN_APP'] as const;

export type TaxComplianceReminderChannel = (typeof TAX_COMPLIANCE_REMINDER_CHANNELS)[number];

export const TAX_COMPLIANCE_NOTIFICATION_DELIVERY_STATUSES = [
  'DELIVERED',
  'SKIPPED_SUPERSEDED',
] as const;

export type TaxComplianceNotificationDeliveryStatus =
  (typeof TAX_COMPLIANCE_NOTIFICATION_DELIVERY_STATUSES)[number];

/** Canonical engine version stamped on every derived reminder. */
export const TAX_COMPLIANCE_REMINDER_SOURCE_VERSION = '4K.3' as const;

/** Product-UX default: remind 7, 3 and 1 day(s) before the authoritative due date. */
export const DEFAULT_TAX_COMPLIANCE_REMINDER_LEAD_TIMES: readonly number[] = [7, 3, 1];

export interface TaxComplianceReminderPreferences {
  readonly remindersEnabled: boolean;
  readonly upcomingEnabled: boolean;
  readonly overdueEnabled: boolean;
  readonly annualEnabled: boolean;
  /** Days before dueDate that generate UPCOMING_DUE instances. UX policy, not law. */
  readonly leadTimes: readonly number[];
}

export const DEFAULT_TAX_COMPLIANCE_REMINDER_PREFERENCES: TaxComplianceReminderPreferences =
  Object.freeze({
    remindersEnabled: true,
    upcomingEnabled: true,
    overdueEnabled: true,
    annualEnabled: true,
    leadTimes: DEFAULT_TAX_COMPLIANCE_REMINDER_LEAD_TIMES,
  });

/**
 * Derived reminder. Identity is semantic and deterministic:
 * reminderKey = `${obligationKey}:${kind}:${triggerAt}`.
 * Business identity never uses random UUIDs.
 */
export interface TaxComplianceReminder {
  readonly reminderKey: string;
  readonly taxSubjectId: string;
  readonly obligationKey: string;
  /** Fingerprint of the obligation source this instance was derived from. */
  readonly sourceFingerprint: string;
  readonly kind: TaxComplianceReminderKind;
  /** Civil date (YYYY-MM-DD) the reminder instance triggers. */
  readonly triggerAt: string;
  /** Effective surfacing date: triggerAt, or snoozedUntil while snoozed. */
  readonly effectiveAt: string;
  readonly status: TaxComplianceReminderStatus;
  readonly severity: TaxComplianceObligationSeverity;
  /** Lock-screen-safe title: never carries amounts or credentials. */
  readonly title: string;
  /** In-app detail. Amounts shown verbatim from upstream, never computed. */
  readonly message: string;
  readonly actionTarget: string;
  readonly deliveryChannels: readonly TaxComplianceReminderChannel[];
  /** Idempotency key: `${reminderKey}:${sourceFingerprint}`. */
  readonly dedupKey: string;
  readonly sourceVersion: typeof TAX_COMPLIANCE_REMINDER_SOURCE_VERSION;
  readonly snoozedUntil: string | null;
  readonly actedAt: string | null;
  readonly isStale: boolean;
}

/** Persisted user interaction with a reminder instance. Append-only. */
export interface TaxComplianceReminderActionRecord {
  readonly id: string;
  readonly taxSubjectId: string;
  readonly reminderKey: string;
  readonly obligationKey: string;
  readonly reminderKind: TaxComplianceReminderKind;
  readonly triggerAt: string;
  readonly sourceFingerprint: string;
  readonly actionType: TaxComplianceReminderActionType;
  readonly snoozedUntil: string | null;
  readonly revision: number;
  readonly occurredAt: string;
  readonly createdAt: string;
}

/** Minimal 4K.2 payment-support hint consumed by the reminder projection. */
export interface TaxComplianceReminderPaymentHint {
  readonly obligationKey: string;
  readonly reconciliationStatus: string;
  readonly supportStatus: string;
}

/** Persisted in-app delivery event. One canonical event per dedup key. */
export interface TaxComplianceNotificationEvent {
  readonly id: string;
  readonly taxSubjectId: string;
  readonly reminderKey: string;
  readonly sourceFingerprint: string;
  readonly channel: TaxComplianceReminderChannel;
  readonly triggerAt: string;
  readonly deliveredAt: string;
  readonly deliveryStatus: TaxComplianceNotificationDeliveryStatus;
  readonly attempt: number;
  readonly dedupKey: string;
  readonly createdAt: string;
}
