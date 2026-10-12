import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  themeTokens,
  taxCompliancePeriodCloseReadinessQueryKey,
  taxCompliancePeriodCloseHistoryQueryKey,
  taxCompliancePeriodCloseBinderQueryKey,
  mapToTaxCompliancePeriodCloseReadinessViewModel,
  mapToTaxCompliancePeriodCloseRecordListViewModel,
  TAX_PERIOD_CLOSE_SUPPORT_DISCLAIMER,
  TAX_PERIOD_CLOSE_OPERATIONAL_NOTICE,
  TAX_PERIOD_CLOSE_STALE_MESSAGE,
  type RawTaxCompliancePeriodCloseReadiness,
  type RawTaxCompliancePeriodCloseRecord,
  type RawTaxComplianceEvidenceBinder,
} from '@atlas/ui';
import { Card, LoadingState, ErrorState } from '../ui';
import { apiClient } from '../../api/client';

interface TaxCompliancePeriodCloseCardProps {
  calendarYear: number;
  competence: string;
}

export function TaxCompliancePeriodCloseCard({
  calendarYear,
  competence,
}: TaxCompliancePeriodCloseCardProps) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [reopenReason, setReopenReason] = useState('');
  const [reopenTargetId, setReopenTargetId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const period = scope === 'MONTHLY' ? competence : String(calendarYear);
  const readinessQs =
    scope === 'MONTHLY'
      ? `scope=MONTHLY&calendarYear=${calendarYear}&month=${competence}`
      : `scope=ANNUAL&calendarYear=${calendarYear}&exercise=${calendarYear + 1}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: taxCompliancePeriodCloseReadinessQueryKey(scope, calendarYear, period),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxCompliancePeriodCloseReadiness }>(
        `/api/v1/fiscal/compliance/period-close/readiness?${readinessQs}`,
      );
      return res.data;
    },
    staleTime: 30_000,
  });

  const vm = useMemo(
    () => (data ? mapToTaxCompliancePeriodCloseReadinessViewModel(data) : null),
    [data],
  );

  const { data: historyData } = useQuery({
    queryKey: taxCompliancePeriodCloseHistoryQueryKey(),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxCompliancePeriodCloseRecord[] }>(
        '/api/v1/fiscal/compliance/period-close/history?limit=20&offset=0',
      );
      return res.data;
    },
    staleTime: 30_000,
  });

  const history = useMemo(
    () => mapToTaxCompliancePeriodCloseRecordListViewModel(historyData ?? null),
    [historyData],
  );

  const { data: binderData } = useQuery({
    queryKey: taxCompliancePeriodCloseBinderQueryKey(scope, calendarYear, period),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxComplianceEvidenceBinder }>(
        `/api/v1/fiscal/compliance/period-close/binder?${readinessQs}`,
      );
      return res.data;
    },
    enabled: vm !== null,
    staleTime: 30_000,
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { scope, calendarYear };
      if (scope === 'MONTHLY') {
        body.month = competence;
      } else {
        body.exercise = calendarYear + 1;
      }
      const res = await apiClient.post<{ data: RawTaxCompliancePeriodCloseRecord }>(
        '/api/v1/fiscal/compliance/period-close',
        body,
      );
      return res.data;
    },
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({
        queryKey: taxCompliancePeriodCloseHistoryQueryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: taxCompliancePeriodCloseReadinessQueryKey(scope, calendarYear, period),
      });
    },
    onError: () => setActionError('Falha ao fechar o período. Verifique as pendências.'),
  });

  const reopenMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiClient.post<{ data: RawTaxCompliancePeriodCloseRecord }>(
        `/api/v1/fiscal/compliance/period-close/${encodeURIComponent(id)}/reopen`,
        { reason },
      );
      return res.data;
    },
    onSuccess: () => {
      setActionError(null);
      setReopenTargetId(null);
      setReopenReason('');
      queryClient.invalidateQueries({
        queryKey: taxCompliancePeriodCloseHistoryQueryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: taxCompliancePeriodCloseReadinessQueryKey(scope, calendarYear, period),
      });
    },
    onError: () => setActionError('Falha ao reabrir o período.'),
  });

  if (isLoading) {
    return (
      <Card>
        <LoadingState />
      </Card>
    );
  }

  if (isError || !vm) {
    return (
      <Card>
        <ErrorState message="Falha ao avaliar o fechamento do período." onRetry={() => refetch()} />
      </Card>
    );
  }

  const periodHistory = history.filter(
    (entry) => entry.period === period && entry.scopeLabel === vm.scopeLabel,
  );

  return (
    <Card>
      <Text style={styles.title} accessibilityRole="header">
        Fechamento de período fiscal
      </Text>
      <Text style={styles.subtitle}>
        {vm.periodLabel}
        {vm.exerciseLabel ? ` · ${vm.exerciseLabel}` : ''}
      </Text>

      <View style={styles.scopeRow}>
        {(['MONTHLY', 'ANNUAL'] as const).map((option) => (
          <TouchableOpacity
            key={option}
            onPress={() => setScope(option)}
            accessibilityRole="button"
            accessibilityLabel={`Escopo ${option === 'MONTHLY' ? 'mensal' : 'anual'}`}
            accessibilityState={{ selected: scope === option }}
            style={[styles.scopeChip, scope === option && styles.scopeChipActive]}
          >
            <Text style={[styles.scopeText, scope === option && styles.scopeTextActive]}>
              {option === 'MONTHLY' ? 'Mensal' : 'Anual'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.statusText} testID="period-close-readiness-mobile">
        Situação: {vm.readinessLabel}
      </Text>
      {vm.isStaleVsPreviousClose && (
        <Text style={styles.stale} accessibilityRole="alert">
          {TAX_PERIOD_CLOSE_STALE_MESSAGE}
        </Text>
      )}

      {vm.checklist.map((entry) => (
        <Text key={entry.category} style={styles.checklistItem}>
          {entry.categoryLabel}: {entry.stateLabel} — {entry.detail}
        </Text>
      ))}

      {vm.unresolvedItems.length > 0 && (
        <View style={styles.unresolved}>
          <Text style={styles.sectionTitle}>Itens pendentes ({vm.unresolvedItems.length})</Text>
          {vm.unresolvedItems.slice(0, 10).map((item) => (
            <Text key={`${item.ref}::${item.kind}`} style={styles.unresolvedItem}>
              {item.kindLabel} — {item.title}
            </Text>
          ))}
        </View>
      )}

      {vm.cleanCloseAllowed ? (
        <View>
          <Text style={styles.notice}>{TAX_PERIOD_CLOSE_OPERATIONAL_NOTICE}</Text>
          <TouchableOpacity
            onPress={() => closeMutation.mutate()}
            disabled={closeMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Fechar período operacionalmente"
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonText}>
              {closeMutation.isPending ? 'Fechando…' : 'Fechar período'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.notice}>
          Fechamento limpo indisponível: resolva as pendências. Para exportar o dossiê, use a versão
          web.
        </Text>
      )}
      {actionError && <Text style={styles.error}>{actionError}</Text>}

      {binderData && (
        <View style={styles.binder}>
          <Text style={styles.sectionTitle}>
            Dossiê de evidências ({binderData.sections.length} seções)
          </Text>
          {binderData.sections.slice(0, 11).map((section) => (
            <Text key={section.code} style={styles.binderSection}>
              {section.title} ({section.lines.length})
            </Text>
          ))}
        </View>
      )}

      {periodHistory.length > 0 && (
        <View style={styles.history}>
          <Text style={styles.sectionTitle}>Histórico</Text>
          {periodHistory.map((entry) => (
            <View key={entry.id} style={styles.historyItem}>
              <Text style={styles.historyText}>
                {entry.recordStatusLabel} · {entry.revisionLabel} · {entry.closedAtFormatted}
              </Text>
              {entry.reason && <Text style={styles.meta}>Motivo: {entry.reason}</Text>}
              {entry.recordStatus === 'CLOSED' &&
                (reopenTargetId === entry.id ? (
                  <View>
                    <TextInput
                      value={reopenReason}
                      onChangeText={setReopenReason}
                      placeholder="Motivo da reabertura"
                      accessibilityLabel="Motivo da reabertura"
                      style={styles.input}
                    />
                    <TouchableOpacity
                      onPress={() => reopenMutation.mutate({ id: entry.id, reason: reopenReason })}
                      disabled={reopenMutation.isPending || reopenReason.trim().length === 0}
                      accessibilityRole="button"
                      accessibilityLabel="Confirmar reabertura"
                      style={styles.smallButton}
                    >
                      <Text style={styles.smallButtonText}>Confirmar</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => setReopenTargetId(entry.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Reabrir ${entry.revisionLabel}`}
                    style={styles.smallButton}
                  >
                    <Text style={styles.smallButtonText}>Reabrir</Text>
                  </TouchableOpacity>
                ))}
            </View>
          ))}
        </View>
      )}

      <Text style={styles.disclaimer}>{TAX_PERIOD_CLOSE_SUPPORT_DISCLAIMER}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    color: themeTokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
    marginBottom: 8,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  scopeChip: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
  },
  scopeChipActive: {
    backgroundColor: themeTokens.colors.primary,
    borderColor: themeTokens.colors.primary,
  },
  scopeText: {
    color: themeTokens.colors.text,
    fontSize: 13,
  },
  scopeTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  statusText: {
    color: themeTokens.colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  stale: {
    color: themeTokens.colors.warning,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  checklistItem: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  unresolved: {
    marginTop: 8,
  },
  sectionTitle: {
    color: themeTokens.colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  unresolvedItem: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  notice: {
    color: themeTokens.colors.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  closeButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeTokens.colors.primary,
    borderRadius: 8,
    marginTop: 8,
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  error: {
    color: themeTokens.colors.danger,
    fontSize: 13,
    marginTop: 4,
  },
  binder: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    paddingTop: 8,
  },
  binderSection: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  history: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    paddingTop: 8,
  },
  historyItem: {
    marginBottom: 6,
  },
  historyText: {
    color: themeTokens.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  meta: {
    color: themeTokens.colors.textMuted,
    fontSize: 12,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: themeTokens.colors.text,
    marginTop: 4,
  },
  smallButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  smallButtonText: {
    color: themeTokens.colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  disclaimer: {
    color: themeTokens.colors.textMuted,
    fontSize: 11,
    marginTop: 10,
  },
});
