import { formatPercentage } from '../formatters';
import { colors } from '../tokens/colors';
import { formatLocalDateDisplay } from './portfolio-performance.view-model';

/**
 * Downside & tail risk view-model (3N, ADR-153).
 *
 * Presentation only: formats server-computed downside deviation, semideviation
 * and historical VaR/CVaR (loss magnitudes). NEVER sorts returns, computes
 * quantiles, downside statistics, VaR, CVaR or tail means — all tail-risk math
 * is server-side in @atlas/risk-engine.
 */

export const TAIL_CONFIDENCE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '95', label: '95%' },
  { value: '99', label: '99%' },
];

export const TAIL_RISK_TOOLTIPS = {
  DOWNSIDE: 'Mostra a dispersão histórica dos retornos abaixo de zero.',
  SEMIDEVIATION: 'Mostra a dispersão histórica dos retornos abaixo da média da própria série.',
  VAR: 'Estima, a partir da distribuição histórica dos retornos, um limiar de perda diária para o nível de confiança selecionado.',
  CVAR: 'Mostra a perda média histórica observada nos retornos que compõem a cauda além do VaR.',
} as const;

export interface TailRiskCurrencyVM {
  currency: string;
  status: string;
  observationCount: number;
  isPartial: boolean;
  isUnavailable: boolean;
  hasDownside: boolean;
  hasSemideviation: boolean;
  hasVar: boolean;
  hasCvar: boolean;
  downsideAnnualizedFormatted: string;
  semideviationAnnualizedFormatted: string;
  varLabel: string;
  varLossFormatted: string;
  varQuantileFormatted: string;
  varTailObservationCount: number;
  cvarLabel: string;
  cvarLossFormatted: string;
  cvarTailObservationCount: number;
}

export interface PortfolioTailRiskViewModel {
  period: { startDate: string; endDate: string; display: string };
  confidenceLevel: string;
  confidenceLabel: string;
  currencies: TailRiskCurrencyVM[];
  status: string;
  dataAvailability: string;
  isPartial: boolean;
  isUnavailable: boolean;
  statusLabel: string;
  statusColor: string;
  accessibilitySummary: string;
}

export interface RawTailRiskCurrencyData {
  currency: string;
  status: string;
  observationCount: number;
  downsideDeviation: {
    frequency: string;
    dailyPercentage: string | null;
    annualizedPercentage: string | null;
    negativeObservationCount: number;
  };
  semideviation: {
    frequency: string;
    dailyPercentage: string | null;
    annualizedPercentage: string | null;
  };
  historicalVar: {
    confidenceLevel: string;
    quantileReturnPercentage: string | null;
    lossPercentage: string | null;
    tailObservationCount: number;
  };
  historicalCvar: {
    confidenceLevel: string;
    meanTailReturnPercentage: string | null;
    lossPercentage: string | null;
    tailObservationCount: number;
  };
}

export interface RawTailRiskData {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  confidenceLevel: string;
  currencies: Record<string, RawTailRiskCurrencyData>;
  status: string;
  dataAvailability: string;
}

export function mapToPortfolioTailRiskViewModel(
  data: RawTailRiskData | null,
): PortfolioTailRiskViewModel | null {
  if (!data) return null;

  const confidenceLabel = `${data.confidenceLevel}%`;
  const currencies: TailRiskCurrencyVM[] = Object.values(data.currencies).map((c) => {
    const isPartial = c.status === 'PARTIAL';
    const isUnavailable = c.status === 'UNAVAILABLE';
    return {
      currency: c.currency,
      status: c.status,
      observationCount: c.observationCount,
      isPartial,
      isUnavailable,
      hasDownside: c.downsideDeviation.dailyPercentage !== null,
      hasSemideviation: c.semideviation.dailyPercentage !== null,
      hasVar: c.historicalVar.lossPercentage !== null,
      hasCvar: c.historicalCvar.lossPercentage !== null,
      downsideAnnualizedFormatted: formatPercentage(c.downsideDeviation.annualizedPercentage),
      semideviationAnnualizedFormatted: formatPercentage(c.semideviation.annualizedPercentage),
      varLabel: `VaR histórico (${data.confidenceLevel}%)`,
      varLossFormatted: formatPercentage(c.historicalVar.lossPercentage),
      varQuantileFormatted: formatPercentage(c.historicalVar.quantileReturnPercentage),
      varTailObservationCount: c.historicalVar.tailObservationCount,
      cvarLabel: `CVaR histórico (${data.confidenceLevel}%)`,
      cvarLossFormatted: formatPercentage(c.historicalCvar.lossPercentage),
      cvarTailObservationCount: c.historicalCvar.tailObservationCount,
    };
  });

  const isPartial = data.status === 'PARTIAL';
  const isUnavailable = data.status === 'UNAVAILABLE';

  let statusLabel = 'Métricas históricas de risco de cauda. Valores históricos, não previsões.';
  let statusColor: string = colors.positive;
  if (isPartial) {
    statusLabel = 'Dados parciais para métricas de risco de cauda.';
    statusColor = colors.warning;
  } else if (isUnavailable) {
    statusLabel = 'Histórico insuficiente para calcular esta métrica.';
    statusColor = colors.textMuted;
  }

  const periodDisplay = `${formatLocalDateDisplay(data.period.startDate)} → ${formatLocalDateDisplay(data.period.endDate)}`;
  const parts = currencies.map((c) => {
    if (c.isUnavailable) return `${c.currency}: histórico insuficiente`;
    return (
      `${c.currency}: downside ${c.downsideAnnualizedFormatted}, ` +
      `semidesvio ${c.semideviationAnnualizedFormatted}, ` +
      `${c.varLabel} ${c.varLossFormatted}, ${c.cvarLabel} ${c.cvarLossFormatted}`
    );
  });
  const accessibilitySummary =
    parts.length > 0
      ? `Risco de cauda no período ${periodDisplay}. ${parts.join('; ')}. Valores históricos, não previsões.`
      : `Histórico insuficiente para calcular esta métrica no período ${periodDisplay}.`;

  return {
    period: {
      startDate: data.period.startDate,
      endDate: data.period.endDate,
      display: periodDisplay,
    },
    confidenceLevel: data.confidenceLevel,
    confidenceLabel,
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

export function tailRiskQueryKey(
  portfolioId: string,
  startDate: string,
  endDate: string,
  confidenceLevel: string,
): readonly string[] {
  return ['portfolio-tail-risk', portfolioId, startDate, endDate, confidenceLevel] as const;
}
