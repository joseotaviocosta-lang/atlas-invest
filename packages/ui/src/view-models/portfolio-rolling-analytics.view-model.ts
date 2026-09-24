import { formatRatio, formatPercentage, formatDate } from '../formatters';
import { colors } from '../tokens/colors';
import { formatLocalDateDisplay } from './portfolio-performance.view-model';

/**
 * Rolling analytics view-model (3M, ADR-148).
 *
 * Presentation only: formats server-computed rolling series (volatility as a
 * percentage, Beta/Sharpe as unitless ratios), exposes window/metric selectors
 * and labels, and preserves null gaps. NEVER slices returns, computes variance,
 * covariance, beta, volatility, Sharpe or annualization — all rolling math is
 * server-side in @atlas/risk-engine.
 */

export type RollingMetric = 'VOLATILITY' | 'BETA' | 'SHARPE';

export const ROLLING_METRIC_OPTIONS: readonly { value: RollingMetric; label: string }[] = [
  { value: 'VOLATILITY', label: 'Volatilidade' },
  { value: 'BETA', label: 'Beta' },
  { value: 'SHARPE', label: 'Sharpe' },
];

export const ROLLING_WINDOW_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 20, label: '20 pregões' },
  { value: 60, label: '60 pregões' },
  { value: 120, label: '120 pregões' },
];

export const ROLLING_METRIC_TOOLTIPS: Record<RollingMetric, string> = {
  VOLATILITY:
    'Mostra como a volatilidade histórica anualizada da carteira variou usando uma janela móvel de observações.',
  BETA: 'Mostra como o beta histórico da carteira em relação ao Ibovespa variou ao longo do tempo usando uma janela móvel.',
  SHARPE:
    'Mostra como o índice de Sharpe histórico variou ao longo do tempo usando uma janela móvel e o CDI como referência.',
};

export interface RollingPointVM {
  date: string;
  dateDisplay: string;
  value: string | null;
  valueRaw: string | null;
  windowStartDisplay: string;
  observationCount: number;
  status: string;
  tooltip: string;
}

export interface RollingSeriesVM {
  window: number;
  status: string;
  points: RollingPointVM[];
  isAvailable: boolean;
  isEmpty: boolean;
}

export interface RollingCurrencyVM {
  currency: string;
  volatility: RollingSeriesVM;
  beta: RollingSeriesVM;
  sharpe: RollingSeriesVM;
  isIncompatibleCurrency: boolean;
}

export interface PortfolioRollingAnalyticsViewModel {
  period: { startDate: string; endDate: string; display: string };
  window: number;
  windowLabel: string;
  currencies: RollingCurrencyVM[];
  status: string;
  dataAvailability: string;
  isPartial: boolean;
  isUnavailable: boolean;
  statusLabel: string;
  statusColor: string;
  accessibilitySummary: string;
}

export interface RawRollingPointData {
  windowStartDate: string;
  endDate: string;
  observationCount: number;
  annualizedPercentage?: string | null;
  annualized?: string | null;
  beta?: string | null;
  status: string;
}

export interface RawRollingSeriesData {
  window: number;
  status: string;
  points: RawRollingPointData[];
}

export interface RawRollingCurrencyData {
  currency: string;
  rollingVolatility: RawRollingSeriesData;
  rollingSharpe: RawRollingSeriesData;
  rollingBeta: RawRollingSeriesData;
}

export interface RawRollingAnalyticsData {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  window: number;
  currencies: Record<string, RawRollingCurrencyData>;
  status: string;
  dataAvailability: string;
}

function windowLabel(window: number): string {
  return `${window} pregões`;
}

function mapSeries(
  raw: RawRollingSeriesData | undefined,
  window: number,
  metric: RollingMetric,
): RollingSeriesVM {
  if (!raw) {
    return { window, status: 'UNAVAILABLE', points: [], isAvailable: false, isEmpty: true };
  }
  const points: RollingPointVM[] = raw.points.map((p) => {
    const rawValue =
      metric === 'VOLATILITY'
        ? (p.annualizedPercentage ?? null)
        : metric === 'BETA'
          ? (p.beta ?? null)
          : (p.annualized ?? null);
    const formatted =
      rawValue === null
        ? '—'
        : metric === 'VOLATILITY'
          ? formatPercentage(rawValue)
          : formatRatio(rawValue);
    const metricLabel =
      metric === 'VOLATILITY' ? 'Volatilidade' : metric === 'BETA' ? 'Beta' : 'Sharpe';
    const dateDisplay = formatDate(p.endDate);
    return {
      date: p.endDate,
      dateDisplay,
      value: formatted,
      valueRaw: rawValue,
      windowStartDisplay: formatLocalDateDisplay(p.windowStartDate),
      observationCount: p.observationCount,
      status: p.status,
      tooltip: `${dateDisplay} • Janela: ${windowLabel(raw.window)} • ${metricLabel}: ${formatted}`,
    };
  });
  return {
    window: raw.window,
    status: raw.status,
    points,
    isAvailable: raw.status !== 'UNAVAILABLE' && points.some((p) => p.valueRaw !== null),
    isEmpty: points.length === 0,
  };
}

export function mapToPortfolioRollingAnalyticsViewModel(
  data: RawRollingAnalyticsData | null,
): PortfolioRollingAnalyticsViewModel | null {
  if (!data) return null;

  const currencies: RollingCurrencyVM[] = Object.values(data.currencies).map((c) => ({
    currency: c.currency,
    volatility: mapSeries(c.rollingVolatility, data.window, 'VOLATILITY'),
    beta: mapSeries(c.rollingBeta, data.window, 'BETA'),
    sharpe: mapSeries(c.rollingSharpe, data.window, 'SHARPE'),
    isIncompatibleCurrency: c.currency !== 'BRL',
  }));

  const isPartial = data.status === 'PARTIAL';
  const isUnavailable = data.status === 'UNAVAILABLE';

  let statusLabel = 'Séries históricas móveis. Valores históricos, não previsões.';
  let statusColor: string = colors.positive;
  if (isPartial) {
    statusLabel = 'Dados parciais para análise móvel.';
    statusColor = colors.warning;
  } else if (isUnavailable) {
    statusLabel = 'Histórico insuficiente para esta janela.';
    statusColor = colors.textMuted;
  }

  const periodDisplay = `${formatLocalDateDisplay(data.period.startDate)} → ${formatLocalDateDisplay(data.period.endDate)}`;
  const parts = currencies.map((c) => {
    if (c.isIncompatibleCurrency)
      return `${c.currency}: volatilidade ${c.volatility.points.length} pontos`;
    return (
      `${c.currency}: volatilidade ${c.volatility.points.length} pontos, ` +
      `Beta ${c.beta.points.length} pontos, Sharpe ${c.sharpe.points.length} pontos`
    );
  });
  const accessibilitySummary =
    parts.length > 0
      ? `Evolução do risco no período ${periodDisplay}, janela de ${windowLabel(data.window)}. ${parts.join('; ')}. Valores históricos, não previsões.`
      : `Histórico insuficiente para esta janela no período ${periodDisplay}.`;

  return {
    period: {
      startDate: data.period.startDate,
      endDate: data.period.endDate,
      display: periodDisplay,
    },
    window: data.window,
    windowLabel: windowLabel(data.window),
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

export function rollingAnalyticsQueryKey(
  portfolioId: string,
  startDate: string,
  endDate: string,
  window: number,
): readonly (string | number)[] {
  return ['portfolio-rolling-analytics', portfolioId, startDate, endDate, window] as const;
}
