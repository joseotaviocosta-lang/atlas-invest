import { formatCurrency, formatPercentage } from '../formatters';
import { colors } from '../tokens/colors';
import { formatLocalDateDisplay } from './portfolio-performance.view-model';

/**
 * Portfolio Intelligence Summary view-model (3P, ADR-166–ADR-172).
 *
 * Presentation only: formats server-computed consolidated read models and
 * renders DETERMINISTIC FACTUAL observation templates. Zero financial math: no
 * metric is computed, compared, ranked, scored or recommended here. Outputs are
 * historical / hypothetical facts, never predictions.
 */

const REASON_MESSAGES: Record<string, string> = {
  INSUFFICIENT_HISTORY: 'Histórico insuficiente',
  MISSING_MARKET_PRICE: 'Preço de mercado ausente',
  COST_BASIS_INCOMPLETE: 'Custo de aquisição incompleto',
  BENCHMARK_UNAVAILABLE: 'Benchmark indisponível',
  RISK_FREE_PROXY_UNAVAILABLE: 'Referência livre de risco indisponível',
  MULTI_CURRENCY_NO_FX: 'Moeda sem referência compatível',
  BETA_UNAVAILABLE: 'Beta indisponível',
  PARTIAL_VALUATION: 'Valuation parcial',
  UNSUPPORTED: 'Não suportado nesta fase',
};

export interface IntelligenceObservationVM {
  code: string;
  scope: string;
  source: string;
  text: string;
}

export interface IntelligenceDataQualityItemVM {
  key: string;
  status: string;
  reasonMessage: string | null;
}

export interface IntelligenceBenchmarkVM {
  id: string;
  label: string;
  returnFormatted: string;
  differenceFormatted: string;
  isAvailable: boolean;
}

export interface IntelligenceCurrencySummaryVM {
  currency: string;
  status: string;
  isPartial: boolean;
  isUnavailable: boolean;
  overview: {
    currentMarketValueFormatted: string;
    positionCount: number;
    valuedPositionCount: number;
    unvaluedPositionCount: number;
  };
  performance: { twrFormatted: string; xirrFormatted: string };
  benchmarks: IntelligenceBenchmarkVM[];
  risk: {
    volatilityFormatted: string;
    maximumDrawdownFormatted: string;
    currentDrawdownFormatted: string;
  };
  tailRisk: { var95Formatted: string; cvar95Formatted: string };
  scenario: {
    label: string;
    baseValueFormatted: string;
    stressedValueFormatted: string;
    absoluteImpactFormatted: string;
    percentageImpactFormatted: string;
    hypotheticalLabel: string;
  };
  dataQuality: IntelligenceDataQualityItemVM[];
}

export interface PortfolioIntelligenceSummaryViewModel {
  period: { startDate: string; endDate: string; display: string };
  asOf: string;
  currencies: IntelligenceCurrencySummaryVM[];
  observations: IntelligenceObservationVM[];
  status: string;
  dataAvailability: string;
  isPartial: boolean;
  isUnavailable: boolean;
  statusLabel: string;
  statusColor: string;
  accessibilitySummary: string;
}

// --- raw shapes (server-serialized) -----------------------------------------

interface RawBlockStatus {
  status: string;
  reason?: string | null;
}

