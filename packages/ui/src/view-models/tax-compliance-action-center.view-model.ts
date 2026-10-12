import { formatCurrency, formatDate } from '../formatters';
import { colors } from '../tokens/colors';

export type TaxComplianceActionItemKind =
  | 'PAY_TAX'
  | 'REVIEW_PAYMENT_EVIDENCE'
  | 'REVIEW_CHANGED_OBLIGATION'
  | 'PROVIDE_CONFIRMATION'
  | 'REVIEW_ANNUAL_FILING'
  | 'RESOLVE_BLOCKER'
  | 'COMPLETE_COMPLIANCE_ACTION'
  | 'INFORMATIONAL';

export type TaxComplianceOperationalStatus =
  | 'ACTION_REQUIRED'
  | 'UPCOMING'
  | 'DUE_TODAY'
  | 'OVERDUE'
  | 'WAITING_USER'
  | 'REQUIRES_REVIEW'
  | 'COMPLETED'
  | 'SUPERSEDED'
  | 'INFORMATIONAL';

export type TaxCompliancePriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type TaxComplianceNextAction =
  | 'REVIEW_OBLIGATION'
  | 'PREPARE_PAYMENT'
  | 'ADD_PAYMENT_EVIDENCE'
  | 'REVIEW_STALE_EVIDENCE'
  | 'CONFIRM_INFORMATION'
  | 'OPEN_ANNUAL_REVIEW'
  | 'ACKNOWLEDGE_REMINDER'
  | 'VIEW_DETAILS';

export type TaxComplianceCalendarEventType =
  'OBLIGATION_DUE' | 'REMINDER' | 'PAYMENT_EVIDENCE_REVIEW' | 'ANNUAL_REVIEW' | 'USER_SNOOZE';

export type TaxComplianceActionSection =
  'attention' | 'upcoming' | 'review' | 'completed' | 'informational';

export interface RawTaxComplianceActionItem {
  readonly actionKey: string;
  readonly taxSubjectId: string;
  readonly obligationKey: string;
  readonly sourceFingerprint: string;
  readonly kind: TaxComplianceActionItemKind;
  readonly period: string;
  readonly calendarYear: number;
  readonly exercise: number | null;
  readonly dueDate: string | null;
  readonly priority: TaxCompliancePriority;
  readonly operationalStatus: TaxComplianceOperationalStatus;
  readonly title: string;
  readonly summary: string;
  readonly nextAction: TaxComplianceNextAction;
  readonly actionTarget: string;
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
  readonly sourceVersion: string;
}

