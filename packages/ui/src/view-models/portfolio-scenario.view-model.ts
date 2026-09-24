import { formatCurrency, formatPercentage } from '../formatters';
import { colors } from '../tokens/colors';
import { formatLocalDateDisplay } from './portfolio-performance.view-model';

/**
 * Scenario analysis view-model (3O, ADR-159–ADR-165).
 *
 * Presentation only: formats server-computed deterministic what-if results.
 * NEVER applies shocks, Beta, duration, stressed prices or scenario totals —
 * all scenario math is server-side in @atlas/scenario-engine. Results are
 * hypothetical simulations, never forecasts or probabilities.
 */

export interface ScenarioPresetOption {
  id: string;
  label: string;
  definition: Record<string, string>;
  disabled?: boolean;
  disabledReason?: string;
}

export const SCENARIO_PRESET_OPTIONS: readonly ScenarioPresetOption[] = [
  {
    id: 'MARKET_DOWN_10',
    label: 'Queda de ações -10%',
    definition: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
  },
  {
    id: 'MARKET_DOWN_20',
    label: 'Queda de ações -20%',
    definition: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-20' },
  },
  {
    id: 'MARKET_UP_10',
    label: 'Alta de ações +10%',
    definition: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '10' },
  },
  {
    id: 'IBOV_DOWN_10',
    label: 'Ibovespa -10%',
    definition: { type: 'BENCHMARK_SHOCK', benchmarkId: 'IBOV', shockPercentage: '-10' },
  },
  {
    id: 'RATES_UP_100BPS',
    label: 'Juros +100 bps',
    definition: { type: 'RATE_SHOCK', rateShockBps: '100' },
    disabled: true,
    disabledReason:
      'Este cenário exige dados de sensibilidade de juros que não estão disponíveis para esta posição.',
  },
  {
    id: 'RATES_DOWN_100BPS',
    label: 'Juros -100 bps',
    definition: { type: 'RATE_SHOCK', rateShockBps: '-100' },
    disabled: true,
    disabledReason:
      'Este cenário exige dados de sensibilidade de juros que não estão disponíveis para esta posição.',
  },
  {
    id: 'CUSTOM',
    label: 'Personalizado',
    definition: { type: 'CUSTOM' },
  },
];

export const SCENARIO_REASON_MESSAGES: Record<string, string> = {
  'SCENARIO.UNSUPPORTED_RATE_SHOCK':
    'Este cenário exige dados de sensibilidade de juros que não estão disponíveis para esta posição.',
  'SCENARIO.BETA_UNAVAILABLE':
    'Beta histórico indisponível para este período; o cenário de Ibovespa não pôde ser estimado.',
  'SCENARIO.RATE_SHOCK_NEGATIVE_VALUE':
    'O choque de juros produziria um valor não positivo; o cenário não foi aplicado.',
};

export interface ScenarioComponentVM {
  componentType: string;
  status: string;
  absoluteImpactFormatted: string;
  percentageImpactFormatted: string;
  reasonMessage: string | null;
}

export interface ScenarioCurrencyResultVM {
  currency: string;
  status: string;
  isPartial: boolean;
  isUnavailable: boolean;
  baseValueFormatted: string;
  stressedValueFormatted: string;
  absoluteImpactFormatted: string;
  percentageImpactFormatted: string;
  positionCount: number;
  valuedPositionCount: number;
  unvaluedPositionCount: number;
  components: ScenarioComponentVM[];
  usesBeta: boolean;
  rateUnsupported: boolean;
}

export interface PortfolioScenarioViewModel {
  asOf: string;
  asOfDisplay: string;
  scenarioLabel: string;
  currencies: ScenarioCurrencyResultVM[];
  status: string;
  dataAvailability: string;
  isPartial: boolean;
  isUnavailable: boolean;
  statusLabel: string;
  statusColor: string;
  accessibilitySummary: string;
}

export interface RawScenarioComponentData {
  componentType: string;
  status: string;
  baseValue: string | null;
  stressedValue: string | null;
  absoluteImpact: string | null;
  percentageImpact: string | null;
  reason: string | null;
}

export interface RawScenarioCurrencyData {
  currency: string;
  status: string;
  baseValue: string | null;
  stressedValue: string | null;
  absoluteImpact: string | null;
  percentageImpact: string | null;
  positionCount: number;
  valuedPositionCount: number;
  unvaluedPositionCount: number;
  components: RawScenarioComponentData[];
}

