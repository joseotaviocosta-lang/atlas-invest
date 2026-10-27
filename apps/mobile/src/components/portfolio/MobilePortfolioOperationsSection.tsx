import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  themeTokens,
  describeDataQualityStatus,
  describeOperationsAttention,
  describeOperationsAttentionDetail,
  describeOperationsDomain,
  describeOperationsStatus,
} from '@atlas/ui';
import { Card } from '../ui/Card';
import { portfoliosApi } from '../../api/portfolios';

interface OperationsAttentionView {
  code: string;
  domain: string;
  severity: string;
  count: number | null;
  facts: { source: string | null; assetId: string | null; at: string | null };
  actions: Array<{ type: string }>;
}

interface PortfolioOperationsData {
  portfolioId: string;
  generatedAt: string;
  status: string;
  attention: { total: number; preview: OperationsAttentionView[] };
  integrations: Array<{
    source: string;
    provider: string;
    environment: string;
    availability: string;
    connectionState: string;
    schedule: { cadence: string; enabled: boolean } | null;
    lastRun: { status: string; at: string } | null;
    lastSuccessfulAt: string | null;
    status: string;
    structuralNote: boolean;
  }>;
  reconciliation: {
    matched: number;
    divergent: number;
    missingLocal: number;
    missingSource: number;
    unresolved: number;
    pendingReviews: number;
    truncated: boolean;
  };
  dataQuality: {
    status: string;
    summary: {
      positionsTotal: number;
      positionsWithoutIssues: number;
      positionsReviewRequired: number;
      positionsBlocked: number;
      issuesTotal: number;
      coveragePercent: string;
      unvaluedCount: number;
      knownCurrencies: string[];
    };
    issuesByDomain: Array<{ domain: string; count: number }>;
  };
  reviewWorkflow: {
    pendingPairs: number;
    decidedPairs: number;
    totalPairs: number;
  };
  reviewPreview: Array<{
    source: string;
    status: string;
    severity: string;
    reasonCodes: string[];
    at: string;
  }>;
  recentActivity: Array<{
    source: string;
    status: string;
    trigger: string | null;
    at: string;
    newRecords: number;
    confirmed: number;
  }>;
  availableActions: Array<{ type: string }>;
  limitations: string[];
}

function actionRoute(action: string): string | null {
  // Only routes that exist in the native app. Import hub and portfolio
  // tabs are web-only, so integration/import actions show no CTA here.
  if (action === 'VIEW_REVIEWS') return '/(app)/reviews';
  if (action === 'VIEW_DATA_QUALITY') return '/(app)/(tabs)/portfolio';
  return null;
}

/**
 * Phase 5S-A (mobile) — portfolio operations center, compact read-only.
 * Status, attention count, integration/reconciliation/data-quality
 * summaries and recent runs. Text only; navigation where routes exist.
 */
