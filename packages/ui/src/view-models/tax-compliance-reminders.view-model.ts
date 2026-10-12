import { formatDate } from '../formatters';
import { colors } from '../tokens/colors';

export type TaxComplianceReminderKind =
  | 'UPCOMING_DUE'
  | 'DUE_TODAY'
  | 'OVERDUE'
  | 'ACTION_REQUIRED'
  | 'EVIDENCE_REQUIRED'
  | 'PAYMENT_EVIDENCE_REVIEW'
  | 'STALE_SOURCE'
  | 'ANNUAL_REVIEW_REQUIRED';

export type TaxComplianceReminderStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'DELIVERED'
  | 'ACKNOWLEDGED'
  | 'SNOOZED'
  | 'DISMISSED'
  | 'SUPERSEDED'
  | 'CANCELLED';

export type TaxReminderActionType = 'ACKNOWLEDGE' | 'SNOOZE' | 'DISMISS';

export type TaxReminderDeliveryChannel = 'IN_APP' | 'MOBILE_IN_APP';

export type TaxComplianceReminderGroup = 'upcoming' | 'overdue' | 'stale' | 'action';

export interface RawTaxComplianceReminder {
  readonly reminderKey: string;
  readonly taxSubjectId: string;
  readonly obligationKey: string;
  readonly sourceFingerprint: string;
  readonly kind: TaxComplianceReminderKind;
  readonly triggerAt: string;
  readonly effectiveAt: string;
  readonly status: TaxComplianceReminderStatus;
  readonly severity: string;
  readonly title: string;
  readonly message: string;
  readonly actionTarget: string | null;
  readonly deliveryChannels: readonly string[];
  readonly dedupKey: string;
  readonly sourceVersion: string;
  readonly snoozedUntil: string | null;
  readonly actedAt: string | null;
  readonly isStale: boolean;
}

export interface RawTaxReminderPreferences {
  readonly remindersEnabled: boolean;
  readonly upcomingEnabled: boolean;
  readonly overdueEnabled: boolean;
  readonly annualEnabled: boolean;
  readonly leadTimes: readonly number[];
}

export interface RawTaxReminderDeliveryEvent {
  readonly id: string;
  readonly reminderKey?: string | null;
  readonly channel: string;
  readonly triggerAt?: string | null;
  readonly sourceFingerprint?: string | null;
  readonly deliveredAt?: string | null;
  readonly createdAt: string;
}

export interface TaxComplianceReminderViewModel {
  readonly reminderKey: string;
  readonly obligationKey: string;
  readonly sourceFingerprint: string;
  readonly kind: TaxComplianceReminderKind;
  readonly kindLabel: string;
  readonly triggerAt: string;
  readonly triggerAtFormatted: string;
  readonly effectiveAt: string;
  readonly effectiveAtFormatted: string;
  readonly status: TaxComplianceReminderStatus;
  readonly statusLabel: string;
  readonly statusColor: string;
  readonly statusVariant: 'neutral' | 'info' | 'warning' | 'danger' | 'success';
  readonly severity: string;
  readonly title: string;
  readonly message: string;
  readonly actionTarget: string | null;
  readonly deliveryChannels: readonly string[];
  readonly dedupKey: string;
  readonly sourceVersion: string;
  readonly snoozedUntil: string | null;
  readonly snoozedUntilFormatted: string | null;
  readonly actedAt: string | null;
  readonly actedAtFormatted: string | null;
  readonly isStale: boolean;
  readonly group: TaxComplianceReminderGroup;
  readonly groupLabel: string;
  readonly isOverdue: boolean;
  readonly isActionable: boolean;
}

export interface TaxReminderPreferencesViewModel {
  readonly remindersEnabled: boolean;
  readonly upcomingEnabled: boolean;
  readonly overdueEnabled: boolean;
  readonly annualEnabled: boolean;
  readonly leadTimes: readonly number[];
  readonly leadTimesLabel: string;
}

export interface TaxReminderDeliveryEventViewModel {
  readonly id: string;
  readonly channel: string;
  readonly channelLabel: string;
  readonly triggerAt: string | null;
  readonly triggerAtFormatted: string;
  readonly createdAtFormatted: string;
}

/**
 * Display-only support notice. Reminders never process payments and never
 * transmit data to government systems.
 */
export const TAX_REMINDER_SUPPORT_DISCLAIMER =
  'O Atlas não processa pagamentos nem transmite dados à Receita Federal';

/**
 * Display-only staleness notice shown when the underlying obligation data
 * changed after the reminder was generated.
 */
export const TAX_REMINDER_STALE_MESSAGE =
  'Os dados desta obrigação foram alterados. Revise novamente antes de considerar o item resolvido.';

/**
 * Display-only warning: acting on a reminder (acknowledge / dismiss) only
 * records an internal note and does NOT resolve the tax obligation itself.
 */
export const TAX_REMINDER_ACTION_NOT_RESOLVED_WARNING =
  'Reconhecer ou dispensar este lembrete não resolve a obrigação fiscal. ' +
  'O lembrete é apenas um aviso de apoio; a obrigação permanece até ser tratada pelos canais oficiais.';

