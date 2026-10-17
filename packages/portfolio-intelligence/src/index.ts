export const PORTFOLIO_INTELLIGENCE_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Portfolio Intelligence Summary (3P, ADR-166–ADR-172)
//
// PURE DETERMINISTIC AGGREGATOR. It receives ALREADY-COMPUTED read models from
// the approved engines/use cases and produces one consolidated summary with
// structured data quality and objective, factual observations. It owns NO
// financial formula, performs NO I/O (no replay, no provider, no Prisma, no
// Nest, no React), performs NO AI/recommendation/score/rating, and never
// aggregates currencies. All outputs frozen.
// ---------------------------------------------------------------------------

export const INTELLIGENCE_STATUSES = ['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'] as const;
export type IntelligenceStatus = (typeof INTELLIGENCE_STATUSES)[number];

export const INTELLIGENCE_AVAILABILITIES = ['COMPLETE', 'PARTIAL', 'UNAVAILABLE'] as const;
export type IntelligenceAvailability = (typeof INTELLIGENCE_AVAILABILITIES)[number];

/** Stable reason codes (re-used across blocks). Never a numeric score. */
export const INTELLIGENCE_REASON_CODES = [
  'INSUFFICIENT_HISTORY',
  'MISSING_MARKET_PRICE',
  'COST_BASIS_INCOMPLETE',
  'BENCHMARK_UNAVAILABLE',
  'RISK_FREE_PROXY_UNAVAILABLE',
  'MULTI_CURRENCY_NO_FX',
  'BETA_UNAVAILABLE',
  'PARTIAL_VALUATION',
  'UNSUPPORTED',
] as const;
export type IntelligenceReasonCode = (typeof INTELLIGENCE_REASON_CODES)[number];

/**
 * Reason codes that describe a STRUCTURAL limitation of the phase (a currency
 * for which a reference simply does not exist), as opposed to an accidental
 * data gap. Structural reasons never downgrade the over-arching summary to
 * PARTIAL on their own (ADR-171).
 */
const STRUCTURAL_REASONS: readonly string[] = ['UNSUPPORTED', 'MULTI_CURRENCY_NO_FX'];

export const OBSERVATION_CODES = [
  'PERFORMANCE_VS_IBOV',
  'PERFORMANCE_VS_CDI',
  'CURRENT_DRAWDOWN',
  'MAX_DRAWDOWN',
  'TAIL_RISK_95',
  'EQUITY_DOWN_10_IMPACT',
  'PARTIAL_VALUATION',
  'INCOMPLETE_DATA',
  'MULTI_CURRENCY_PRESENT',
] as const;
export type ObservationCode = (typeof OBSERVATION_CODES)[number];

/** Canonical deterministic observation order (ADR-168). */
export const OBSERVATION_ORDER: readonly ObservationCode[] = [
  'PERFORMANCE_VS_IBOV',
  'PERFORMANCE_VS_CDI',
  'CURRENT_DRAWDOWN',
  'MAX_DRAWDOWN',
  'TAIL_RISK_95',
  'EQUITY_DOWN_10_IMPACT',
  'PARTIAL_VALUATION',
  'INCOMPLETE_DATA',
  'MULTI_CURRENCY_PRESENT',
];

export const OBSERVATION_SOURCES = [
  'PERFORMANCE',
  'RISK',
  'TAIL_RISK',
  'SCENARIO',
  'DATA_QUALITY',
  'PORTFOLIO',
] as const;
export type ObservationSource = (typeof OBSERVATION_SOURCES)[number];

// --- Input blocks (already-computed values; strings are exact decimals) ------

export interface IntelligenceStatusInfo {
  status: IntelligenceStatus;
  reason: string | null;
}

export interface IntelligenceOverviewBlock {
  currentMarketValue: string | null;
  positionCount: number;
  valuedPositionCount: number;
  unvaluedPositionCount: number;
  status: IntelligenceStatus;
}

export interface IntelligencePerformanceBlock {
  twr: string | null;
  xirr: string | null;
  observationCount: number;
  status: IntelligenceStatus;
}