export interface RawIntelligenceCurrency {
  currency: string;
  status: string;
  dataAvailability: string;
  overview: {
    currentMarketValue: string | null;
    positionCount: number;
    valuedPositionCount: number;
    unvaluedPositionCount: number;
    status: string;
  };
  performance: {
    twr: string | null;
    xirr: string | null;
    observationCount: number;
    status: string;
  };
  benchmarks: Array<{
    id: string;
    return: string | null;
    differencePercentagePoints: string | null;
    status: string;
  }>;
  risk: {
    realizedVolatilityAnnualized: string | null;
    maximumDrawdown: string | null;
    currentDrawdown: string | null;
    status: string;
  };
  riskAdjusted: {
    sharpe: string | null;
    sortino: string | null;
    riskFreeProxy: string | null;
    status: string;
  };
  relativeRisk: {
    benchmark: string | null;
    beta: string | null;
    correlation: string | null;
    trackingErrorAnnualized: string | null;
    status: string;
  };
  activePerformance: {
    alpha: string | null;
    informationRatio: string | null;
    treynor: string | null;
    status: string;
  };
  tailRisk: {
    confidenceLevel: string;
    downsideDeviationAnnualized: string | null;
    semideviationAnnualized: string | null;
    var95: string | null;
    cvar95: string | null;
    status: string;
  };
  scenario: {
    preset: string;
    type: string;
    baseValue: string | null;
    stressedValue: string | null;
    absoluteImpact: string | null;
    percentageImpact: string | null;
    hypothetical: boolean;
    status: string;
  };
  dataQuality: Record<string, RawBlockStatus>;
}

export interface RawIntelligenceObservation {
  code: string;
  scope: string;
  status: string;
  source: string;
  values: Record<string, string | readonly string[] | number>;
}

export interface RawIntelligenceSummary {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  asOf: string;
  currencies: Record<string, RawIntelligenceCurrency>;
  observations: RawIntelligenceObservation[];
  status: string;
  dataAvailability: string;
}

const BENCHMARK_LABELS: Record<string, string> = { IBOV: 'Ibovespa', CDI: 'CDI' };

function asString(value: string | readonly string[] | number | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? value.join(', ') : String(value);
}

/** Deterministic factual templates (ADR-168). No judgment, no recommendation. */
function observationText(observation: RawIntelligenceObservation): string {
  const v = observation.values;
  const scope = observation.scope;
  switch (observation.code) {
    case 'PERFORMANCE_VS_IBOV':
      return `No período, a carteira em ${scope} teve retorno de ${formatPercentage(asString(v.portfolioReturn))}, contra ${formatPercentage(asString(v.benchmarkReturn))} do Ibovespa, diferença de ${formatPercentage(asString(v.differencePercentagePoints))} p.p.`;
    case 'PERFORMANCE_VS_CDI':
      return `No período, a carteira em ${scope} teve retorno de ${formatPercentage(asString(v.portfolioReturn))}, contra ${formatPercentage(asString(v.benchmarkReturn))} do CDI, diferença de ${formatPercentage(asString(v.differencePercentagePoints))} p.p.`;
    case 'CURRENT_DRAWDOWN':
      return `A carteira em ${scope} está com drawdown atual de ${formatPercentage(asString(v.currentDrawdown))} (histórico).`;
    case 'MAX_DRAWDOWN':
      return `O maior drawdown histórico da carteira em ${scope} no período foi de ${formatPercentage(asString(v.maximumDrawdown))}.`;
    case 'TAIL_RISK_95':
      return `VaR histórico 95%: ${formatPercentage(asString(v.var95))}; CVaR histórico 95%: ${formatPercentage(asString(v.cvar95))}. Métricas históricas, não previsões.`;
    case 'EQUITY_DOWN_10_IMPACT':
      return `Hipótese: queda direta de 10% nos ativos elegíveis resultaria em valor estimado de ${formatCurrency(asString(v.stressedValue), scope)} para ${scope}, impacto de ${formatCurrency(asString(v.absoluteImpact), scope)} (${formatPercentage(asString(v.percentageImpact))}).`;
    case 'PARTIAL_VALUATION':
      return `${asString(v.unvaluedPositionCount)} de ${asString(v.positionCount)} posições em ${scope} sem preço; o resumo cobre parte da carteira.`;
    case 'INCOMPLETE_DATA': {
      const reasons = Array.isArray(v.reasons)
        ? (v.reasons as readonly string[]).map((r) => REASON_MESSAGES[r] ?? r)
        : [asString(v.reasons)];
      return `Dados incompletos em ${scope}: ${reasons.join('; ')}.`;
    }
    case 'MULTI_CURRENCY_PRESENT':
      return `A carteira possui múltiplas moedas (${asString(v.currencies)}); os totais permanecem segregados por moeda.`;
    default:
      return '';
  }
}

