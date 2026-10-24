import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { themeTokens } from '@atlas/ui';
import {
  describeReviewSignal,
  describeReviewRule,
  describeReviewLimitation,
  describeReviewTrend,
  buildReviewSignalTitle,
  buildReviewSignalLines,
} from '@atlas/ui';
import { Screen, Header, Card, Button, ErrorState } from '../../../src/components/ui';
import { reviewApi } from '../../../src/api/review';

type DetailDto = {
  code: string;
  state: 'ACTIVE' | 'NOT_ACTIVE';
  period: { preset: string; startDate: string; endDate: string };
  generatedAt: string;
  marketDataAsOf: string | null;
  evidence: Record<string, string | number | boolean | null> | null;
  history:
    | {
        kind: 'SERIES';
        benchmark: string;
        currency: string;
        points: Array<{
          date: string;
          portfolioReturn: string | null;
          benchmarkReturn: string | null;
          gap: string | null;
          state: string;
        }>;
        worstGap: string | null;
        firstBelowAt: string | null;
        trend: string;
      }
    | {
        kind: 'TABLE_MONTHLY';
        months: Array<{
          month: string;
          total: string;
          currency: string;
          dividends: string;
          jcp: string;
          fiiIncome: string;
        }>;
        total: string;
        currency: string;
        trend: string;
      }
    | {
        kind: 'GROUPED';
        groups: Array<{
          kind: 'TABLE_MONTHLY';
          months: Array<{
            month: string;
            total: string;
            currency: string;
            dividends: string;
            jcp: string;
            fiiIncome: string;
          }>;
          total: string;
          currency: string;
          trend: string;
        }>;
      }
    | {
        kind: 'TABLE_RUNS';
        rows: Array<{
          runId: string;
          date: string;
          status: string;
          trigger: string | null;
          newRecords: number;
          partial: boolean;
          divergent: number;
          missingLocal: number;
          missingSource: number;
          unresolved: number;
        }>;
        firstDivergenceAt: string | null;
        trend: string;
      }
    | { kind: 'UNAVAILABLE'; reason: string };
  limitations: string[];
  action: { kind: 'ROUTE' | 'NONE'; href?: string; label?: string };
};

const PERIODS = [
  { id: '1M', label: '1M' },
  { id: '3M', label: '3M' },
  { id: '6M', label: '6M' },
  { id: 'YTD', label: 'Ano' },
  { id: '1A', label: '1 ano' },
  { id: 'INCEPTION', label: 'Início' },
];