export interface IntelligenceBenchmarkBlock {
  id: string;
  return: string | null;
  differencePercentagePoints: string | null;
  status: IntelligenceStatus;
}

export interface IntelligenceRiskBlock {
  realizedVolatilityAnnualized: string | null;
  maximumDrawdown: string | null;
  currentDrawdown: string | null;
  status: IntelligenceStatus;
}

export interface IntelligenceRiskAdjustedBlock {
  sharpe: string | null;
  sortino: string | null;
  riskFreeProxy: string | null;
  status: IntelligenceStatus;
}

export interface IntelligenceRelativeRiskBlock {
  benchmark: string | null;
  beta: string | null;
  correlation: string | null;
  trackingErrorAnnualized: string | null;
  status: IntelligenceStatus;
}

export interface IntelligenceActivePerformanceBlock {
  alpha: string | null;
  informationRatio: string | null;
  treynor: string | null;
  status: IntelligenceStatus;
}

export interface IntelligenceTailRiskBlock {
  confidenceLevel: string;
  downsideDeviationAnnualized: string | null;
  semideviationAnnualized: string | null;
  var95: string | null;
  cvar95: string | null;
  status: IntelligenceStatus;
}

export interface IntelligenceScenarioBlock {
  preset: string;
  type: string;
  baseValue: string | null;
  stressedValue: string | null;
  absoluteImpact: string | null;
  percentageImpact: string | null;
  /** Explicitly hypothetical — never predictive. */
  hypothetical: true;
  status: IntelligenceStatus;
}

export interface IntelligenceDataQualityInput {
  portfolioStateCompleteness: IntelligenceStatusInfo;
  valuationCompleteness: IntelligenceStatusInfo;
  performanceAvailability: IntelligenceStatusInfo;
  benchmarkAvailability: IntelligenceStatusInfo;
  riskAvailability: IntelligenceStatusInfo;
  tailRiskAvailability: IntelligenceStatusInfo;
  scenarioAvailability: IntelligenceStatusInfo;
}

export interface CurrencyIntelligenceInput {
  currency: string;
  overview: IntelligenceOverviewBlock;
  performance: IntelligencePerformanceBlock;
  benchmarks: readonly IntelligenceBenchmarkBlock[];
  risk: IntelligenceRiskBlock;
  riskAdjusted: IntelligenceRiskAdjustedBlock;
  relativeRisk: IntelligenceRelativeRiskBlock;
  activePerformance: IntelligenceActivePerformanceBlock;
  tailRisk: IntelligenceTailRiskBlock;
  scenario: IntelligenceScenarioBlock;
  dataQuality: IntelligenceDataQualityInput;
}

export interface PortfolioIntelligenceInput {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  asOf: string;
  currencies: readonly CurrencyIntelligenceInput[];
}

// --- Output -----------------------------------------------------------------

export type ObservationValue = string | readonly string[] | number;

export interface PortfolioObservation {
  code: ObservationCode;
  scope: string;
  status: IntelligenceStatus;
  source: ObservationSource;
  values: Readonly<Record<string, ObservationValue>>;
}

export interface CurrencyIntelligenceSummary {
  currency: string;
  overview: IntelligenceOverviewBlock;
  performance: IntelligencePerformanceBlock;
  benchmarks: readonly IntelligenceBenchmarkBlock[];
  risk: IntelligenceRiskBlock;
  riskAdjusted: IntelligenceRiskAdjustedBlock;
  relativeRisk: IntelligenceRelativeRiskBlock;
  activePerformance: IntelligenceActivePerformanceBlock;
  tailRisk: IntelligenceTailRiskBlock;
  scenario: IntelligenceScenarioBlock;
  dataQuality: IntelligenceDataQualityInput;
  status: IntelligenceStatus;
  dataAvailability: IntelligenceAvailability;
}

export interface PortfolioIntelligenceSummary {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  asOf: string;
  currencies: Record<string, CurrencyIntelligenceSummary>;
  observations: readonly PortfolioObservation[];
  status: IntelligenceStatus;
  dataAvailability: IntelligenceAvailability;
}

