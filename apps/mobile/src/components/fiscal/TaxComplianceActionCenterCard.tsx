import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  themeTokens,
  taxComplianceActionCenterQueryKey,
  taxComplianceCalendarQueryKey,
  mapToTaxComplianceActionItemListViewModel,
  mapToTaxComplianceCalendarListViewModel,
  groupTaxComplianceCalendarByDate,
  TAX_ACTION_CENTER_SUPPORT_DISCLAIMER,
  TAX_ACTION_CENTER_STALE_MESSAGE,
  TAX_ACTION_CENTER_EVIDENCE_NOT_VERIFIED_WARNING,
  type RawTaxComplianceActionItem,
  type RawTaxComplianceActionCenterSummary,
  type TaxComplianceActionItemViewModel,
} from '@atlas/ui';
import { Card, LoadingState, EmptyState, ErrorState } from '../ui';
import { apiClient } from '../../api/client';

interface TaxComplianceActionCenterCardProps {
  calendarYear: number;
}

type CenterFilter = 'ALL' | 'ATTENTION' | 'UPCOMING' | 'REVIEW' | 'COMPLETED';

const FILTER_LABELS: Record<CenterFilter, string> = {
  ALL: 'Todos',
  ATTENTION: 'Atenção',
  UPCOMING: 'Próximos',
  REVIEW: 'Revisão',
  COMPLETED: 'Concluídos',
};

function filterItem(item: TaxComplianceActionItemViewModel, filter: CenterFilter): boolean {
  switch (filter) {
    case 'ATTENTION':
      return item.section === 'attention';
    case 'UPCOMING':
      return item.section === 'upcoming';
    case 'REVIEW':
      return item.section === 'review';
    case 'COMPLETED':
      return item.section === 'completed';
    case 'ALL':
    default:
      return true;
  }
}

