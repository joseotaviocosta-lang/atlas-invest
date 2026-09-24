import { formatRatio } from '../formatters';
import { colors } from '../tokens/colors';
import { formatLocalDateDisplay } from './portfolio-performance.view-model';

/**
 * Portfolio Risk-Adjusted Metrics view-model (3J, ADR-133).
 *
 * Presentation only: formats server-computed Sharpe/Sortino ratio strings,
 * derives labels and accessibility text. NEVER computes excess returns,
 * means, variances, downside deviations, ratios or annualizations — all
 * risk-adjusted math is server-side in @atlas/risk-engine.
 *
 * Ratios are unitless: rendered via formatRatio ("1,24"), never with a
 * percent sign.
 */

export interface RiskAdjustedSharpeVM {
  observationCount: number;
  meanDailyExcessFormatted: string;
  dailyFormatted: string;
  annualizedFormatted: string;
  annualizationFactor: string;
  status: string;
}

export interface RiskAdjustedSortinoVM {
  observationCount: number;
  downsideObservationCount: number;
  downsideDeviationFormatted: string;
  dailyFormatted: string;
  annualizedFormatted: string;
  annualizationFactor: string;
  status: string;
}

export interface RiskAdjustedCurrencyVM {
  currency: string;
  frequency: string;
  status: string;
  dataAvailability: string;
  riskFreeProxy: string | null;
  riskFreeLabel: string;
  sharpe: RiskAdjustedSharpeVM | null;
  sortino: RiskAdjustedSortinoVM | null;
  isPartial: boolean;
  isUnavailable: boolean;
  isIncompatibleCurrency: boolean;
}

export interface PortfolioRiskAdjustedViewModel {
  period: { startDate: string; endDate: string; display: string };
  currencies: RiskAdjustedCurrencyVM[];
  status: string;
  dataAvailability: string;
  isPartial: boolean;
  isUnavailable: boolean;
  statusLabel: string;
  statusColor: string;
  accessibilitySummary: string;
}

export interface RawRiskAdjustedData {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  currencies: Record<
    string,
    {
      currency: string;
      frequency: string;
      status: string;
      dataAvailability: string;
      riskFreeProxy: string | null;
      sharpe: {
        observationCount: number;
        meanDailyExcessPercentage: string | null;
        daily: string | null;
        annualized: string | null;
        annualizationFactor: string;
        status: string;
      } | null;
      sortino: {
        observationCount: number;
        downsideObservationCount: number;
        downsideDeviationPercentage: string | null;
        daily: string | null;
        annualized: string | null;
        annualizationFactor: string;
        status: string;
      } | null;
    }
  >;
  status: string;
  dataAvailability: string;
}

export function mapToPortfolioRiskAdjustedViewModel(
  data: RawRiskAdjustedData | null,
): PortfolioRiskAdjustedViewModel | null {
  if (!data) return null;

  const currencies: RiskAdjustedCurrencyVM[] = Object.values(data.currencies).map((c) => {
    const isPartial = c.dataAvailability === 'PARTIAL' || c.status === 'PARTIAL';
    const isIncompatibleCurrency = c.riskFreeProxy === null;
    const isUnavailable =
      c.dataAvailability === 'UNAVAILABLE' ||
      c.status === 'INSUFFICIENT_DATA' ||
      (c.sharpe === null && c.sortino === null);
    return {
      currency: c.currency,
      frequency: c.frequency,
      status: c.status,
      dataAvailability: c.dataAvailability,
      riskFreeProxy: c.riskFreeProxy,
      riskFreeLabel: c.riskFreeProxy ? `Referência usada: ${c.riskFreeProxy}` : '',
      sharpe: c.sharpe
        ? {
            observationCount: c.sharpe.observationCount,
            meanDailyExcessFormatted: formatRatio(c.sharpe.meanDailyExcessPercentage),
            dailyFormatted: formatRatio(c.sharpe.daily),
            annualizedFormatted: formatRatio(c.sharpe.annualized),
            annualizationFactor: c.sharpe.annualizationFactor,
            status: c.sharpe.status,
          }
        : null,
      sortino: c.sortino
        ? {
            observationCount: c.sortino.observationCount,
            downsideObservationCount: c.sortino.downsideObservationCount,
            downsideDeviationFormatted: formatRatio(c.sortino.downsideDeviationPercentage),
            dailyFormatted: formatRatio(c.sortino.daily),
            annualizedFormatted: formatRatio(c.sortino.annualized),
            annualizationFactor: c.sortino.annualizationFactor,
            status: c.sortino.status,
          }
        : null,
      isPartial,
      isUnavailable,
      isIncompatibleCurrency,
    };
  });

  const isPartial = data.dataAvailability === 'PARTIAL' || data.status === 'PARTIAL';
  const isUnavailable =
    data.dataAvailability === 'UNAVAILABLE' || data.status === 'INSUFFICIENT_DATA';

  let statusLabel = 'Métricas históricas';
  let statusColor: string = colors.positive;
  if (isPartial) {
    statusLabel = 'Dados parciais para retorno ajustado ao risco.';
    statusColor = colors.warning;
  } else if (isUnavailable) {
    statusLabel = 'Histórico insuficiente para calcular Sharpe e Sortino.';
    statusColor = colors.textMuted;
  }

  const periodDisplay = `${formatLocalDateDisplay(data.period.startDate)} → ${formatLocalDateDisplay(data.period.endDate)}`;
  const parts = currencies.map((c) => {
    if (c.isIncompatibleCurrency) return `${c.currency}: indisponível sem referência compatível`;
    if (c.isUnavailable) return `${c.currency}: métricas indisponíveis`;
    return (
      `${c.currency}: Sharpe ${c.sharpe?.annualizedFormatted ?? '—'}, ` +
      `Sortino ${c.sortino?.annualizedFormatted ?? '—'}`
    );
  });
  const accessibilitySummary =
    parts.length > 0
      ? `Retorno ajustado ao risco no período ${periodDisplay}. ${parts.join('; ')}. Valores históricos, não previsões.`
      : `Histórico insuficiente para calcular Sharpe e Sortino no período ${periodDisplay}.`;

  return {
    period: {
      startDate: data.period.startDate,
      endDate: data.period.endDate,
      display: periodDisplay,
    },
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

export function riskAdjustedQueryKey(
  portfolioId: string,
  startDate: string,
  endDate: string,
): readonly string[] {
  return ['portfolio-risk-adjusted', portfolioId, startDate, endDate] as const;
}
