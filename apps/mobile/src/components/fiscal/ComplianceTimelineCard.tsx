import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
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
  const [filter, setFilter] = useState<FilterStatus>('ALL');

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
});