function monthBounds(year: number, month: number): { from: string; to: string } {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function TaxComplianceActionCenterCard({
  calendarYear,
}: TaxComplianceActionCenterCardProps) {
  const [filter, setFilter] = useState<CenterFilter>('ALL');
  const [visibleCount, setVisibleCount] = useState(10);

  const now = new Date();
  const bounds = monthBounds(now.getFullYear(), now.getMonth() + 1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: taxComplianceActionCenterQueryKey(calendarYear, {}),
    queryFn: async () => {
      const res = await apiClient.get<{
        data: RawTaxComplianceActionItem[];
        meta: { summary: RawTaxComplianceActionCenterSummary; totalCount: number };
      }>(`/api/v1/fiscal/compliance/action-center?calendarYear=${calendarYear}&limit=100`);
      return res;
    },
    staleTime: 30_000,
  });

  const { data: calendarData } = useQuery({
    queryKey: taxComplianceCalendarQueryKey(bounds.from, bounds.to),
    queryFn: async () => {
      const res = await apiClient.get<{ data: unknown[] }>(
        `/api/v1/fiscal/compliance/calendar?from=${bounds.from}&to=${bounds.to}`,
      );
      return res.data;
    },
    staleTime: 30_000,
  });

  const items = useMemo(
    () => mapToTaxComplianceActionItemListViewModel(data?.data ?? null),
    [data],
  );
  const summary = data?.meta.summary ?? null;

  const filtered = useMemo(() => items.filter((item) => filterItem(item, filter)), [items, filter]);
  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const agenda = useMemo(() => {
    const events = mapToTaxComplianceCalendarListViewModel(
      (calendarData ?? []) as Parameters<typeof mapToTaxComplianceCalendarListViewModel>[0],
    );
    return groupTaxComplianceCalendarByDate(events);
  }, [calendarData]);

  if (isLoading) {
    return (
      <Card>
        <LoadingState />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <ErrorState message="Falha ao carregar a central de ações." onRetry={() => refetch()} />
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nenhuma ação fiscal pendente"
          description="Não há obrigações ou revisões exigindo atenção neste período."
        />
      </Card>
    );
  }

  return (
    <Card>
      <Text style={styles.title} accessibilityRole="header">
        Central de ações fiscais
      </Text>
      <Text style={styles.subtitle}>
        O que fazer agora, o que vem a seguir e o que já foi concluído.
      </Text>

      {summary && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText} testID="action-center-summary-mobile">
            Atenção: {summary.needsAttention} · Hoje: {summary.dueToday} · Próximos:{' '}
            {summary.upcoming} · Revisão: {summary.requiresReview} · Concluídos: {summary.completed}
          </Text>
        </View>
      )}

      <View style={styles.filterRow}>
        {(Object.keys(FILTER_LABELS) as CenterFilter[]).map((option) => (
          <TouchableOpacity
            key={option}
            onPress={() => {
              setFilter(option);
              setVisibleCount(10);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Filtrar por ${FILTER_LABELS[option]}`}
            accessibilityState={{ selected: filter === option }}
            style={[styles.filterChip, filter === option && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filter === option && styles.filterTextActive]}>
              {FILTER_LABELS[option]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nada neste filtro"
          description="Não há itens para o filtro selecionado."
        />
      ) : (
        visible.map((item) => (
          <View
            key={item.actionKey}
            testID={`action-center-item-mobile-${item.actionKey}`}
            style={styles.item}
          >
            <View style={styles.badgeRow}>
              <Text style={styles.statusText}>{item.statusLabel}</Text>
              <Text style={styles.priorityText}>{item.priorityLabel}</Text>
            </View>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.itemSummary}>{item.summary}</Text>
            <Text style={styles.meta}>
              Vencimento: {item.dueDateFormatted} · Valor: {item.amountFormatted}
            </Text>
            {item.exerciseLabel && <Text style={styles.meta}>{item.exerciseLabel}</Text>}
            {item.paymentEvidenceLabel && (
              <Text style={styles.meta}>Comprovante: {item.paymentEvidenceLabel}</Text>
            )}
            {item.isStale && (
              <Text style={styles.stale} accessibilityRole="alert">
                {TAX_ACTION_CENTER_STALE_MESSAGE}
              </Text>
            )}
            {item.paymentEvidenceStatus === 'USER_REPORTED_MATCH' && (
              <Text style={styles.meta}>{TAX_ACTION_CENTER_EVIDENCE_NOT_VERIFIED_WARNING}</Text>
            )}
            <Text style={styles.nextAction}>Próxima ação: {item.nextActionLabel}</Text>
          </View>
        ))
      )}

      {visible.length < filtered.length && (
        <TouchableOpacity
          onPress={() => setVisibleCount((count) => count + 10)}
          accessibilityRole="button"
          accessibilityLabel="Carregar mais itens"
          style={styles.moreButton}
        >
          <Text style={styles.moreButtonText}>
            Carregar mais ({filtered.length - visible.length} restantes)
          </Text>
        </TouchableOpacity>
      )}

      {agenda.length > 0 && (
        <View style={styles.agenda}>
          <Text style={styles.agendaTitle}>Agenda do mês</Text>
          {agenda.map((group) => (
            <View key={group.date} style={styles.agendaGroup}>
              <Text style={styles.agendaDate}>{group.dateFormatted}</Text>
              {group.events.map((event) => (
                <Text key={event.eventKey} style={styles.agendaItem}>
                  {event.eventTypeLabel} — {event.title}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}

      <Text style={styles.disclaimer}>{TAX_ACTION_CENTER_SUPPORT_DISCLAIMER}.</Text>
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
  summaryRow: {
    marginBottom: 8,
  },
  summaryText: {
    color: themeTokens.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  filterChip: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
  },
  filterChipActive: {
    backgroundColor: themeTokens.colors.primary,
    borderColor: themeTokens.colors.primary,
  },
  filterText: {
    color: themeTokens.colors.text,
    fontSize: 13,
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  item: {
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    paddingVertical: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  statusText: {
    color: themeTokens.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  priorityText: {
    color: themeTokens.colors.textMuted,
    fontSize: 12,
  },
  itemTitle: {
    color: themeTokens.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  itemSummary: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  meta: {
    color: themeTokens.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  stale: {
    color: themeTokens.colors.warning,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  nextAction: {
    color: themeTokens.colors.text,
    fontSize: 13,
    marginTop: 4,
  },
  moreButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  moreButtonText: {
    color: themeTokens.colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  agenda: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    paddingTop: 8,
  },
  agendaTitle: {
    color: themeTokens.colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  agendaGroup: {
    marginBottom: 6,
  },
  agendaDate: {
    color: themeTokens.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  agendaItem: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
  },
  disclaimer: {
    color: themeTokens.colors.textMuted,
    fontSize: 11,
    marginTop: 10,
  },
});
