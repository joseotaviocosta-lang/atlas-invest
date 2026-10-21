'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import {
  colors,
  spacing,
  borderRadius,
  taxComplianceRemindersQueryKey,
  taxReminderPreferencesQueryKey,
  taxReminderDeliveriesQueryKey,
  mapToTaxComplianceReminderListViewModel,
  mapToTaxReminderPreferencesViewModel,
  mapToTaxReminderDeliveryEventViewModel,
  buildTaxReminderActionPayload,
  buildTaxReminderDeliveryPayload,
  taxReminderSnoozeDateError,
  parseTaxReminderLeadTimes,
  TAX_REMINDER_SUPPORT_DISCLAIMER,
  TAX_REMINDER_STALE_MESSAGE,
  TAX_REMINDER_ACTION_NOT_RESOLVED_WARNING,
  type RawTaxComplianceReminder,
  type RawTaxReminderPreferences,
  type RawTaxReminderDeliveryEvent,
  type TaxComplianceReminderGroup,
  type TaxComplianceReminderViewModel,
  type TaxReminderActionType,
} from '@atlas/ui';
import { Card, Skeleton, EmptyState, SectionHeader, Badge, Button } from '@/components/ui';

const GROUP_ORDER: readonly TaxComplianceReminderGroup[] = [
  'overdue',
  'stale',
  'action',
  'upcoming',
];

const GROUP_TITLES: Record<TaxComplianceReminderGroup, string> = {
  overdue: 'Vencidos',
  stale: 'Dados alterados — revisar',
  action: 'Ações necessárias',
  upcoming: 'Próximos vencimentos',
};

const MIN_TOUCH_PX = 44;

function currentYear(): number {
  return new Date().getFullYear();
}

interface ReminderCardProps {
  readonly reminder: TaxComplianceReminderViewModel;
  readonly onAction: (
    reminder: TaxComplianceReminderViewModel,
    actionType: TaxReminderActionType,
    snoozedUntil?: string,
  ) => void;
  readonly onRegisterDelivery: (reminder: TaxComplianceReminderViewModel) => void;
  readonly isActing: boolean;
  readonly isRegisteringDelivery: boolean;
  readonly actionError: string | null;
}

