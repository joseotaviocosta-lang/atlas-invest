import { describe, it, expect } from 'vitest';
import {
  buildPortfolioIntelligenceSummary,
  OBSERVATION_ORDER,
  PORTFOLIO_INTELLIGENCE_VERSION,
  CurrencyIntelligenceInput,
  PortfolioIntelligenceInput,
} from '@atlas/portfolio-intelligence';

function currencyInput(
  overrides: Partial<CurrencyIntelligenceInput> = {},
): CurrencyIntelligenceInput {
  return {
    currency: 'BRL',
    overview: {
      currentMarketValue: '100000',
      positionCount: 2,
      valuedPositionCount: 2,
      unvaluedPositionCount: 0,
      status: 'AVAILABLE',
    },
    performance: { twr: '12', xirr: '11.5', observationCount: 200, status: 'AVAILABLE' },
    benchmarks: [
      { id: 'IBOV', return: '8', differencePercentagePoints: '4', status: 'AVAILABLE' },
      { id: 'CDI', return: '9', differencePercentagePoints: '3', status: 'AVAILABLE' },
    ],
    risk: {
      realizedVolatilityAnnualized: '18',
      maximumDrawdown: '-12',
      currentDrawdown: '-5',
      status: 'AVAILABLE',
    },
    riskAdjusted: { sharpe: '1.2', sortino: '1.5', riskFreeProxy: 'CDI', status: 'AVAILABLE' },
    relativeRisk: {
      benchmark: 'IBOV',
      beta: '0.9',
      correlation: '0.8',
      trackingErrorAnnualized: '10',
      status: 'AVAILABLE',
    },
    activePerformance: { alpha: '2', informationRatio: '1.1', treynor: '5', status: 'AVAILABLE' },
    tailRisk: {
      confidenceLevel: '95',
      downsideDeviationAnnualized: '12',
      semideviationAnnualized: '10',
      var95: '2.5',
      cvar95: '3.5',
      status: 'AVAILABLE',
    },
    scenario: {
      preset: 'EQUITY_DOWN_10',
      type: 'EQUITY_PRICE_SHOCK',
      baseValue: '100000',
      stressedValue: '90000',
      absoluteImpact: '-10000',
      percentageImpact: '-10',
      hypothetical: true,
      status: 'AVAILABLE',
    },
    dataQuality: {
      portfolioStateCompleteness: { status: 'AVAILABLE', reason: null },
      valuationCompleteness: { status: 'AVAILABLE', reason: null },
      performanceAvailability: { status: 'AVAILABLE', reason: null },
      benchmarkAvailability: { status: 'AVAILABLE', reason: null },
      riskAvailability: { status: 'AVAILABLE', reason: null },
      tailRiskAvailability: { status: 'AVAILABLE', reason: null },
      scenarioAvailability: { status: 'AVAILABLE', reason: null },
    },
    ...overrides,
  };
}

function input(currencies: CurrencyIntelligenceInput[]): PortfolioIntelligenceInput {
  return {
    portfolioId: 'p1',
    period: { startDate: '2025-09-22', endDate: '2026-09-22' },
    asOf: '2026-09-22',
    currencies,
  };
}

