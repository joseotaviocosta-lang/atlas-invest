import { describe, it, expect } from 'vitest';
import {
  buildPortfolioIntelligenceSummary,
  CurrencyIntelligenceInput,
  PortfolioIntelligenceInput,
} from '@atlas/portfolio-intelligence';
import {
  buildPortfolioAiGroundingContext,
  GROUNDING_SCHEMA_VERSION,
  GROUNDED_FACT_CATEGORIES,
  CANONICAL_GROUNDING_CAPABILITIES,
} from '@atlas/ai-engine';

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

function summaryInput(currencies: CurrencyIntelligenceInput[]): PortfolioIntelligenceInput {
  return {
    portfolioId: 'portfolio-123',
    period: { startDate: '2025-09-22', endDate: '2026-09-22' },
    asOf: '2026-09-22',
    currencies,
  };
}

function resolvePropertyPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\w+)\]/g, '.$1').split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

describe('Portfolio AI Grounding Builder (Phase 3Q, ADR-173–ADR-178)', () => {
  it('builds a complete BRL grounding context with schema version and stable facts', () => {
    const summary = buildPortfolioIntelligenceSummary(summaryInput([currencyInput()]));
    const context = buildPortfolioAiGroundingContext(summary, {
      generatedAt: '2026-09-24T10:00:00.000Z',
    });

    expect(context.schemaVersion).toBe(GROUNDING_SCHEMA_VERSION);
    expect(context.portfolioId).toBe('portfolio-123');
    expect(context.generatedAt).toBe('2026-09-24T10:00:00.000Z');
    expect(context.analysisPeriod).toEqual({
      startDate: '2025-09-22',
      endDate: '2026-09-22',
    });
    expect(context.asOf).toBe('2026-09-22');
    expect(context.currencies).toEqual(['BRL']);
    expect(context.facts.length).toBe(30);
    expect(context.limitations.length).toBe(0);
    expect(context.capabilities).toEqual(CANONICAL_GROUNDING_CAPABILITIES);
  });

  it('preserves multi-currency segregation and detects MULTI_CURRENCY_NO_FX limitation', () => {
    const summary = buildPortfolioIntelligenceSummary(
      summaryInput([
        currencyInput(),
        currencyInput({
          currency: 'USD',
          benchmarks: [
            { id: 'IBOV', return: null, differencePercentagePoints: null, status: 'UNAVAILABLE' },
            { id: 'CDI', return: null, differencePercentagePoints: null, status: 'UNAVAILABLE' },
          ],
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
          },
        }),
      ]),
    );

    const context = buildPortfolioAiGroundingContext(summary);
    expect(context.currencies).toEqual(['BRL', 'USD']);

    const brlFacts = context.facts.filter((f) => f.scope === 'BRL');
    const usdFacts = context.facts.filter((f) => f.scope === 'USD');
    expect(brlFacts.length).toBe(30);
    expect(usdFacts.length).toBe(30);

    const multiLim = context.limitations.find((l) => l.code === 'MULTI_CURRENCY_NO_FX');
    expect(multiLim).toBeDefined();
    expect(multiLim!.scope).toBe('PORTFOLIO');

    const usdBenchLim = context.limitations.find((l) => l.code === 'USD_BENCHMARK_UNSUPPORTED');
    expect(usdBenchLim).toBeDefined();
    expect(usdBenchLim!.scope).toBe('USD');

    // Never produce a global aggregated money fact without FX
    expect(context.facts.some((f) => f.metric === 'TOTAL_MARKET_VALUE')).toBe(false);
  });

  it('critical transport test: preserves exact decimal string without rounding or recalculation', () => {
    const weirdDecimal = '3.999999999999999999';
    const summary = buildPortfolioIntelligenceSummary(
      summaryInput([
        currencyInput({
          benchmarks: [
            {
              id: 'IBOV',
              return: '8',
              differencePercentagePoints: weirdDecimal,
              status: 'AVAILABLE',
            },
          ],
        }),
      ]),
    );

    const context = buildPortfolioAiGroundingContext(summary);
    const diffFact = context.facts.find((f) => f.factId === 'BRL.BENCHMARK.IBOV.DIFFERENCE')!;
    expect(diffFact.value).toBe(weirdDecimal);
    expect(diffFact.value).not.toBe('4');
    expect(diffFact.unit).toBe('PERCENTAGE_POINTS');
    expect(diffFact.nature).toBe('PERIOD');
  });

  it('marks scenario facts as HYPOTHETICAL and tail facts as HISTORICAL', () => {
    const summary = buildPortfolioIntelligenceSummary(summaryInput([currencyInput()]));
    const context = buildPortfolioAiGroundingContext(summary);

    const scenarioFacts = context.facts.filter((f) => f.category === 'SCENARIO');
    expect(scenarioFacts.length).toBeGreaterThan(0);
    for (const f of scenarioFacts) {
      expect(f.nature).toBe('HYPOTHETICAL');
    }

    const tailFacts = context.facts.filter((f) => f.category === 'TAIL_RISK');
    expect(tailFacts.length).toBeGreaterThan(0);
    for (const f of tailFacts) {
      expect(f.nature).toBe('HISTORICAL');
    }

    const overviewValueFact = context.facts.find((f) => f.factId === 'BRL.OVERVIEW.MARKET_VALUE')!;
    expect(overviewValueFact.nature).toBe('POINT_IN_TIME');
    expect(overviewValueFact.unit).toBe('MONEY');
    expect(overviewValueFact.currency).toBe('BRL');

    const twrFact = context.facts.find((f) => f.factId === 'BRL.PERFORMANCE.TWR')!;
    expect(twrFact.nature).toBe('PERIOD');
    expect(twrFact.unit).toBe('PERCENTAGE');

    const sharpeFact = context.facts.find((f) => f.factId === 'BRL.RISK_ADJUSTED.SHARPE')!;
    expect(sharpeFact.unit).toBe('RATIO');
  });

  it('handles partial valuation with structured limitation count and PARTIAL status', () => {
    const summary = buildPortfolioIntelligenceSummary(
      summaryInput([
        currencyInput({
          overview: {
            currentMarketValue: '100000',
            positionCount: 5,
            valuedPositionCount: 3,
            unvaluedPositionCount: 2,
            status: 'PARTIAL',
          },
          dataQuality: {
            ...currencyInput().dataQuality,
            valuationCompleteness: { status: 'PARTIAL', reason: 'PARTIAL_VALUATION' },
          },
        }),
      ]),
    );

    const context = buildPortfolioAiGroundingContext(summary);
    const partLim = context.limitations.find((l) => l.code === 'PARTIAL_VALUATION')!;
    expect(partLim).toBeDefined();
    expect(partLim.scope).toBe('BRL');
    expect(partLim.count).toBe(2);

    const mvFact = context.facts.find((f) => f.factId === 'BRL.OVERVIEW.MARKET_VALUE')!;
    expect(mvFact.status).toBe('PARTIAL');
  });

  it('handles unavailable metrics with null value and canonical reason without inventing data', () => {
    const summary = buildPortfolioIntelligenceSummary(
      summaryInput([
        currencyInput({
          performance: {
            twr: null,
            xirr: null,
            observationCount: 0,
            status: 'UNAVAILABLE',
          },
          dataQuality: {
            ...currencyInput().dataQuality,
            performanceAvailability: { status: 'UNAVAILABLE', reason: 'INSUFFICIENT_HISTORY' },
          },
        }),
      ]),
    );

    const context = buildPortfolioAiGroundingContext(summary);
    const twrFact = context.facts.find((f) => f.factId === 'BRL.PERFORMANCE.TWR')!;
    expect(twrFact.value).toBeNull();
    expect(twrFact.status).toBe('UNAVAILABLE');
    expect(twrFact.reason).toBe('INSUFFICIENT_HISTORY');
  });

  it('guarantees unique factIds and strict canonical ordering', () => {
    const summary = buildPortfolioIntelligenceSummary(
      summaryInput([currencyInput(), currencyInput({ currency: 'USD', benchmarks: [] })]),
    );
    const context = buildPortfolioAiGroundingContext(summary);

    const ids = context.facts.map((f) => f.factId);
    expect(new Set(ids).size).toBe(ids.length);

    // Verify category ordering matches GROUNDED_FACT_CATEGORIES
    let lastCatIndex = -1;
    let lastScope = '';
    let lastFactId = '';

    for (const f of context.facts) {
      const catIndex = GROUNDED_FACT_CATEGORIES.indexOf(f.category);
      if (catIndex > lastCatIndex) {
        lastCatIndex = catIndex;
        lastScope = f.scope;
        lastFactId = f.factId;
      } else if (catIndex === lastCatIndex) {
        const scopeComp = f.scope.localeCompare(lastScope);
        if (scopeComp > 0) {
          lastScope = f.scope;
          lastFactId = f.factId;
        } else if (scopeComp === 0) {
          expect(f.factId.localeCompare(lastFactId)).toBeGreaterThanOrEqual(0);
          lastFactId = f.factId;
        } else {
          throw new Error(`Scope out of order: ${lastScope} before ${f.scope}`);
        }
      } else {
        throw new Error(`Category out of order: ${lastCatIndex} before ${catIndex}`);
      }
    }
  });

  it('source path verification: every fact points to a valid path on the source summary', () => {
    const summary = buildPortfolioIntelligenceSummary(summaryInput([currencyInput()]));
    const context = buildPortfolioAiGroundingContext(summary);

    expect(context.facts.length).toBeGreaterThan(0);
    for (const fact of context.facts) {
      expect(fact.source.contract).toBe('PORTFOLIO_INTELLIGENCE_SUMMARY_V1');
      const resolved = resolvePropertyPath(summary, fact.source.path);
      // Property exists on summary (can be null/number/string, but not undefined)
      expect(resolved, `Path ${fact.source.path} did not resolve`).not.toBeUndefined();
      if (fact.value !== null) {
        expect(String(resolved)).toBe(fact.value);
      }
    }
  });

  it('is completely frozen and immutable', () => {
    const summary = buildPortfolioIntelligenceSummary(summaryInput([currencyInput()]));
    const context = buildPortfolioAiGroundingContext(summary);

    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.facts)).toBe(true);
    expect(Object.isFrozen(context.limitations)).toBe(true);
    expect(Object.isFrozen(context.capabilities)).toBe(true);
    expect(Object.isFrozen(context.analysisPeriod)).toBe(true);
    expect(Object.isFrozen(context.facts[0])).toBe(true);
  });

  it('deterministic output when given the same generatedAt clock', () => {
    const summary = buildPortfolioIntelligenceSummary(summaryInput([currencyInput()]));
    const a = buildPortfolioAiGroundingContext(summary, { generatedAt: '2026-09-24T12:00:00Z' });
    const b = buildPortfolioAiGroundingContext(summary, { generatedAt: '2026-09-24T12:00:00Z' });

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('data minimization: context excludes auth secrets, tokens, email, CPF, and raw transactions', () => {
    const summary = buildPortfolioIntelligenceSummary(summaryInput([currencyInput()]));
    const context = buildPortfolioAiGroundingContext(summary);
    const json = JSON.stringify(context).toLowerCase();

    const sensitiveWords = [
      'password',
      'refreshtoken',
      'accesstoken',
      'authorization',
      'cpf',
      'email',
      'session',
      'jwt',
      'bearer',
    ];

    for (const word of sensitiveWords) {
      expect(json).not.toContain(word);
    }

    // Check no raw transactions array
    expect(context).not.toHaveProperty('transactions');
    expect(json).not.toMatch(/"transactions"\s*:/);
    expect(json).not.toMatch(/"ledger"\s*:/);
  });

  it('bounded size: fact count does not scale with position count', () => {
    const summary10 = buildPortfolioIntelligenceSummary(
      summaryInput([
        currencyInput({ overview: { ...currencyInput().overview, positionCount: 10 } }),
      ]),
    );
    const summary100 = buildPortfolioIntelligenceSummary(
      summaryInput([
        currencyInput({ overview: { ...currencyInput().overview, positionCount: 100 } }),
      ]),
    );
    const summary1000 = buildPortfolioIntelligenceSummary(
      summaryInput([
        currencyInput({ overview: { ...currencyInput().overview, positionCount: 1000 } }),
      ]),
    );

    const ctx10 = buildPortfolioAiGroundingContext(summary10);
    const ctx100 = buildPortfolioAiGroundingContext(summary100);
    const ctx1000 = buildPortfolioAiGroundingContext(summary1000);

    expect(ctx10.facts.length).toBe(ctx100.facts.length);
    expect(ctx100.facts.length).toBe(ctx1000.facts.length);
    expect(ctx10.facts.length).toBe(30);
  });

  it('no AI recommendation, score, or prediction language present in context', () => {
    const summary = buildPortfolioIntelligenceSummary(summaryInput([currencyInput()]));
    const context = buildPortfolioAiGroundingContext(summary);
    const json = JSON.stringify(context).toLowerCase();

    expect(json).not.toMatch(/"score"|"ranking"|"grade"|"rating"/);
    expect(json).not.toMatch(/"recommendation"|"rebalance"|"buysignal"|"sellsignal"/);
    expect(json).not.toMatch(/"prediction"|"forecast"|"expectedreturn"/);
  });
});