function ReminderCard({
  reminder,
  onAction,
  onRegisterDelivery,
  isActing,
  isRegisteringDelivery,
  actionError,
}: ReminderCardProps) {
  const authReady = useAuthReady();
  const [showSnooze, setShowSnooze] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState('');
  const [snoozeError, setSnoozeError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data: rawDeliveries, isLoading: isHistoryLoading } = useQuery({
    queryKey: taxReminderDeliveriesQueryKey(reminder.reminderKey),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxReminderDeliveryEvent[] }>(
        `/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminder.reminderKey)}/deliveries`,
      );
      return res.data;
    },
    enabled: authReady && showHistory,
    staleTime: 10_000,
  });

  const deliveries = useMemo(
    () => (rawDeliveries ?? []).map(mapToTaxReminderDeliveryEventViewModel),
    [rawDeliveries],
  );

  function handleSnoozeConfirm() {
    const error = taxReminderSnoozeDateError(snoozeDate);
    if (error) {
      setSnoozeError(error);
      return;
    }
    setSnoozeError(null);
    onAction(reminder, 'SNOOZE', snoozeDate.trim());
  }

  return (
    <Card
      style={{
        padding: `${spacing.base}px`,
        borderLeft: `4px solid ${reminder.statusColor}`,
      }}
      data-testid={`reminder-card-${reminder.kind}`}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: `${spacing.xs}px`,
        }}
      >
        <div>
          <strong style={{ color: colors.textPrimary, fontSize: '1rem' }}>{reminder.title}</strong>
          <span
            style={{ marginLeft: `${spacing.sm}px`, fontSize: '0.75rem', color: colors.textMuted }}
          >
            {reminder.kindLabel}
          </span>
        </div>
        <Badge variant={reminder.statusVariant}>{reminder.statusLabel}</Badge>
      </div>

      <div
        style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: `${spacing.xs}px` }}
      >
        {reminder.message}
      </div>

      <div
        style={{
          display: 'flex',
          gap: `${spacing.sm}px`,
          flexWrap: 'wrap',
          marginTop: `${spacing.xs}px`,
          fontSize: '0.75rem',
          color: colors.textMuted,
        }}
      >
        <span>Disparo: {reminder.triggerAtFormatted}</span>
        <span>Efetivo em: {reminder.effectiveAtFormatted}</span>
        {reminder.snoozedUntilFormatted && (
          <span>Nova data de exibição: {reminder.snoozedUntilFormatted}</span>
        )}
      </div>

      {reminder.isStale && (
        <div
          role="alert"
          style={{
            marginTop: `${spacing.sm}px`,
            padding: `${spacing.xs}px ${spacing.sm}px`,
            backgroundColor: colors.warningSubtle,
            color: colors.warning,
            borderRadius: `${borderRadius.sm}px`,
            fontSize: '0.8125rem',
          }}
        >
          {TAX_REMINDER_STALE_MESSAGE}
        </div>
      )}

      {reminder.isActionable && (
        <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: `${spacing.xs}px` }}>
          {TAX_REMINDER_ACTION_NOT_RESOLVED_WARNING}
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          style={{ fontSize: '0.8125rem', color: colors.negative, marginTop: '4px' }}
        >
          {actionError}
        </div>
      )}

      {reminder.isActionable && (
        <div
          style={{
            marginTop: `${spacing.sm}px`,
            display: 'flex',
            gap: `${spacing.xs}px`,
            flexWrap: 'wrap',
          }}
        >
          <Button
            size="sm"
            variant="primary"
            aria-label={`Reconhecer lembrete ${reminder.title}`}
            disabled={isActing}
            onClick={() => onAction(reminder, 'ACKNOWLEDGE')}
            style={{ minHeight: `${MIN_TOUCH_PX}px` }}
          >
            Reconhecer
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label={`Adiar lembrete ${reminder.title}`}
            disabled={isActing}
            onClick={() => setShowSnooze((v) => !v)}
            style={{ minHeight: `${MIN_TOUCH_PX}px` }}
          >
            Adiar…
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label={`Dispensar lembrete ${reminder.title}`}
            disabled={isActing}
            onClick={() => onAction(reminder, 'DISMISS')}
            style={{ minHeight: `${MIN_TOUCH_PX}px` }}
          >
            Dispensar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            aria-label={`Ver histórico de entregas do lembrete ${reminder.title}`}
            onClick={() => setShowHistory((v) => !v)}
            style={{ minHeight: `${MIN_TOUCH_PX}px` }}
          >
            {showHistory ? 'Ocultar entregas' : 'Histórico de entregas'}
          </Button>
        </div>
      )}

      {showSnooze && reminder.isActionable && (
        <div
          style={{
            marginTop: `${spacing.sm}px`,
            padding: `${spacing.sm}px`,
            border: `1px solid ${colors.border}`,
            borderRadius: `${borderRadius.md}px`,
            backgroundColor: colors.surfaceElevated,
          }}
        >
          <label
            htmlFor={`snooze-date-${reminder.dedupKey}`}
            style={{ fontSize: '0.8125rem', color: colors.textPrimary, fontWeight: 600 }}
          >
            Nova data de exibição (AAAA-MM-DD)
          </label>
          <input
            id={`snooze-date-${reminder.dedupKey}`}
            type="text"
            inputMode="numeric"
            placeholder="Ex: 2026-10-20"
            value={snoozeDate}
            onChange={(e) => setSnoozeDate(e.target.value)}
            aria-describedby={`snooze-hint-${reminder.dedupKey}`}
            style={{
              width: '100%',
              marginTop: '4px',
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: `${borderRadius.sm}px`,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              fontSize: '0.875rem',
              minHeight: `${MIN_TOUCH_PX}px`,
            }}
          />
          <div
            id={`snooze-hint-${reminder.dedupKey}`}
            style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '4px' }}
          >
            O lembrete voltará a ser exibido a partir desta data.
          </div>
          {snoozeError && (
            <div
              role="alert"
              style={{ fontSize: '0.8125rem', color: colors.negative, marginTop: '4px' }}
            >
              {snoozeError}
            </div>
          )}
          <div style={{ display: 'flex', gap: `${spacing.xs}px`, marginTop: `${spacing.xs}px` }}>
            <Button
              size="sm"
              variant="primary"
              aria-label={`Confirmar adiamento do lembrete ${reminder.title}`}
              disabled={isActing}
              onClick={handleSnoozeConfirm}
              style={{ minHeight: `${MIN_TOUCH_PX}px` }}
            >
              Confirmar adiamento
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setShowSnooze(false);
                setSnoozeError(null);
              }}
              style={{ minHeight: `${MIN_TOUCH_PX}px` }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {showHistory && (
        <div style={{ marginTop: `${spacing.sm}px` }}>
          <Button
            size="sm"
            variant="outline"
            aria-label={`Registrar entrega do lembrete ${reminder.title}`}
            disabled={isRegisteringDelivery}
            onClick={() => onRegisterDelivery(reminder)}
            style={{ minHeight: `${MIN_TOUCH_PX}px`, marginBottom: `${spacing.xs}px` }}
          >
            {isRegisteringDelivery ? 'Registrando…' : 'Registrar entrega (neste app)'}
          </Button>
          {isHistoryLoading ? (
            <Skeleton width="100%" height="40px" />
          ) : deliveries.length === 0 ? (
            <div style={{ fontSize: '0.8125rem', color: colors.textMuted }}>
              Nenhuma entrega registrada para este lembrete.
            </div>
          ) : (
            <ul
              style={{
                margin: 0,
                paddingLeft: '20px',
                fontSize: '0.8125rem',
                color: colors.textSecondary,
              }}
            >
              {deliveries.map((d) => (
                <li key={d.id}>
                  {d.channelLabel} · disparo {d.triggerAtFormatted} · registrado em{' '}
                  {d.createdAtFormatted}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

export function TaxComplianceRemindersSection({ initialYear }: { initialYear?: number }) {
  const queryClient = useQueryClient();
  const authReady = useAuthReady();
  const [selectedYear, setSelectedYear] = useState<number>(initialYear ?? 2025);
  const [kindFilter, setKindFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [actionErrorByKey, setActionErrorByKey] = useState<Record<string, string | null>>({});
  const [leadTimesDraft, setLeadTimesDraft] = useState<string | null>(null);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);

  useEffect(() => {
    if (initialYear === undefined) {
      setSelectedYear(currentYear());
    }
  }, [initialYear]);

  const {
    data: rawReminders,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: taxComplianceRemindersQueryKey(selectedYear),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxComplianceReminder[] }>(
        `/api/v1/fiscal/compliance/reminders?calendarYear=${selectedYear}`,
      );
      return res.data;
    },
    enabled: authReady,
    staleTime: 30_000,
  });

  const {
    data: rawPreferences,
    isLoading: isPreferencesLoading,
    isError: isPreferencesError,
    refetch: refetchPreferences,
  } = useQuery({
    queryKey: taxReminderPreferencesQueryKey(),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxReminderPreferences }>(
        '/api/v1/fiscal/compliance/reminder-preferences',
      );
      return res.data;
    },
    enabled: authReady,
    staleTime: 30_000,
  });

  const reminders = useMemo(
    () => mapToTaxComplianceReminderListViewModel(rawReminders ?? null),
    [rawReminders],
  );
  const preferences = useMemo(
    () => mapToTaxReminderPreferencesViewModel(rawPreferences ?? null),
    [rawPreferences],
  );

  const filtered = useMemo(() => {
    return reminders.filter((r) => {
      if (kindFilter !== 'ALL' && r.kind !== kindFilter) return false;
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      return true;
    });
  }, [reminders, kindFilter, statusFilter]);

  const grouped = useMemo(() => {
    const map = new Map<TaxComplianceReminderGroup, TaxComplianceReminderViewModel[]>();
    for (const group of GROUP_ORDER) map.set(group, []);
    for (const reminder of filtered) {
      map.get(reminder.group)?.push(reminder);
    }
    return GROUP_ORDER.map((group) => ({ group, items: map.get(group) ?? [] })).filter(
      ({ items }) => items.length > 0,
    );
  }, [filtered]);

  const actionMutation = useMutation({
    mutationFn: async ({
      reminder,
      actionType,
      snoozedUntil,
    }: {
      reminder: TaxComplianceReminderViewModel;
      actionType: TaxReminderActionType;
      snoozedUntil?: string;
    }) => {
      if (!authReady) {
        throw new Error('Sessão não está pronta. Entre novamente para continuar.');
      }
      const payload = buildTaxReminderActionPayload(reminder, actionType, { snoozedUntil });
      const res = await apiClient.post<{ data: unknown }>(
        `/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminder.reminderKey)}/actions`,
        payload,
      );
      return res.data;
    },
    onSuccess: (_data, variables) => {
      setActionErrorByKey((prev) => ({ ...prev, [variables.reminder.reminderKey]: null }));
      void queryClient.invalidateQueries({ queryKey: ['fiscal', 'compliance'] });
      void queryClient.invalidateQueries({
        queryKey: taxComplianceRemindersQueryKey(selectedYear),
      });
      void queryClient.invalidateQueries({
        queryKey: taxReminderDeliveriesQueryKey(variables.reminder.reminderKey),
      });
    },
    onError: (err: unknown, variables) => {
      setActionErrorByKey((prev) => ({
        ...prev,
        [variables.reminder.reminderKey]:
          err instanceof Error ? err.message : 'Falha ao registrar a ação do lembrete.',
      }));
    },
  });

  const deliveryMutation = useMutation({
    mutationFn: async ({ reminder }: { reminder: TaxComplianceReminderViewModel }) => {
      if (!authReady) {
        throw new Error('Sessão não está pronta. Entre novamente para continuar.');
      }
      const payload = buildTaxReminderDeliveryPayload(reminder, 'IN_APP');
      const res = await apiClient.post<{ data: unknown }>(
        `/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminder.reminderKey)}/deliveries`,
        payload,
      );
      return res.data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: taxReminderDeliveriesQueryKey(variables.reminder.reminderKey),
      });
      void queryClient.invalidateQueries({ queryKey: ['fiscal', 'compliance'] });
    },
  });

  const preferencesMutation = useMutation({
    mutationFn: async (body: RawTaxReminderPreferences) => {
      if (!authReady) {
        throw new Error('Sessão não está pronta. Entre novamente para continuar.');
      }
      const res = await apiClient.put<{ data: RawTaxReminderPreferences }>(
        '/api/v1/fiscal/compliance/reminder-preferences',
        body,
      );
      return res.data;
    },
    onSuccess: () => {
      setPreferencesError(null);
      setLeadTimesDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['fiscal', 'compliance'] });
      void queryClient.invalidateQueries({ queryKey: taxReminderPreferencesQueryKey() });
    },
    onError: (err: unknown) => {
      setPreferencesError(
        err instanceof Error ? err.message : 'Falha ao salvar as preferências de lembretes.',
      );
    },
  });

  function handleAction(
    reminder: TaxComplianceReminderViewModel,
    actionType: TaxReminderActionType,
    snoozedUntil?: string,
  ) {
    actionMutation.mutate({ reminder, actionType, snoozedUntil });
  }

  function handlePreferenceToggle(
    field: 'remindersEnabled' | 'upcomingEnabled' | 'overdueEnabled' | 'annualEnabled',
  ) {
    if (!rawPreferences) return;
    preferencesMutation.mutate({ ...rawPreferences, [field]: !rawPreferences[field] });
  }

  function handleLeadTimesSave() {
    if (!rawPreferences || leadTimesDraft === null) return;
    const parsed = parseTaxReminderLeadTimes(leadTimesDraft);
    if (!parsed) {
      setPreferencesError(
        'Informe os prazos em dias separados por vírgula (ex: 30, 7, 1), entre 0 e 365.',
      );
      return;
    }
    preferencesMutation.mutate({ ...rawPreferences, leadTimes: parsed });
  }

  return (
    <div style={{ marginTop: `${spacing.xl}px` }} data-testid="tax-compliance-reminders-section">
      <SectionHeader
        title="Lembretes de conformidade fiscal"
        description="Avisos de apoio sobre obrigações fiscais. Lembretes não calculam tributos nem substituem os canais oficiais."
      />

      <div
        style={{
          display: 'flex',
          gap: `${spacing.md}px`,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: `${spacing.base}px`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
          <label
            htmlFor="reminders-year"
            style={{ fontSize: '0.875rem', color: colors.textSecondary }}
          >
            Ano-calendário:
          </label>
          <select
            id="reminders-year"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              fontSize: '0.875rem',
              minHeight: `${MIN_TOUCH_PX}px`,
            }}
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
          <label
            htmlFor="reminders-kind-filter"
            style={{ fontSize: '0.875rem', color: colors.textSecondary }}
          >
            Tipo:
          </label>
          <select
            id="reminders-kind-filter"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              fontSize: '0.875rem',
              minHeight: `${MIN_TOUCH_PX}px`,
            }}
          >
            <option value="ALL">Todos os tipos</option>
            <option value="UPCOMING_DUE">Vence em breve</option>
            <option value="DUE_TODAY">Vence hoje</option>
            <option value="OVERDUE">Vencidos</option>
            <option value="ACTION_REQUIRED">Ação necessária</option>
            <option value="EVIDENCE_REQUIRED">Comprovante necessário</option>
            <option value="PAYMENT_EVIDENCE_REVIEW">Revisar comprovante</option>
            <option value="STALE_SOURCE">Dados alterados</option>
            <option value="ANNUAL_REVIEW_REQUIRED">Revisão anual</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
          <label
            htmlFor="reminders-status-filter"
            style={{ fontSize: '0.875rem', color: colors.textSecondary }}
          >
            Status:
          </label>
          <select
            id="reminders-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              fontSize: '0.875rem',
              minHeight: `${MIN_TOUCH_PX}px`,
            }}
          >
            <option value="ALL">Todos os status</option>
            <option value="PENDING">Pendentes</option>
            <option value="SCHEDULED">Agendados</option>
            <option value="DELIVERED">Entregues</option>
            <option value="ACKNOWLEDGED">Reconhecidos</option>
            <option value="SNOOZED">Adiados</option>
            <option value="DISMISSED">Dispensados</option>
            <option value="SUPERSEDED">Substituídos</option>
            <option value="CANCELLED">Cancelados</option>
          </select>
        </div>
      </div>

      {isLoading && (
        <Card style={{ padding: `${spacing.base}px` }}>
          <Skeleton width="100%" height="80px" />
        </Card>
      )}

      {isError && !isLoading && (
        <Card style={{ padding: `${spacing.base}px` }}>
          <div role="alert" style={{ color: colors.negative, fontSize: '0.875rem' }}>
            {(error as ApiError)?.message || 'Erro ao carregar os lembretes de conformidade.'}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            style={{ marginTop: `${spacing.sm}px`, minHeight: `${MIN_TOUCH_PX}px` }}
          >
            Tentar novamente
          </Button>
        </Card>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <Card style={{ padding: `${spacing.lg}px` }}>
          <EmptyState
            title="Nenhum lembrete encontrado"
            description="Não há lembretes de conformidade para os filtros selecionados neste ano-calendário."
          />
        </Card>
      )}

      {grouped.map(({ group, items }) => (
        <div key={group} style={{ marginBottom: `${spacing.base}px` }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: colors.textPrimary }}>
            {GROUP_TITLES[group]} ({items.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
            {items.map((reminder) => (
              <ReminderCard
                key={reminder.reminderKey}
                reminder={reminder}
                onAction={handleAction}
                onRegisterDelivery={(r) => deliveryMutation.mutate({ reminder: r })}
                isActing={actionMutation.isPending}
                isRegisteringDelivery={deliveryMutation.isPending}
                actionError={actionErrorByKey[reminder.reminderKey] ?? null}
              />
            ))}
          </div>
        </div>
      ))}

      <Card style={{ padding: `${spacing.base}px`, marginTop: `${spacing.base}px` }}>
        <h3
          style={{ fontSize: '0.9375rem', fontWeight: 700, color: colors.textPrimary, margin: 0 }}
        >
          Preferências de lembretes
        </h3>
        {isPreferencesLoading && <Skeleton width="100%" height="40px" />}
        {isPreferencesError && !isPreferencesLoading && (
          <div>
            <div role="alert" style={{ fontSize: '0.8125rem', color: colors.negative }}>
              Não foi possível carregar as preferências de lembretes.
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchPreferences()}
              style={{ marginTop: `${spacing.xs}px`, minHeight: `${MIN_TOUCH_PX}px` }}
            >
              Tentar novamente
            </Button>
          </div>
        )}
        {preferences && rawPreferences && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: `${spacing.xs}px`,
              marginTop: `${spacing.xs}px`,
            }}
          >
            {(
              [
                { field: 'remindersEnabled', label: 'Lembretes ativados' },
                { field: 'upcomingEnabled', label: 'Avisar vencimentos próximos' },
                { field: 'overdueEnabled', label: 'Avisar vencimentos em atraso' },
                { field: 'annualEnabled', label: 'Avisar revisão anual' },
              ] as const
            ).map(({ field, label }) => (
              <label
                key={field}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${spacing.xs}px`,
                  fontSize: '0.875rem',
                  color: colors.textPrimary,
                  minHeight: `${MIN_TOUCH_PX}px`,
                }}
              >
                <input
                  type="checkbox"
                  checked={preferences[field]}
                  onChange={() => handlePreferenceToggle(field)}
                  disabled={preferencesMutation.isPending}
                  aria-label={label}
                  style={{ width: '20px', height: '20px' }}
                />
                {label}
              </label>
            ))}
            <div style={{ marginTop: `${spacing.xs}px` }}>
              <label
                htmlFor="reminder-lead-times"
                style={{ fontSize: '0.8125rem', color: colors.textPrimary, fontWeight: 600 }}
              >
                Antecedência dos avisos (dias, separados por vírgula)
              </label>
              <div
                style={{
                  display: 'flex',
                  gap: `${spacing.xs}px`,
                  marginTop: '4px',
                  flexWrap: 'wrap',
                }}
              >
                <input
                  id="reminder-lead-times"
                  type="text"
                  inputMode="numeric"
                  value={leadTimesDraft ?? preferences.leadTimes.join(', ')}
                  onChange={(e) => setLeadTimesDraft(e.target.value)}
                  placeholder="Ex: 30, 7, 1"
                  style={{
                    flex: 1,
                    minWidth: '180px',
                    padding: `${spacing.xs}px ${spacing.sm}px`,
                    borderRadius: `${borderRadius.sm}px`,
                    border: `1px solid ${colors.border}`,
                    backgroundColor: colors.surfaceElevated,
                    color: colors.textPrimary,
                    fontSize: '0.875rem',
                    minHeight: `${MIN_TOUCH_PX}px`,
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Salvar prazos de antecedência"
                  disabled={preferencesMutation.isPending || leadTimesDraft === null}
                  onClick={handleLeadTimesSave}
                  style={{ minHeight: `${MIN_TOUCH_PX}px` }}
                >
                  Salvar prazos
                </Button>
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '4px' }}>
                Atual: {preferences.leadTimesLabel}
              </div>
            </div>
            {preferencesError && (
              <div role="alert" style={{ fontSize: '0.8125rem', color: colors.negative }}>
                {preferencesError}
              </div>
            )}
          </div>
        )}
      </Card>

      <div
        style={{
          marginTop: `${spacing.base}px`,
          padding: `${spacing.sm}px`,
          backgroundColor: colors.surfaceElevated,
          borderRadius: `${borderRadius.md}px`,
          fontSize: '0.75rem',
          color: colors.textMuted,
          lineHeight: 1.5,
        }}
      >
        <strong>Aviso de responsabilidade e independência:</strong>{' '}
        {TAX_REMINDER_SUPPORT_DISCLAIMER}. Lembretes são avisos de apoio e não resolvem obrigações
        fiscais.
      </div>
    </div>
  );
}
