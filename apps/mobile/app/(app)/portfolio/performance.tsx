import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Card, Header, Screen, EmptyState, ErrorState } from '@/components/ui';
import { colors } from '@atlas/ui';
import {
  mapToPortfolioPerformanceViewModel,
  mapToPortfolioPerformanceSeriesViewModel,
  getPeriodDates,
  performanceQueryKey,
  performanceSeriesQueryKey,
  riskQueryKey,
  riskAdjustedQueryKey,
  relativeRiskQueryKey,
  activePerformanceQueryKey,
  rollingAnalyticsQueryKey,
  tailRiskQueryKey,
  intelligenceSummaryQueryKey,
  getTodayLocalDateString,
  PERFORMANCE_PERIOD_OPTIONS,
  PerformancePeriodPreset,
  RawRiskData,
  RawRiskAdjustedData,
  RawRelativeRiskData,
  RawActivePerformanceData,
  RawRollingAnalyticsData,
  RawTailRiskData,
  RawIntelligenceSummary,
} from '@atlas/ui';
import { MobilePerformanceSeriesChart } from '@/components/portfolio/PerformanceSeriesChart';
import { MobileRiskSection } from '@/components/portfolio/MobileRiskSection';
import { MobileRiskAdjustedSection } from '@/components/portfolio/MobileRiskAdjustedSection';
import { MobileRelativeRiskSection } from '@/components/portfolio/MobileRelativeRiskSection';
import { MobileActivePerformanceSection } from '@/components/portfolio/MobileActivePerformanceSection';
import { MobileRollingAnalyticsSection } from '@/components/portfolio/MobileRollingAnalyticsSection';
import { MobileTailRiskSection } from '@/components/portfolio/MobileTailRiskSection';
import { MobileScenarioSection } from '@/components/portfolio/MobileScenarioSection';
import { MobileIntelligenceSummarySection } from '@/components/portfolio/MobileIntelligenceSummarySection';