export function mapToPortfolioIntelligenceViewModel(
  data: RawIntelligenceSummary | null,
): PortfolioIntelligenceSummaryViewModel | null {
  if (!data) return null;

  const currencies: IntelligenceCurrencySummaryVM[] = Object.values(data.currencies).map((c) => {
    const isPartial = c.status === 'PARTIAL';
    const isUnavailable = c.status === 'UNAVAILABLE';
    return {
      currency: c.currency,
      status: c.status,
      isPartial,
      isUnavailable,
      overview: {
        currentMarketValueFormatted: formatCurrency(c.overview.currentMarketValue, c.currency),
        positionCount: c.overview.positionCount,
        valuedPositionCount: c.overview.valuedPositionCount,
        unvaluedPositionCount: c.overview.unvaluedPositionCount,
      },
      performance: {
        twrFormatted: formatPercentage(c.performance.twr),
        xirrFormatted: formatPercentage(c.performance.xirr),
      },
      benchmarks: c.benchmarks.map((b) => ({
        id: b.id,
        label: BENCHMARK_LABELS[b.id] ?? b.id,
        returnFormatted: formatPercentage(b.return),
        differenceFormatted: formatPercentage(b.differencePercentagePoints),
        isAvailable: b.return !== null,
      })),
      risk: {
        volatilityFormatted: formatPercentage(c.risk.realizedVolatilityAnnualized),
        maximumDrawdownFormatted: formatPercentage(c.risk.maximumDrawdown),
        currentDrawdownFormatted: formatPercentage(c.risk.currentDrawdown),
      },
      tailRisk: {
        var95Formatted: formatPercentage(c.tailRisk.var95),
        cvar95Formatted: formatPercentage(c.tailRisk.cvar95),
      },
      scenario: {
        label: 'Hipótese: queda direta de 10% nos ativos elegíveis.',
        baseValueFormatted: formatCurrency(c.scenario.baseValue, c.currency),
        stressedValueFormatted: formatCurrency(c.scenario.stressedValue, c.currency),
        absoluteImpactFormatted: formatCurrency(c.scenario.absoluteImpact, c.currency),
        percentageImpactFormatted: formatPercentage(c.scenario.percentageImpact),
        hypotheticalLabel: 'Hipótese',
      },
      dataQuality: Object.entries(c.dataQuality).map(([key, block]) => ({
        key,
        status: block.status,
        reasonMessage: block.reason ? (REASON_MESSAGES[block.reason] ?? block.reason) : null,
      })),
    };
  });

  const observations: IntelligenceObservationVM[] = data.observations.map((o) => ({
    code: o.code,
    scope: o.scope,
    source: o.source,
    text: observationText(o),
  }));

  const isPartial = data.status === 'PARTIAL';
  const isUnavailable = data.status === 'UNAVAILABLE';

  let statusLabel = 'Resumo determinístico. Fatos históricos, não previsões.';
  let statusColor: string = colors.positive;
  if (isPartial) {
    statusLabel = 'Resumo parcial: alguns blocos não puderam ser calculados.';
    statusColor = colors.warning;
  } else if (isUnavailable) {
    statusLabel = 'Resumo indisponível para esta carteira.';
    statusColor = colors.textMuted;
  }

  const periodDisplay = `${formatLocalDateDisplay(data.period.startDate)} → ${formatLocalDateDisplay(data.period.endDate)}`;
  const accessibilitySummary = `Resumo da carteira no período ${periodDisplay}. ${observations.length} destaques objetivos. Fatos históricos, não previsões.`;

  return {
    period: { ...data.period, display: periodDisplay },
    asOf: data.asOf,
    currencies,
    observations,
    status: data.status,
    dataAvailability: data.dataAvailability,
    isPartial,
    isUnavailable,
    statusLabel,
    statusColor,
    accessibilitySummary,
  };
}

export function intelligenceSummaryQueryKey(
  portfolioId: string,
  startDate: string,
  endDate: string,
): readonly string[] {
  return ['portfolio-intelligence-summary', portfolioId, startDate, endDate] as const;
}
