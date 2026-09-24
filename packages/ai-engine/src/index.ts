export const AI_ENGINE_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Legacy / Foundation contracts (preserved for backward-compatibility)
// ---------------------------------------------------------------------------

export interface AIToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface AITool {
  name: string;
  description: string;
  parameters: AIToolParameter[];
  execute(args: Record<string, unknown>): Promise<unknown>;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
}

export interface AICompletionOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: AITool[];
}

/**
 * Future AI Provider contract (LLM abstraction for contextual insights and RAG).
 * Pure interface contract - zero LLM integrations or prompts in Phase 0B / 3Q.
 */
export interface AIProvider {
  complete(messages: AIMessage[], options?: AICompletionOptions): Promise<AIMessage>;
  registerTool(tool: AITool): void;
}

// ---------------------------------------------------------------------------
// Phase 3Q: AI Grounding Foundation (ADR-173–ADR-178)
// Pure, deterministic, zero I/O transport of Portfolio Intelligence Summary
// into structured, traceable facts and declarative capabilities/limitations.
// Zero model calls. Zero financial recalculation. Zero raw transaction ledger.
// ---------------------------------------------------------------------------

import type {
  PortfolioIntelligenceSummary,
  PortfolioObservation,
  IntelligenceStatus,
  IntelligenceAvailability,
  IntelligenceDataQualityInput,
} from '@atlas/portfolio-intelligence';

export const GROUNDING_SCHEMA_VERSION = '1' as const;

export const GROUNDED_FACT_CATEGORIES = [
  'OVERVIEW',
  'PERFORMANCE',
  'BENCHMARK',
  'RISK',
  'RISK_ADJUSTED',
  'RELATIVE_RISK',
  'ACTIVE_PERFORMANCE',
  'TAIL_RISK',
  'SCENARIO',
] as const;
export type GroundedFactCategory = (typeof GROUNDED_FACT_CATEGORIES)[number];

export const GROUNDED_FACT_UNITS = [
  'MONEY',
  'PERCENTAGE',
  'PERCENTAGE_POINTS',
  'RATIO',
  'COUNT',
  'DATE',
  'STATUS',
  'TEXT_ENUM',
] as const;
export type GroundedFactUnit = (typeof GROUNDED_FACT_UNITS)[number];

export const GROUNDED_FACT_NATURES = [
  'POINT_IN_TIME',
  'PERIOD',
  'HISTORICAL',
  'HYPOTHETICAL',
  'STRUCTURAL',
] as const;
export type GroundedFactNature = (typeof GROUNDED_FACT_NATURES)[number];

export const GROUNDED_FACT_STATUSES = ['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'] as const;
export type GroundedFactStatus = (typeof GROUNDED_FACT_STATUSES)[number];

export interface GroundedFactSource {
  readonly contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1';
  readonly path: string;
}

export interface GroundedFinancialFact {
  readonly factId: string;
  readonly category: GroundedFactCategory;
  readonly scope: string;
  readonly metric: string;
  readonly value: string | null;
  readonly unit: GroundedFactUnit;
  readonly currency?: string;
  readonly nature: GroundedFactNature;
  readonly status: GroundedFactStatus;
  readonly reason?: string | null;
  readonly period?: {
    readonly startDate: string;
    readonly endDate: string;
  };
  readonly asOf?: string;
  readonly source: GroundedFactSource;
}

export interface GroundedLimitation {
  readonly code: string;
  readonly scope: string;
  readonly description: string;
  readonly count?: number;
}

export interface GroundedDataQuality {
  readonly status: IntelligenceStatus;
  readonly availability: IntelligenceAvailability;
  readonly currencies: Readonly<Record<string, IntelligenceDataQualityInput>>;
}

export interface GroundingCapabilities {
  readonly canExplainPortfolioFacts: boolean;
  readonly canExplainHistoricalPerformance: boolean;
  readonly canExplainHistoricalRisk: boolean;
  readonly canExplainScenarioResults: boolean;
  readonly canRecommendTrades: boolean;
  readonly canPredictReturns: boolean;
  readonly canCalculateNewMetrics: boolean;
}

export const CANONICAL_GROUNDING_CAPABILITIES: GroundingCapabilities = Object.freeze({
  canExplainPortfolioFacts: true,
  canExplainHistoricalPerformance: true,
  canExplainHistoricalRisk: true,
  canExplainScenarioResults: true,
  canRecommendTrades: false,
  canPredictReturns: false,
  canCalculateNewMetrics: false,
});

