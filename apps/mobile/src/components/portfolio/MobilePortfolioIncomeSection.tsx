import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  themeTokens,
  describeIncomeLimitation,
  describePositionTransactionType,
  formatPlanMonthLong,
  formatScenarioBp,
  formatScenarioMoney,
} from '@atlas/ui';
import { Card } from '../ui/Card';
import { portfoliosApi } from '../../api/portfolios';

interface IncomeCurrencyTotalView {
  currency: string;
  dividends: string;
  jcp: string;
  fiiIncome: string;
  total: string;
  eventCount: number;
}

interface PortfolioIncomeData {
  portfolioId: string;
  generatedAt: string;
  marketDataAsOf: string | null;
  period: { startDate: string; endDate: string; months: string[] };
  inceptionDate: string | null;
  totalsByCurrency: IncomeCurrencyTotalView[];
  timeline: Array<{ month: string; totals: IncomeCurrencyTotalView[] }>;
  byPosition: Array<{
    assetId: string;
    ticker: string | null;
    currency: string;
    total: string;
    eventCount: number;
    isOpen: boolean;
    hasDetail: boolean;
    rank: number;
    shareBp: string | null;
  }>;
  concentration: Array<{
    currency: string;
    largest: {
      assetId: string;
      ticker: string | null;
      total: string;
      shareBp: string | null;
    } | null;
    top3ShareBp: string | null;
    top3: Array<{
      assetId: string;
      ticker: string | null;
      total: string;
      shareBp: string | null;
      rank: number;
    }>;
  }>;
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
  const lastDay = new Date(year, month, 0).getDate();
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(Math.min(Number(dayRaw), lastDay))}`;
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

function shareBpLabel(shareBp: string | null): string {
  if (shareBp === null) return '—';
  const parsed = Number(shareBp);
  return formatScenarioBp(Number.isSafeInteger(parsed) ? parsed : null);
}

/**
 * Phase 5R-D (mobile) — portfolio income, read-only.
 * Totals by type, monthly timeline, factual by-position list and
 * neutral concentration facts. Text only; tables carry the facts.
 */
export function MobilePortfolioIncomeSection({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const today = useMemo(() => {
    const now = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }, []);
  const [preset, setPreset] = useState<PeriodPreset>('1A');
  const [inceptionAnchor, setInceptionAnchor] = useState<string | null>(null);

  const range = periodRange(preset, today, inceptionAnchor);
  const incomeQuery = useQuery({
    queryKey: ['portfolio-income', portfolioId, preset, range.start ?? '', range.end],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (range.start) params.set('startDate', range.start);
      params.set('endDate', range.end);
      const res = await portfoliosApi.getPortfolioIncome(portfolioId, params.toString());
      return res.data as PortfolioIncomeData;
    },
    enabled: Boolean(portfolioId),
    staleTime: 30_000,
    retry: false,
  });

  const data = incomeQuery.data ?? null;
  if (data && data.inceptionDate && data.inceptionDate !== inceptionAnchor) {
    setInceptionAnchor(data.inceptionDate);
  }

  return (
    <View testID="portfolio-income">
      <Card style={styles.card}>
        <Text style={styles.sectionHeading}>RENDA</Text>
        <Text style={styles.lede}>
          Rendimentos registrados no período — dividendos, JCP e rendimentos de FII. Valores
          históricos, sem projeção.
        </Text>
        <View style={styles.presetRow}>
          {PERIOD_PRESETS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setPreset(option.value)}
              accessibilityRole="button"
              accessibilityLabel={`Ver renda de ${option.label}`}
              accessibilityState={{ selected: preset === option.value }}
              testID={`income-period-${option.value}`}
            >
              <Text style={[styles.preset, preset === option.value && styles.presetActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {incomeQuery.isLoading ? (
          <Text style={styles.muted}>Carregando renda…</Text>
        ) : incomeQuery.isError || !data ? (
          <Text style={styles.muted}>Não foi possível carregar a renda da carteira.</Text>
        ) : data.totalsByCurrency.length === 0 ? (
          <Text style={styles.muted}>Sem rendimentos no período.</Text>
        ) : (
          <View>
            {data.totalsByCurrency.map((row) => (
              <View key={row.currency} testID={`income-total-${row.currency}`}>
                <Text style={styles.subHeading}>Renda no período ({row.currency})</Text>
                <Text style={styles.row}>
                  {describePositionTransactionType('DIVIDEND')}:{' '}
                  {formatScenarioMoney(row.dividends, row.currency)}
                </Text>
                <Text style={styles.row}>
                  {describePositionTransactionType('JCP')}:{' '}
                  {formatScenarioMoney(row.jcp, row.currency)}
                </Text>
                <Text style={styles.row}>
                  {describePositionTransactionType('FII_INCOME')}:{' '}
                  {formatScenarioMoney(row.fiiIncome, row.currency)}
                </Text>
                <Text style={styles.total}>
                  Total: {formatScenarioMoney(row.total, row.currency)}
                </Text>
              </View>
            ))}

            <Text style={styles.subHeading}>Renda por mês</Text>
            <View testID="income-timeline">
              {data.timeline.map((bucket) => (
                <View key={bucket.month} testID={`income-month-${bucket.month}`}>
                  <Text style={styles.month}>{formatPlanMonthLong(bucket.month)}</Text>
                  {bucket.totals.length === 0 ? (
                    <Text style={styles.muted}>Sem rendimentos neste mês.</Text>
                  ) : (
                    bucket.totals.map((row) => (
                      <Text key={row.currency} style={styles.row}>
                        {row.currency}: {formatScenarioMoney(row.total, row.currency)}
                      </Text>
                    ))
                  )}
                </View>
              ))}
            </View>

            <Text style={styles.subHeading}>Renda por posição</Text>
            <View testID="income-by-position">
              {data.byPosition.map((row) => (
                <Pressable
                  key={`${row.currency}-${row.assetId}`}
                  onPress={
                    row.hasDetail
                      ? () =>
                          router.push(
                            `/(app)/portfolio/${row.assetId}?portfolioId=${portfolioId}` as never,
                          )
                      : undefined
                  }
                  accessibilityRole={row.hasDetail ? 'button' : undefined}
                  accessibilityLabel={
                    row.hasDetail ? `Ver posição ${row.ticker ?? row.assetId}` : undefined
                  }
                  testID={`income-position-${row.assetId}`}
                >
                  <Text style={styles.row}>
                    {row.ticker ?? 'Posição encerrada'}
                    {!row.isOpen && row.ticker ? ' (encerrada)' : ''} —{' '}
                    {formatScenarioMoney(row.total, row.currency)} ({shareBpLabel(row.shareBp)})
                  </Text>
                </Pressable>
              ))}
            </View>

            {data.concentration.map((block) => (
              <View key={block.currency} testID={`income-concentration-${block.currency}`}>
                <Text style={styles.subHeading}>Concentração da renda ({block.currency})</Text>
                {block.largest ? (
                  <Text style={styles.row}>
                    Maior participação: {block.largest.ticker ?? block.largest.assetId} —{' '}
                    {shareBpLabel(block.largest.shareBp)}
                    {block.top3ShareBp !== null && block.top3.length > 1
                      ? `; 3 maiores posições: ${shareBpLabel(block.top3ShareBp)}`
                      : ''}
                  </Text>
                ) : (
                  <Text style={styles.muted}>Sem concentração a reportar.</Text>
                )}
              </View>
            ))}

            {data.limitations.map((code) => (
              <Text key={code} style={styles.muted} testID={`income-limitation-${code}`}>
                {describeIncomeLimitation(code)}
              </Text>
            ))}
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
  month: { fontSize: 12, fontWeight: '600', color: themeTokens.colors.text, marginTop: 8 },
  row: { fontSize: 13, color: themeTokens.colors.text, marginVertical: 2 },
  total: { fontSize: 13, fontWeight: '700', color: themeTokens.colors.text, marginTop: 4 },
  muted: { fontSize: 12, color: themeTokens.colors.textMuted, marginVertical: 4 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  preset: {
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    color: themeTokens.colors.textMuted,
  },
  presetActive: { fontWeight: '700', color: themeTokens.colors.text },
});
