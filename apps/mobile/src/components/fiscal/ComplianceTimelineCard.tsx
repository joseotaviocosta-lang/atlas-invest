import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  colors,
  borderRadius,
  mapToTaxComplianceTimelineViewModel,
  taxComplianceTimelineQueryKey,
  type RawTaxComplianceTimeline,
  type TaxComplianceObligationViewModel,
} from '@atlas/ui';
import { Card } from '../ui';
import { apiClient } from '../../api/client';

interface ComplianceTimelineCardProps {
  calendarYear: number;
}

type FilterStatus = 'ALL' | 'PENDING' | 'OVERDUE' | 'COMPLETED';

export function ComplianceTimelineCard({ calendarYear }: ComplianceTimelineCardProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterStatus>('ALL');
  const [expandedPaymentKey, setExpandedPaymentKey] = useState<string | null>(null);
  const [evidenceDate, setEvidenceDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [evidenceAmount, setEvidenceAmount] = useState<string>('');
  const [evidenceNote, setEvidenceNote] = useState<string>('');
  const [actionSuccessKey, setActionSuccessKey] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: taxComplianceTimelineQueryKey(calendarYear),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawTaxComplianceTimeline }>(
        `/api/v1/fiscal/compliance?year=${calendarYear}`,
      );
      return res.data;
    },
  });

  const vm = useMemo(() => mapToTaxComplianceTimelineViewModel(data ?? null), [data]);

  const recordEvidenceMutation = useMutation({
    mutationFn: async ({
      obligationKey,
      paymentDate,
      amountReported,
      revenueCodeReported,
      referencePeriod,
      note,
    }: {
      obligationKey: string;
      paymentDate: string;
      amountReported: string;
      revenueCodeReported?: string;
      referencePeriod: string;
      note?: string;
    }) => {
      const res = await apiClient.post<{ data: unknown }>(
        `/api/v1/fiscal/compliance/${encodeURIComponent(obligationKey)}/payment-evidence`,
        {
          paymentDate,
          amountReported,
          revenueCodeReported,
          referencePeriod,
          note: note?.trim() || undefined,
        },
      );
      return res.data;
    },
    onSuccess: (_, vars) => {
      setActionSuccessKey(vars.obligationKey);
      setEvidenceNote('');
      void queryClient.invalidateQueries({ queryKey: taxComplianceTimelineQueryKey(calendarYear) });
    },
  });

  const filteredObligations = useMemo(() => {
    if (!vm || !vm.obligations) return [];
    if (filter === 'ALL') return vm.obligations;
    if (filter === 'PENDING') {
      return vm.obligations.filter(
        (o) => o.status === 'PENDING' || o.status === 'DUE_SOON' || o.status === 'SUPERSEDED',
      );
    }
    if (filter === 'OVERDUE') {
      return vm.obligations.filter((o) => o.isOverdue);
    }
    if (filter === 'COMPLETED') {
      return vm.obligations.filter((o) => o.isCompleted || o.isDismissed);
    }
    return vm.obligations;
  }, [vm, filter]);

  if (isLoading) {
    return (
      <Card>
        <Text style={styles.sectionTitle}>Cronograma de Obrigações</Text>
        <Text style={styles.meta}>Carregando cronograma...</Text>
      </Card>
    );
  }

  if (!vm || !vm.hasObligations) {
    return (
      <Card>
        <Text style={styles.sectionTitle}>Cronograma de Obrigações ({calendarYear})</Text>
        <Text style={styles.meta}>Nenhuma obrigação tributária identificada para este ano.</Text>
      </Card>
    );
  }

  return (
    <Card>
      <Text style={styles.sectionTitle}>Cronograma de Obrigações ({calendarYear})</Text>

      {/* Summary Counters */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryCount}>{vm.summary.pendingCount}</Text>
          <Text style={styles.summaryLabel}>Pendentes</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text
            style={[
              styles.summaryCount,
              vm.summary.overdueCount > 0 ? { color: colors.negative } : {},
            ]}
          >
            {vm.summary.overdueCount}
          </Text>
          <Text style={styles.summaryLabel}>Vencidos</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: colors.positive }]}>
            {vm.summary.completedCount}
          </Text>
          <Text style={styles.summaryLabel}>Concluídos</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'ALL' && styles.filterButtonActive]}
          onPress={() => setFilter('ALL')}
        >
          <Text
            style={[styles.filterButtonText, filter === 'ALL' && styles.filterButtonTextActive]}
          >
            Todos ({vm.obligations.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'PENDING' && styles.filterButtonActive]}
          onPress={() => setFilter('PENDING')}
        >
          <Text
            style={[styles.filterButtonText, filter === 'PENDING' && styles.filterButtonTextActive]}
          >
            Pendentes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'OVERDUE' && styles.filterButtonActive]}
          onPress={() => setFilter('OVERDUE')}
        >
          <Text
            style={[styles.filterButtonText, filter === 'OVERDUE' && styles.filterButtonTextActive]}
          >
            Vencidos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'COMPLETED' && styles.filterButtonActive]}
          onPress={() => setFilter('COMPLETED')}
        >
          <Text
            style={[
              styles.filterButtonText,
              filter === 'COMPLETED' && styles.filterButtonTextActive,
            ]}
          >
            Concluídos
          </Text>
        </TouchableOpacity>
      </View>

      {/* Obligations List */}
      {filteredObligations.length === 0 ? (
        <Text style={styles.meta}>Nenhuma obrigação no filtro selecionado.</Text>
      ) : (
        filteredObligations.map((ob: TaxComplianceObligationViewModel) => (
          <View key={ob.obligationKey} style={styles.obligationItem}>
            <View style={styles.obligationHeader}>
              <Text style={styles.obligationTitle}>{ob.title}</Text>
              <Text style={[styles.statusBadge, { color: ob.statusColor }]}>{ob.statusLabel}</Text>
            </View>
            <Text style={styles.obligationDesc}>{ob.description}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>Vencimento: {ob.dueDateFormatted}</Text>
              {ob.amount && <Text style={styles.meta}>Valor: {ob.amountFormatted}</Text>}
            </View>
            {ob.isSuperseded && (
              <Text style={styles.warning}>
                Atenção: Os dados fiscais de origem foram atualizados após seu registro anterior.
                Revise na versão Web.
              </Text>
            )}

            {ob.kind === 'MONTHLY_TAX_PAYMENT' && ob.amount && ob.amount !== '0' && (
              <View style={{ marginTop: 6 }}>
                <TouchableOpacity
                  style={styles.paymentSupportToggle}
                  onPress={() => {
                    if (expandedPaymentKey === ob.obligationKey) {
                      setExpandedPaymentKey(null);
                    } else {
                      setExpandedPaymentKey(ob.obligationKey);
                      setEvidenceAmount(ob.amount ?? '');
                      setActionSuccessKey(null);
                    }
                  }}
                >
                  <Text style={styles.paymentSupportToggleText}>
                    {expandedPaymentKey === ob.obligationKey
                      ? '▲ Ocultar Apoio ao Pagamento'
                      : '▼ Apoio ao Pagamento (DARF)'}
                  </Text>
                </TouchableOpacity>

                {expandedPaymentKey === ob.obligationKey && (
                  <View style={styles.paymentSupportBox}>
                    <Text style={styles.supportLabel}>Instruções para pagamento:</Text>
                    <Text style={styles.supportInstruction}>
                      • Código de Receita: {ob.revenueCode ?? '6015'}
                    </Text>
                    <Text style={styles.supportInstruction}>
                      • Período de Apuração: {ob.periodLabel}
                    </Text>
                    <Text style={styles.supportInstruction}>
                      • Vencimento: {ob.dueDateFormatted}
                    </Text>
                    <Text style={styles.supportInstruction}>
                      • Valor Principal: {ob.amountFormatted}
                    </Text>

                    {actionSuccessKey === ob.obligationKey ? (
                      <Text style={styles.successMessage}>
                        Comprovante registrado com sucesso! (Declarado pelo usuário)
                      </Text>
                    ) : (
                      <View style={styles.evidenceForm}>
                        <Text style={styles.inputLabel}>Data do Pagamento (AAAA-MM-DD):</Text>
                        <TextInput
                          style={styles.textInput}
                          value={evidenceDate}
                          onChangeText={setEvidenceDate}
                          placeholder="AAAA-MM-DD"
                          placeholderTextColor={colors.textMuted}
                        />
                        <Text style={styles.inputLabel}>Valor Pago (R$):</Text>
                        <TextInput
                          style={styles.textInput}
                          value={evidenceAmount}
                          onChangeText={setEvidenceAmount}
                          placeholder="Ex: 150.00"
                          placeholderTextColor={colors.textMuted}
                        />
                        <Text style={styles.inputLabel}>Observação (opcional):</Text>
                        <TextInput
                          style={styles.textInput}
                          value={evidenceNote}
                          onChangeText={setEvidenceNote}
                          placeholder="Anotações internas"
                          placeholderTextColor={colors.textMuted}
                        />
                        <TouchableOpacity
                          style={styles.saveButton}
                          disabled={recordEvidenceMutation.isPending}
                          onPress={() => {
                            if (!evidenceAmount.trim()) return;
                            recordEvidenceMutation.mutate({
                              obligationKey: ob.obligationKey,
                              paymentDate: evidenceDate.trim(),
                              amountReported: evidenceAmount.trim(),
                              revenueCodeReported: ob.revenueCode ?? '6015',
                              referencePeriod: ob.period,
                              note: evidenceNote,
                            });
                          }}
                        >
                          <Text style={styles.saveButtonText}>
                            {recordEvidenceMutation.isPending
                              ? 'Salvando...'
                              : 'Salvar Comprovante'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <Text style={styles.disclaimerSmall}>
                      Aviso: O Atlas não executa pagamentos bancários e não valida comprovantes
                      junto à Receita Federal.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        ))
      )}

      <Text style={styles.disclaimer}>{vm.disclaimer}</Text>
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
    color: '#ffffff',
    fontWeight: '700',
  },
  obligationItem: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 4,
  },
  obligationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  obligationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: '700',
  },
  obligationDesc: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
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
  disclaimer: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
    marginTop: 12,
    fontStyle: 'italic',
  },
  paymentSupportToggle: {
    paddingVertical: 4,
    marginTop: 4,
  },
  paymentSupportToggleText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '600',
  },
  paymentSupportBox: {
    marginTop: 6,
    padding: 10,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  supportLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  supportInstruction: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  supportNote: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
    marginBottom: 6,
  },
  successMessage: {
    fontSize: 12,
    color: colors.positive,
    fontWeight: '600',
    marginTop: 6,
  },
  evidenceForm: {
    marginTop: 6,
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
    fontSize: 12,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.sm,
    paddingVertical: 6,
    alignItems: 'center',
    marginTop: 6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  disclaimerSmall: {
    fontSize: 10,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 8,
  },
});