export interface RawScenarioData {
  portfolioId: string;
  asOf: string;
  scenario: Record<string, string | undefined>;
  currencies: Record<string, RawScenarioCurrencyData>;
  status: string;
  dataAvailability: string;
}

function describeScenario(scenario: Record<string, string | undefined>): string {
  switch (scenario.type) {
    case 'EQUITY_PRICE_SHOCK':
      return `Choque direto de preços: ${scenario.shockPercentage ?? '—'}%`;
    case 'BENCHMARK_SHOCK':
      return `Choque de ${scenario.benchmarkId ?? 'IBOV'}: ${scenario.shockPercentage ?? '—'}% (estimativa pelo beta histórico)`;
    case 'RATE_SHOCK':
      return `Choque de juros: ${scenario.rateShockBps ?? '—'} bps (aproximação linear por duration)`;
    case 'COMBINED': {
      const parts: string[] = [];
      if (scenario.equityShockPercentage !== undefined)
        parts.push(`ações ${scenario.equityShockPercentage}%`);
      if (scenario.benchmarkShockPercentage !== undefined)
        parts.push(`${scenario.benchmarkId ?? 'IBOV'} ${scenario.benchmarkShockPercentage}%`);
      if (scenario.rateShockBps !== undefined) parts.push(`juros ${scenario.rateShockBps} bps`);
      return `Cenário combinado: ${parts.join(' + ')}`;
    }
    default:
      return 'Cenário personalizado';
  }
}

export function mapToPortfolioScenarioViewModel(
  data: RawScenarioData | null,
): PortfolioScenarioViewModel | null {
  if (!data) return null;

  const currencies: ScenarioCurrencyResultVM[] = Object.values(data.currencies).map((c) => {
    const usesBeta = c.components.some(
      (component) => component.componentType === 'BENCHMARK_SHOCK',
    );
    const rateUnsupported = c.components.some(
      (component) => component.reason === 'SCENARIO.UNSUPPORTED_RATE_SHOCK',
    );
    return {
      currency: c.currency,
      status: c.status,
      isPartial: c.status === 'PARTIAL',
      isUnavailable: c.status === 'UNAVAILABLE',
      baseValueFormatted: formatCurrency(c.baseValue, c.currency),
      stressedValueFormatted: formatCurrency(c.stressedValue, c.currency),
      absoluteImpactFormatted: formatCurrency(c.absoluteImpact, c.currency),
      percentageImpactFormatted: formatPercentage(c.percentageImpact, { showSign: true }),
      positionCount: c.positionCount,
      valuedPositionCount: c.valuedPositionCount,
      unvaluedPositionCount: c.unvaluedPositionCount,
      components: c.components.map((component) => ({
        componentType: component.componentType,
        status: component.status,
        absoluteImpactFormatted: formatCurrency(component.absoluteImpact, c.currency),
        percentageImpactFormatted: formatPercentage(component.percentageImpact, {
          showSign: true,
        }),
        reasonMessage: component.reason
          ? (SCENARIO_REASON_MESSAGES[component.reason] ?? component.reason)
          : null,
      })),
      usesBeta,
      rateUnsupported,
    };
  });

  const isPartial = data.status === 'PARTIAL';
  const isUnavailable = data.status === 'UNAVAILABLE';

  let statusLabel = 'Simulação determinística. Hipótese, não previsão.';
  let statusColor: string = colors.positive;
  if (isPartial) {
    statusLabel = 'Algumas posições não puderam ser avaliadas neste cenário.';
    statusColor = colors.warning;
  } else if (isUnavailable) {
    statusLabel = 'Cenário indisponível para esta carteira.';
    statusColor = colors.textMuted;
  }

  const parts = currencies.map((c) => {
    if (c.isUnavailable) return `${c.currency}: indisponível`;
    return `${c.currency}: impacto estimado ${c.absoluteImpactFormatted} (${c.percentageImpactFormatted})`;
  });
  const accessibilitySummary =
    parts.length > 0
      ? `Simulação de cenário em ${formatLocalDateDisplay(data.asOf)}. ${parts.join('; ')}. Hipótese, não previsão.`
      : `Cenário indisponível em ${formatLocalDateDisplay(data.asOf)}.`;

  return {
    asOf: data.asOf,
    asOfDisplay: formatLocalDateDisplay(data.asOf),
    scenarioLabel: describeScenario(data.scenario),
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

export function scenarioQueryKey(portfolioId: string, asOf: string): readonly string[] {
  return ['portfolio-scenario', portfolioId, asOf] as const;
}
