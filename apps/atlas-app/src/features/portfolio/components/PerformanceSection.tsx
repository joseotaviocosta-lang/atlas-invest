import React, { useState, useMemo } from 'react';
import { usePortfolio } from '../../../providers/PortfolioProvider';
import { usePortfolioPerformance, usePortfolioPerformanceSeries } from '../hooks';
import { PerformanceSeriesChart } from './PerformanceSeriesChart';
import { Card, StatCard, Skeleton, EmptyState } from '../../../components/ui';
import {
  colors,
  borderRadius,
  formatPercentage,
  mapToPortfolioPerformanceSeriesViewModel,
  PerformancePeriodPreset,
} from '@atlas/ui';

const PERIODS: Array<{ label: string; value: PerformancePeriodPreset }> = [
  { label: '1 Mês', value: '1M' },
  { label: '3 Meses', value: '3M' },
  { label: '6 Meses', value: '6M' },
  { label: 'No Ano (YTD)', value: 'YTD' },
  { label: '1 Ano', value: '1Y' },
  { label: 'Início', value: 'INCEPTION' },
];

export const PerformanceSection: React.FC = () => {
  const { selectedPortfolioId } = usePortfolio();
  const [selectedPeriod, setSelectedPeriod] = useState<PerformancePeriodPreset>('1Y');
  const [selectedBenchmark, setSelectedBenchmark] = useState<'CDI' | 'IBOV' | ''>('CDI');

  const {
    data: perfRes,
    isLoading: isPerfLoading,
    isError: isPerfError,
  } = usePortfolioPerformance(selectedPortfolioId, selectedPeriod, selectedBenchmark || undefined);

  const {
    data: seriesRes,
    isLoading: isSeriesLoading,
  } = usePortfolioPerformanceSeries(selectedPortfolioId, selectedPeriod, selectedBenchmark || undefined);

  const seriesVM = useMemo(() => {
    if (!seriesRes?.data) return null;
    try {
      return mapToPortfolioPerformanceSeriesViewModel(seriesRes.data);
    } catch {
      return null;
    }
  }, [seriesRes]);

  if (isPerfLoading && isSeriesLoading) {
    return (
      <Card>
        <Skeleton height={280} />
      </Card>
    );
  }

  if (isPerfError || !perfRes?.data) {
    return (
      <Card>
        <EmptyState
          title="Rentabilidade Indisponível"
          description="Não foi possível calcular o retorno da carteira para o período selecionado."
        />
      </Card>
    );
  }

  const { currencies } = perfRes.data;
  const currencyKeys = Object.keys(currencies);
  const primaryCurrency = currencyKeys[0] ?? 'BRL';
  const metric = currencies[primaryCurrency];

  const primarySeries = seriesVM?.currencies?.find((c) => c.currency === primaryCurrency) ?? seriesVM?.currencies?.[0];

  const twrFormatted = metric?.twr ? formatPercentage(metric.twr, { showSign: true }) : null;
  const xirrFormatted = metric?.xirr ? formatPercentage(metric.xirr, { showSign: true }) : null;
  const benchmarkReturnFormatted = metric?.benchmark?.return
    ? formatPercentage(metric.benchmark.return, { showSign: true })
    : null;
  const diffFormatted = metric?.differencePercentagePoints
    ? formatPercentage(metric.differencePercentagePoints, { showSign: true })
    : null;

  const isTwrPositive = metric?.twr && !metric.twr.startsWith('-') && metric.twr !== '0';
  const isTwrNegative = metric?.twr && metric.twr.startsWith('-');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Controls header */}
      <Card style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          {/* Period selector chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginRight: '4px' }}>Período:</span>
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setSelectedPeriod(p.value)}
                style={{
                  padding: '5px 12px',
                  borderRadius: `${borderRadius.md}px`,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: selectedPeriod === p.value ? `1px solid ${colors.accent}` : `1px solid ${colors.border}`,
                  backgroundColor: selectedPeriod === p.value ? `${colors.accent}20` : colors.surfaceElevated,
                  color: selectedPeriod === p.value ? colors.accent : colors.textSecondary,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Benchmark selector chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginRight: '4px' }}>Benchmark:</span>
            {(['CDI', 'IBOV', ''] as const).map((b) => (
              <button
                key={b || 'none'}
                type="button"
                onClick={() => setSelectedBenchmark(b)}
                style={{
                  padding: '5px 12px',
                  borderRadius: `${borderRadius.md}px`,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: selectedBenchmark === b ? `1px solid ${colors.accent}` : `1px solid ${colors.border}`,
                  backgroundColor: selectedBenchmark === b ? `${colors.accent}20` : colors.surfaceElevated,
                  color: selectedBenchmark === b ? colors.accent : colors.textSecondary,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {b || 'Nenhum'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Metric Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <StatCard
          label="Retorno Ponderado (TWR)"
          value={twrFormatted}
          subValue="Métrica pura de alocação"
          changeType={isTwrPositive ? 'positive' : isTwrNegative ? 'negative' : 'neutral'}
          isPlaceholder={!twrFormatted}
        />
        <StatCard
          label="Taxa Interna de Retorno (XIRR)"
          value={xirrFormatted}
          subValue="Ponderado por fluxos e aportes"
          changeType={isTwrPositive ? 'positive' : isTwrNegative ? 'negative' : 'neutral'}
          isPlaceholder={!xirrFormatted}
        />
        {selectedBenchmark && (
          <StatCard
            label={`Benchmark (${selectedBenchmark})`}
            value={benchmarkReturnFormatted}
            subValue={diffFormatted ? `Alfa: ${diffFormatted}` : undefined}
            changeType={diffFormatted && !diffFormatted.startsWith('-') ? 'positive' : 'negative'}
            isPlaceholder={!benchmarkReturnFormatted}
          />
        )}
      </div>

      {/* SVG Performance Chart */}
      <Card>
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 600, color: colors.textPrimary }}>
            Evolução Acumulada
          </h4>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: colors.textSecondary }}>
            Curva de rentabilidade ponderada no tempo versus benchmark oficial
          </p>
        </div>

        {primarySeries && primarySeries.points.length > 0 ? (
          <PerformanceSeriesChart series={primarySeries} height={300} />
        ) : (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: colors.textSecondary, fontSize: '0.875rem' }}>
            Dados de série temporal indisponíveis para este período.
          </div>
        )}
      </Card>
    </div>
  );
};
