import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { themeTokens } from '@atlas/ui';
import {
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
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['integration-reviews'],
    queryFn: () => reviewsApi.listReviews({ limit: 50 }),
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
});
