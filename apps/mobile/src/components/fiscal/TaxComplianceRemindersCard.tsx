import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  colors,
  borderRadius,
  mapToTaxComplianceReminderListViewModel,
  mapToTaxReminderPreferencesViewModel,
  mapToTaxReminderDeliveryEventViewModel,
  buildTaxReminderActionPayload,
  buildTaxReminderDeliveryPayload,
  taxReminderSnoozeDateError,
  taxComplianceRemindersQueryKey,
  taxReminderPreferencesQueryKey,
  taxReminderDeliveriesQueryKey,
  TAX_REMINDER_SUPPORT_DISCLAIMER,
  TAX_REMINDER_STALE_MESSAGE,
  TAX_REMINDER_ACTION_NOT_RESOLVED_WARNING,
  type RawTaxComplianceReminder,
  type RawTaxReminderPreferences,
  type RawTaxReminderDeliveryEvent,
  type TaxComplianceReminderViewModel,
  type TaxReminderActionType,
} from '@atlas/ui';
import { Card } from '../ui';
import { apiClient } from '../../api/client';

interface TaxComplianceRemindersCardProps {
  calendarYear: number;
}

type ReminderFilter = 'ALL' | 'OVERDUE' | 'ACTION' | 'STALE';

const FILTER_LABELS: Record<ReminderFilter, string> = {
  ALL: 'Todos',
  OVERDUE: 'Vencidos',
  ACTION: 'Ações',
  STALE: 'Revisar',
};