describe('Portfolio Intelligence aggregator (ADR-166/168/169)', () => {
  it('exposes a version and aggregates all supplied blocks', () => {
    const summary = buildPortfolioIntelligenceSummary(input([currencyInput()]));
    expect(PORTFOLIO_INTELLIGENCE_VERSION).toBe('0.1.0');
    expect(summary.status).toBe('AVAILABLE');
    expect(summary.dataAvailability).toBe('COMPLETE');
    expect(summary.currencies.BRL.performance.twr).toBe('12');
    expect(summary.currencies.BRL.risk.realizedVolatilityAnnualized).toBe('18');
    expect(summary.currencies.BRL.relativeRisk.beta).toBe('0.9');
    expect(summary.currencies.BRL.activePerformance.alpha).toBe('2');
    expect(summary.currencies.BRL.tailRisk.var95).toBe('2.5');
  });

  it('is deterministic and frozen', () => {
    const a = buildPortfolioIntelligenceSummary(input([currencyInput()]));
    const b = buildPortfolioIntelligenceSummary(input([currencyInput()]));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.observations)).toBe(true);
    expect(Object.isFrozen(a.currencies)).toBe(true);
  });

  it('orders observations by the canonical order and dedups (code, scope)', () => {
    const summary = buildPortfolioIntelligenceSummary(input([currencyInput()]));
    const codes = summary.observations.map((o) => o.code);
    const indexes = codes.map((c) => OBSERVATION_ORDER.indexOf(c));
    expect([...indexes].sort((x, y) => x - y)).toEqual(indexes);
    const keys = summary.observations.map((o) => `${o.code}::${o.scope}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('performance observation transports the canonical difference (no float math)', () => {
    const summary = buildPortfolioIntelligenceSummary(input([currencyInput()]));
    const obs = summary.observations.find((o) => o.code === 'PERFORMANCE_VS_IBOV')!;
    expect(obs.scope).toBe('BRL');
    expect(obs.source).toBe('PERFORMANCE');
    expect(obs.values.portfolioReturn).toBe('12');
    expect(obs.values.benchmarkReturn).toBe('8');
    expect(obs.values.differencePercentagePoints).toBe('4');
  });

  it('transports the SUPPLIED difference verbatim (never recalculates)', () => {
    const summary = buildPortfolioIntelligenceSummary(
      input([
        currencyInput({
          benchmarks: [
            {
              id: 'IBOV',
              return: '8',
              differencePercentagePoints: '3.999999999999999999',
              status: 'AVAILABLE',
            },
          ],
        }),
      ]),
    );
    const obs = summary.observations.find((o) => o.code === 'PERFORMANCE_VS_IBOV')!;
    // 12 - 8 = 4 would be a recalculation; the supplied value must pass through.
    expect(obs.values.differencePercentagePoints).toBe('3.999999999999999999');
    expect(obs.values.differencePercentagePoints).not.toBe('4');
  });

  it('scenario values are transported from the supplied read model (no base × 0.9)', () => {
    const summary = buildPortfolioIntelligenceSummary(
      input([
        currencyInput({
          scenario: {
            preset: 'EQUITY_DOWN_10',
            type: 'EQUITY_PRICE_SHOCK',
            baseValue: '100000',
            stressedValue: '12345', // deliberately NOT base × 0.9
            absoluteImpact: '-87655',
            percentageImpact: '-87.655',
            hypothetical: true,
            status: 'AVAILABLE',
          },
        }),
      ]),
    );
    const obs = summary.observations.find((o) => o.code === 'EQUITY_DOWN_10_IMPACT')!;
    expect(obs.values.stressedValue).toBe('12345');
    expect(obs.values.absoluteImpact).toBe('-87655');
    expect(obs.values.percentageImpact).toBe('-87.655');
  });

  it('negative difference is returned without a qualitative label', () => {
    const summary = buildPortfolioIntelligenceSummary(
      input([
        currencyInput({
          benchmarks: [
            { id: 'IBOV', return: '8', differencePercentagePoints: '-3', status: 'AVAILABLE' },
          ],
        }),
      ]),
    );
    const obs = summary.observations.find((o) => o.code === 'PERFORMANCE_VS_IBOV')!;
    expect(obs.values.differencePercentagePoints).toBe('-3');
    expect(JSON.stringify(obs)).not.toMatch(/outperform|underperform|good|bad/i);
  });

  it('current drawdown observation is omitted when exactly 0', () => {
    const summary = buildPortfolioIntelligenceSummary(
      input([
        currencyInput({
          risk: {
            realizedVolatilityAnnualized: '18',
            maximumDrawdown: '-12',
            currentDrawdown: '0',
            status: 'AVAILABLE',
          },
        }),
      ]),
    );
    expect(summary.observations.some((o) => o.code === 'CURRENT_DRAWDOWN')).toBe(false);
    expect(summary.observations.some((o) => o.code === 'MAX_DRAWDOWN')).toBe(true);
  });

  it('maximum drawdown observation is suppressed when risk status is PARTIAL or UNAVAILABLE', () => {
    const summary = buildPortfolioIntelligenceSummary(
      input([
        currencyInput({
          risk: {
            realizedVolatilityAnnualized: '18',
            maximumDrawdown: '0',
            currentDrawdown: '0',
            status: 'PARTIAL',
          },
          dataQuality: {
            ...currencyInput().dataQuality,
            riskAvailability: { status: 'PARTIAL', reason: null },
          },
        }),
      ]),
    );
    expect(summary.observations.some((o) => o.code === 'MAX_DRAWDOWN')).toBe(false);
  });

  it('tail observation is created only when available; no fake observation', () => {
    const available = buildPortfolioIntelligenceSummary(input([currencyInput()]));
    expect(available.observations.some((o) => o.code === 'TAIL_RISK_95')).toBe(true);

    const unavailable = buildPortfolioIntelligenceSummary(
      input([
        currencyInput({
          tailRisk: {
            confidenceLevel: '95',
            downsideDeviationAnnualized: null,
            semideviationAnnualized: null,
            var95: null,
            cvar95: null,
            status: 'UNAVAILABLE',
          },
          dataQuality: {
            ...currencyInput().dataQuality,
            tailRiskAvailability: { status: 'UNAVAILABLE', reason: 'INSUFFICIENT_HISTORY' },
          },
        }),
      ]),
    );
    expect(unavailable.observations.some((o) => o.code === 'TAIL_RISK_95')).toBe(false);
    const incomplete = unavailable.observations.find((o) => o.code === 'INCOMPLETE_DATA')!;
    expect(incomplete.values.reasons).toContain('INSUFFICIENT_HISTORY');
  });

  it('scenario observation is hypothetical and transports precomputed values', () => {
    const summary = buildPortfolioIntelligenceSummary(input([currencyInput()]));
    const obs = summary.observations.find((o) => o.code === 'EQUITY_DOWN_10_IMPACT')!;
    expect(obs.source).toBe('SCENARIO');
    expect(obs.values.hypothetical).toBe('true');
    expect(obs.values.baseValue).toBe('100000');
    expect(obs.values.absoluteImpact).toBe('-10000');
  });

  it('multi-currency: separate blocks, MULTI_CURRENCY_PRESENT, no global total', () => {
    const summary = buildPortfolioIntelligenceSummary(
      input([currencyInput(), currencyInput({ currency: 'USD', benchmarks: [] })]),
    );
    expect(Object.keys(summary.currencies).sort()).toEqual(['BRL', 'USD']);
    const multi = summary.observations.find((o) => o.code === 'MULTI_CURRENCY_PRESENT')!;
    expect(multi.scope).toBe('PORTFOLIO');
    expect(multi.values.currencies).toEqual(['BRL', 'USD']);
    expect(JSON.stringify(summary)).not.toMatch(
      /totalMarketValue|globalTotal|patrimonioConsolidado/i,
    );
  });

  it('status aggregation: partial block → currency PARTIAL, top-level PARTIAL', () => {
    const summary = buildPortfolioIntelligenceSummary(
      input([
        currencyInput({
          overview: {
            currentMarketValue: '100000',
            positionCount: 2,
            valuedPositionCount: 1,
            unvaluedPositionCount: 1,
            status: 'PARTIAL',
          },
          dataQuality: {
            ...currencyInput().dataQuality,
            valuationCompleteness: { status: 'PARTIAL', reason: 'PARTIAL_VALUATION' },
          },
        }),
      ]),
    );
    expect(summary.currencies.BRL.status).toBe('PARTIAL');
    expect(summary.status).toBe('PARTIAL');
    expect(summary.observations.some((o) => o.code === 'PARTIAL_VALUATION')).toBe(true);
  });

  it('USD structural unsupported does not force top-level PARTIAL', () => {
    const summary = buildPortfolioIntelligenceSummary(
      input([
        currencyInput(),
        currencyInput({
          currency: 'USD',
          benchmarks: [],
          riskAdjusted: { sharpe: null, sortino: null, riskFreeProxy: null, status: 'UNAVAILABLE' },
          relativeRisk: {
            benchmark: null,
            beta: null,
            correlation: null,
            trackingErrorAnnualized: null,
            status: 'UNAVAILABLE',
          },
          activePerformance: {
            alpha: null,
            informationRatio: null,
            treynor: null,
            status: 'UNAVAILABLE',
          },
          dataQuality: {
            ...currencyInput().dataQuality,
            benchmarkAvailability: { status: 'UNAVAILABLE', reason: 'UNSUPPORTED' },
            riskAvailability: { status: 'AVAILABLE', reason: null },
            tailRiskAvailability: { status: 'AVAILABLE', reason: null },
          },
        }),
      ]),
    );
    // BRL available + USD structurally unsupported → summary stays AVAILABLE.
    expect(summary.status).toBe('AVAILABLE');
  });

  it('unavailable when no currency has a core snapshot', () => {
    const summary = buildPortfolioIntelligenceSummary(
      input([
        currencyInput({
          overview: {
            currentMarketValue: null,
            positionCount: 0,
            valuedPositionCount: 0,
            unvaluedPositionCount: 0,
            status: 'UNAVAILABLE',
          },
          dataQuality: {
            ...currencyInput().dataQuality,
            portfolioStateCompleteness: { status: 'UNAVAILABLE', reason: 'INSUFFICIENT_HISTORY' },
          },
        }),
      ]),
    );
    expect(summary.status).toBe('UNAVAILABLE');
    expect(summary.dataAvailability).toBe('UNAVAILABLE');
  });

  it('does not create scores/ratings/recommendations', () => {
    const summary = buildPortfolioIntelligenceSummary(input([currencyInput()]));
    const text = JSON.stringify(summary);
    expect(text).not.toMatch(/score|rating|grade|ranking|recommend|rebalance|buy|sell/i);
  });
});
