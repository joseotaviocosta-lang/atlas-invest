import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  themeTokens,
  describeReconciliationState,
  describeReviewReason,
  describeWorkspaceLimitation,
  describeDifferenceField,
  describeImportRunSource,
  type ReviewReasonCode,
} from '@atlas/ui';
import { Screen, Header, Card, LoadingState, ErrorState } from '../../../src/components/ui';
import { reviewsApi, type MobileReviewDetail } from '../../../src/api/reviews';

const COMPARABLE_FIELDS = ['date', 'type', 'asset', 'quantity', 'amount', 'currency'];

/**
 * Phase 5S-B (mobile) — review detail, stacked read-only.
 * Run context, source panel (with persistence limits), linked local
 * facts, reconciliation semantics. Text only; no import actions natively.
 */
export default function ReviewDetailPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ runId: string }>();
  const runId = params.runId || '';
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['integration-review', runId],
    queryFn: () => reviewsApi.getReview(runId),
    enabled: Boolean(runId),
    staleTime: 30_000,
    retry: false,
  });
  const detail: MobileReviewDetail | null = (data?.data as MobileReviewDetail) ?? null;
  const item = detail?.item ?? null;

  return (
    <Screen scrollable>
      <Header
        title="Detalhe da revisão"
        subtitle="Comparação entre fonte e Atlas para esta execução."
        onBack={() => router.back()}
      />
      <View style={styles.content}>
        {isLoading ? (
          <LoadingState message="Carregando revisão..." />
        ) : isError || !detail ? (
          <ErrorState message="Não foi possível carregar a revisão." onRetry={() => refetch()} />
        ) : (
          <Card style={styles.card}>
            <Text style={styles.row} testID="review-run-context">
              {item ? describeImportRunSource(item.source, null) : 'Execução'}
              {item ? ` · ${item.status}` : ''} · Situação:{' '}
              {detail.state === 'ACTIONABLE' ? 'Aguardando revisão' : 'Resolvida'}
            </Text>
            {item && (
              <View testID="review-reasons">
                <Text style={styles.subHeading}>Por que está em revisão</Text>
                {(item.reasonCodes as ReviewReasonCode[]).map((code) => (
                  <Text key={code} style={styles.row}>
                    {describeReviewReason(code)}
                  </Text>
                ))}
              </View>
            )}
            <View testID="review-source-panel">
              <Text style={styles.subHeading}>Fonte</Text>
              <Text style={styles.muted}>
                O detalhamento item a item da fonte não é guardado após a execução. A comparação
                mostra os totais da execução e os fatos locais confirmados.
              </Text>
            </View>
            <View testID="review-local-panel">
              <Text style={styles.subHeading}>
                Atlas — operações vinculadas ({detail.linkedTransactions.length})
              </Text>
              {detail.linkedTransactions.length === 0 ? (
                <Text style={styles.muted}>Nenhuma operação vinculada a esta execução.</Text>
              ) : (
                detail.linkedTransactions.map((row) => (
                  <Text key={row.transactionId} style={styles.row}>
                    {row.tradeDate ?? '—'} · {row.type ?? '—'} · {row.ticker ?? row.assetId ?? '—'}{' '}
                    · {row.amount ?? row.quantity ?? '—'}
                    {row.decision === 'CONFIRM_MATCH' ? ' · Correspondência confirmada' : ''}
                    {row.decision === 'NOT_A_MATCH' ? ' · Não correspondem' : ''}
                  </Text>
                ))
              )}
            </View>
            {item && (
              <View testID="review-reconciliation">
                <Text style={styles.subHeading}>Reconciliação</Text>
                {(
                  [
                    ['DIVERGENT', item.metrics.divergent],
                    ['MISSING_LOCAL', item.metrics.missingLocal],
                    ['MISSING_SOURCE', item.metrics.missingSource],
                    ['UNRESOLVED', item.metrics.unresolved],
                  ] as Array<[string, number]>
                ).map(([state, count]) => (
                  <Text key={state} style={styles.row}>
                    {state} ({count}): {describeReconciliationState(state)}
                  </Text>
                ))}
              </View>
            )}
            <View testID="review-differences">
              <Text style={styles.subHeading}>Diferenças encontradas</Text>
              <Text style={styles.muted}>
                Sem detalhamento campo a campo: os itens da fonte não ficam guardados após a
                execução. Campos comparáveis quando a fonte está disponível:{' '}
                {COMPARABLE_FIELDS.map(describeDifferenceField).join(', ')}.
              </Text>
            </View>
            {detail.limitations.map((code) => (
              <Text key={code} style={styles.muted} testID={`review-limitation-${code}`}>
                {describeWorkspaceLimitation(code)}
              </Text>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: themeTokens.spacing.md,
  },
  card: {
    marginBottom: themeTokens.spacing.sm,
  },
  subHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: themeTokens.colors.text,
    marginTop: 12,
    marginBottom: 4,
  },
  row: { fontSize: 13, color: themeTokens.colors.text, marginVertical: 2 },
  muted: { fontSize: 12, color: themeTokens.colors.textMuted, marginVertical: 4 },
});
