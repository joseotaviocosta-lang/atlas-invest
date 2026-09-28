import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  themeTokens,
  mapToFiscalMonthlyViewModel,
  fiscalMonthlyQueryKey,
  type RawFiscalMonthlyState,
} from '@atlas/ui';
import {
  Screen,
  Header,
  Card,
  LoadingState,
  EmptyState,
  ErrorState,
} from '../../../src/components/ui';
import { apiClient, ApiError } from '../../../src/api/client';

function currentCompetence(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
}

function shiftCompetence(competence: string, delta: number): string {
  const [y, m] = competence.split('-').map((v) => parseInt(v, 10));
  const base = new Date(y!, m! - 1 + delta, 1);
  return `${base.getFullYear()}-${(base.getMonth() + 1).toString().padStart(2, '0')}`;
}

export default function TaxScreen() {
  const router = useRouter();
  const [competence, setCompetence] = useState(currentCompetence());

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: fiscalMonthlyQueryKey(competence),
    queryFn: async () => {
      const res = await apiClient.get<{ data: RawFiscalMonthlyState }>(
        `/api/v1/fiscal/monthly/${competence}`,
      );
      return res.data;
    },
  });

  const vm = useMemo(() => mapToFiscalMonthlyViewModel(data ?? null), [data]);

  return (
    <Screen>
      <Header
        title="Fiscal"
        subtitle="Apuração fiscal mensal (fundação)"
        rightAction={{ title: 'Perfil', onPress: () => router.push('/(app)/profile') }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.competenceRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Competência anterior"
              onPress={() => setCompetence((c) => shiftCompetence(c, -1))}
              style={styles.competenceButton}
            >
              <Text style={styles.competenceButtonText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.competenceLabel}>{vm ? vm.competenceLabel : competence}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Próxima competência"
              onPress={() => setCompetence((c) => shiftCompetence(c, 1))}
              style={styles.competenceButton}
            >
              <Text style={styles.competenceButtonText}>›</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {isLoading && <LoadingState message="Carregando apuração fiscal..." />}

        {isError && !isLoading && (
          <ErrorState
            message={(error as ApiError)?.message || 'Erro ao consultar o estado fiscal.'}
            onRetry={() => refetch()}
          />
        )}

        {vm && (
          <>
            <Card>
              <Text style={styles.sectionTitle}>Status da apuração</Text>
              <Text style={[styles.status, { color: vm.statusColor }]}>{vm.statusLabel}</Text>
              <Text style={styles.meta}>{vm.ruleSetLabel}</Text>
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>Eventos fiscais</Text>
              <Text style={styles.meta}>{vm.eventCount} evento(s) na competência</Text>
              {vm.eventsSummary.length > 0 && (
                <Text style={styles.meta}>
                  {vm.eventsSummary.map((e) => `${e.count} ${e.label}`).join(' · ')}
                </Text>
              )}
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>Categorias de ativos</Text>
              {vm.categories.length === 0 ? (
                <EmptyState
                  title="Sem eventos"
                  description="Nenhum evento fiscal registrado para esta competência."
                />
              ) : (
                vm.categories.map((c) => (
                  <View key={`${c.categoryLabel}-${c.currency}`} style={styles.categoryRow}>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryTitle}>
                        {c.categoryLabel} · {c.currency}
                      </Text>
                      <Text style={[styles.categoryCapability, { color: c.capabilityColor }]}>
                        {c.capabilityLabel}
                      </Text>
                    </View>
                    <Text style={styles.meta}>
                      {c.eventCount} evento(s) · Vendas: {c.salesProceedsFormatted} · Proventos:{' '}
                      {c.incomeFormatted}
                    </Text>
                    {c.qualityLabels.length > 0 && (
                      <Text style={styles.warning}>Pendências: {c.qualityLabels.join(' · ')}</Text>
                    )}
                  </View>
                ))
              )}
            </Card>

            {vm.dataQuality.hasIssues && (
              <Card>
                <Text style={styles.sectionTitle}>Dados incompletos</Text>
                {vm.dataQuality.issueLabels.map((label) => (
                  <Text key={label} style={styles.warning}>
                    • {label}
                  </Text>
                ))}
              </Card>
            )}

            <Text style={styles.notice}>{vm.foundationNotice}</Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: themeTokens.spacing.md,
    gap: themeTokens.spacing.md,
  },
  competenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  competenceButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  competenceButtonText: {
    color: themeTokens.colors.primary,
    fontSize: 24,
    fontWeight: '700',
  },
  competenceLabel: {
    color: themeTokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionTitle: {
    color: themeTokens.colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  status: {
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  categoryRow: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: themeTokens.colors.border ?? themeTokens.colors.textMuted,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  categoryTitle: {
    color: themeTokens.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  categoryCapability: {
    fontSize: 12,
    fontWeight: '600',
  },
  warning: {
    color: themeTokens.colors.warning ?? themeTokens.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  notice: {
    color: themeTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: 4,
  },
});