export interface RawTaxComplianceActionCenterSummary {
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

export interface RawTaxComplianceCalendarEvent {
  readonly eventKey: string;
  readonly taxSubjectId: string;
  readonly obligationKey: string | null;
  readonly actionKey: string | null;
  readonly sourceFingerprint: string;
  readonly eventType: TaxComplianceCalendarEventType;
  readonly eventDate: string;
  readonly title: string;
  readonly status: string;
  readonly severity: string;
  readonly actionTarget: string;
}

export interface TaxComplianceActionItemViewModel {
  readonly actionKey: string;
  readonly obligationKey: string;
  readonly kind: TaxComplianceActionItemKind;
  readonly kindLabel: string;
  readonly period: string;
  readonly calendarYear: number;
  readonly exercise: number | null;
  readonly exerciseLabel: string | null;
  readonly dueDate: string | null;
  readonly dueDateFormatted: string;
  readonly priority: TaxCompliancePriority;
  readonly priorityLabel: string;
  readonly operationalStatus: TaxComplianceOperationalStatus;
  readonly statusLabel: string;
  readonly statusColor: string;
  readonly statusVariant: 'neutral' | 'info' | 'warning' | 'danger' | 'success';
  readonly title: string;
  readonly summary: string;
  readonly nextAction: TaxComplianceNextAction;
  readonly nextActionLabel: string;
  readonly actionTarget: string;
  readonly amountFormatted: string;
  readonly revenueCode: string | null;
  readonly paymentSupportStatus: string | null;
  readonly paymentEvidenceStatus: string | null;
  readonly paymentEvidenceLabel: string | null;
  readonly reminderStatus: string | null;
  readonly reminderStatusLabel: string | null;
  readonly annualReviewStatus: string | null;
  readonly isStale: boolean;
  readonly isSuperseded: boolean;
  readonly blockingReasons: readonly string[];
  readonly section: TaxComplianceActionSection;
  readonly sectionLabel: string;
}

/**
 * Display-only support notice. The Action Center never processes payments,
 * never verifies settlement with the government and never transmits data.
 */
export const TAX_ACTION_CENTER_SUPPORT_DISCLAIMER =
  'Central operacional de apoio: o Atlas não processa pagamentos, não confirma quitação junto à Receita Federal e não transmite dados a sistemas oficiais';

export const TAX_ACTION_CENTER_STALE_MESSAGE =
  'Dados desta obrigação foram alterados. Revise novamente.';

export const TAX_ACTION_CENTER_EVIDENCE_NOT_VERIFIED_WARNING =
  'Comprovante informado pelo investidor; sem verificação governamental.';

export const TAX_ACTION_CENTER_REMINDER_NOT_RESOLVED_WARNING =
  'Lembretes e avisos não resolvem a obrigação fiscal.';

export function taxComplianceActionCenterQueryKey(
  calendarYear: number | string,
  filters?: { status?: string; priority?: string; kind?: string; month?: string },
) {
  const suffix = filters
    ? [filters.status ?? '', filters.priority ?? '', filters.kind ?? '', filters.month ?? ''].join(
        '|',
      )
    : '';
  return ['fiscal', 'compliance', 'action-center', String(calendarYear), suffix] as const;
}

export function taxComplianceCalendarQueryKey(from: string, to: string) {
  return ['fiscal', 'compliance', 'calendar', from, to] as const;
}

const ACTION_KIND_LABELS: Record<TaxComplianceActionItemKind, string> = {
  PAY_TAX: 'Pagar tributo',
  REVIEW_PAYMENT_EVIDENCE: 'Revisar comprovante',
  REVIEW_CHANGED_OBLIGATION: 'Dados alterados — revisar',
  PROVIDE_CONFIRMATION: 'Fornecer confirmação',
  REVIEW_ANNUAL_FILING: 'Revisar declaração anual',
  RESOLVE_BLOCKER: 'Resolver pendência',
  COMPLETE_COMPLIANCE_ACTION: 'Ação concluída',
  INFORMATIONAL: 'Informativo',
};

const ACTION_STATUS_CONFIGS: Record<
  TaxComplianceOperationalStatus,
  { label: string; color: string; variant: 'neutral' | 'info' | 'warning' | 'danger' | 'success' }
> = {
  ACTION_REQUIRED: { label: 'Ação necessária', color: colors.negative, variant: 'danger' },
  UPCOMING: { label: 'Próximo vencimento', color: colors.info, variant: 'info' },
  DUE_TODAY: { label: 'Vence hoje', color: colors.warning, variant: 'warning' },
  OVERDUE: { label: 'Em atraso', color: colors.negative, variant: 'danger' },
  WAITING_USER: { label: 'Aguardando você', color: colors.warning, variant: 'warning' },
  REQUIRES_REVIEW: { label: 'Em revisão', color: colors.warning, variant: 'warning' },
  COMPLETED: { label: 'Concluído', color: colors.positive, variant: 'success' },
  SUPERSEDED: { label: 'Substituído (dados alterados)', color: colors.warning, variant: 'warning' },
  INFORMATIONAL: { label: 'Informativo', color: colors.textSecondary, variant: 'neutral' },
};

const ACTION_PRIORITY_LABELS: Record<TaxCompliancePriority, string> = {
  CRITICAL: 'Crítica',
  HIGH: 'Alta',
  MEDIUM: 'Média',
  LOW: 'Baixa',
};

const NEXT_ACTION_LABELS: Record<TaxComplianceNextAction, string> = {
  REVIEW_OBLIGATION: 'Revisar obrigação',
  PREPARE_PAYMENT: 'Preparar pagamento',
  ADD_PAYMENT_EVIDENCE: 'Adicionar comprovante',
  REVIEW_STALE_EVIDENCE: 'Revisar dados alterados',
  CONFIRM_INFORMATION: 'Confirmar informações',
  OPEN_ANNUAL_REVIEW: 'Abrir revisão anual',
  ACKNOWLEDGE_REMINDER: 'Reconhecer lembrete',
  VIEW_DETAILS: 'Ver detalhes',
};

const PAYMENT_EVIDENCE_LABELS: Record<string, string> = {
  NO_EVIDENCE: 'Sem comprovante',
  USER_REPORTED_MATCH: 'Comprovante informado — confere',
  USER_REPORTED_MISMATCH: 'Comprovante diverge — revisar',
  STALE_SOURCE: 'Comprovante desatualizado — revisar',
  REQUIRES_REVIEW: 'Em revisão',
};

const ACTION_SECTION_LABELS: Record<TaxComplianceActionSection, string> = {
  attention: 'Precisa de atenção',
  upcoming: 'Próximos vencimentos',
  review: 'Em revisão',
  completed: 'Concluídos recentemente',
  informational: 'Informativos',
};

function classifyActionSection(raw: RawTaxComplianceActionItem): TaxComplianceActionSection {
  if (
    raw.operationalStatus === 'OVERDUE' ||
    raw.operationalStatus === 'DUE_TODAY' ||
    raw.operationalStatus === 'ACTION_REQUIRED' ||
    raw.isStale
  ) {
    return 'attention';
  }
  if (raw.operationalStatus === 'REQUIRES_REVIEW' || raw.operationalStatus === 'WAITING_USER') {
    return 'review';
  }
  if (raw.operationalStatus === 'COMPLETED') {
    return 'completed';
  }
  if (raw.operationalStatus === 'UPCOMING') {
    return 'upcoming';
  }
  return 'informational';
}

/**
 * Format-only mapper: copies server strings verbatim, formats dates/amounts
 * for display. Zero financial math — amounts are never parsed or aggregated.
 */
export function mapToTaxComplianceActionItemViewModel(
  raw: RawTaxComplianceActionItem,
): TaxComplianceActionItemViewModel {
  const statusConfig =
    ACTION_STATUS_CONFIGS[raw.operationalStatus] ?? ACTION_STATUS_CONFIGS.INFORMATIONAL;
  const section = classifyActionSection(raw);
  return {
    actionKey: raw.actionKey,
    obligationKey: raw.obligationKey,
    kind: raw.kind,
    kindLabel: ACTION_KIND_LABELS[raw.kind] ?? raw.kind,
    period: raw.period,
    calendarYear: raw.calendarYear,
    exercise: raw.exercise,
    exerciseLabel:
      raw.exercise !== null
        ? `Exercício ${raw.exercise} (ano-calendário ${raw.calendarYear})`
        : null,
    dueDate: raw.dueDate,
    dueDateFormatted: raw.dueDate ? formatDate(raw.dueDate) : '—',
    priority: raw.priority,
    priorityLabel: ACTION_PRIORITY_LABELS[raw.priority] ?? raw.priority,
    operationalStatus: raw.operationalStatus,
    statusLabel: statusConfig.label,
    statusColor: statusConfig.color,
    statusVariant: statusConfig.variant,
    title: raw.title,
    summary: raw.summary,
    nextAction: raw.nextAction,
    nextActionLabel: NEXT_ACTION_LABELS[raw.nextAction] ?? raw.nextAction,
    actionTarget: raw.actionTarget,
    amountFormatted:
      raw.amount !== null && raw.currency !== null ? formatCurrency(raw.amount, raw.currency) : '—',
    revenueCode: raw.revenueCode,
    paymentSupportStatus: raw.paymentSupportStatus,
    paymentEvidenceStatus: raw.paymentEvidenceStatus,
    paymentEvidenceLabel:
      raw.paymentEvidenceStatus !== null
        ? (PAYMENT_EVIDENCE_LABELS[raw.paymentEvidenceStatus] ?? raw.paymentEvidenceStatus)
        : null,
    reminderStatus: raw.reminderStatus,
    reminderStatusLabel: raw.reminderStatus,
    annualReviewStatus: raw.annualReviewStatus,
    isStale: raw.isStale,
    isSuperseded: raw.isSuperseded,
    blockingReasons: raw.blockingReasons ?? [],
    section,
    sectionLabel: ACTION_SECTION_LABELS[section],
  };
}

export function mapToTaxComplianceActionItemListViewModel(
  rawList: readonly RawTaxComplianceActionItem[] | null | undefined,
): TaxComplianceActionItemViewModel[] {
  if (!rawList) return [];
  return rawList.map(mapToTaxComplianceActionItemViewModel);
}

export interface TaxComplianceCalendarEventViewModel {
  readonly eventKey: string;
  readonly obligationKey: string | null;
  readonly actionKey: string | null;
  readonly eventType: TaxComplianceCalendarEventType;
  readonly eventTypeLabel: string;
  readonly eventDate: string;
  readonly eventDateFormatted: string;
  readonly title: string;
  readonly status: string;
  readonly actionTarget: string;
}

const CALENDAR_EVENT_LABELS: Record<TaxComplianceCalendarEventType, string> = {
  OBLIGATION_DUE: 'Vencimento',
  REMINDER: 'Lembrete',
  PAYMENT_EVIDENCE_REVIEW: 'Revisar comprovante',
  ANNUAL_REVIEW: 'Revisão anual',
  USER_SNOOZE: 'Lembrete adiado',
};

export function mapToTaxComplianceCalendarEventViewModel(
  raw: RawTaxComplianceCalendarEvent,
): TaxComplianceCalendarEventViewModel {
  return {
    eventKey: raw.eventKey,
    obligationKey: raw.obligationKey,
    actionKey: raw.actionKey,
    eventType: raw.eventType,
    eventTypeLabel: CALENDAR_EVENT_LABELS[raw.eventType] ?? raw.eventType,
    eventDate: raw.eventDate,
    eventDateFormatted: formatDate(raw.eventDate),
    title: raw.title,
    status: raw.status,
    actionTarget: raw.actionTarget,
  };
}

export function mapToTaxComplianceCalendarListViewModel(
  rawList: readonly RawTaxComplianceCalendarEvent[] | null | undefined,
): TaxComplianceCalendarEventViewModel[] {
  if (!rawList) return [];
  return rawList.map(mapToTaxComplianceCalendarEventViewModel);
}

/**
 * Group calendar events by civil date (agenda view). Pure display grouping —
 * no date arithmetic, no fiscal math.
 */
export function groupTaxComplianceCalendarByDate(
  events: readonly TaxComplianceCalendarEventViewModel[],
): Array<{ date: string; dateFormatted: string; events: TaxComplianceCalendarEventViewModel[] }> {
  const groups = new Map<string, TaxComplianceCalendarEventViewModel[]>();
  for (const event of events) {
    const list = groups.get(event.eventDate) ?? [];
    list.push(event);
    groups.set(event.eventDate, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, dateEvents]) => ({
      date,
      dateFormatted: formatDate(date),
      events: dateEvents,
    }));
}