export function taxComplianceRemindersQueryKey(calendarYear: number | string) {
  return ['fiscal', 'compliance', 'reminders', String(calendarYear)] as const;
}

export function taxReminderPreferencesQueryKey() {
  return ['fiscal', 'compliance', 'reminder-preferences'] as const;
}

export function taxReminderDeliveriesQueryKey(reminderKey: string) {
  return ['fiscal', 'compliance', 'reminder-deliveries', reminderKey] as const;
}

const REMINDER_KIND_LABELS: Record<TaxComplianceReminderKind, string> = {
  UPCOMING_DUE: 'Vence em breve',
  DUE_TODAY: 'Vence hoje',
  OVERDUE: 'Vencido',
  ACTION_REQUIRED: 'Ação necessária',
  EVIDENCE_REQUIRED: 'Comprovante necessário',
  PAYMENT_EVIDENCE_REVIEW: 'Revisar comprovante de pagamento',
  STALE_SOURCE: 'Dados alterados',
  ANNUAL_REVIEW_REQUIRED: 'Revisão anual necessária',
};

const REMINDER_STATUS_CONFIGS: Record<
  TaxComplianceReminderStatus,
  { label: string; color: string; variant: 'neutral' | 'info' | 'warning' | 'danger' | 'success' }
> = {
  PENDING: { label: 'Pendente', color: colors.textSecondary, variant: 'neutral' },
  SCHEDULED: { label: 'Agendado', color: colors.info, variant: 'info' },
  DELIVERED: { label: 'Entregue', color: colors.info, variant: 'info' },
  ACKNOWLEDGED: { label: 'Reconhecido', color: colors.positive, variant: 'success' },
  SNOOZED: { label: 'Adiado', color: colors.warning, variant: 'warning' },
  DISMISSED: { label: 'Dispensado', color: colors.textMuted, variant: 'neutral' },
  SUPERSEDED: {
    label: 'Substituído (dados alterados)',
    color: colors.warning,
    variant: 'warning',
  },
  CANCELLED: { label: 'Cancelado', color: colors.textMuted, variant: 'neutral' },
};

const REMINDER_GROUP_LABELS: Record<TaxComplianceReminderGroup, string> = {
  upcoming: 'Próximos vencimentos',
  overdue: 'Vencidos',
  stale: 'Dados alterados — revisar',
  action: 'Ações necessárias',
};

function classifyReminderGroup(raw: RawTaxComplianceReminder): TaxComplianceReminderGroup {
  if (raw.isStale || raw.kind === 'STALE_SOURCE' || raw.status === 'SUPERSEDED') {
    return 'stale';
  }
  if (raw.kind === 'OVERDUE') {
    return 'overdue';
  }
  if (
    raw.kind === 'ACTION_REQUIRED' ||
    raw.kind === 'EVIDENCE_REQUIRED' ||
    raw.kind === 'PAYMENT_EVIDENCE_REVIEW' ||
    raw.kind === 'ANNUAL_REVIEW_REQUIRED'
  ) {
    return 'action';
  }
  return 'upcoming';
}

export function mapToTaxComplianceReminderViewModel(
  raw: RawTaxComplianceReminder,
): TaxComplianceReminderViewModel {
  const statusConfig = REMINDER_STATUS_CONFIGS[raw.status] ?? REMINDER_STATUS_CONFIGS.PENDING;
  const group = classifyReminderGroup(raw);
  return {
    reminderKey: raw.reminderKey,
    obligationKey: raw.obligationKey,
    sourceFingerprint: raw.sourceFingerprint,
    kind: raw.kind,
    kindLabel: REMINDER_KIND_LABELS[raw.kind] ?? raw.kind,
    triggerAt: raw.triggerAt,
    triggerAtFormatted: formatDate(raw.triggerAt),
    effectiveAt: raw.effectiveAt,
    effectiveAtFormatted: formatDate(raw.effectiveAt),
    status: raw.status,
    statusLabel: statusConfig.label,
    statusColor: statusConfig.color,
    statusVariant: statusConfig.variant,
    severity: raw.severity,
    title: raw.title,
    message: raw.message,
    actionTarget: raw.actionTarget,
    deliveryChannels: raw.deliveryChannels ?? [],
    dedupKey: raw.dedupKey,
    sourceVersion: raw.sourceVersion,
    snoozedUntil: raw.snoozedUntil,
    snoozedUntilFormatted: raw.snoozedUntil ? formatDate(raw.snoozedUntil) : null,
    actedAt: raw.actedAt,
    actedAtFormatted: raw.actedAt ? formatDate(raw.actedAt) : null,
    isStale: raw.isStale,
    group,
    groupLabel: REMINDER_GROUP_LABELS[group],
    isOverdue: raw.kind === 'OVERDUE',
    isActionable:
      raw.status === 'PENDING' || raw.status === 'SCHEDULED' || raw.status === 'DELIVERED',
  };
}

export function mapToTaxComplianceReminderListViewModel(
  rawList: readonly RawTaxComplianceReminder[] | null | undefined,
): TaxComplianceReminderViewModel[] {
  if (!rawList) return [];
  return rawList.map(mapToTaxComplianceReminderViewModel);
}