// --- derivation helpers -----------------------------------------------------

function makeObservation(
  code: ObservationCode,
  scope: string,
  source: ObservationSource,
  values: Record<string, ObservationValue>,
): PortfolioObservation {
  return Object.freeze({
    code,
    scope,
    status: 'AVAILABLE' as const,
    source,
    values: Object.freeze(values),
  });
}

function deriveCurrencyObservations(currency: CurrencyIntelligenceInput): PortfolioObservation[] {
  const observations: PortfolioObservation[] = [];
  const scope = currency.currency;

  const ibov = currency.benchmarks.find((b) => b.id === 'IBOV');
  if (ibov && ibov.return !== null && currency.performance.twr !== null) {
    observations.push(
      makeObservation('PERFORMANCE_VS_IBOV', scope, 'PERFORMANCE', {
        portfolioReturn: currency.performance.twr,
        benchmarkReturn: ibov.return,
        differencePercentagePoints: ibov.differencePercentagePoints ?? '',
      }),
    );
  }

  const cdi = currency.benchmarks.find((b) => b.id === 'CDI');
  if (cdi && cdi.return !== null && currency.performance.twr !== null) {
    observations.push(
      makeObservation('PERFORMANCE_VS_CDI', scope, 'PERFORMANCE', {
        portfolioReturn: currency.performance.twr,
        benchmarkReturn: cdi.return,
        differencePercentagePoints: cdi.differencePercentagePoints ?? '',
      }),
    );
  }

  // CURRENT_DRAWDOWN omitted when exactly 0 (ADR-168).
  if (
    currency.risk.currentDrawdown !== null &&
    currency.risk.currentDrawdown !== '0' &&
    currency.risk.currentDrawdown !== '0.0'
  ) {
    observations.push(
      makeObservation('CURRENT_DRAWDOWN', scope, 'RISK', {
        currentDrawdown: currency.risk.currentDrawdown,
      }),
    );
  }

  // MAX_DRAWDOWN emitted only when risk data is completely AVAILABLE (ADR-168/Phase 5B-H2).
  // A 0.00% or partial drawdown on incomplete data is an unproven artifact, not a factual claim.
  if (currency.risk.maximumDrawdown !== null && currency.risk.status === 'AVAILABLE') {
    observations.push(
      makeObservation('MAX_DRAWDOWN', scope, 'RISK', {
        maximumDrawdown: currency.risk.maximumDrawdown,
      }),
    );
  }

  if (currency.tailRisk.var95 !== null) {
    observations.push(
      makeObservation('TAIL_RISK_95', scope, 'TAIL_RISK', {
        confidenceLevel: currency.tailRisk.confidenceLevel,
        var95: currency.tailRisk.var95,
        cvar95: currency.tailRisk.cvar95 ?? '',
      }),
    );
  }

  if (currency.scenario.status !== 'UNAVAILABLE' && currency.scenario.absoluteImpact !== null) {
    observations.push(
      makeObservation('EQUITY_DOWN_10_IMPACT', scope, 'SCENARIO', {
        preset: currency.scenario.preset,
        baseValue: currency.scenario.baseValue ?? '',
        stressedValue: currency.scenario.stressedValue ?? '',
        absoluteImpact: currency.scenario.absoluteImpact,
        percentageImpact: currency.scenario.percentageImpact ?? '',
        hypothetical: 'true',
      }),
    );
  }

  if (currency.overview.unvaluedPositionCount > 0) {
    observations.push(
      makeObservation('PARTIAL_VALUATION', scope, 'DATA_QUALITY', {
        unvaluedPositionCount: currency.overview.unvaluedPositionCount,
        positionCount: currency.overview.positionCount,
      }),
    );
  }

  const incompleteReasons = Object.values(currency.dataQuality)
    .filter(
      (block) => block.status !== 'AVAILABLE' && !STRUCTURAL_REASONS.includes(block.reason ?? ''),
    )
    .map((block) => block.reason ?? 'UNKNOWN');
  if (incompleteReasons.length > 0) {
    observations.push(
      makeObservation('INCOMPLETE_DATA', scope, 'DATA_QUALITY', {
        reasons: Object.freeze(Array.from(new Set(incompleteReasons))) as readonly string[],
      }),
    );
  }

  return observations;
}

