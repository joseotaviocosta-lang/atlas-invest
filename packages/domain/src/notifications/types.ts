/**
 * Phase 5V — Notification System Enhancement: Canonical Notification Domain Types.
 *
 * Strict invariants:
 * - Every notification represents a factual event, deadline, or required action.
 * - Zero artificial urgency or synthetic spam.
 * - Single-currency isolation & decimal string representations.
 */

export const NOTIFICATION_CATEGORIES = [
  'FISCAL',
  'REVIEW',
  'IMPORT',
  'RECOVERY',
  'DATA_QUALITY',
  'CONTRIBUTION',
  'CORPORATE_EVENT',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_PRIORITIES = ['URGENT', 'ACTION_REQUIRED', 'IMPORTANT', 'INFO'] as const;

export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export interface NotificationSourceContextDto {
  readonly origin: string;
  readonly entityType: string;
  readonly entityId: string;
}

export interface NotificationDto {
  readonly id: string;
  readonly category: NotificationCategory;
  readonly priority: NotificationPriority;
  readonly title: string;
  readonly description: string;
  readonly occurredAt: string;
  readonly dueAt?: string | null;
  readonly portfolioId?: string | null;
  readonly portfolioName?: string | null;
  readonly actionHref: string;
  readonly actionLabel: string;
  readonly sourceContext: NotificationSourceContextDto;
}

export interface NotificationCenterMetaDto {
  readonly totalCount: number;
  readonly actionRequiredCount: number;
  readonly urgentCount: number;
  readonly categories: readonly NotificationCategory[];
  readonly generatedAt: string;
}

export interface NotificationCenterResponseDto {
  readonly data: readonly NotificationDto[];
  readonly meta: NotificationCenterMetaDto;
}
