import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { themeTokens } from '@atlas/ui';
import { describeReviewSignal, buildReviewSignalTitle } from '@atlas/ui';
import { reviewApi } from '@/api/review';
import { Card, Button } from '@/components/ui';

/**
 * Phase 5Q-A — compact read-only review card (mobile).
 *
 * Summary + up to three signal titles + coverage note. CTAs only route
 * to screens that exist natively (reviews, performance, income); anything
 * else renders as text without a dead button.
 */
const ROUTE_MAP: Record<string, (portfolioId: string) => string | null> = {
  INTEGRATION_PENDING_REVIEW: () => '/(app)/reviews',
  PERFORMANCE_BENCHMARK_GAP: (portfolioId) =>
    `/(app)/portfolio/performance?portfolioId=${portfolioId}`,
  PERFORMANCE_BENCHMARK_UNAVAILABLE: (portfolioId) =>
    `/(app)/portfolio/performance?portfolioId=${portfolioId}`,
  INCOME_RECEIVED: (portfolioId) => `/(app)/portfolio/income?portfolioId=${portfolioId}`,
};

export function MobileReviewSection({ portfolioId }: { portfolioId: string | null }) {
  const router = useRouter();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['portfolio-review', portfolioId],
    queryFn: async () => {
      if (!portfolioId) return null;
      return reviewApi.getReview(portfolioId);
    },
    enabled: Boolean(portfolioId),
    staleTime: 30000,
  });

  if (!portfolioId) return null;
  if (isLoading) {
    return (
      <Card style={{ marginBottom: 16 }}>
        <ActivityIndicator />
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card style={{ marginBottom: 16 }}>
        <Text style={{ color: themeTokens.colors.danger, fontSize: 13 }}>
          Não foi possível carregar a revisão.
        </Text>
      </Card>
    );
  }

  const review = data.data;
  const attention = review.summary.attentionCount;
  const headline =
    review.isEmpty && review.signals.length === 0
      ? 'Sua carteira ainda não possui ativos suficientes para gerar uma revisão.'
      : attention === 0
        ? 'Nenhum ponto relevante identificado com os dados disponíveis.'
        : attention === 1
          ? '1 ponto merece revisão.'
          : `${attention} pontos merecem revisão.`;
  const visible = review.signals.slice(0, 3);

  return (
    <Card style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 15, fontWeight: '700', marginBottom: 4 }}>Revisão da carteira</Text>
      <Text style={{ fontSize: 13, color: themeTokens.colors.textMuted, marginBottom: 8 }}>
        {headline}
      </Text>
      {review.summary.dataNote !== null ? (
        <Text style={{ fontSize: 12, color: themeTokens.colors.textMuted, marginBottom: 8 }}>
          Cobertura de preços: {review.summary.dataNote.replace('.', ',')}% — análises consideram
          apenas o valor com preço disponível.
        </Text>
      ) : null}
      {visible.map((signal) => {
        const presentation = describeReviewSignal(signal.code);
        const title = buildReviewSignalTitle({
          code: signal.code,
          severity: signal.severity,
          evidence: signal.evidence,
        });
        const target = ROUTE_MAP[signal.code]?.(review.portfolioId) ?? null;
        return (
          <View key={signal.id} style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700' }}>
              {presentation.label} · {title}
            </Text>
            {target !== null ? (
              <Button
                title={
                  signal.action.kind === 'ROUTE' && signal.action.label
                    ? signal.action.label
                    : 'Abrir'
                }
                onPress={() => router.push(target as never)}
                variant="ghost"
              />
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}