export interface PortfolioAiGroundingContextV1 {
  readonly schemaVersion: '1';
  readonly portfolioId: string;
  readonly generatedAt: string;
  readonly analysisPeriod: {
    readonly startDate: string;
    readonly endDate: string;
  };
  readonly asOf: string;
  readonly currencies: readonly string[];
  readonly facts: readonly GroundedFinancialFact[];
  readonly observations: readonly PortfolioObservation[];
  readonly dataQuality: GroundedDataQuality;
  readonly limitations: readonly GroundedLimitation[];
  readonly capabilities: GroundingCapabilities;
}

export interface BuildGroundingOptions {
  readonly generatedAt?: string;
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

/**
 * Builds the canonical deterministic GroundedFinancialFact array from a PortfolioIntelligenceSummary.
 */
function extractFactsForCurrency(
  currency: string,
  summary: PortfolioIntelligenceSummary,
): GroundedFinancialFact[] {
  const c = summary.currencies[currency];
  if (!c) return [];

  const facts: GroundedFinancialFact[] = [];
  const scope = currency;
  const isUsd = currency === 'USD';

  // 1. OVERVIEW
  facts.push({
    factId: `${scope}.OVERVIEW.MARKET_VALUE`,
    category: 'OVERVIEW',
    scope,
    metric: 'CURRENT_MARKET_VALUE',
    value: c.overview.currentMarketValue,
    unit: 'MONEY',
    currency: scope,
    nature: 'POINT_IN_TIME',
    status: c.overview.status,
    reason: c.overview.currentMarketValue === null ? 'PARTIAL_VALUATION' : null,
    asOf: summary.asOf,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.overview.currentMarketValue`,
    },
  });

  facts.push({
    factId: `${scope}.OVERVIEW.POSITION_COUNT`,
    category: 'OVERVIEW',
    scope,
    metric: 'POSITION_COUNT',
    value: String(c.overview.positionCount),
    unit: 'COUNT',
    nature: 'POINT_IN_TIME',
    status: 'AVAILABLE',
    asOf: summary.asOf,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.overview.positionCount`,
    },
  });