export default function MobilePerformanceScreen() {
  const router = useRouter();
  const [selectedPreset, setSelectedPreset] = useState<PerformancePeriodPreset>('1Y');
  const [selectedBenchmark, setSelectedBenchmark] = useState<string>('');
  const [rollingWindow, setRollingWindow] = useState<number>(20);
  const [tailConfidence, setTailConfidence] = useState<string>('95');
  const today = useMemo(() => getTodayLocalDateString(), []);

  const { data: portfoliosData } = useQuery<{ data: Array<{ id: string; name: string }> }>({
    queryKey: ['portfolios'],
    queryFn: () =>
      apiClient.get<{ data: Array<{ id: string; name: string }> }>('/api/v1/portfolios'),
  });
  const portfolios = portfoliosData?.data ?? [];
  const portfolioId = portfolios[0]?.id ?? null;

  const period = useMemo(() => {
    const p = getPeriodDates(selectedPreset, today, undefined, undefined);
    return p ?? getPeriodDates('1Y', today, undefined, undefined)!;
  }, [selectedPreset, today]);

  const benchmarkQuery = selectedBenchmark ? `&benchmark=${selectedBenchmark}` : '';
  const { data, isLoading, isError, refetch } = useQuery<{
    data: {
      portfolioId: string;
      period: { startDate: string; endDate: string };
      currencies: Record<
        string,
        {
          currency: string;
          twr: string | null;
          xirr: string | null;
          twrStatus: string;
          xirrStatus: string;
          status: string;
          dataAvailability: string;
          benchmark?: {
            id: string;
            name: string;
            currency: string;
            type: string;
            return: string | null;
            status: string;
            dataAvailability: string;
            observationCount?: number;
          } | null;
          differencePercentagePoints?: string | null;
        }
      >;
      status: string;
      dataAvailability: string;
    };
  }>({
    queryKey: portfolioId
      ? performanceQueryKey(portfolioId, period.startDate, period.endDate, selectedBenchmark)
      : ['portfolio-performance', 'none'],
    queryFn: () =>
      apiClient.get<{
        data: {
          portfolioId: string;
          period: { startDate: string; endDate: string };
          currencies: Record<
            string,
            {
              currency: string;
              twr: string | null;
              xirr: string | null;
              twrStatus: string;
              xirrStatus: string;
              status: string;
              dataAvailability: string;
              benchmark?: {
                id: string;
                name: string;
                currency: string;
                type: string;
                return: string | null;
                status: string;
                dataAvailability: string;
              } | null;
              differencePercentagePoints?: string | null;
            }
          >;
          status: string;
          dataAvailability: string;
        };
      }>(
        `/api/v1/portfolios/${portfolioId}/performance?startDate=${period.startDate}&endDate=${period.endDate}${benchmarkQuery}`,
      ),
    enabled: !!portfolioId,
  });

  const viewModel = useMemo(
    () => (data?.data ? mapToPortfolioPerformanceViewModel(data.data) : null),
    [data],
  );

  const {
    data: seriesData,
    isLoading: isSeriesLoading,
    isError: isSeriesError,
    refetch: refetchSeries,
  } = useQuery<{
    data: {
      portfolioId: string;
      period: { startDate: string; endDate: string };
      requestedGranularity: string;
      currencies: Record<
        string,
        {
          currency: string;
          granularity: string;
          status: string;
          dataAvailability: string;
          benchmark?: {
            id: string;
            name: string;
            currency: string;
            type: string;
            status: string;
            dataAvailability: string;
          } | null;
          points: Array<{
            date: string;
            portfolioReturn: string | null;
            benchmarkReturn: string | null;
            status: string;
          }>;
        }
      >;
      status: string;
      dataAvailability: string;
    };
  }>({
    queryKey: portfolioId
      ? [
          ...performanceSeriesQueryKey(
            portfolioId,
            period.startDate,
            period.endDate,
            selectedBenchmark,
            'AUTO',
          ),
        ]
      : ['portfolio-performance-series', 'none'],
    queryFn: () =>
      apiClient.get<{
        data: {
          portfolioId: string;
          period: { startDate: string; endDate: string };
          requestedGranularity: string;
          currencies: Record<
            string,
            {
              currency: string;
              granularity: string;
              status: string;
              dataAvailability: string;
              benchmark?: {
                id: string;
                name: string;
                currency: string;
                type: string;
                status: string;
                dataAvailability: string;
              } | null;
              points: Array<{
                date: string;
                portfolioReturn: string | null;
                benchmarkReturn: string | null;
                status: string;
              }>;
            }
          >;
          status: string;
          dataAvailability: string;
        };
      }>(
        `/api/v1/portfolios/${portfolioId}/performance/series?startDate=${period.startDate}&endDate=${period.endDate}${benchmarkQuery}&granularity=AUTO`,
      ),
    enabled: !!portfolioId,
  });

  const seriesViewModel = useMemo(
    () => (seriesData?.data ? mapToPortfolioPerformanceSeriesViewModel(seriesData.data) : null),
    [seriesData],
  );

  const {
    data: riskData,
    isLoading: isRiskLoading,
    isError: isRiskError,
    refetch: refetchRisk,
  } = useQuery<{ data: RawRiskData }>({
    queryKey: portfolioId
      ? [...riskQueryKey(portfolioId, period.startDate, period.endDate)]
      : ['portfolio-risk', 'none'],
    queryFn: () =>
      apiClient.get<{ data: RawRiskData }>(
        `/api/v1/portfolios/${portfolioId}/performance/risk?startDate=${period.startDate}&endDate=${period.endDate}`,
      ),
    enabled: !!portfolioId,
  });

  const {
    data: riskAdjustedData,
    isLoading: isRiskAdjustedLoading,
    isError: isRiskAdjustedError,
    refetch: refetchRiskAdjusted,
  } = useQuery<{ data: RawRiskAdjustedData }>({
    queryKey: portfolioId
      ? [...riskAdjustedQueryKey(portfolioId, period.startDate, period.endDate)]
      : ['portfolio-risk-adjusted', 'none'],
    queryFn: () =>
      apiClient.get<{ data: RawRiskAdjustedData }>(
        `/api/v1/portfolios/${portfolioId}/performance/risk-adjusted?startDate=${period.startDate}&endDate=${period.endDate}`,
      ),
    enabled: !!portfolioId,
  });

  const {
    data: relativeRiskData,
    isLoading: isRelativeRiskLoading,
    isError: isRelativeRiskError,
    refetch: refetchRelativeRisk,
  } = useQuery<{ data: RawRelativeRiskData }>({
    queryKey: portfolioId
      ? [...relativeRiskQueryKey(portfolioId, period.startDate, period.endDate, 'IBOV')]
      : ['portfolio-relative-risk', 'none'],
    queryFn: () =>
      apiClient.get<{ data: RawRelativeRiskData }>(
        `/api/v1/portfolios/${portfolioId}/performance/relative-risk?startDate=${period.startDate}&endDate=${period.endDate}&benchmark=IBOV`,
      ),
    enabled: !!portfolioId,
  });

  const {
    data: activePerformanceData,
    isLoading: isActivePerformanceLoading,
    isError: isActivePerformanceError,
    refetch: refetchActivePerformance,
  } = useQuery<{ data: RawActivePerformanceData }>({
    queryKey: portfolioId
      ? [...activePerformanceQueryKey(portfolioId, period.startDate, period.endDate)]
      : ['portfolio-active-performance', 'none'],
    queryFn: () =>
      apiClient.get<{ data: RawActivePerformanceData }>(
        `/api/v1/portfolios/${portfolioId}/performance/active?startDate=${period.startDate}&endDate=${period.endDate}`,
      ),
    enabled: !!portfolioId,
  });

  const {
    data: rollingData,
    isLoading: isRollingLoading,
    isError: isRollingError,
    refetch: refetchRolling,
  } = useQuery<{ data: RawRollingAnalyticsData }>({
    queryKey: portfolioId
      ? [...rollingAnalyticsQueryKey(portfolioId, period.startDate, period.endDate, rollingWindow)]
      : ['portfolio-rolling-analytics', 'none'],
    queryFn: () =>
      apiClient.get<{ data: RawRollingAnalyticsData }>(
        `/api/v1/portfolios/${portfolioId}/performance/rolling?startDate=${period.startDate}&endDate=${period.endDate}&window=${rollingWindow}`,
      ),
    enabled: !!portfolioId,
  });

  const {
    data: tailRiskData,
    isLoading: isTailRiskLoading,
    isError: isTailRiskError,
    refetch: refetchTailRisk,
  } = useQuery<{ data: RawTailRiskData }>({
    queryKey: portfolioId
      ? [...tailRiskQueryKey(portfolioId, period.startDate, period.endDate, tailConfidence)]
      : ['portfolio-tail-risk', 'none'],
    queryFn: () =>
      apiClient.get<{ data: RawTailRiskData }>(
        `/api/v1/portfolios/${portfolioId}/performance/tail-risk?startDate=${period.startDate}&endDate=${period.endDate}&confidenceLevel=${tailConfidence}`,
      ),
    enabled: !!portfolioId,
  });

  const {
    data: intelligenceData,
    isLoading: isIntelligenceLoading,
    isError: isIntelligenceError,
    refetch: refetchIntelligence,
  } = useQuery<{ data: RawIntelligenceSummary }>({
    queryKey: portfolioId
      ? [
          ...intelligenceSummaryQueryKey(
            portfolioId,
            period.startDate,
            period.endDate,
            selectedBenchmark,
          ),
        ]
      : ['portfolio-intelligence-summary', 'none'],
    queryFn: () => {
      const benchmarkParam = selectedBenchmark
        ? `&benchmark=${selectedBenchmark}`
        : '&benchmark=none';
      return apiClient.get<{ data: RawIntelligenceSummary }>(
        `/api/v1/portfolios/${portfolioId}/intelligence/summary?startDate=${period.startDate}&endDate=${period.endDate}${benchmarkParam}`,
      );
    },
    enabled: !!portfolioId,
  });

  return (
    <Screen>
      <Header title="Performance" subtitle="Retorno no período" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PERFORMANCE_PERIOD_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => setSelectedPreset(opt.value)}
              accessibilityLabel={`Selecionar período ${opt.label}`}
              accessibilityRole="button"
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: selectedPreset === opt.value ? colors.accent : colors.border,
                backgroundColor:
                  selectedPreset === opt.value ? colors.accentSubtle : colors.surface,
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: selectedPreset === opt.value ? colors.accent : colors.textSecondary,
                }}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {[
            { label: 'Sem benchmark', value: '' },
            { label: 'IBOV', value: 'IBOV' },
            { label: 'CDI', value: 'CDI' },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.value || 'none'}
              onPress={() => setSelectedBenchmark(opt.value)}
              accessibilityLabel={opt.value ? `Selecionar benchmark ${opt.value}` : 'Sem benchmark'}
              accessibilityRole="button"
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: selectedBenchmark === opt.value ? colors.accent : colors.border,
                backgroundColor:
                  selectedBenchmark === opt.value ? colors.accentSubtle : colors.surface,
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: selectedBenchmark === opt.value ? colors.accent : colors.textSecondary,
                }}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading ? (
          <Card style={{ padding: 16 }}>
            <ActivityIndicator />
          </Card>
        ) : isError ? (
          <Card style={{ padding: 16 }}>
            <ErrorState
              message="Não foi possível carregar a performance."
              onRetry={() => refetch()}
            />
          </Card>
        ) : !viewModel ? (
          <Card style={{ padding: 16 }}>
            <EmptyState
              title="Selecione uma carteira"
              description="Escolha uma carteira para ver sua performance."
            />
          </Card>
        ) : viewModel.isUnavailable ? (
          <Card style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>
              Performance indisponível para este período.
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
              Não há preços históricos suficientes. Tente um período menor.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 16 }}>
            <MobileIntelligenceSummarySection
              data={intelligenceData}
              isLoading={isIntelligenceLoading}
              isError={isIntelligenceError}
              onRetry={() => refetchIntelligence()}
              selectedBenchmark={selectedBenchmark}
            />
            {viewModel.isPartial && (
              <Card style={{ backgroundColor: '#FFF7ED', borderColor: '#FDBA74', padding: 12 }}>
                <Text style={{ fontSize: 12, color: '#9A3412' }}>
                  Alguns preços históricos não estavam disponíveis. Resultados parciais.
                </Text>
              </Card>
            )}
            {viewModel.currencies.map((cur) => {
              const curWithBench = cur as unknown as {
                benchmark?: {
                  id?: string;
                  return: string | null;
                  status: string;
                  dataAvailability?: string;
                } | null;
                differencePercentagePoints?: string | null;
              };
              const bench = curWithBench.benchmark;
              const diff = curWithBench.differencePercentagePoints;
              const isCdi = selectedBenchmark === 'CDI';
              return (
                <Card key={cur.currency} style={{ padding: 16, gap: 12 }}>
                  <Text style={{ fontWeight: '700' }}>{cur.currency}</Text>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600' }}>TWR</Text>
                    <Text
                      style={{
                        fontSize: 20,
                        fontWeight: '700',
                        color:
                          cur.twrFormatted === '—'
                            ? colors.textMuted
                            : cur.isPositiveTwr
                              ? colors.positive
                              : colors.negative,
                      }}
                    >
                      {cur.twrFormatted}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                      Retorno da carteira desconsiderando o efeito de aportes e retiradas.
                    </Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600' }}>XIRR</Text>
                    <Text
                      style={{
                        fontSize: 20,
                        fontWeight: '700',
                        color:
                          cur.xirrFormatted === '—'
                            ? colors.textMuted
                            : cur.isPositiveXirr
                              ? colors.positive
                              : colors.negative,
                      }}
                    >
                      {cur.xirrFormatted}
                      {cur.xirrFormatted !== '—' ? ' a.a.' : ''}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                      Seu retorno considerando quando o dinheiro entrou e saiu.
                    </Text>
                  </View>
                  {(selectedBenchmark === 'IBOV' || selectedBenchmark === 'CDI') && (
                    <View
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                        paddingTop: 8,
                        gap: 4,
                      }}
                    >
                      {cur.currency !== 'BRL' ? (
                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                          Sem benchmark compatível nesta fase.
                        </Text>
                      ) : !bench || bench.return === null ? (
                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                          {isCdi
                            ? 'CDI indisponível para este período.'
                            : 'Benchmark indisponível para este período.'}
                        </Text>
                      ) : (
                        <>
                          <Text style={{ fontSize: 12, fontWeight: '600' }}>
                            {isCdi ? 'CDI' : 'Ibovespa'}
                          </Text>
                          {(bench.status === 'PARTIAL' || bench.dataAvailability === 'PARTIAL') && (
                            <Text style={{ fontSize: 11, color: '#9A3412' }}>
                              Comparação parcial
                            </Text>
                          )}
                          <Text style={{ fontSize: 13 }}>
                            {isCdi ? 'CDI' : 'Ibovespa'} {bench.return}%
                          </Text>
                          {diff && (
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: '600',
                                color: diff.startsWith('-') ? colors.negative : colors.positive,
                              }}
                            >
                              {diff.startsWith('-') ? '' : '+'}
                              {diff} {isCdi ? 'p.p. vs. CDI' : 'p.p. vs. IBOV'}
                            </Text>
                          )}
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                            {isCdi
                              ? 'O CDI é uma referência de taxas de juros de curtíssimo prazo no mercado brasileiro.'
                              : 'A comparação usa o TWR da carteira no mesmo período.'}
                          </Text>
                        </>
                      )}
                    </View>
                  )}
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    Período: {viewModel.period.display} • {viewModel.statusLabel}
                  </Text>
                </Card>
              );
            })}
            <Card style={{ padding: 16, gap: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: '700' }}>Histórico de performance</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                Retorno acumulado normalizado para 0,00% no início do período.
              </Text>
              {isSeriesLoading ? (
                <ActivityIndicator accessibilityLabel="Carregando histórico de performance" />
              ) : isSeriesError ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                    Não foi possível carregar o histórico de performance.
                  </Text>
                  <TouchableOpacity
                    onPress={() => refetchSeries()}
                    accessibilityRole="button"
                    accessibilityLabel="Tentar carregar histórico novamente"
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      minWidth: 44,
                      minHeight: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: colors.accent, fontWeight: '600' }}>
                      Tentar novamente
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : !seriesViewModel || seriesViewModel.isUnavailable ? (
                <EmptyState
                  title="Histórico insuficiente para montar o gráfico."
                  description="Sem série disponível neste período."
                />
              ) : (
                <View style={{ gap: 16 }}>
                  {seriesViewModel.isPartial && (
                    <Text
                      style={{ fontSize: 12, color: '#9A3412' }}
                      accessibilityLabel="Série parcial"
                    >
                      Série parcial — alguns pontos usam valuations parciais.
                    </Text>
                  )}
                  {seriesViewModel.currencies.map((cur) =>
                    cur.isUnavailable ? (
                      <EmptyState
                        key={cur.currency}
                        title="Histórico insuficiente para montar o gráfico."
                        description={`Sem série disponível para ${cur.currency}.`}
                      />
                    ) : (
                      <View key={cur.currency} style={{ gap: 8 }}>
                        <Text style={{ fontWeight: '700' }}>{cur.currency}</Text>
                        <MobilePerformanceSeriesChart series={cur} />
                      </View>
                    ),
                  )}
                </View>
              )}
            </Card>
            <MobileRiskSection
              data={riskData}
              isLoading={isRiskLoading}
              isError={isRiskError}
              onRetry={() => refetchRisk()}
            />
            <MobileRiskAdjustedSection
              data={riskAdjustedData}
              isLoading={isRiskAdjustedLoading}
              isError={isRiskAdjustedError}
              onRetry={() => refetchRiskAdjusted()}
            />
            <MobileRelativeRiskSection
              data={relativeRiskData}
              isLoading={isRelativeRiskLoading}
              isError={isRelativeRiskError}
              onRetry={() => refetchRelativeRisk()}
            />
            <MobileActivePerformanceSection
              data={activePerformanceData}
              isLoading={isActivePerformanceLoading}
              isError={isActivePerformanceError}
              onRetry={() => refetchActivePerformance()}
            />
            <MobileRollingAnalyticsSection
              data={rollingData}
              isLoading={isRollingLoading}
              isError={isRollingError}
              onRetry={() => refetchRolling()}
              window={rollingWindow}
              onWindowChange={setRollingWindow}
            />
            <MobileTailRiskSection
              data={tailRiskData}
              isLoading={isTailRiskLoading}
              isError={isTailRiskError}
              onRetry={() => refetchTailRisk()}
              confidenceLevel={tailConfidence}
              onConfidenceChange={setTailConfidence}
            />
            <MobileScenarioSection portfolioId={portfolioId} />
          </View>
        )}

        <TouchableOpacity
          onPress={() => router.back()}
          style={{ padding: 12, alignItems: 'center' }}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Text style={{ color: colors.accent, fontWeight: '600' }}>← Voltar</Text>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}
