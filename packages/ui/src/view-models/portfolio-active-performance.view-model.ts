import { formatRatio, formatPercentage } from '../formatters';
import { colors } from '../tokens/colors';
import { formatLocalDateDisplay } from './portfolio-performance.view-model';

/**
 * Active performance view-model (3L, ADR-143).
 *
 * Presentation only: formats server-computed Jensen Alpha (percentage),
 * Information Ratio (unitless ratio) and Treynor (percentage-per-beta) strings,
 * per currency. NEVER computes expected CAPM return, alpha, active returns,
 * information ratio, tracking error or excess-per-beta — all active-performance
 * math is server-side in @atlas/risk-engine.
 */

export interface ActivePerformanceAlphaVM {
  periodFormatted: string;
}

export interface ActivePerformanceInformationRatioVM {
  observationCount: number;
  dailyFormatted: string;
  annualizedFormatted: string;
}

export interface ActivePerformanceTreynorVM {
  periodFormatted: string;
}

export interface ActivePerformanceCurrencyVM {
  currency: string;
  status: string;
  isPartial: boolean;
  isUnavailable: boolean;
  isIncompatibleCurrency: boolean;
  alpha: ActivePerformanceAlphaVM | null;
  informationRatio: ActivePerformanceInformationRatioVM | null;
  treynor: ActivePerformanceTreynorVM | null;
}

export interface PortfolioActivePerformanceViewModel {
  period: { startDate: string; endDate: string; display: string };
  marketBenchmarkLabel: string;
  riskFreeLabel: string;
  currencies: ActivePerformanceCurrencyVM[];
  status: string;
  dataAvailability: string;
  isPartial: boolean;
  isUnavailable: boolean;
  statusLabel: string;
  statusColor: string;
  accessibilitySummary: string;
}

export interface RawActivePerformanceCurrencyData {
  currency: string;
  status: string;
  alpha: { periodPercentage: string | null } | null;
  informationRatio: {
    observationCount: number;
    daily: string | null;
    annualized: string | null;
  } | null;
  treynor: { periodPercentagePerBeta: string | null } | null;
}

export interface RawActivePerformanceData {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  marketBenchmark: string;
  riskFreeProxy: string;
  currencies: Record<string, RawActivePerformanceCurrencyData>;
  status: string;
  dataAvailability: string;
}

const BENCHMARK_NAMES: Record<string, string> = { IBOV: 'Ibovespa' };

export function mapToPortfolioActivePerformanceViewModel(
  data: RawActivePerformanceData | null,
): PortfolioActivePerformanceViewModel | null {
  if (!data) return null;

  const benchmarkName = BENCHMARK_NAMES[data.marketBenchmark] ?? data.marketBenchmark;
  const marketBenchmarkLabel = `Benchmark de mercado: ${benchmarkName}`;
  const riskFreeLabel = `Referência usada: ${data.riskFreeProxy}`;

  const currencies: ActivePerformanceCurrencyVM[] = Object.values(data.currencies).map((c) => {
    const isIncompatibleCurrency = c.currency !== 'BRL';
    const isPartial = !isIncompatibleCurrency && c.status === 'PARTIAL';
    const isUnavailable =
      !isIncompatibleCurrency &&
      (c.status === 'UNAVAILABLE' ||
        (c.alpha === null && c.informationRatio === null && c.treynor === null));
    return {
      currency: c.currency,
      status: c.status,
      isPartial,
      isUnavailable,
      isIncompatibleCurrency,
      alpha: c.alpha
        ? { periodFormatted: formatPercentage(c.alpha.periodPercentage, { showSign: true }) }
        : null,
      informationRatio: c.informationRatio
        ? {
            observationCount: c.informationRatio.observationCount,
            dailyFormatted: formatRatio(c.informationRatio.daily),
            annualizedFormatted: formatRatio(c.informationRatio.annualized),
          }
        : null,
      treynor: c.treynor
        ? { periodFormatted: formatPercentage(c.treynor.periodPercentagePerBeta) }
        : null,
    };
  });

  const isPartial = data.dataAvailability === 'PARTIAL' || data.status === 'PARTIAL';
  const isUnavailable = data.dataAvailability === 'UNAVAILABLE' || data.status === 'UNAVAILABLE';

  let statusLabel = 'Métricas históricas de desempenho ativo. Valores históricos, não previsões.';
  let statusColor: string = colors.positive;
  if (isPartial) {
    statusLabel = 'Dados parciais para métricas de desempenho ativo.';
    statusColor = colors.warning;
  } else if (isUnavailable) {
    statusLabel = 'Histórico insuficiente para calcular métricas de desempenho ativo.';
    statusColor = colors.textMuted;
  }

  const periodDisplay = `${formatLocalDateDisplay(data.period.startDate)} → ${formatLocalDateDisplay(data.period.endDate)}`;
  const parts = currencies.map((c) => {
    if (c.isIncompatibleCurrency) return `${c.currency}: indisponível sem referências compatíveis`;
    if (c.isUnavailable) return `${c.currency}: métricas indisponíveis`;
    return (
      `${c.currency}: Alpha ${c.alpha?.periodFormatted ?? '—'}, ` +
      `Information Ratio ${c.informationRatio?.annualizedFormatted ?? '—'}, ` +
      `Treynor ${c.treynor?.periodFormatted ?? '—'}`
    );
  });
  const accessibilitySummary =
    parts.length > 0
      ? `Desempenho ativo no período ${periodDisplay}. ${parts.join('; ')}. Benchmark de mercado ${benchmarkName}, referência ${data.riskFreeProxy}. Valores históricos, não previsões.`
      : `Histórico insuficiente para calcular métricas de desempenho ativo no período ${periodDisplay}.`;

  return {
    period: {
      startDate: data.period.startDate,
      endDate: data.period.endDate,
      display: periodDisplay,
    },
    marketBenchmarkLabel,
    riskFreeLabel,
    currencies,
    status: data.status,
    dataAvailability: data.dataAvailability,
    isPartial,
    isUnavailable,
    statusLabel,
    statusColor,
    accessibilitySummary,
  };
}

export function activePerformanceQueryKey(
  portfolioId: string,
  startDate: string,
  endDate: string,
): readonly string[] {
  return ['portfolio-active-performance', portfolioId, startDate, endDate] as const;
}
