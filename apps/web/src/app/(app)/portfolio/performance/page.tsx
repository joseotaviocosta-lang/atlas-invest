'use client';

import React, { useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/api/client';
import { Card, Badge, Skeleton, EmptyState, ErrorState, Button, useToast } from '@/components/ui';
import { colors } from '@atlas/ui';
import {
  PortfolioShell,
  IngestionReceiptDto,
  formatUpdateReceiptFeedback,
} from '@/components/portfolio';
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
import { PerformanceSeriesChart } from '@/components/portfolio/PerformanceSeriesChart';
import { PortfolioRiskSection } from '@/components/portfolio/RiskMetricsSection';
import { RiskAdjustedSection } from '@/components/portfolio/RiskAdjustedSection';
import { RelativeRiskSection } from '@/components/portfolio/RelativeRiskSection';
import { ActivePerformanceSection } from '@/components/portfolio/ActivePerformanceSection';
import { RollingAnalyticsSection } from '@/components/portfolio/RollingAnalyticsSection';
import { TailRiskSection } from '@/components/portfolio/TailRiskSection';
import { ScenarioSection } from '@/components/portfolio/ScenarioSection';
import { IntelligenceSummarySection } from '@/components/portfolio/IntelligenceSummarySection';

function PerformancePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const portfolioIdParam = searchParams.get('portfolioId');
  const periodParam = (searchParams.get('period') as PerformancePeriodPreset) || '1Y';
  const customStart = searchParams.get('startDate') ?? undefined;
  const customEnd = searchParams.get('endDate') ?? undefined;
  const benchmarkParam = searchParams.get('benchmark') ?? '';

  const today = useMemo(() => getTodayLocalDateString(), []);

  // Fetch portfolios for selector
  const { data: rawPortfolios = [] } = useQuery<Array<{ id: string; name: string }>, ApiError>({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Array<{ id: string; name: string }> }>(
        '/api/v1/portfolios',
      );
      return res.data || [];
    },
    staleTime: 60000,
  });
  const portfolios: Array<{ id: string; name: string }> = Array.isArray(rawPortfolios)
    ? rawPortfolios
    : ((rawPortfolios as unknown as { data?: Array<{ id: string; name: string }> })?.data ?? []);

  const activePortfolioIdResolved =
    (portfolioIdParam && portfolios.some((p) => p.id === portfolioIdParam)
      ? portfolioIdParam
      : portfolios[0]?.id) ?? null;

  const activePortfolio = portfolios.find((p) => p.id === activePortfolioIdResolved) ?? null;

  const selectedPreset: PerformancePeriodPreset = PERFORMANCE_PERIOD_OPTIONS.some(
    (o) => o.value === periodParam,
  )
    ? periodParam
    : '1Y';

  const period = useMemo(() => {
    const p = getPeriodDates(selectedPreset, today, customStart, customEnd);
    return p ?? getPeriodDates('1Y', today, undefined, undefined)!;
  }, [selectedPreset, today, customStart, customEnd]);

  const selectedBenchmark = ['IBOV', 'CDI'].includes(benchmarkParam) ? benchmarkParam : '';
  const benchmarkQuery = selectedBenchmark ? `&benchmark=${selectedBenchmark}` : '';

  const { data, isLoading, isError, error, refetch } = useQuery<
    {
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
    },
    ApiError
  >({
    queryKey: activePortfolioIdResolved
      ? performanceQueryKey(
          activePortfolioIdResolved,
          period.startDate,
          period.endDate,
          selectedBenchmark,
        )
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
        `/api/v1/portfolios/${activePortfolioIdResolved}/performance?startDate=${period.startDate}&endDate=${period.endDate}${benchmarkQuery}`,
      ),
    enabled: !!activePortfolioIdResolved,
    staleTime: 30000,
  });

  const viewModel = useMemo(
    () => (data?.data ? mapToPortfolioPerformanceViewModel(data.data) : null),
    [data],
  );

  const seriesQuery = selectedBenchmark ? `&benchmark=${selectedBenchmark}` : '';
  const {
    data: seriesData,
    isLoading: isSeriesLoading,
    isError: isSeriesError,
    refetch: refetchSeries,
  } = useQuery<
    {
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
    },
    ApiError
  >({
    queryKey: activePortfolioIdResolved
      ? [
          ...performanceSeriesQueryKey(
            activePortfolioIdResolved,
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
        `/api/v1/portfolios/${activePortfolioIdResolved}/performance/series?startDate=${period.startDate}&endDate=${period.endDate}${seriesQuery}&granularity=AUTO`,
      ),
    enabled: !!activePortfolioIdResolved,
    staleTime: 30000,
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
  } = useQuery<{ data: RawRiskData }, ApiError>({
    queryKey: activePortfolioIdResolved
      ? [...riskQueryKey(activePortfolioIdResolved, period.startDate, period.endDate)]
      : ['portfolio-risk', 'none'],
    queryFn: () =>
      apiClient.get<{ data: RawRiskData }>(
        `/api/v1/portfolios/${activePortfolioIdResolved}/performance/risk?startDate=${period.startDate}&endDate=${period.endDate}`,
      ),
    enabled: !!activePortfolioIdResolved,
    staleTime: 30000,
  });

  const {
    data: riskAdjustedData,
    isLoading: isRiskAdjustedLoading,
    isError: isRiskAdjustedError,
    refetch: refetchRiskAdjusted,
  } = useQuery<{ data: RawRiskAdjustedData }, ApiError>({
    queryKey: activePortfolioIdResolved
      ? [...riskAdjustedQueryKey(activePortfolioIdResolved, period.startDate, period.endDate)]
      : ['portfolio-risk-adjusted', 'none'],
    queryFn: () =>
      apiClient.get<{ data: RawRiskAdjustedData }>(
        `/api/v1/portfolios/${activePortfolioIdResolved}/performance/risk-adjusted?startDate=${period.startDate}&endDate=${period.endDate}`,
      ),
    enabled: !!activePortfolioIdResolved,
    staleTime: 30000,
  });

  const effectiveRelativeBenchmark = selectedBenchmark === 'CDI' ? 'CDI' : 'IBOV';
  const {
    data: relativeRiskData,
    isLoading: isRelativeRiskLoading,
    isError: isRelativeRiskError,
    refetch: refetchRelativeRisk,
  } = useQuery<{ data: RawRelativeRiskData }, ApiError>({
    queryKey: activePortfolioIdResolved
      ? [
          ...relativeRiskQueryKey(
            activePortfolioIdResolved,
            period.startDate,
            period.endDate,
            effectiveRelativeBenchmark,
          ),
        ]
      : ['portfolio-relative-risk', 'none'],
    queryFn: () => {
      // Defaults to benchmark=IBOV when no specific benchmark is selected
      const benchmarkQueryParam = effectiveRelativeBenchmark || 'IBOV';
      return apiClient.get<{ data: RawRelativeRiskData }>(
        `/api/v1/portfolios/${activePortfolioIdResolved}/performance/relative-risk?startDate=${period.startDate}&endDate=${period.endDate}&benchmark=${benchmarkQueryParam}`,
      );
    },
    enabled: !!activePortfolioIdResolved,
    staleTime: 30000,
  });

  const {
    data: activePerformanceData,
    isLoading: isActivePerformanceLoading,
    isError: isActivePerformanceError,
    refetch: refetchActivePerformance,
  } = useQuery<{ data: RawActivePerformanceData }, ApiError>({
    queryKey: activePortfolioIdResolved
      ? [
          ...activePerformanceQueryKey(activePortfolioIdResolved, period.startDate, period.endDate),
          effectiveRelativeBenchmark,
        ]
      : ['portfolio-active-performance', 'none'],
    queryFn: () =>
      apiClient.get<{ data: RawActivePerformanceData }>(
        `/api/v1/portfolios/${activePortfolioIdResolved}/performance/active?startDate=${period.startDate}&endDate=${period.endDate}&benchmark=${effectiveRelativeBenchmark}`,
      ),
    enabled: !!activePortfolioIdResolved,
    staleTime: 30000,
  });

  const windowParam = searchParams.get('window');
  const rollingWindow = windowParam === '60' ? 60 : windowParam === '120' ? 120 : 20;

  const {
    data: rollingData,
    isLoading: isRollingLoading,
    isError: isRollingError,
    refetch: refetchRolling,
  } = useQuery<{ data: RawRollingAnalyticsData }, ApiError>({
    queryKey: activePortfolioIdResolved
      ? [
          ...rollingAnalyticsQueryKey(
            activePortfolioIdResolved,
            period.startDate,
            period.endDate,
            rollingWindow,
          ),
        ]
      : ['portfolio-rolling-analytics', 'none'],
    queryFn: () =>
      apiClient.get<{ data: RawRollingAnalyticsData }>(
        `/api/v1/portfolios/${activePortfolioIdResolved}/performance/rolling?startDate=${period.startDate}&endDate=${period.endDate}&window=${rollingWindow}`,
      ),
    enabled: !!activePortfolioIdResolved,
    staleTime: 30000,
  });

  const confidenceParam = searchParams.get('confidence');
  const tailConfidence = confidenceParam === '99' ? '99' : '95';

  const {
    data: tailRiskData,
    isLoading: isTailRiskLoading,
    isError: isTailRiskError,
    refetch: refetchTailRisk,
  } = useQuery<{ data: RawTailRiskData }, ApiError>({
    queryKey: activePortfolioIdResolved
      ? [
          ...tailRiskQueryKey(
            activePortfolioIdResolved,
            period.startDate,
            period.endDate,
            tailConfidence,
          ),
        ]
      : ['portfolio-tail-risk', 'none'],
    queryFn: () =>
      apiClient.get<{ data: RawTailRiskData }>(
        `/api/v1/portfolios/${activePortfolioIdResolved}/performance/tail-risk?startDate=${period.startDate}&endDate=${period.endDate}&confidenceLevel=${tailConfidence}`,
      ),
    enabled: !!activePortfolioIdResolved,
    staleTime: 30000,
  });

  const {
    data: intelligenceData,
    isLoading: isIntelligenceLoading,
    isError: isIntelligenceError,
    refetch: refetchIntelligence,
  } = useQuery<{ data: RawIntelligenceSummary }, ApiError>({
    queryKey: activePortfolioIdResolved
      ? [
          ...intelligenceSummaryQueryKey(
            activePortfolioIdResolved,
            period.startDate,
            period.endDate,
          ),
        ]
      : ['portfolio-intelligence-summary', 'none'],
    queryFn: () =>
      apiClient.get<{ data: RawIntelligenceSummary }>(
        `/api/v1/portfolios/${activePortfolioIdResolved}/intelligence/summary?startDate=${period.startDate}&endDate=${period.endDate}`,
      ),
    enabled: !!activePortfolioIdResolved,
    staleTime: 30000,
  });

  const handlePeriodChange = (preset: PerformancePeriodPreset) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', preset);
    if (preset !== 'CUSTOM') {
      params.delete('startDate');
      params.delete('endDate');
    }
    router.replace(`/portfolio/performance?${params.toString()}`);
  };

  const handleBenchmarkChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('benchmark', value);
    else params.delete('benchmark');
    router.replace(`/portfolio/performance?${params.toString()}`);
  };

  const handleWindowChange = (value: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('window', String(value));
    router.replace(`/portfolio/performance?${params.toString()}`);
  };

  const handleTailConfidenceChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('confidence', value);
    router.replace(`/portfolio/performance?${params.toString()}`);
  };

  const queryClient = useQueryClient();
  const { showToast } = useToast();

  interface BenchmarkIngestionReceiptDto {
    benchmarkId: string;
    provider: string;
    from: string;
    to: string;
    observationsFetched: number;
    observationsInserted: number;
    observationsUnchanged: number;
    observationsRevised: number;
    providerErrors: string[];
    status: 'COMPLETED' | 'COMPLETED_WITH_WARNINGS' | 'FAILED';
  }

  interface CombinedBackfillResult {
    portfolioReceipt: IngestionReceiptDto;
    benchmarkReceipt?: BenchmarkIngestionReceiptDto;
    benchmarkError?: string;
  }

  const formatCombinedReceiptFeedback = (
    result: CombinedBackfillResult,
    benchmarkId?: string,
  ): { message: string; variant: 'positive' | 'warning' | 'negative' } => {
    const portfolioFeedback = formatUpdateReceiptFeedback(result.portfolioReceipt);

    if (!benchmarkId) {
      return portfolioFeedback;
    }

    if (result.benchmarkError) {
      return {
        message: `${portfolioFeedback.message} Falha ao atualizar ${benchmarkId}: ${result.benchmarkError}`,
        variant: 'warning',
      };
    }

    if (!result.benchmarkReceipt) {
      return portfolioFeedback;
    }

    const b = result.benchmarkReceipt;
    const bInserted = b.observationsInserted ?? 0;
    const bUnchanged = b.observationsUnchanged ?? 0;
    const bRevised = b.observationsRevised ?? 0;
    const bTotal = bInserted + bRevised;

    let bMessage = '';
    if (bTotal > 0) {
      bMessage = `${benchmarkId}: ${bTotal} ${bTotal === 1 ? 'observação atualizada' : 'observações atualizadas'}.`;
    } else if (bUnchanged > 0) {
      bMessage = `${benchmarkId} já atualizado (${bUnchanged} ${bUnchanged === 1 ? 'observação mantida' : 'observações mantidas'}).`;
    } else {
      bMessage = `${benchmarkId}: nenhuma observação encontrada no período.`;
    }

    const combinedMessage = `${portfolioFeedback.message} ${bMessage}`;
    const variant =
      portfolioFeedback.variant === 'negative'
        ? 'negative'
        : b.status === 'COMPLETED_WITH_WARNINGS'
          ? 'warning'
          : portfolioFeedback.variant;

    return {
      message: combinedMessage,
      variant,
    };
  };

  const backfillMutation = useMutation({
    mutationFn: async (): Promise<CombinedBackfillResult> => {
      if (!activePortfolioIdResolved) throw new Error('Nenhuma carteira selecionada.');

      const portfolioPromise = apiClient.post<{
        data: IngestionReceiptDto;
      }>(`/api/v1/portfolios/${activePortfolioIdResolved}/market-data/backfill`, {
        from: period.startDate,
        to: period.endDate,
      });

      let benchmarkPromise: Promise<{ data: BenchmarkIngestionReceiptDto }> | null = null;
      if (selectedBenchmark === 'IBOV' || selectedBenchmark === 'CDI') {
        benchmarkPromise = apiClient.post<{
          data: BenchmarkIngestionReceiptDto;
        }>(`/api/v1/benchmarks/${selectedBenchmark}/update`, {
          from: period.startDate,
          to: period.endDate,
        });
      }

      if (!benchmarkPromise) {
        const portfolioRes = await portfolioPromise;
        return { portfolioReceipt: portfolioRes.data };
      }

      const [portfolioRes, benchmarkRes] = await Promise.all([
        portfolioPromise,
        benchmarkPromise.catch((err: ApiError | Error) => {
          return { error: err.message || 'Erro na obtenção do benchmark' };
        }),
      ]);

      if ('error' in benchmarkRes) {
        return {
          portfolioReceipt: portfolioRes.data,
          benchmarkError: benchmarkRes.error,
        };
      }

      return {
        portfolioReceipt: portfolioRes.data,
        benchmarkReceipt: benchmarkRes.data,
      };
    },
    onSuccess: (result) => {
      if (activePortfolioIdResolved) {
        queryClient.invalidateQueries({
          queryKey: ['portfolio-performance', activePortfolioIdResolved],
        });
        queryClient.invalidateQueries({
          queryKey: ['portfolio-performance-series', activePortfolioIdResolved],
        });
        queryClient.invalidateQueries({
          queryKey: ['portfolio-risk-metrics', activePortfolioIdResolved],
        });
        queryClient.invalidateQueries({
          queryKey: ['portfolio-relative-risk', activePortfolioIdResolved],
        });
        queryClient.invalidateQueries({
          queryKey: ['portfolio-active-performance', activePortfolioIdResolved],
        });
        queryClient.invalidateQueries({
          queryKey: ['portfolio-intelligence-summary', activePortfolioIdResolved],
        });
      }
      const feedback = formatCombinedReceiptFeedback(
        result,
        selectedBenchmark === 'IBOV' || selectedBenchmark === 'CDI' ? selectedBenchmark : undefined,
      );
      showToast(feedback.message, feedback.variant);
      refetch();
      refetchSeries();
      refetchRelativeRisk();
      refetchActivePerformance();
    },
    onError: (err: ApiError) => {
      showToast(err.message || 'Falha ao atualizar histórico de mercado.', 'negative');
    },
  });

  return (
    <PortfolioShell
      activeTab="returns"
      selectedPortfolioId={activePortfolioIdResolved}
      subtitle={
        activePortfolio
          ? `Retorno da carteira "${activePortfolio.name}" no período`
          : 'Retorno da carteira no período'
      }
      onSelectPortfolio={(id) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('portfolioId', id);
        router.replace(`/portfolio/performance?${params.toString()}`);
      }}
    >
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Período:</span>
          {PERFORMANCE_PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handlePeriodChange(opt.value)}
              aria-label={`Selecionar período ${opt.label}`}
              aria-pressed={selectedPreset === opt.value}
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                border: `1px solid ${selectedPreset === opt.value ? colors.accent : colors.border}`,
                background: selectedPreset === opt.value ? colors.accentSubtle : colors.surface,
                color: selectedPreset === opt.value ? colors.accent : colors.textSecondary,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: 32,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {viewModel && (
          <div style={{ marginTop: 8, fontSize: 13, color: colors.textSecondary }}>
            {viewModel.period.display}
          </div>
        )}
      </Card>

      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Benchmark:</span>
          <button
            onClick={() => handleBenchmarkChange('')}
            aria-label="Sem benchmark"
            aria-pressed={selectedBenchmark === ''}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              border: `1px solid ${selectedBenchmark === '' ? colors.accent : colors.border}`,
              background: selectedBenchmark === '' ? colors.accentSubtle : colors.surface,
              color: selectedBenchmark === '' ? colors.accent : colors.textSecondary,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 32,
            }}
          >
            Sem benchmark
          </button>
          <button
            onClick={() => handleBenchmarkChange('IBOV')}
            aria-label="Selecionar benchmark IBOV"
            aria-pressed={selectedBenchmark === 'IBOV'}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              border: `1px solid ${selectedBenchmark === 'IBOV' ? colors.accent : colors.border}`,
              background: selectedBenchmark === 'IBOV' ? colors.accentSubtle : colors.surface,
              color: selectedBenchmark === 'IBOV' ? colors.accent : colors.textSecondary,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 32,
            }}
          >
            IBOV
          </button>
          <button
            onClick={() => handleBenchmarkChange('CDI')}
            aria-label="Selecionar benchmark CDI"
            aria-pressed={selectedBenchmark === 'CDI'}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              border: `1px solid ${selectedBenchmark === 'CDI' ? colors.accent : colors.border}`,
              background: selectedBenchmark === 'CDI' ? colors.accentSubtle : colors.surface,
              color: selectedBenchmark === 'CDI' ? colors.accent : colors.textSecondary,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 32,
            }}
          >
            CDI
          </button>

          <div style={{ marginLeft: 'auto' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => backfillMutation.mutate()}
              disabled={backfillMutation.isPending || !activePortfolioIdResolved}
            >
              {backfillMutation.isPending ? 'Atualizando histórico...' : 'Atualizar histórico'}
            </Button>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Card style={{ padding: 16 }}>
          <Skeleton width="40%" height="1.5rem" style={{ marginBottom: 16 }} />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            {[1, 2].map((i) => (
              <Card key={i} style={{ minHeight: 120 }}>
                <Skeleton width="30%" height="1rem" style={{ marginBottom: 8 }} />
                <Skeleton width="60%" height="1.5rem" />
              </Card>
            ))}
          </div>
        </Card>
      ) : isError ? (
        <Card style={{ padding: 16 }}>
          <ErrorState
            message={error?.message || 'Não foi possível carregar a performance.'}
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
        <Card style={{ padding: 24, textAlign: 'center' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            Performance indisponível para este período.
          </h3>
          <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 16 }}>
            Não há preços históricos suficientes persistidos para calcular o retorno. Execute a
            atualização de histórico para sincronizar as cotações do período.
          </p>
          <Button
            variant="primary"
            onClick={() => backfillMutation.mutate()}
            disabled={backfillMutation.isPending || !activePortfolioIdResolved}
          >
            {backfillMutation.isPending ? 'Sincronizando cotações...' : 'Atualizar histórico agora'}
          </Button>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <IntelligenceSummarySection
            data={intelligenceData}
            isLoading={isIntelligenceLoading}
            isError={isIntelligenceError}
            onRetry={() => refetchIntelligence()}
            selectedBenchmark={selectedBenchmark}
          />

          {viewModel.isPartial && (
            <Card style={{ background: '#FFF7ED', borderColor: '#FDBA74', padding: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Badge variant="warning">Dados parciais</Badge>
                <span style={{ fontSize: 13, color: '#9A3412' }}>
                  Alguns preços históricos não estavam disponíveis. Os resultados abaixo usam apenas
                  os dados que puderam ser reconstruídos.
                </span>
              </div>
            </Card>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {viewModel.currencies.map((cur) => (
              <Card
                key={cur.currency}
                data-testid={`performance-${cur.currency}`}
                style={{ padding: 16 }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <strong>{cur.currency}</strong>
                  <Badge variant={cur.dataAvailability === 'AVAILABLE' ? 'positive' : 'warning'}>
                    {cur.dataAvailability}
                  </Badge>
                </div>

                <div style={{ display: 'grid', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>TWR</span>
                      <span
                        role="img"
                        aria-label="TWR mede o desempenho da carteira reduzindo o efeito do momento dos aportes e retiradas."
                        title="TWR mede o desempenho da carteira reduzindo o efeito do momento dos aportes e retiradas."
                        style={{ cursor: 'help', fontSize: 12 }}
                      >
                        ⓘ
                      </span>
                    </div>
                    <div
                      data-testid={`twr-${cur.currency}`}
                      style={{
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        color:
                          cur.twrFormatted === '—'
                            ? colors.textMuted
                            : cur.isPositiveTwr
                              ? colors.positive
                              : cur.isPositiveTwr === false
                                ? colors.negative
                                : colors.textPrimary,
                      }}
                    >
                      {cur.twrFormatted}
                    </div>
                    <div style={{ fontSize: 12, color: colors.textSecondary }}>
                      Retorno da carteira desconsiderando o efeito de aportes e retiradas.
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>XIRR</span>
                      <span
                        role="img"
                        aria-label="XIRR considera o valor e a data de cada aporte e retirada para estimar o retorno anualizado do investidor."
                        title="XIRR considera o valor e a data de cada aporte e retirada para estimar o retorno anualizado do investidor."
                        style={{ cursor: 'help', fontSize: 12 }}
                      >
                        ⓘ
                      </span>
                    </div>
                    <div
                      data-testid={`xirr-${cur.currency}`}
                      style={{
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        color:
                          cur.xirrFormatted === '—'
                            ? colors.textMuted
                            : cur.isPositiveXirr
                              ? colors.positive
                              : cur.isPositiveXirr === false
                                ? colors.negative
                                : colors.textPrimary,
                      }}
                    >
                      {cur.xirrFormatted}
                      {cur.xirrFormatted !== '—' ? ' a.a.' : ''}
                    </div>
                    <div style={{ fontSize: 12, color: colors.textSecondary }}>
                      Retorno considerando quando o dinheiro entrou e saiu.
                    </div>
                  </div>

                  {(selectedBenchmark === 'IBOV' || selectedBenchmark === 'CDI') && (
                    <div style={{ paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
                      {cur.currency === 'BRL' ? (
                        (() => {
                          const bench = (
                            cur as unknown as {
                              benchmark?: {
                                id?: string;
                                return: string | null;
                                status: string;
                                dataAvailability?: string;
                              } | null;
                              differencePercentagePoints?: string | null;
                            }
                          ).benchmark;
                          const diff = (
                            cur as unknown as { differencePercentagePoints?: string | null }
                          ).differencePercentagePoints;
                          const isCdi = selectedBenchmark === 'CDI';
                          if (!bench || bench.return === null) {
                            const msg =
                              bench?.status === 'PARTIAL'
                                ? 'Comparação parcial'
                                : 'Benchmark indisponível para este período.';
                            return (
                              <div style={{ fontSize: 12, color: colors.textSecondary }}>
                                {isCdi ? 'CDI indisponível para este período.' : msg}
                              </div>
                            );
                          }
                          const isPositiveDiff = diff
                            ? !diff.startsWith('-') && diff !== '0'
                            : null;
                          const benchLabel = isCdi ? 'CDI' : 'Ibovespa';
                          const benchTooltip = isCdi
                            ? 'O CDI é uma referência de taxas de juros de curtíssimo prazo no mercado brasileiro.'
                            : 'O Ibovespa é um índice de referência do mercado acionário brasileiro.';
                          const partialNote =
                            bench.status === 'PARTIAL' || bench.dataAvailability === 'PARTIAL';
                          return (
                            <>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginBottom: 4,
                                }}
                              >
                                <span style={{ fontSize: 12, fontWeight: 600 }}>{benchLabel}</span>
                                <span title={benchTooltip} style={{ cursor: 'help', fontSize: 12 }}>
                                  ⓘ
                                </span>
                              </div>
                              {partialNote && (
                                <div style={{ fontSize: 11, color: '#9A3412', marginBottom: 4 }}>
                                  Comparação parcial
                                </div>
                              )}
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  fontSize: 13,
                                }}
                              >
                                <span>{benchLabel}</span>
                                <span data-testid={`benchmark-${cur.currency}`}>
                                  {bench.return ? `${bench.return}%` : '—'}
                                </span>
                              </div>
                              {diff && (
                                <div
                                  data-testid={`difference-${cur.currency}`}
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: isPositiveDiff
                                      ? colors.positive
                                      : isPositiveDiff === false
                                        ? colors.negative
                                        : colors.textPrimary,
                                  }}
                                >
                                  {diff.startsWith('-') ? '' : '+'}
                                  {diff} {isCdi ? 'p.p. vs. CDI' : 'p.p. vs. IBOV'}
                                </div>
                              )}
                              <div style={{ fontSize: 11, color: colors.textSecondary }}>
                                A comparação usa o TWR da carteira no mesmo período.
                              </div>
                            </>
                          );
                        })()
                      ) : (
                        <div style={{ fontSize: 12, color: colors.textSecondary }}>
                          Sem benchmark compatível nesta fase.
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    style={{
                      fontSize: 12,
                      color: colors.textSecondary,
                      paddingTop: 8,
                      borderTop: `1px solid ${colors.border}`,
                    }}
                  >
                    Período: {viewModel.period.display} • {viewModel.statusLabel}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Card style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: colors.textSecondary }}>
              <strong>Nota:</strong> TWR e XIRR são conceitos distintos e normalmente apresentam
              valores diferentes. TWR isola o efeito de mercado; XIRR pondera o timing do seu
              dinheiro.
            </div>
          </Card>

          <Card style={{ padding: 16 }} data-testid="performance-series-section">
            <div style={{ marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                Histórico de performance
              </h3>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>
                Retorno acumulado normalizado para 0,00% no início do período.
              </div>
            </div>
            {isSeriesLoading ? (
              <div>
                <Skeleton width="100%" height="300px" />
              </div>
            ) : isSeriesError ? (
              <div style={{ fontSize: 13, color: colors.textSecondary }}>
                Não foi possível carregar o histórico de performance.
                <div style={{ marginTop: 8 }}>
                  <Button variant="secondary" size="sm" onClick={() => refetchSeries()}>
                    Tentar novamente
                  </Button>
                </div>
              </div>
            ) : !seriesViewModel || seriesViewModel.isUnavailable ? (
              <EmptyState
                title="Histórico insuficiente para montar o gráfico."
                description="Não há valuations históricos suficientes neste período. O resumo de TWR/XIRR acima continua válido."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {seriesViewModel.isPartial && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Badge variant="warning">Série parcial</Badge>
                    <span style={{ fontSize: 12, color: colors.textSecondary }}>
                      Alguns pontos usam valuations parciais.
                    </span>
                  </div>
                )}
                {seriesViewModel.currencies.map((cur) =>
                  cur.isUnavailable ? (
                    <EmptyState
                      key={cur.currency}
                      title="Histórico insuficiente para montar o gráfico."
                      description={`Sem série disponível para ${cur.currency} neste período.`}
                    />
                  ) : (
                    <div key={cur.currency}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 8,
                        }}
                      >
                        <strong>{cur.currency}</strong>
                        <span style={{ fontSize: 12, color: colors.textSecondary }}>
                          {cur.granularity} • {cur.points.length} pontos
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 16,
                          fontSize: 12,
                          color: colors.textSecondary,
                          marginBottom: 8,
                        }}
                      >
                        <span>
                          <span
                            style={{
                              display: 'inline-block',
                              width: 16,
                              height: 3,
                              background: colors.accent,
                              verticalAlign: 'middle',
                              marginRight: 4,
                            }}
                          />
                          Carteira
                        </span>
                        {cur.benchmarkId && (
                          <span>
                            <span
                              style={{
                                display: 'inline-block',
                                width: 16,
                                height: 0,
                                borderTop: `2px dashed ${colors.textSecondary}`,
                                verticalAlign: 'middle',
                                marginRight: 4,
                              }}
                            />
                            {cur.benchmarkName}
                          </span>
                        )}
                      </div>
                      <PerformanceSeriesChart series={cur} height={320} />
                    </div>
                  ),
                )}
              </div>
            )}
          </Card>

          <PortfolioRiskSection
            data={riskData}
            isLoading={isRiskLoading}
            isError={isRiskError}
            onRetry={() => refetchRisk()}
          />

          <RiskAdjustedSection
            data={riskAdjustedData}
            isLoading={isRiskAdjustedLoading}
            isError={isRiskAdjustedError}
            onRetry={() => refetchRiskAdjusted()}
          />

          <RelativeRiskSection
            data={relativeRiskData}
            isLoading={isRelativeRiskLoading}
            isError={isRelativeRiskError}
            onRetry={() => refetchRelativeRisk()}
          />

          <ActivePerformanceSection
            data={activePerformanceData}
            isLoading={isActivePerformanceLoading}
            isError={isActivePerformanceError}
            onRetry={() => refetchActivePerformance()}
          />

          <RollingAnalyticsSection
            data={rollingData}
            isLoading={isRollingLoading}
            isError={isRollingError}
            onRetry={() => refetchRolling()}
            window={rollingWindow}
            onWindowChange={handleWindowChange}
          />

          <TailRiskSection
            data={tailRiskData}
            isLoading={isTailRiskLoading}
            isError={isTailRiskError}
            onRetry={() => refetchTailRisk()}
            confidenceLevel={tailConfidence}
            onConfidenceChange={handleTailConfidenceChange}
          />

          <ScenarioSection portfolioId={activePortfolioIdResolved} />
        </div>
      )}
    </PortfolioShell>
  );
}

export default function PerformancePage() {
  return (
    <Suspense fallback={<Skeleton width="100%" height="200px" />}>
      <PerformancePageContent />
    </Suspense>
  );
}
