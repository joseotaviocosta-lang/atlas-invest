import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  themeTokens,
  formatCurrency,
  formatDatePtBr,
  formatPercentage,
  formatPlanMonthLong,
  describePositionLimitation,
} from '@atlas/ui';
import { Card } from '../ui/Card';
import { portfoliosApi } from '../../api/portfolios';

interface PerformanceMonthPoint {
  month: string;
  positionReturn: string | null;
  weightStart: string | null;
  contributionPp: string | null;
  valued: boolean;
}

interface PositionPerformanceData {
  portfolioId: string;
  assetId: string;
  generatedAt: string;
  marketDataAsOf: string | null;
  period: { startDate: string; endDate: string; months: string[] };
  inceptionDate: string;
  positionCurrency: string;
  return: {
    twr: string | null;
    status: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT_DATA' | 'NOT_AVAILABLE';
    dataAvailability: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
    actualStartDate: string | null;
    actualEndDate: string | null;
  };
  realized: {
    byCurrency: Array<{
      currency: string;
      gainLoss: string | null;
      status: 'KNOWN' | 'INCOMPLETE';
      disposalCount: number;
    }>;
  };
  unrealized: { amount: string; currency: string; percent: string | null } | null;
  income: {
    totalsByCurrency: Array<{
      currency: string;
      dividends: string;
      jcp: string;
      fiiIncome: string;
      total: string;
    }>;
  };
  economicPnl: {
    totalsByCurrency: Array<{
      currency: string;
      realized: string | null;
      unrealized: string | null;
      income: string | null;
      total: string | null;
    }>;
  } | null;
  contribution: {
    totalPp: string | null;
    portfolioReturnOnGrid: string;
    monthsValued: number;
    monthsTotal: number;
    monthlyPoints: PerformanceMonthPoint[];
  } | null;
  limitations: string[];
}

const PERIOD_PRESETS = [
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: 'YTD', label: 'No ano' },
  { value: '1A', label: '1 ano' },
  { value: 'INCEPTION', label: 'Desde o início' },
] as const;

type PeriodPreset = (typeof PERIOD_PRESETS)[number]['value'];