export function TaxComplianceRemindersCard({ calendarYear }: TaxComplianceRemindersCardProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ReminderFilter>('ALL');
  const [expandedHistoryKey, setExpandedHistoryKey] = useState<string | null>(null);
  const [expandedSnoozeKey, setExpandedSnoozeKey] = useState<string | null>(null);
  const [snoozeDate, setSnoozeDate] = useState('');
  const [snoozeError, setSnoozeError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccessKey, setActionSuccessKey] = useState<string | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: taxComplianceRemindersQueryKey(calendarYear),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxComplianceReminder[] }>(
        `/api/v1/fiscal/compliance/reminders?calendarYear=${calendarYear}`,
      );
      return res.data;
    },
    staleTime: 30_000,
  });

  const { data: preferencesData } = useQuery({
    queryKey: taxReminderPreferencesQueryKey(),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxReminderPreferences }>(
        '/api/v1/fiscal/compliance/reminder-preferences',
      );
      return res.data;
    },
    staleTime: 30_000,
    enabled: showPreferences,
  });

  const { data: historyData, isLoading: isHistoryLoading } = useQuery({
    queryKey: expandedHistoryKey
      ? taxReminderDeliveriesQueryKey(expandedHistoryKey)
      : (['fiscal', 'compliance', 'reminder-deliveries', 'none'] as const),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxReminderDeliveryEvent[] }>(
        `/api/v1/fiscal/compliance/reminders/${encodeURIComponent(expandedHistoryKey!)}/deliveries`,
      );
      return res.data;
    },
    enabled: expandedHistoryKey !== null,
    staleTime: 10_000,
  });

  const reminders = useMemo(() => mapToTaxComplianceReminderListViewModel(data ?? null), [data]);
  const preferences = useMemo(
    () => mapToTaxReminderPreferencesViewModel(preferencesData ?? null),
    [preferencesData],
  );
  const history = useMemo(
    () => (historyData ?? []).map(mapToTaxReminderDeliveryEventViewModel),
    [historyData],
  );

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
      const payload = buildTaxReminderActionPayload(reminder, actionType, { snoozedUntil });
      const res = await apiClient.post<{ data: unknown }>(
        `/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminder.reminderKey)}/actions`,
        payload,
      );
      return res.data;
    },
    onSuccess: (_data, variables) => {
      setActionError(null);
      setSnoozeError(null);
      setActionSuccessKey(variables.reminder.reminderKey);
      setExpandedSnoozeKey(null);
      void queryClient.invalidateQueries({ queryKey: ['fiscal', 'compliance'] });
      void queryClient.invalidateQueries({
        queryKey: taxComplianceRemindersQueryKey(calendarYear),
      });
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : 'Falha ao registrar a ação.');
    },
  });

  const preferencesMutation = useMutation({
    mutationFn: async (body: RawTaxReminderPreferences) => {
      const res = await apiClient.put<{ data: RawTaxReminderPreferences }>(
        '/api/v1/fiscal/compliance/reminder-preferences',
        body,
      );
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fiscal', 'compliance'] });
      void queryClient.invalidateQueries({ queryKey: taxReminderPreferencesQueryKey() });
    },
  });

  const deliveryMutation = useMutation({
    mutationFn: async ({ reminder }: { reminder: TaxComplianceReminderViewModel }) => {
      const payload = buildTaxReminderDeliveryPayload(reminder, 'MOBILE_IN_APP');
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

  const filtered = useMemo(() => {
    if (filter === 'ALL') return reminders;
    if (filter === 'OVERDUE') return reminders.filter((r) => r.group === 'overdue');
    if (filter === 'ACTION') return reminders.filter((r) => r.group === 'action');
    return reminders.filter((r) => r.group === 'stale');
  }, [reminders, filter]);

  const upcomingCount = reminders.filter((r) => r.group === 'upcoming').length;
  const overdueCount = reminders.filter((r) => r.group === 'overdue').length;
  const staleCount = reminders.filter((r) => r.group === 'stale').length;

  function handleSnoozeConfirm(reminder: TaxComplianceReminderViewModel) {
    const error = taxReminderSnoozeDateError(snoozeDate);
    if (error) {
      setSnoozeError(error);
      return;
    }
    setSnoozeError(null);
    actionMutation.mutate({ reminder, actionType: 'SNOOZE', snoozedUntil: snoozeDate.trim() });
  }

  function handlePreferenceToggle(
    field: 'remindersEnabled' | 'upcomingEnabled' | 'overdueEnabled' | 'annualEnabled',
  ) {
    if (!preferencesData) return;
    preferencesMutation.mutate({ ...preferencesData, [field]: !preferencesData[field] });
  }

  if (isLoading) {
    return (
      <Card>
        <Text style={styles.sectionTitle}>Lembretes fiscais</Text>
        <Text style={styles.meta}>Carregando lembretes...</Text>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <Text style={styles.sectionTitle}>Lembretes fiscais ({calendarYear})</Text>
        <Text style={styles.error}>Erro ao carregar os lembretes de conformidade.</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Tentar carregar lembretes novamente"
          style={styles.retryButton}
          onPress={() => refetch()}
        >
          <Text style={styles.retryButtonText}>Tentar novamente</Text>
        </TouchableOpacity>
      </Card>
    );
  }

  if (reminders.length === 0) {
    return (
      <Card>
        <Text style={styles.sectionTitle}>Lembretes fiscais ({calendarYear})</Text>
        <Text style={styles.meta}>Nenhum lembrete de conformidade para este ano-calendário.</Text>
        <Text style={styles.disclaimer}>{TAX_REMINDER_SUPPORT_DISCLAIMER}.</Text>
      </Card>
    );
  }

  return (
    <Card>
      <Text style={styles.sectionTitle}>Lembretes fiscais ({calendarYear})</Text>

      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryCount}>{upcomingCount}</Text>
          <Text style={styles.summaryLabel}>Próximos</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, overdueCount > 0 ? { color: colors.negative } : {}]}>
            {overdueCount}
          </Text>
          <Text style={styles.summaryLabel}>Vencidos</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, staleCount > 0 ? { color: colors.warning } : {}]}>
            {staleCount}
          </Text>
          <Text style={styles.summaryLabel}>Revisar</Text>
        </View>
      </View>

      <View style={styles.filterRow}>
        {(Object.keys(FILTER_LABELS) as ReminderFilter[]).map((key) => (
          <TouchableOpacity
            key={key}
            accessibilityRole="button"
            accessibilityLabel={`Filtrar lembretes: ${FILTER_LABELS[key]}`}
            style={[styles.filterButton, filter === key && styles.filterButtonActive]}
            onPress={() => setFilter(key)}
          >
            <Text
              style={[styles.filterButtonText, filter === key && styles.filterButtonTextActive]}
            >
              {FILTER_LABELS[key]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <Text style={styles.meta}>Nenhum lembrete no filtro selecionado.</Text>
      ) : (
        filtered.map((reminder) => (
          <View key={reminder.reminderKey} style={styles.reminderItem}>
            <View style={styles.reminderHeader}>
              <Text style={styles.reminderTitle}>{reminder.title}</Text>
              <Text style={[styles.statusBadge, { color: reminder.statusColor }]}>
                {reminder.statusLabel}
              </Text>
            </View>
            <Text style={styles.kindLabel}>
              {reminder.kindLabel} · {reminder.groupLabel}
            </Text>
            <Text style={styles.reminderMessage}>{reminder.message}</Text>
            <Text style={styles.meta}>
              Disparo: {reminder.triggerAtFormatted} · Efetivo em: {reminder.effectiveAtFormatted}
            </Text>
            {reminder.snoozedUntilFormatted && (
              <Text style={styles.meta}>
                Nova data de exibição: {reminder.snoozedUntilFormatted}
              </Text>
            )}
            {reminder.isStale && <Text style={styles.warning}>{TAX_REMINDER_STALE_MESSAGE}</Text>}
            {reminder.isActionable && (
              <Text style={styles.note}>{TAX_REMINDER_ACTION_NOT_RESOLVED_WARNING}</Text>
            )}
            {actionSuccessKey === reminder.reminderKey && (
              <Text style={styles.successMessage}>Ação registrada. (Apoio interno)</Text>
            )}
            {actionError && <Text style={styles.error}>{actionError}</Text>}

            {reminder.isActionable && (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Reconhecer lembrete ${reminder.title}`}
                  style={styles.actionButton}
                  disabled={actionMutation.isPending}
                  onPress={() => actionMutation.mutate({ reminder, actionType: 'ACKNOWLEDGE' })}
                >
                  <Text style={styles.actionButtonText}>Reconhecer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Adiar lembrete ${reminder.title}`}
                  style={styles.actionButtonSecondary}
                  onPress={() => {
                    setExpandedSnoozeKey(
                      expandedSnoozeKey === reminder.reminderKey ? null : reminder.reminderKey,
                    );
                    setSnoozeDate('');
                    setSnoozeError(null);
                  }}
                >
                  <Text style={styles.actionButtonSecondaryText}>Adiar…</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Dispensar lembrete ${reminder.title}`}
                  style={styles.actionButtonSecondary}
                  disabled={actionMutation.isPending}
                  onPress={() => actionMutation.mutate({ reminder, actionType: 'DISMISS' })}
                >
                  <Text style={styles.actionButtonSecondaryText}>Dispensar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Ver histórico de entregas do lembrete ${reminder.title}`}
                  style={styles.actionButtonSecondary}
                  onPress={() =>
                    setExpandedHistoryKey(
                      expandedHistoryKey === reminder.reminderKey ? null : reminder.reminderKey,
                    )
                  }
                >
                  <Text style={styles.actionButtonSecondaryText}>
                    {expandedHistoryKey === reminder.reminderKey ? 'Ocultar entregas' : 'Entregas'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {expandedSnoozeKey === reminder.reminderKey && reminder.isActionable && (
              <View style={styles.snoozeBox}>
                <Text style={styles.inputLabel}>Nova data de exibição (AAAA-MM-DD):</Text>
                <TextInput
                  style={styles.textInput}
                  value={snoozeDate}
                  onChangeText={setSnoozeDate}
                  placeholder="Ex: 2026-10-20"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Nova data de exibição no formato AAAA-MM-DD"
                />
                {snoozeError && <Text style={styles.error}>{snoozeError}</Text>}
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Confirmar adiamento do lembrete ${reminder.title}`}
                  style={styles.saveButton}
                  disabled={actionMutation.isPending}
                  onPress={() => handleSnoozeConfirm(reminder)}
                >
                  <Text style={styles.saveButtonText}>Confirmar adiamento</Text>
                </TouchableOpacity>
              </View>
            )}

            {expandedHistoryKey === reminder.reminderKey && (
              <View style={styles.historyBox}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Registrar entrega do lembrete ${reminder.title}`}
                  style={styles.actionButtonSecondary}
                  disabled={deliveryMutation.isPending}
                  onPress={() => deliveryMutation.mutate({ reminder })}
                >
                  <Text style={styles.actionButtonSecondaryText}>
                    Registrar entrega (neste app)
                  </Text>
                </TouchableOpacity>
                {isHistoryLoading ? (
                  <Text style={styles.meta}>Carregando entregas...</Text>
                ) : history.length === 0 ? (
                  <Text style={styles.meta}>Nenhuma entrega registrada.</Text>
                ) : (
                  history.map((event) => (
                    <Text key={event.id} style={styles.meta}>
                      {event.channelLabel} · disparo {event.triggerAtFormatted} · registrado em{' '}
                      {event.createdAtFormatted}
                    </Text>
                  ))
                )}
              </View>
            )}
          </View>
        ))
      )}

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Ver preferências de lembretes"
        style={styles.preferencesToggle}
        onPress={() => setShowPreferences((v) => !v)}
      >
        <Text style={styles.preferencesToggleText}>
          {showPreferences ? '▲ Ocultar preferências' : '▼ Preferências de lembretes'}
        </Text>
      </TouchableOpacity>

      {showPreferences && (
        <View style={styles.preferencesBox}>
          {!preferences || !preferencesData ? (
            <Text style={styles.meta}>Carregando preferências...</Text>
          ) : (
            (
              [
                { field: 'remindersEnabled', label: 'Lembretes ativados' },
                { field: 'upcomingEnabled', label: 'Avisar vencimentos próximos' },
                { field: 'overdueEnabled', label: 'Avisar vencimentos em atraso' },
                { field: 'annualEnabled', label: 'Avisar revisão anual' },
              ] as const
            ).map(({ field, label }) => (
              <TouchableOpacity
                key={field}
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked: preferences[field] }}
                style={styles.preferenceRow}
                onPress={() => handlePreferenceToggle(field)}
              >
                <Text style={styles.preferenceCheckbox}>{preferences[field] ? '☑' : '☐'}</Text>
                <Text style={styles.preferenceLabel}>{label}</Text>
              </TouchableOpacity>
            ))
          )}
          {preferences && (
            <Text style={styles.meta}>Antecedência atual: {preferences.leadTimesLabel}</Text>
          )}
          <Text style={styles.note}>
            Para ajustar os prazos de antecedência em dias, utilize a versão Web.
          </Text>
        </View>
      )}

      <Text style={styles.disclaimer}>
        {TAX_REMINDER_SUPPORT_DISCLAIMER}. Lembretes são avisos de apoio e não resolvem obrigações
        fiscais.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryCount: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  filterButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
  },
  filterButtonActive: {
    backgroundColor: colors.accent,
  },
  filterButtonText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  reminderItem: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 4,
  },
  reminderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  reminderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: '700',
  },
  kindLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  reminderMessage: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  meta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  warning: {
    fontSize: 12,
    color: colors.warning,
    marginTop: 4,
  },
  note: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  error: {
    fontSize: 12,
    color: colors.negative,
    marginTop: 4,
  },
  successMessage: {
    fontSize: 12,
    color: colors.positive,
    fontWeight: '600',
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  actionButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtonSecondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonSecondaryText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  snoozeBox: {
    marginTop: 6,
    padding: 10,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  historyBox: {
    marginTop: 6,
    padding: 10,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 44,
    fontSize: 12,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.sm,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  saveButtonText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  preferencesToggle: {
    paddingVertical: 4,
    marginTop: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  preferencesToggleText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '600',
  },
  preferencesBox: {
    marginTop: 6,
    padding: 10,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  preferenceCheckbox: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  preferenceLabel: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  retryButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.sm,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
  },
  retryButtonText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
    marginTop: 12,
    fontStyle: 'italic',
  },
});