  facts.push({
    factId: `${scope}.OVERVIEW.VALUED_POSITION_COUNT`,
    category: 'OVERVIEW',
    scope,
    metric: 'VALUED_POSITION_COUNT',
    value: String(c.overview.valuedPositionCount),
    unit: 'COUNT',
    nature: 'POINT_IN_TIME',
    status: 'AVAILABLE',
    asOf: summary.asOf,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.overview.valuedPositionCount`,
    },
  });

  facts.push({
    factId: `${scope}.OVERVIEW.UNVALUED_POSITION_COUNT`,
    category: 'OVERVIEW',
    scope,
    metric: 'UNVALUED_POSITION_COUNT',
    value: String(c.overview.unvaluedPositionCount),
    unit: 'COUNT',
    nature: 'POINT_IN_TIME',
    status: 'AVAILABLE',
    asOf: summary.asOf,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.overview.unvaluedPositionCount`,
    },
  });

  // 2. PERFORMANCE
  facts.push({
    factId: `${scope}.PERFORMANCE.TWR`,
    category: 'PERFORMANCE',
    scope,
    metric: 'TWR',
    value: c.performance.twr,
    unit: 'PERCENTAGE',
    nature: 'PERIOD',
    status: c.performance.status,
    reason: c.performance.twr === null ? 'INSUFFICIENT_HISTORY' : null,
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.performance.twr`,
    },
  });

  facts.push({
    factId: `${scope}.PERFORMANCE.XIRR`,
    category: 'PERFORMANCE',
    scope,
    metric: 'XIRR',
    value: c.performance.xirr,
    unit: 'PERCENTAGE',
    nature: 'PERIOD',
    status: c.performance.status,
    reason: c.performance.xirr === null ? 'INSUFFICIENT_HISTORY' : null,
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.performance.xirr`,
    },
  });

  facts.push({
    factId: `${scope}.PERFORMANCE.OBSERVATION_COUNT`,
    category: 'PERFORMANCE',
    scope,
    metric: 'OBSERVATION_COUNT',
    value: String(c.performance.observationCount),
    unit: 'COUNT',
    nature: 'PERIOD',
    status: 'AVAILABLE',
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.performance.observationCount`,
    },
  });

  // 3. BENCHMARK
  for (let idx = 0; idx < c.benchmarks.length; idx++) {
    const b = c.benchmarks[idx]!;
    facts.push({
      factId: `${scope}.BENCHMARK.${b.id}.RETURN`,
      category: 'BENCHMARK',
      scope,
      metric: `${b.id}_RETURN`,
      value: b.return,
      unit: 'PERCENTAGE',
      nature: 'PERIOD',
      status: b.status,
      reason: b.status === 'UNAVAILABLE' ? (isUsd ? 'UNSUPPORTED' : 'BENCHMARK_UNAVAILABLE') : null,
      period: summary.period,
      source: {
        contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
        path: `currencies.${scope}.benchmarks[${idx}].return`,
      },
    });

    facts.push({
      factId: `${scope}.BENCHMARK.${b.id}.DIFFERENCE`,
      category: 'BENCHMARK',
      scope,
      metric: `${b.id}_DIFFERENCE`,
      value: b.differencePercentagePoints,
      unit: 'PERCENTAGE_POINTS',
      nature: 'PERIOD',
      status: b.status,
      reason: b.status === 'UNAVAILABLE' ? (isUsd ? 'UNSUPPORTED' : 'BENCHMARK_UNAVAILABLE') : null,
      period: summary.period,
      source: {
        contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
        path: `currencies.${scope}.benchmarks[${idx}].differencePercentagePoints`,
      },
    });
  }

  // 4. RISK
  facts.push({
    factId: `${scope}.RISK.VOLATILITY`,
    category: 'RISK',
    scope,
    metric: 'REALIZED_VOLATILITY_ANNUALIZED',
    value: c.risk.realizedVolatilityAnnualized,
    unit: 'PERCENTAGE',
    nature: 'HISTORICAL',
    status: c.risk.status,
    reason: c.risk.realizedVolatilityAnnualized === null ? 'INSUFFICIENT_HISTORY' : null,
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.risk.realizedVolatilityAnnualized`,
    },
  });

  facts.push({
    factId: `${scope}.RISK.MAX_DRAWDOWN`,
    category: 'RISK',
    scope,
    metric: 'MAX_DRAWDOWN',
    value: c.risk.maximumDrawdown,
    unit: 'PERCENTAGE',
    nature: 'HISTORICAL',
    status: c.risk.status,
    reason: c.risk.maximumDrawdown === null ? 'INSUFFICIENT_HISTORY' : null,
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.risk.maximumDrawdown`,
    },
  });

  facts.push({
    factId: `${scope}.RISK.CURRENT_DRAWDOWN`,
    category: 'RISK',
    scope,
    metric: 'CURRENT_DRAWDOWN',
    value: c.risk.currentDrawdown,
    unit: 'PERCENTAGE',
    nature: 'POINT_IN_TIME',
    status: c.risk.status,
    reason: c.risk.currentDrawdown === null ? 'INSUFFICIENT_HISTORY' : null,
    asOf: summary.asOf,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.risk.currentDrawdown`,
    },
  });

  // 5. RISK_ADJUSTED
  facts.push({
    factId: `${scope}.RISK_ADJUSTED.SHARPE`,
    category: 'RISK_ADJUSTED',
    scope,
    metric: 'SHARPE',
    value: c.riskAdjusted.sharpe,
    unit: 'RATIO',
    nature: 'PERIOD',
    status: c.riskAdjusted.status,
    reason:
      c.riskAdjusted.status === 'UNAVAILABLE'
        ? isUsd
          ? 'UNSUPPORTED'
          : 'RISK_FREE_PROXY_UNAVAILABLE'
        : null,
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.riskAdjusted.sharpe`,
    },
  });

  facts.push({
    factId: `${scope}.RISK_ADJUSTED.SORTINO`,
    category: 'RISK_ADJUSTED',
    scope,
    metric: 'SORTINO',
    value: c.riskAdjusted.sortino,
    unit: 'RATIO',
    nature: 'PERIOD',
    status: c.riskAdjusted.status,
    reason:
      c.riskAdjusted.status === 'UNAVAILABLE'
        ? isUsd
          ? 'UNSUPPORTED'
          : 'RISK_FREE_PROXY_UNAVAILABLE'
        : null,
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.riskAdjusted.sortino`,
    },
  });

  // 6. RELATIVE_RISK
  facts.push({
    factId: `${scope}.RELATIVE_RISK.BETA`,
    category: 'RELATIVE_RISK',
    scope,
    metric: 'BETA',
    value: c.relativeRisk.beta,
    unit: 'RATIO',
    nature: 'PERIOD',
    status: c.relativeRisk.status,
    reason:
      c.relativeRisk.status === 'UNAVAILABLE' ? (isUsd ? 'UNSUPPORTED' : 'BETA_UNAVAILABLE') : null,
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.relativeRisk.beta`,
    },
  });

  facts.push({
    factId: `${scope}.RELATIVE_RISK.CORRELATION`,
    category: 'RELATIVE_RISK',
    scope,
    metric: 'CORRELATION',
    value: c.relativeRisk.correlation,
    unit: 'RATIO',
    nature: 'PERIOD',
    status: c.relativeRisk.status,
    reason:
      c.relativeRisk.status === 'UNAVAILABLE' ? (isUsd ? 'UNSUPPORTED' : 'BETA_UNAVAILABLE') : null,
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.relativeRisk.correlation`,
    },
  });

  facts.push({
    factId: `${scope}.RELATIVE_RISK.TRACKING_ERROR`,
    category: 'RELATIVE_RISK',
    scope,
    metric: 'TRACKING_ERROR_ANNUALIZED',
    value: c.relativeRisk.trackingErrorAnnualized,
    unit: 'PERCENTAGE',
    nature: 'PERIOD',
    status: c.relativeRisk.status,
    reason:
      c.relativeRisk.status === 'UNAVAILABLE' ? (isUsd ? 'UNSUPPORTED' : 'BETA_UNAVAILABLE') : null,
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.relativeRisk.trackingErrorAnnualized`,
    },
  });

  // 7. ACTIVE_PERFORMANCE
  facts.push({
    factId: `${scope}.ACTIVE.ALPHA`,
    category: 'ACTIVE_PERFORMANCE',
    scope,
    metric: 'ALPHA',
    value: c.activePerformance.alpha,
    unit: 'PERCENTAGE',
    nature: 'PERIOD',
    status: c.activePerformance.status,
    reason:
      c.activePerformance.status === 'UNAVAILABLE'
        ? isUsd
          ? 'UNSUPPORTED'
          : 'BENCHMARK_UNAVAILABLE'
        : null,
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.activePerformance.alpha`,
    },
  });

  facts.push({
    factId: `${scope}.ACTIVE.INFORMATION_RATIO`,
    category: 'ACTIVE_PERFORMANCE',
    scope,
    metric: 'INFORMATION_RATIO',
    value: c.activePerformance.informationRatio,
    unit: 'RATIO',
    nature: 'PERIOD',
    status: c.activePerformance.status,
    reason:
      c.activePerformance.status === 'UNAVAILABLE'
        ? isUsd
          ? 'UNSUPPORTED'
          : 'BENCHMARK_UNAVAILABLE'
        : null,
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.activePerformance.informationRatio`,
    },
  });

  facts.push({
    factId: `${scope}.ACTIVE.TREYNOR`,
    category: 'ACTIVE_PERFORMANCE',
    scope,
    metric: 'TREYNOR',
    value: c.activePerformance.treynor,
    unit: 'RATIO',
    nature: 'PERIOD',
    status: c.activePerformance.status,
    reason:
      c.activePerformance.status === 'UNAVAILABLE'
        ? isUsd
          ? 'UNSUPPORTED'
          : 'BENCHMARK_UNAVAILABLE'
        : null,
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.activePerformance.treynor`,
    },
  });

  // 8. TAIL_RISK
  facts.push({
    factId: `${scope}.TAIL.DOWNSIDE_DEVIATION`,
    category: 'TAIL_RISK',
    scope,
    metric: 'DOWNSIDE_DEVIATION_ANNUALIZED',
    value: c.tailRisk.downsideDeviationAnnualized,
    unit: 'PERCENTAGE',
    nature: 'HISTORICAL',
    status: c.tailRisk.status,
    reason: c.tailRisk.status === 'UNAVAILABLE' ? 'INSUFFICIENT_HISTORY' : null,
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.tailRisk.downsideDeviationAnnualized`,
    },
  });

  facts.push({
    factId: `${scope}.TAIL.SEMIDEVIATION`,
    category: 'TAIL_RISK',
    scope,
    metric: 'SEMIDEVIATION_ANNUALIZED',
    value: c.tailRisk.semideviationAnnualized,
    unit: 'PERCENTAGE',
    nature: 'HISTORICAL',
    status: c.tailRisk.status,
    reason: c.tailRisk.status === 'UNAVAILABLE' ? 'INSUFFICIENT_HISTORY' : null,
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.tailRisk.semideviationAnnualized`,
    },
  });

  facts.push({
    factId: `${scope}.TAIL.VAR95`,
    category: 'TAIL_RISK',
    scope,
    metric: 'VAR95',
    value: c.tailRisk.var95,
    unit: 'PERCENTAGE',
    nature: 'HISTORICAL',
    status: c.tailRisk.status,
    reason: c.tailRisk.status === 'UNAVAILABLE' ? 'INSUFFICIENT_HISTORY' : null,
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.tailRisk.var95`,
    },
  });

  facts.push({
    factId: `${scope}.TAIL.CVAR95`,
    category: 'TAIL_RISK',
    scope,
    metric: 'CVAR95',
    value: c.tailRisk.cvar95,
    unit: 'PERCENTAGE',
    nature: 'HISTORICAL',
    status: c.tailRisk.status,
    reason: c.tailRisk.status === 'UNAVAILABLE' ? 'INSUFFICIENT_HISTORY' : null,
    period: summary.period,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.tailRisk.cvar95`,
    },
  });

  // 9. SCENARIO
  facts.push({
    factId: `${scope}.SCENARIO.EQUITY_DOWN_10.BASE_VALUE`,
    category: 'SCENARIO',
    scope,
    metric: 'SCENARIO_BASE_VALUE',
    value: c.scenario.baseValue,
    unit: 'MONEY',
    currency: scope,
    nature: 'HYPOTHETICAL',
    status: c.scenario.status,
    reason: c.scenario.status === 'UNAVAILABLE' ? 'PARTIAL_VALUATION' : null,
    asOf: summary.asOf,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.scenario.baseValue`,
    },
  });

  facts.push({
    factId: `${scope}.SCENARIO.EQUITY_DOWN_10.STRESSED_VALUE`,
    category: 'SCENARIO',
    scope,
    metric: 'SCENARIO_STRESSED_VALUE',
    value: c.scenario.stressedValue,
    unit: 'MONEY',
    currency: scope,
    nature: 'HYPOTHETICAL',
    status: c.scenario.status,
    reason: c.scenario.status === 'UNAVAILABLE' ? 'PARTIAL_VALUATION' : null,
    asOf: summary.asOf,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.scenario.stressedValue`,
    },
  });

  facts.push({
    factId: `${scope}.SCENARIO.EQUITY_DOWN_10.ABSOLUTE_IMPACT`,
    category: 'SCENARIO',
    scope,
    metric: 'SCENARIO_ABSOLUTE_IMPACT',
    value: c.scenario.absoluteImpact,
    unit: 'MONEY',
    currency: scope,
    nature: 'HYPOTHETICAL',
    status: c.scenario.status,
    reason: c.scenario.status === 'UNAVAILABLE' ? 'PARTIAL_VALUATION' : null,
    asOf: summary.asOf,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.scenario.absoluteImpact`,
    },
  });

  facts.push({
    factId: `${scope}.SCENARIO.EQUITY_DOWN_10.PERCENTAGE_IMPACT`,
    category: 'SCENARIO',
    scope,
    metric: 'SCENARIO_PERCENTAGE_IMPACT',
    value: c.scenario.percentageImpact,
    unit: 'PERCENTAGE',
    nature: 'HYPOTHETICAL',
    status: c.scenario.status,
    reason: c.scenario.status === 'UNAVAILABLE' ? 'PARTIAL_VALUATION' : null,
    asOf: summary.asOf,
    source: {
      contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
      path: `currencies.${scope}.scenario.percentageImpact`,
    },
  });

  return facts;
}

/**
 * Derives limitations deterministically from the summary.
 */
function deriveLimitations(
  currencies: readonly string[],
  summary: PortfolioIntelligenceSummary,
): GroundedLimitation[] {
  const rawLimitations: GroundedLimitation[] = [];

  if (currencies.length > 1) {
    rawLimitations.push({
      code: 'MULTI_CURRENCY_NO_FX',
      scope: 'PORTFOLIO',
      description: 'Portfolio contains multiple currencies without foreign exchange aggregation.',
    });
  }

  for (const curr of currencies) {
    const c = summary.currencies[curr];
    if (!c) continue;

    if (c.overview.unvaluedPositionCount > 0) {
      rawLimitations.push({
        code: 'PARTIAL_VALUATION',
        scope: curr,
        count: c.overview.unvaluedPositionCount,
        description: `${c.overview.unvaluedPositionCount} position(s) lack valuation due to missing market prices.`,
      });
    }

    if (curr === 'USD') {
      rawLimitations.push({
        code: 'USD_BENCHMARK_UNSUPPORTED',
        scope: 'USD',
        description:
          'Domestic benchmarks (IBOV, CDI) are structurally unsupported for USD positions in this phase.',
      });
      rawLimitations.push({
        code: 'USD_RISK_FREE_PROXY_UNSUPPORTED',
        scope: 'USD',
        description:
          'Domestic risk-free rate proxy (CDI) is structurally unsupported for USD positions in this phase.',
      });
    }

    for (const [blockName, info] of Object.entries(c.dataQuality)) {
      if (info.status !== 'AVAILABLE' && info.reason && info.reason !== 'UNSUPPORTED') {
        rawLimitations.push({
          code: info.reason,
          scope: curr,
          description: `Data limitation for ${blockName}: ${info.reason}.`,
        });
      }
    }
  }

  // Deduplicate by code::scope and sort deterministically
  const seen = new Set<string>();
  const limitations = rawLimitations
    .filter((lim) => {
      const key = `${lim.scope}::${lim.code}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const scopeComp = a.scope.localeCompare(b.scope);
      if (scopeComp !== 0) return scopeComp;
      return a.code.localeCompare(b.code);
    });

  return limitations;
}