function formatDatePtBr(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * Phase 5Q-B (mobile) — review drill-down, read-only text version.
 * Same contract as web: header, why, current evidence, history
 * (tables/text only — no charts on native), limitations, single CTA.
 */
export default function PortfolioReviewDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ portfolioId?: string; code?: string; period?: string }>();
  const portfolioId = typeof params.portfolioId === 'string' ? params.portfolioId : '';
  const code = typeof params.code === 'string' ? params.code : '';
  const period = typeof params.period === 'string' && params.period !== '' ? params.period : '1A';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['portfolio-review-detail', portfolioId, code, period],
    queryFn: async () => {
      const res = await reviewApi.getSignalDetail(portfolioId, code, period);
      return res.data as unknown as DetailDto;
    },
    enabled: portfolioId !== '' && code !== '',
  });

  const setPeriod = (next: string) => {
    router.setParams({ period: next });
  };

  return (
    <Screen>
      <Header
        title="Detalhe da revisão"
        subtitle="O que é, como evoluiu e onde agir"
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {isLoading ? (
          <ActivityIndicator />
        ) : isError || !data ? (
          <ErrorState message="Não foi possível carregar o detalhe." onRetry={() => refetch()} />
        ) : (
          <DetailBody
            detail={data}
            portfolioId={portfolioId}
            onSelectPeriod={setPeriod}
            activePeriod={period}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

function DetailBody({
  detail,
  portfolioId,
  onSelectPeriod,
  activePeriod,
}: {
  detail: DetailDto;
  portfolioId: string;
  onSelectPeriod: (period: string) => void;
  activePeriod: string;
}) {
  const presentation = describeReviewSignal(detail.code);
  const router = useRouter();
  return (
    <View>
      <Card style={styles.card}>
        <Text style={styles.title}>
          {detail.evidence !== null
            ? buildReviewSignalTitle({
                code: detail.code,
                severity: 'REVIEW',
                evidence: detail.evidence,
              })
            : presentation.label}
        </Text>
        <Text style={styles.label}>{presentation.label}</Text>
        {detail.state === 'NOT_ACTIVE' ? (
          <Text style={styles.muted}>Sem sinal ativo no momento.</Text>
        ) : null}
        <Text style={styles.muted}>
          Período: {formatDatePtBr(detail.period.startDate)} a{' '}
          {formatDatePtBr(detail.period.endDate)}
        </Text>
        {detail.evidence !== null
          ? buildReviewSignalLines({
              code: detail.code,
              severity: 'REVIEW',
              evidence: detail.evidence,
            }).map((line) => (
              <Text key={line.text} style={styles.muted}>
                {line.text}
              </Text>
            ))
          : null}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Por que estou vendo isso?</Text>
        <Text style={styles.body}>{describeReviewRule(detail.code)}</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Como evoluiu</Text>
        <HistoryBlock history={detail.history} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Período</Text>
        <View style={styles.periodRow}>
          {PERIODS.map((option) => (
            <TouchableOpacity
              key={option.id}
              onPress={() => onSelectPeriod(option.id)}
              accessibilityRole="button"
              accessibilityLabel={`Analisar período ${option.label}`}
              accessibilityState={{ selected: activePeriod === option.id }}
              style={[styles.periodChip, activePeriod === option.id && styles.periodChipActive]}
            >
              <Text
                style={[
                  styles.periodChipText,
                  activePeriod === option.id && styles.periodChipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Dados usados</Text>
        {detail.marketDataAsOf !== null ? (
          <Text style={styles.muted}>Dados de mercado de {detail.marketDataAsOf}.</Text>
        ) : null}
        <Text style={styles.muted}>
          Período: {formatDatePtBr(detail.period.startDate)} a{' '}
          {formatDatePtBr(detail.period.endDate)} ({detail.period.preset}).
        </Text>
        {detail.limitations.length > 0 ? (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.sectionTitle}>Limitações</Text>
            {detail.limitations.map((limitation) => (
              <Text key={limitation} style={styles.muted}>
                {describeReviewLimitation(limitation)}
              </Text>
            ))}
          </View>
        ) : null}
      </Card>

      {(() => {
        if (detail.action.kind !== 'ROUTE' || !detail.action.href) return null;
        const href = detail.action.href;
        if (href.startsWith('/reviews')) {
          return (
            <Button
              title={detail.action.label ?? 'Abrir'}
              onPress={() => router.push('/(app)/reviews')}
            />
          );
        }
        if (href.includes('/portfolio/performance')) {
          return (
            <Button
              title={detail.action.label ?? 'Abrir'}
              onPress={() => router.push(`/(app)/portfolio/performance?portfolioId=${portfolioId}`)}
            />
          );
        }
        if (href.includes('/portfolio/income')) {
          return (
            <Button
              title={detail.action.label ?? 'Abrir'}
              onPress={() => router.push(`/(app)/portfolio/income?portfolioId=${portfolioId}`)}
            />
          );
        }
        return null;
      })()}
    </View>
  );
}

function HistoryBlock({ history }: { history: DetailDto['history'] }) {
  if (history.kind === 'SERIES') {
    const trend = describeReviewTrend(history.trend);
    return (
      <View>
        <Text style={styles.body}>
          {history.points.length} pontos no período · Tendência: {trend.label}.
        </Text>
        {history.firstBelowAt !== null ? (
          <Text style={styles.muted}>
            Abaixo do benchmark desde {formatDatePtBr(history.firstBelowAt)}.
          </Text>
        ) : null}
        {history.worstGap !== null ? (
          <Text style={styles.muted}>
            Pior diferença: {history.worstGap.replace('.', ',')} p.p.
          </Text>
        ) : null}
        {history.points.slice(-5).map((point) => (
          <Text key={point.date} style={styles.muted}>
            {formatDatePtBr(point.date)} · carteira {point.portfolioReturn ?? '—'}
            {point.benchmarkReturn !== null && point.benchmarkReturn !== undefined
              ? ` · benchmark ${point.benchmarkReturn}`
              : ''}
          </Text>
        ))}
      </View>
    );
  }
  if (history.kind === 'GROUPED') {
    return (
      <View>
        {history.groups.map((group) => (
          <View key={group.currency} style={{ marginBottom: 8 }}>
            <Text style={styles.body}>{group.currency}</Text>
            {group.months.map((month) => (
              <Text key={month.month} style={styles.muted}>
                {month.month}: {month.currency} {month.total}
              </Text>
            ))}
          </View>
        ))}
      </View>
    );
  }
  if (history.kind === 'TABLE_RUNS') {
    if (history.rows.length === 0) {
      return <Text style={styles.muted}>Sem execuções no período.</Text>;
    }
    return (
      <View>
        {history.rows.slice(0, 10).map((row) => (
          <Text key={row.runId} style={styles.muted}>
            {formatDatePtBr(row.date)} · {row.trigger === 'SCHEDULED' ? 'automática' : 'manual'} ·{' '}
            {row.status} · {row.newRecords} novos
          </Text>
        ))}
        {history.firstDivergenceAt !== null ? (
          <Text style={styles.muted}>
            Divergência nesta janela desde {formatDatePtBr(history.firstDivergenceAt)}.
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <Text style={styles.muted}>
      Histórico indisponível para este indicador. A análise considera o snapshot atual.
    </Text>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: themeTokens.spacing.md,
  },
  card: {
    marginBottom: themeTokens.spacing.md,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: themeTokens.colors.text,
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: themeTokens.colors.text,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: themeTokens.colors.text,
    marginBottom: 4,
  },
  body: {
    fontSize: 14,
    color: themeTokens.colors.text,
    marginBottom: 4,
  },
  muted: {
    fontSize: 13,
    color: themeTokens.colors.textMuted,
    marginBottom: 2,
  },
  periodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  periodChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    minHeight: 44,
    justifyContent: 'center',
  },
  periodChipActive: {
    backgroundColor: themeTokens.colors.primary,
    borderColor: themeTokens.colors.primary,
  },
  periodChipText: {
    fontSize: 13,
    color: themeTokens.colors.text,
  },
  periodChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
