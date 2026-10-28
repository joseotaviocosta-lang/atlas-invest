/**
 * Phase 5V — Notification System Enhancement: Unified Investor Notification Center.
 *
 * Grounded cross-product notification taxonomy, priorities, and pure presentation mappings.
 * All notifications represent factual events, deadlines, or actionable states
 * derived from verified Atlas engines (Fiscal, Review, Import, Recovery, Data Quality, Contribution).
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
  readonly [key: string]: unknown;
}

export interface NotificationDto {
  readonly id: string;
  readonly category: NotificationCategory;
  readonly priority: NotificationPriority;
  readonly title: string;
  readonly description: string;
  readonly occurredAt: string;
  readonly dueAt?: string | null;
  readonly actionHref: string;
  readonly actionLabel: string;
  readonly portfolioId?: string | null;
  readonly portfolioName?: string | null;
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

export const NOTIFICATION_CATEGORY_LABELS: Readonly<Record<NotificationCategory, string>> =
  Object.freeze({
    FISCAL: 'Fiscal',
    REVIEW: 'Revisão',
    IMPORT: 'Importação',
    RECOVERY: 'Recuperação',
    DATA_QUALITY: 'Qualidade de Dados',
    CONTRIBUTION: 'Aportes',
    CORPORATE_EVENT: 'Evento Corporativo',
  });

export const NOTIFICATION_PRIORITY_LABELS: Readonly<Record<NotificationPriority, string>> =
  Object.freeze({
    URGENT: 'Urgente',
    ACTION_REQUIRED: 'Ação Necessária',
    IMPORTANT: 'Importante',
    INFO: 'Informativo',
  });

export const NOTIFICATION_PRIORITY_BADGES: Readonly<
  Record<NotificationPriority, 'danger' | 'warning' | 'info' | 'neutral'>
> = Object.freeze({
  URGENT: 'danger',
  ACTION_REQUIRED: 'warning',
  IMPORTANT: 'info',
  INFO: 'neutral',
});

export interface NotificationVM {
  readonly id: string;
  readonly category: NotificationCategory;
  readonly categoryLabel: string;
  readonly priority: NotificationPriority;
  readonly priorityLabel: string;
  readonly priorityBadgeVariant: 'danger' | 'warning' | 'info' | 'neutral';
  readonly title: string;
  readonly description: string;
  readonly formattedOccurredAt: string;
  readonly formattedDueAt: string | null;
  readonly portfolioId: string | null;
  readonly portfolioName: string | null;
  readonly actionHref: string;
  readonly actionLabel: string;
  readonly isUrgent: boolean;
  readonly isActionRequired: boolean;
  readonly sourceOrigin: string;
}

export interface NotificationCenterVM {
  readonly notifications: readonly NotificationVM[];
  readonly totalCount: number;
  readonly actionRequiredCount: number;
  readonly urgentCount: number;
  readonly availableCategories: readonly NotificationCategory[];
  readonly hasPendingActions: boolean;
  readonly isEmpty: boolean;
}

function formatCivilDate(dateStr?: string | null): string | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return null;
  const iso = dateStr.slice(0, 10);
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatRelativeDateTime(isoStr?: string | null): string {
  if (!isoStr) return '';
  const civil = formatCivilDate(isoStr);
  if (civil) return civil;
  return isoStr;
}

export function mapToNotificationVM(dto: NotificationDto): NotificationVM {
  return Object.freeze({
    id: dto.id,
    category: dto.category,
    categoryLabel: NOTIFICATION_CATEGORY_LABELS[dto.category] || dto.category,
    priority: dto.priority,
    priorityLabel: NOTIFICATION_PRIORITY_LABELS[dto.priority] || dto.priority,
    priorityBadgeVariant: NOTIFICATION_PRIORITY_BADGES[dto.priority] || 'neutral',
    title: dto.title,
    description: dto.description,
    formattedOccurredAt: formatRelativeDateTime(dto.occurredAt),
    formattedDueAt: formatCivilDate(dto.dueAt),
    portfolioId: dto.portfolioId ?? null,
    portfolioName: dto.portfolioName ?? null,
    actionHref: dto.actionHref,
    actionLabel: dto.actionLabel,
    isUrgent: dto.priority === 'URGENT',
    isActionRequired: dto.priority === 'URGENT' || dto.priority === 'ACTION_REQUIRED',
    sourceOrigin: (dto.sourceContext?.origin as string) || 'Atlas',
  });
}

export function mapToNotificationCenterVM(
  dto?: NotificationCenterResponseDto | null,
): NotificationCenterVM {
  if (!dto || !Array.isArray(dto.data)) {
    return Object.freeze({
      notifications: [],
      totalCount: 0,
      actionRequiredCount: 0,
      urgentCount: 0,
      availableCategories: [],
      hasPendingActions: false,
      isEmpty: true,
    });
  }

  const notifications = dto.data.map(mapToNotificationVM);
  const totalCount = dto.meta?.totalCount ?? notifications.length;
  const actionRequiredCount =
    dto.meta?.actionRequiredCount ??
    notifications.filter((n) => n.isActionRequired).length;
  const urgentCount =
    dto.meta?.urgentCount ?? notifications.filter((n) => n.isUrgent).length;
  const availableCategories =
    dto.meta?.categories ??
    Array.from(new Set(notifications.map((n) => n.category)));

  return Object.freeze({
    notifications,
    totalCount,
    actionRequiredCount,
    urgentCount,
    availableCategories,
    hasPendingActions: actionRequiredCount > 0,
    isEmpty: notifications.length === 0,
  });
}