function currencyStatus(input: CurrencyIntelligenceInput): IntelligenceStatus {
  if (input.overview.valuedPositionCount === 0) return 'UNAVAILABLE';
  const dataPartial = Object.values(input.dataQuality).some(
    (block) => block.status !== 'AVAILABLE' && !STRUCTURAL_REASONS.includes(block.reason ?? ''),
  );
  return dataPartial ? 'PARTIAL' : 'AVAILABLE';
}

// --- aggregator -------------------------------------------------------------

export function buildPortfolioIntelligenceSummary(
  input: PortfolioIntelligenceInput,
): PortfolioIntelligenceSummary {
  const currencies: Record<string, CurrencyIntelligenceSummary> = {};
  const rawObservations: PortfolioObservation[] = [];

  for (const currency of input.currencies) {
    const status = currencyStatus(currency);
    const dataAvailability: IntelligenceAvailability =
      status === 'AVAILABLE' ? 'COMPLETE' : status === 'PARTIAL' ? 'PARTIAL' : 'UNAVAILABLE';
    currencies[currency.currency] = Object.freeze({
      currency: currency.currency,
      overview: Object.freeze({ ...currency.overview }),
      performance: Object.freeze({ ...currency.performance }),
      benchmarks: Object.freeze(currency.benchmarks.map((b) => Object.freeze({ ...b }))),
      risk: Object.freeze({ ...currency.risk }),
      riskAdjusted: Object.freeze({ ...currency.riskAdjusted }),
      relativeRisk: Object.freeze({ ...currency.relativeRisk }),
      activePerformance: Object.freeze({ ...currency.activePerformance }),
      tailRisk: Object.freeze({ ...currency.tailRisk }),
      scenario: Object.freeze({ ...currency.scenario }),
      dataQuality: Object.freeze({ ...currency.dataQuality }),
      status,
      dataAvailability,
    });
    rawObservations.push(...deriveCurrencyObservations(currency));
  }

  if (input.currencies.length > 1) {
    rawObservations.push(
      makeObservation('MULTI_CURRENCY_PRESENT', 'PORTFOLIO', 'PORTFOLIO', {
        currencies: Object.freeze(input.currencies.map((c) => c.currency)) as readonly string[],
      }),
    );
  }

  // Deterministic ordering + dedup by (code, scope): max 1 per pair.
  const seen = new Set<string>();
  const observations = rawObservations
    .slice()
    .sort((a, b) => {
      const orderDiff = OBSERVATION_ORDER.indexOf(a.code) - OBSERVATION_ORDER.indexOf(b.code);
      if (orderDiff !== 0) return orderDiff;
      return a.scope.localeCompare(b.scope);
    })
    .filter((obs) => {
      const key = `${obs.code}::${obs.scope}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const currencyList = Object.values(currencies);
  const hasCore = currencyList.some((c) => c.status !== 'UNAVAILABLE');
  const anyPartial = currencyList.some((c) => c.status === 'PARTIAL');

  let status: IntelligenceStatus;
  if (!hasCore) status = 'UNAVAILABLE';
  else if (anyPartial) status = 'PARTIAL';
  else status = 'AVAILABLE';

  const dataAvailability: IntelligenceAvailability =
    status === 'AVAILABLE' ? 'COMPLETE' : status === 'PARTIAL' ? 'PARTIAL' : 'UNAVAILABLE';

  return Object.freeze({
    portfolioId: input.portfolioId,
    period: Object.freeze({ ...input.period }),
    asOf: input.asOf,
    currencies: Object.freeze(currencies) as Record<string, CurrencyIntelligenceSummary>,
    observations: Object.freeze(observations) as readonly PortfolioObservation[],
    status,
    dataAvailability,
  });
}