function addMonthsIso(date: string, months: number): string {
  const [yearRaw = '0', monthRaw = '1', dayRaw = '1'] = date.split('-');
  const total = Number(yearRaw) * 12 + (Number(monthRaw) - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${pad(month)}-${dayRaw.padStart(2, '0')}`;
}

function periodRange(
  preset: PeriodPreset,
  today: string,
  inception: string | null,
): { start?: string; end: string } {
  if (preset === 'YTD') return { start: `${today.slice(0, 4)}-01-01`, end: today };
  if (preset === 'INCEPTION') {
    return inception ? { start: inception, end: today } : { end: today };
  }
  const months = preset === '1M' ? 1 : preset === '3M' ? 3 : preset === '6M' ? 6 : 12;
  return { start: addMonthsIso(today, -months), end: today };
}

function formatSignedMoney(value: string | null, currency: string): string {
  if (value === null) return '—';
  const negative = value.trim().startsWith('-');
  const abs = negative ? value.trim().slice(1) : value.trim();
  return `${negative ? '-' : '+'}${formatCurrency(abs, currency)}`;
}

function formatSignedPp(value: string | null): string {
  if (value === null) return '—';
  const negative = value.trim().startsWith('-');
  const abs = negative ? value.trim().slice(1) : value.trim();
  return `${negative ? '-' : '+'}${formatPercentage(abs)}`;
}

export interface MobilePositionPerformanceSectionProps {
  portfolioId: string;
  assetId: string;
}

/**
 * Phase 5R-B (mobile) — position performance, read-only.
 * Same facts as web: TWR, P&L components, economic total and monthly
 * contribution. Table only, no chart. Facts only, explicit signs.
 */
export function MobilePositionPerformanceSection({
  portfolioId,
  assetId,
}: MobilePositionPerformanceSectionProps) {
  const today = useMemo(() => {
    const now = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }, []);
  const [preset, setPreset] = useState<PeriodPreset>('1A');
  const [inceptionAnchor, setInceptionAnchor] = useState<string | null>(null);

  const range = periodRange(preset, today, inceptionAnchor);
  const performanceQuery = useQuery({
    queryKey: ['position-performance', portfolioId, assetId, preset, range.start ?? '', range.end],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (range.start) params.set('startDate', range.start);
      params.set('endDate', range.end);
      const res = await portfoliosApi.getPositionPerformance(
        portfolioId,
        assetId,
        params.toString(),
      );
      return res.data as PositionPerformanceData;
    },
    enabled: Boolean(portfolioId) && Boolean(assetId),
    staleTime: 30_000,
    retry: false,
  });

  const data = performanceQuery.data ?? null;
  if (data && data.inceptionDate && data.inceptionDate !== inceptionAnchor) {
    setInceptionAnchor(data.inceptionDate);
  }

  return (
    <View testID="position-performance">
      <Card style={styles.card}>
        <Text style={styles.sectionHeading}>DESEMPENHO DA POSIÇÃO</Text>
        <View style={styles.presetRow}>
          {PERIOD_PRESETS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setPreset(option.value)}
              accessibilityRole="button"
              accessibilityLabel={`Ver desempenho de ${option.label}`}
              accessibilityState={{ selected: preset === option.value }}
              testID={`performance-period-${option.value}`}
            >
              <Text style={[styles.preset, preset === option.value && styles.presetActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {performanceQuery.isLoading ? (
          <Text style={styles.muted}>Carregando desempenho…</Text>
        ) : performanceQuery.isError || !data ? (
          <Text style={styles.muted}>Não foi possível carregar o desempenho desta posição.</Text>
        ) : (
          <View>
            {data.return.twr !== null ? (
              <Text style={styles.value} testID="performance-return">
                {formatPercentage(data.return.twr, { showSign: true })}
              </Text>
            ) : (
              <Text style={styles.body} testID="performance-unavailable">
                O resultado detalhado por posição ainda não está disponível para este período.
              </Text>
            )}
            {data.economicPnl && data.economicPnl.totalsByCurrency.length > 0 ? (
              <View testID="performance-pnl">
                {data.economicPnl.totalsByCurrency.map((row) => (
                  <Text key={row.currency} style={styles.body}>
                    {row.currency}: realizado {formatSignedMoney(row.realized, row.currency)} · não
                    realizado {formatSignedMoney(row.unrealized, row.currency)} · renda{' '}
                    {formatSignedMoney(row.income, row.currency)}
                    {row.total !== null
                      ? ` · total ${formatSignedMoney(row.total, row.currency)}`
                      : null}
                    .
                  </Text>
                ))}
              </View>
            ) : null}
            {data.contribution && data.contribution.totalPp !== null ? (
              <View testID="performance-contribution">
                <Text style={styles.body}>
                  Contribuição: {formatSignedPp(data.contribution.totalPp)} p.p.
                </Text>
                <Text style={styles.muted}>
                  Quanto esta posição contribuiu para a variação da carteira no período.
                </Text>
                {data.contribution.monthlyPoints.map((row) => (
                  <Text key={row.month} style={styles.muted}>
                    {formatPlanMonthLong(row.month)}: retorno{' '}
                    {row.positionReturn !== null
                      ? formatPercentage(row.positionReturn, { showSign: true })
                      : '—'}{' '}
                    · peso {row.weightStart !== null ? formatPercentage(row.weightStart) : '—'} ·
                    contribuição{' '}
                    {row.contributionPp !== null
                      ? `${formatSignedPp(row.contributionPp)} p.p.`
                      : '—'}
                  </Text>
                ))}
              </View>
            ) : null}
            {data.marketDataAsOf ? (
              <Text style={styles.muted}>
                Dados de mercado até {formatDatePtBr(data.marketDataAsOf)}.
              </Text>
            ) : null}
            {data.limitations.map((limitation) => (
              <Text
                key={limitation}
                style={styles.muted}
                testID={`performance-limitation-${limitation}`}
              >
                {describePositionLimitation(limitation)}
              </Text>
            ))}
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: themeTokens.spacing.md,
    padding: themeTokens.spacing.md,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: themeTokens.colors.text,
    marginBottom: 4,
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
    color: themeTokens.colors.text,
  },
  body: {
    fontSize: 14,
    color: themeTokens.colors.text,
    marginTop: 2,
  },
  muted: {
    fontSize: 12,
    color: themeTokens.colors.textMuted,
    marginTop: 2,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 8,
  },
  preset: {
    fontSize: 13,
    color: themeTokens.colors.textMuted,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  presetActive: {
    color: themeTokens.colors.text,
    fontWeight: '700',
  },
});