export function mapToTaxReminderPreferencesViewModel(
  raw: RawTaxReminderPreferences | null | undefined,
): TaxReminderPreferencesViewModel | null {
  if (!raw) return null;
  const leadTimes = [...(raw.leadTimes ?? [])];
  return {
    remindersEnabled: raw.remindersEnabled,
    upcomingEnabled: raw.upcomingEnabled,
    overdueEnabled: raw.overdueEnabled,
    annualEnabled: raw.annualEnabled,
    leadTimes,
    leadTimesLabel: leadTimes.length === 0 ? '—' : leadTimes.map((days) => `${days}d`).join(', '),
  };
}

const DELIVERY_CHANNEL_LABELS: Record<string, string> = {
  IN_APP: 'No aplicativo (web)',
  MOBILE_IN_APP: 'No aplicativo (móvel)',
};

export function mapToTaxReminderDeliveryEventViewModel(
  raw: RawTaxReminderDeliveryEvent,
): TaxReminderDeliveryEventViewModel {
  return {
    id: raw.id,
    channel: raw.channel,
    channelLabel: DELIVERY_CHANNEL_LABELS[raw.channel] ?? raw.channel,
    triggerAt: raw.triggerAt ?? null,
    triggerAtFormatted: raw.triggerAt ? formatDate(raw.triggerAt) : '—',
    createdAtFormatted: formatDate(raw.createdAt.slice(0, 10)),
  };
}

export interface TaxReminderActionPayload {
  readonly actionType: TaxReminderActionType;
  readonly obligationKey: string;
  readonly reminderKind: TaxComplianceReminderKind;
  readonly triggerAt: string;
  readonly sourceFingerprint: string;
  readonly snoozedUntil?: string;
  readonly note?: string;
}

export function buildTaxReminderActionPayload(
  raw: Pick<RawTaxComplianceReminder, 'obligationKey' | 'kind' | 'triggerAt' | 'sourceFingerprint'>,
  actionType: TaxReminderActionType,
  options?: { snoozedUntil?: string; note?: string },
): TaxReminderActionPayload {
  if (actionType === 'SNOOZE') {
    const snoozedUntil = options?.snoozedUntil?.trim() ?? '';
    if (!snoozedUntil) {
      throw new Error('Informe a nova data de exibição (AAAA-MM-DD) para adiar o lembrete.');
    }
    const dateError = taxReminderSnoozeDateError(snoozedUntil);
    if (dateError) {
      throw new Error(dateError);
    }
    const payload: TaxReminderActionPayload = {
      actionType,
      obligationKey: raw.obligationKey,
      reminderKind: raw.kind,
      triggerAt: raw.triggerAt,
      sourceFingerprint: raw.sourceFingerprint,
      snoozedUntil,
    };
    const note = options?.note?.trim();
    return note ? { ...payload, note } : payload;
  }
  const payload: TaxReminderActionPayload = {
    actionType,
    obligationKey: raw.obligationKey,
    reminderKind: raw.kind,
    triggerAt: raw.triggerAt,
    sourceFingerprint: raw.sourceFingerprint,
  };
  const note = options?.note?.trim();
  return note ? { ...payload, note } : payload;
}

export interface TaxReminderDeliveryPayload {
  readonly sourceFingerprint: string;
  readonly channel: TaxReminderDeliveryChannel;
  readonly triggerAt: string;
}

export function buildTaxReminderDeliveryPayload(
  raw: Pick<RawTaxComplianceReminder, 'sourceFingerprint' | 'triggerAt'>,
  channel: TaxReminderDeliveryChannel,
): TaxReminderDeliveryPayload {
  return {
    sourceFingerprint: raw.sourceFingerprint,
    channel,
    triggerAt: raw.triggerAt,
  };
}

/**
 * Validates a civil calendar date string (YYYY-MM-DD) used for snoozing.
 * Returns an error message in PT-BR, or null when valid. Pure presentation
 * validation — it never computes tax or due dates.
 */
export function taxReminderSnoozeDateError(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return 'Informe a data no formato AAAA-MM-DD (ex: 2026-10-20).';
  }
  const year = Number(trimmed.slice(0, 4));
  const month = Number(trimmed.slice(5, 7));
  const day = Number(trimmed.slice(8, 10));
  if (month < 1 || month > 12) {
    return 'Informe uma data civil válida (AAAA-MM-DD).';
  }
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  if (day < 1 || day > daysInMonth) {
    return 'Informe uma data civil válida (AAAA-MM-DD).';
  }
  return null;
}

/**
 * Parses a comma-separated lead-time editor value (e.g. "30, 7, 1") into a
 * list of whole-day counts. Returns null when the input is invalid.
 * Lead times are notification configuration, never financial amounts.
 */
export function parseTaxReminderLeadTimes(value: string): number[] | null {
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  const parsed: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const days = parseInt(part, 10);
    if (!Number.isSafeInteger(days) || days < 0 || days > 365) return null;
    parsed.push(days);
  }
  return parsed;
}
