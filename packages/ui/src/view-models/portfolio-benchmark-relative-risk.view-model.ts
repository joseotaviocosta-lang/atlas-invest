import { formatRatio, formatPercentage } from '../formatters';
import { colors } from '../tokens/colors';
import { formatLocalDateDisplay } from './portfolio-performance.view-model';

/**
 * Benchmark-relative risk view-model (3K, ADR-138).
 *
 * Presentation only: formats server-computed Beta/Correlation ratio strings and
 * the annualized tracking-error percentage. NEVER computes covariance,
 * variance, beta, correlation, active returns, tracking error or interval
 * alignment — all relative-risk math is server-side in @atlas/risk-engine.
 *
 * Beta and Correlation are unitless RATIOS ("0,87"), never percentages.
 * Tracking error is a percentage ("12,06%").
 */

export interface RelativeRiskCurrencyVM {
  currency: string;
  status: string;
  benchmarkLabel: string;
  betaFormatted: string;
  correlationFormatted: string;
  trackingErrorFormatted: string;
  observationCount: number;
  isPartial: boolean;
  isUnavailable: boolean;
  isIncompatibleCurrency: boolean;
}

export interface PortfolioBenchmarkRelativeRiskViewModel {
  period: { startDate: string; endDate: string; display: string };
  benchmarkName: string;
  benchmarkLabel: string;
  currencies: RelativeRiskCurrencyVM[];
  status: string;
  dataAvailability: string;
  isPartial: boolean;
  isUnavailable: boolean;
  statusLabel: string;
  statusColor: string;
  accessibilitySummary: string;
}

export interface RawRelativeRiskData {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  benchmark: { id: string; name: string; currency: string };
  currencies: Record<
    string,
    {
      currency: string;
      status: string;
      alignment: {
        portfolioIntervalCount: number;
        benchmarkIntervalCount: number;
        pairedObservationCount: number;
        droppedPortfolioIntervalCount: number;
        droppedBenchmarkIntervalCount: number;
      } | null;
      beta: string | null;
      correlation: string | null;
      trackingError: {
        frequency: string;
        observationCount: number;
        samplePercentage: string | null;
        annualizedPercentage: string | null;
        annualizationFactor: string;
        status: string;
      } | null;
    }
  >;
  status: string;
  dataAvailability: string;
}

export function mapToPortfolioBenchmarkRelativeRiskViewModel(
  data: RawRelativeRiskData | null,
): PortfolioBenchmarkRelativeRiskViewModel | null {
  if (!data) return null;

  const benchmarkName = data.benchmark?.name ?? 'Ibovespa';
  const benchmarkLabel = `Referência: ${benchmarkName}`;

  const currencies: RelativeRiskCurrencyVM[] = Object.values(data.currencies).map((c) => {
    const isIncompatibleCurrency = c.currency !== 'BRL';
    const isPartial = !isIncompatibleCurrency && c.status === 'PARTIAL';
    const isUnavailable =
      !isIncompatibleCurrency &&
      (c.status === 'UNAVAILABLE' ||
        (c.beta === null && c.correlation === null && c.trackingError === null));
    return {
      currency: c.currency,
      status: c.status,
      benchmarkLabel,
      betaFormatted: formatRatio(c.beta),
      correlationFormatted: formatRatio(c.correlation),
      trackingErrorFormatted: formatPercentage(c.trackingError?.annualizedPercentage),
      observationCount:
        c.trackingError?.observationCount ?? c.alignment?.pairedObservationCount ?? 0,
      isPartial,
      isUnavailable,
      isIncompatibleCurrency,
    };
  });

  const isPartial = data.dataAvailability === 'PARTIAL' || data.status === 'PARTIAL';
  const isUnavailable =
    data.dataAvailability === 'UNAVAILABLE' || data.status === 'INSUFFICIENT_DATA';

  let statusLabel = `Métricas históricas relativas ao ${benchmarkName}.`;
  let statusColor: string = colors.positive;
  if (isPartial) {
    statusLabel = `Dados parciais para comparação com o ${benchmarkName}.`;
    statusColor = colors.warning;
  } else if (isUnavailable) {
    statusLabel = `Histórico insuficiente para calcular métricas relativas ao ${benchmarkName}.`;
    statusColor = colors.textMuted;
  }

  const periodDisplay = `${formatLocalDateDisplay(data.period.startDate)} → ${formatLocalDateDisplay(data.period.endDate)}`;
  const parts = currencies.map((c) => {
    if (c.isIncompatibleCurrency) return `${c.currency}: indisponível sem benchmark compatível`;
    if (c.isUnavailable) return `${c.currency}: métricas indisponíveis`;
    return (
      `${c.currency}: Beta ${c.betaFormatted}, ` +
      `Correlação ${c.correlationFormatted}, ` +
      `Tracking error ${c.trackingErrorFormatted}`
    );
  });
  const accessibilitySummary =
    parts.length > 0
      ? `Relação com o mercado no período ${periodDisplay}, referência ${benchmarkName}. ${parts.join('; ')}. Valores históricos, não previsões.`
      : `Histórico insuficiente para calcular métricas relativas ao ${benchmarkName} no período ${periodDisplay}.`;

  return {
    period: {
      startDate: data.period.startDate,
      endDate: data.period.endDate,
      display: periodDisplay,
    },
    benchmarkName,
    benchmarkLabel,
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

export function relativeRiskQueryKey(
  portfolioId: string,
  startDate: string,
  endDate: string,
  benchmark: string,
): readonly string[] {
  return ['portfolio-relative-risk', portfolioId, startDate, endDate, benchmark] as const;
}