/**
 * Pure, deterministic builder transforming a PortfolioIntelligenceSummary into
 * a versioned, bounded, immutable PortfolioAiGroundingContextV1.
 */
export function buildPortfolioAiGroundingContext(
  summary: PortfolioIntelligenceSummary,
  options?: BuildGroundingOptions,
): PortfolioAiGroundingContextV1 {
  const generatedAt = options?.generatedAt ?? new Date().toISOString();
  const currencies = Object.keys(summary.currencies).sort();

  // Extract all facts for all currencies
  const rawFacts: GroundedFinancialFact[] = [];
  for (const curr of currencies) {
    rawFacts.push(...extractFactsForCurrency(curr, summary));
  }

  // Verify unique factIds (fail-closed if any duplicate exists)
  const seenFactIds = new Set<string>();
  for (const fact of rawFacts) {
    if (seenFactIds.has(fact.factId)) {
      throw new Error(`Duplicate factId detected in grounding context: ${fact.factId}`);
    }
    seenFactIds.add(fact.factId);
  }

  // Canonical ordering: category order -> currency ASC -> factId ASC
  const facts = rawFacts.slice().sort((a, b) => {
    const catDiff =
      GROUNDED_FACT_CATEGORIES.indexOf(a.category) - GROUNDED_FACT_CATEGORIES.indexOf(b.category);
    if (catDiff !== 0) return catDiff;
    const scopeDiff = a.scope.localeCompare(b.scope);
    if (scopeDiff !== 0) return scopeDiff;
    return a.factId.localeCompare(b.factId);
  });

  const limitations = deriveLimitations(currencies, summary);

  const dqCurrencies: Record<string, IntelligenceDataQualityInput> = {};
  for (const curr of currencies) {
    dqCurrencies[curr] = summary.currencies[curr]!.dataQuality;
  }

  const dataQuality: GroundedDataQuality = {
    status: summary.status,
    availability: summary.dataAvailability,
    currencies: dqCurrencies,
  };

  const context: PortfolioAiGroundingContextV1 = {
    schemaVersion: GROUNDING_SCHEMA_VERSION,
    portfolioId: summary.portfolioId,
    generatedAt,
    analysisPeriod: {
      startDate: summary.period.startDate,
      endDate: summary.period.endDate,
    },
    asOf: summary.asOf,
    currencies,
    facts,
    observations: summary.observations,
    dataQuality,
    limitations,
    capabilities: CANONICAL_GROUNDING_CAPABILITIES,
  };

  return deepFreeze(context);
}
