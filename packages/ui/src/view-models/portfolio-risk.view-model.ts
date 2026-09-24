import { formatPercentage } from '../formatters';
import { colors } from '../tokens/colors';
import { formatLocalDateDisplay } from './portfolio-performance.view-model';

/**
 * Portfolio Risk Metrics view-model (3I, ADR-127).
 *
 * Presentation only: formats server-computed risk strings, derives labels
 * and accessibility text. NEVER computes volatility, variance, means,
 * square roots, annualization, drawdowns, peaks, troughs or recoveries —
 * all risk math is server-side in @atlas/risk-engine.
 */

export interface RiskVolatilityVM {
  frequency: string;
  observationCount: number;
  sampleFormatted: string;
  annualizedFormatted: string;
  annualizationFactor: string;
  status: string;
}

export interface RiskDrawdownVM {
  maximumFormatted: string;
  peakDisplay: string | null;
  troughDisplay: string | null;
  recoveryDisplay: string | null;
  isRecovered: boolean;
  currentFormatted: string;
  status: string;
}

export interface RiskCurrencyVM {
  currency: string;
  frequency: string;
  status: string;
  dataAvailability: string;
  volatility: RiskVolatilityVM;
  drawdown: RiskDrawdownVM;
  isPartial: boolean;
  isUnavailable: boolean;
}

export interface PortfolioRiskViewModel {
  period: { startDate: string; endDate: string; display: string };
  currencies: RiskCurrencyVM[];
  status: string;
  dataAvailability: string;
  isPartial: boolean;
  isUnavailable: boolean;
  statusLabel: string;
  statusColor: string;
  accessibilitySummary: string;
}

export interface RawRiskData {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  currencies: Record<
    string,
    {
      currency: string;
      frequency: string;
      status: string;
      dataAvailability: string;
      volatility: {
        frequency: string;
        observationCount: number;
        samplePercentage: string | null;
        annualizedPercentage: string | null;
        annualizationFactor: string;
        status: string;
      };
      drawdown: {
        maximumPercentage: string | null;
        peakDate: string | null;
        troughDate: string | null;
        recoveryDate: string | null;
        currentPercentage: string | null;
        status: string;
      };
    }
  >;
  status: string;
  dataAvailability: string;
}

function formatRiskValue(value: string | null): string {
  if (value === null) return '—';
  return formatPercentage(value);
}

export function mapToPortfolioRiskViewModel(
  data: RawRiskData | null,
): PortfolioRiskViewModel | null {
  if (!data) return null;

  const currencies: RiskCurrencyVM[] = Object.values(data.currencies).map((c) => {
    const isPartial = c.dataAvailability === 'PARTIAL' || c.status === 'PARTIAL';
    const isUnavailable =
      c.dataAvailability === 'UNAVAILABLE' ||
      c.status === 'INSUFFICIENT_DATA' ||
      (c.volatility.annualizedPercentage === null && c.drawdown.maximumPercentage === null);
    return {
      currency: c.currency,
      frequency: c.frequency,
      status: c.status,
      dataAvailability: c.dataAvailability,
      volatility: {
        frequency: c.volatility.frequency,
        observationCount: c.volatility.observationCount,
        sampleFormatted: formatRiskValue(c.volatility.samplePercentage),
        annualizedFormatted: formatRiskValue(c.volatility.annualizedPercentage),
        annualizationFactor: c.volatility.annualizationFactor,
        status: c.volatility.status,
      },
      drawdown: {
        maximumFormatted: formatRiskValue(c.drawdown.maximumPercentage),
        peakDisplay: c.drawdown.peakDate ? formatLocalDateDisplay(c.drawdown.peakDate) : null,
        troughDisplay: c.drawdown.troughDate ? formatLocalDateDisplay(c.drawdown.troughDate) : null,
        recoveryDisplay: c.drawdown.recoveryDate
          ? formatLocalDateDisplay(c.drawdown.recoveryDate)
          : null,
        isRecovered: c.drawdown.recoveryDate !== null,
        currentFormatted: formatRiskValue(c.drawdown.currentPercentage),
        status: c.drawdown.status,
      },
      isPartial,
      isUnavailable,
    };
  });

  const isPartial = data.dataAvailability === 'PARTIAL' || data.status === 'PARTIAL';
  const isUnavailable =
    data.dataAvailability === 'UNAVAILABLE' || data.status === 'INSUFFICIENT_DATA';

  let statusLabel = 'Métricas históricas';
  let statusColor: string = colors.positive;
  if (isPartial) {
    statusLabel = 'Dados parciais para métricas de risco.';
    statusColor = colors.warning;
  } else if (isUnavailable) {
    statusLabel = 'Histórico insuficiente para calcular métricas de risco.';
    statusColor = colors.textMuted;
  }

  const periodDisplay = `${formatLocalDateDisplay(data.period.startDate)} → ${formatLocalDateDisplay(data.period.endDate)}`;
  const parts = currencies.map((c) => {
    if (c.isUnavailable) return `${c.currency}: métricas indisponíveis`;
    return (
      `${c.currency}: volatilidade anualizada ${c.volatility.annualizedFormatted}, ` +
      `máxima queda ${c.drawdown.maximumFormatted}, queda atual ${c.drawdown.currentFormatted}`
    );
  });
  const accessibilitySummary =
    parts.length > 0
      ? `Métricas históricas de risco no período ${periodDisplay}. ${parts.join('; ')}. Valores históricos, não previsões.`
      : `Histórico insuficiente para calcular métricas de risco no período ${periodDisplay}.`;

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

export function riskQueryKey(
  portfolioId: string,
  startDate: string,
  endDate: string,
): readonly string[] {
  return ['portfolio-risk', portfolioId, startDate, endDate] as const;
}