export function MobilePortfolioOperationsSection({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const operationsQuery = useQuery({
    queryKey: ['portfolio-operations', portfolioId],
    queryFn: async () => {
      const res = await portfoliosApi.getPortfolioOperations(portfolioId);
      return res.data as PortfolioOperationsData;
    },
    enabled: Boolean(portfolioId),
    staleTime: 30_000,
    retry: false,
  });

  const data = operationsQuery.data ?? null;

  return (
    <View testID="portfolio-operations">
      <Card style={styles.card}>
        <Text style={styles.sectionHeading}>CENTRAL DE OPERAÇÕES</Text>
        <Text style={styles.lede}>
          Estado operacional da carteira. Somente leitura — nada aqui é importado, executado ou
          corrigido.
        </Text>
        {operationsQuery.isLoading ? (
          <Text style={styles.muted}>Carregando operações…</Text>
        ) : operationsQuery.isError || !data ? (
          <Text style={styles.muted}>Não foi possível carregar a central de operações.</Text>
        ) : (
          <View>
            <Text style={styles.value} testID="operations-status">
              {describeOperationsStatus(data.status)}
            </Text>
            {data.attention.total === 0 ? (
              <Text style={styles.row} testID="operations-clear">
                Nenhuma pendência operacional identificada.
              </Text>
            ) : (
              <Text style={styles.row} testID="operations-attention-count">
                {data.attention.total}{' '}
                {data.attention.total === 1 ? 'item precisa' : 'itens precisam'} da sua atenção.
              </Text>
            )}
            {data.attention.preview.length > 0 && (
              <View testID="operations-attention">
                {data.attention.preview.map((item) => (
                  <View key={`${item.domain}-${item.code}`}>
                    <Text style={styles.row}>
                      {describeOperationsAttention(item.code)}
                      {item.count !== null ? ` (${item.count})` : ''} ·{' '}
                      {describeOperationsDomain(item.domain)}
                    </Text>
                    <Text style={styles.muted}>{describeOperationsAttentionDetail(item.code)}</Text>
                    {item.actions.map((action) => {
                      const route = actionRoute(action.type);
                      return route ? (
                        <Pressable
                          key={action.type}
                          onPress={() => router.push(route as never)}
                          accessibilityRole="button"
                          accessibilityLabel={
                            action.type === 'VIEW_REVIEWS'
                              ? 'Ver revisões'
                              : 'Ver qualidade dos dados'
                          }
                          testID={`operations-action-${action.type}`}
                        >
                          <Text style={styles.link}>
                            {action.type === 'VIEW_REVIEWS' ? 'Ver revisões' : 'Ver qualidade'}
                          </Text>
                        </Pressable>
                      ) : null;
                    })}
                  </View>
                ))}
              </View>
            )}
            <View testID="operations-integrations">
              <Text style={styles.subHeading}>Integrações</Text>
              {data.integrations.map((row) => (
                <Text key={row.source} style={styles.row}>
                  {row.source} · {row.connectionState} ·{' '}
                  {row.schedule ? row.schedule.cadence : 'sem agendamento'}
                  {row.structuralNote ? ' · em preparação' : ''}
                </Text>
              ))}
            </View>
            <View testID="operations-reconciliation">
              <Text style={styles.subHeading}>Reconciliação</Text>
              <Text style={styles.muted}>
                Conferidos: {data.reconciliation.matched} · Divergentes:{' '}
                {data.reconciliation.divergent} · Pendentes: {data.reconciliation.pendingReviews}
              </Text>
              <Text style={styles.muted}>
                Pares revisados: {data.reviewWorkflow.decidedPairs} de{' '}
                {data.reviewWorkflow.totalPairs}
              </Text>
            </View>
            <View testID="operations-data-quality">
              <Text style={styles.subHeading}>Qualidade dos dados</Text>
              <Text style={styles.row}>
                {describeDataQualityStatus(data.dataQuality.status)} ·{' '}
                {data.dataQuality.summary.positionsTotal} posições ·{' '}
                {data.dataQuality.summary.positionsBlocked} com dados insuficientes
              </Text>
            </View>
            {data.recentActivity.length > 0 && (
              <View testID="operations-recent-runs">
                <Text style={styles.subHeading}>Execuções recentes</Text>
                {data.recentActivity.map((run, index) => (
                  <Text key={index} style={styles.row}>
                    {run.source} · {run.status} · {run.newRecords} novos
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginVertical: themeTokens.spacing.sm },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: themeTokens.colors.text,
    marginBottom: 4,
  },
  lede: { fontSize: 12, color: themeTokens.colors.textMuted, marginBottom: 8 },
  subHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: themeTokens.colors.text,
    marginTop: 12,
    marginBottom: 4,
  },
  value: { fontSize: 16, fontWeight: '700', color: themeTokens.colors.text, marginVertical: 4 },
  row: { fontSize: 13, color: themeTokens.colors.text, marginVertical: 2 },
  muted: { fontSize: 12, color: themeTokens.colors.textMuted, marginVertical: 4 },
  link: { fontSize: 13, color: themeTokens.colors.text, textDecorationLine: 'underline' },
});
