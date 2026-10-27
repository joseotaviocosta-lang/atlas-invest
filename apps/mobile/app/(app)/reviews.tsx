import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { themeTokens } from '@atlas/ui';
import {
  REVIEW_FILTERS,
  REVIEW_SEVERITY_PRESENTATION,
  buildReviewItemSummaryLines,
  buildReviewItemTitle,
  describeImportRunSource,
  describeIntegrationRunTrigger,
  type ReviewReasonCode,
} from '@atlas/ui';
import {
  Screen,
  Header,
  Card,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../src/components/ui';
import { reviewsApi, type MobileReviewItem } from '../../src/api/reviews';

function severityColor(severity: MobileReviewItem['severity']): string {
  if (severity === 'ERROR') return themeTokens.colors.danger;
  if (severity === 'WARNING') return themeTokens.colors.warning;
  return themeTokens.colors.info;
}

function ReviewCard({ item }: { item: MobileReviewItem }) {
  const router = useRouter();
  const presentation = REVIEW_SEVERITY_PRESENTATION[item.severity];
  const origin = describeIntegrationRunTrigger(item.trigger);
  const reasonCodes = item.reasonCodes as ReviewReasonCode[];
  const title = buildReviewItemTitle({
    source: item.source,
    trigger: item.trigger,
    severity: item.severity,
    reasonCodes,
    metrics: item.metrics,
  });
  const lines = buildReviewItemSummaryLines({
    source: item.source,
    trigger: item.trigger,
    severity: item.severity,
    reasonCodes,
    metrics: item.metrics,
  });
  return (
    <Card style={styles.itemCard}>
      <View style={styles.badgesRow}>
        <View style={[styles.severityDot, { backgroundColor: severityColor(item.severity) }]} />
        <Text style={styles.severityLabel}>
          {presentation.label} · {origin.label}
        </Text>
      </View>
      <Text style={styles.itemTitle}>
        {item.portfolioName ?? 'Carteira'} · {describeImportRunSource(item.source, null)}
      </Text>
      <Text style={styles.itemSubtitle}>{title}</Text>
      {lines.map((line) => (
        <Text key={line.text} style={styles.itemLine}>
          {line.text}
        </Text>
      ))}
      <Text style={styles.itemDate}>{item.createdAt.slice(0, 10)}</Text>
      {item.pairReview && item.pairReview.status === 'RESOLVED' ? (
        <Text style={styles.itemLine}>Revisado</Text>
      ) : item.pairReview && item.pairReview.status === 'PARTIALLY_RESOLVED' ? (
        <Text style={styles.itemLine}>
          {item.pairReview.decidedPairs} de {item.pairReview.totalPairs} revisados
        </Text>
      ) : item.pairReview && item.pairReview.totalPairs > 0 ? (
        <Text style={styles.itemLine}>
          {item.pairReview.totalPairs}{' '}
          {item.pairReview.totalPairs === 1 ? 'par pendente' : 'pares pendentes'}
        </Text>
      ) : null}
      <Pressable
        onPress={() => router.push(`/(app)/reviews/${item.runId}` as never)}
        accessibilityRole="button"
        accessibilityLabel={`Ver detalhes da pendência de ${item.portfolioName ?? 'carteira'}`}
        testID={`review-detail-${item.runId}`}
      >
        <Text style={styles.link}>Ver detalhes</Text>
      </Pressable>
    </Card>
  );
}

/**
 * Phase 5P-B — read-only review inbox (mobile).
 *
 * The native app has no import hub: this screen is strictly read-only.
 * Review and confirmation happen on web; the screen says so explicitly
 * instead of offering a dead-end CTA.
 */
export default function ReviewsScreen() {
  const router = useRouter();
  const [severity, setSeverity] = useState<'ALL' | 'REVIEW' | 'WARNING' | 'ERROR'>('ALL');
  const [source, setSource] = useState<string>('ALL');
  const [workflow, setWorkflow] = useState<'ALL' | 'PENDING' | 'RESOLVED'>('ALL');
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['integration-reviews', severity, source, workflow],
    queryFn: () =>
      reviewsApi.listReviews({
        limit: 50,
        severity: severity === 'ALL' ? null : severity,
        source: source === 'ALL' ? null : source,
        state: workflow === 'ALL' ? null : workflow,
      }),
    staleTime: 30_000,
  });
  const items = data?.data ?? [];

  return (
    <Screen scrollable>
      <Header
        title="Pendências"
        subtitle="Revisões e avisos das suas importações e sincronizações"
        onBack={() => router.back()}
      />
      <View style={styles.content}>
        <View style={styles.filterRow}>
          {REVIEW_FILTERS.map((filter) => (
            <Pressable
              key={filter.id}
              onPress={() => setSeverity(filter.id as 'ALL' | 'REVIEW' | 'WARNING' | 'ERROR')}
              accessibilityRole="button"
              accessibilityLabel={`Filtrar por ${filter.label}`}
              accessibilityState={{ selected: severity === filter.id }}
              testID={`review-filter-${filter.id}`}
            >
              <Text style={[styles.filter, severity === filter.id && styles.filterActive]}>
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.filterRow}>
          {['ALL', 'B3', 'CSV', 'MANUAL'].map((option) => (
            <Pressable
              key={option}
              onPress={() => setSource(option)}
              accessibilityRole="button"
              accessibilityLabel={`Filtrar por origem ${option === 'ALL' ? 'todas' : option}`}
              accessibilityState={{ selected: source === option }}
              testID={`review-source-${option}`}
            >
              <Text style={[styles.filter, source === option && styles.filterActive]}>
                {option === 'ALL' ? 'Todas' : option}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.filterRow}>
          {[
            { value: 'ALL', label: 'Todas' },
            { value: 'PENDING', label: 'Pendentes' },
            { value: 'RESOLVED', label: 'Resolvidas' },
          ].map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setWorkflow(option.value as 'ALL' | 'PENDING' | 'RESOLVED')}
              accessibilityRole="button"
              accessibilityLabel={`Mostrar revisões ${option.label.toLowerCase()}`}
              accessibilityState={{ selected: workflow === option.value }}
              testID={`review-workflow-${option.value}`}
            >
              <Text style={[styles.filter, workflow === option.value && styles.filterActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {isLoading ? (
          <LoadingState message="Carregando pendências..." />
        ) : isError ? (
          <ErrorState
            message="Não foi possível carregar as pendências."
            onRetry={() => refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="Nenhuma pendência no momento"
            description="Quando uma importação ou sincronização precisar da sua atenção, ela aparece aqui."
          />
        ) : (
          <>
            {items.map((item) => (
              <ReviewCard key={item.id} item={item} />
            ))}
            <Text style={styles.footnote}>
              Para revisar e importar, acesse a versão web do Atlas. Nada é importado sem a sua
              confirmação.
            </Text>
          </>
        )}
        {isRefetching ? <LoadingState message="Atualizando..." /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: themeTokens.spacing.md,
  },
  itemCard: {
    marginBottom: themeTokens.spacing.sm,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  severityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  severityLabel: {
    color: themeTokens.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  itemTitle: {
    color: themeTokens.colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  itemSubtitle: {
    color: themeTokens.colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemLine: {
    color: themeTokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  itemDate: {
    color: themeTokens.colors.textMuted,
    fontSize: 12,
    marginTop: 6,
  },
  footnote: {
    color: themeTokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  filter: {
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: themeTokens.colors.textMuted,
  },
  filterActive: {
    fontWeight: '700',
    color: themeTokens.colors.text,
  },
  link: {
    fontSize: 13,
    fontWeight: '600',
    color: themeTokens.colors.text,
    textDecorationLine: 'underline',
    marginTop: 6,
    paddingVertical: 8,
  },
});
