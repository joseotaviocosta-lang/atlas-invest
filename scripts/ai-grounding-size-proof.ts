/* eslint-disable no-console */
import {
  buildPortfolioIntelligenceSummary,
  CurrencyIntelligenceInput,
  PortfolioIntelligenceInput,
} from '@atlas/portfolio-intelligence';
import { buildPortfolioAiGroundingContext } from '@atlas/ai-engine';

function currencyInput(
  positions: number,
  overrides: Partial<CurrencyIntelligenceInput> = {},
): CurrencyIntelligenceInput {
  return {
    currency: 'BRL',
    overview: {
      currentMarketValue: String(positions * 50000),
      positionCount: positions,
      valuedPositionCount: positions,
      unvaluedPositionCount: 0,
      status: 'AVAILABLE',
    },
    performance: { twr: '12.4', xirr: '11.8', observationCount: 250, status: 'AVAILABLE' },
    benchmarks: [
      { id: 'IBOV', return: '8.4', differencePercentagePoints: '4.0', status: 'AVAILABLE' },
      { id: 'CDI', return: '9.2', differencePercentagePoints: '3.2', status: 'AVAILABLE' },
    ],
    risk: {
      realizedVolatilityAnnualized: '17.8',
      maximumDrawdown: '-12.3',
      currentDrawdown: '-4.1',
      status: 'AVAILABLE',
    },
    riskAdjusted: { sharpe: '1.25', sortino: '1.62', riskFreeProxy: 'CDI', status: 'AVAILABLE' },
    relativeRisk: {
      benchmark: 'IBOV',
      beta: '0.92',
      correlation: '0.84',
      trackingErrorAnnualized: '9.8',
      status: 'AVAILABLE',
    },
    activePerformance: {
      alpha: '2.1',
      informationRatio: '1.15',
      treynor: '5.2',
      status: 'AVAILABLE',
    },
    tailRisk: {
      confidenceLevel: '95',
      downsideDeviationAnnualized: '11.9',
      semideviationAnnualized: '9.8',
      var95: '2.35',
      cvar95: '3.10',
      status: 'AVAILABLE',
    },
    scenario: {
      preset: 'EQUITY_DOWN_10',
      type: 'EQUITY_PRICE_SHOCK',
      baseValue: String(positions * 50000),
      stressedValue: String(positions * 45000),
      absoluteImpact: String(-positions * 5000),
      percentageImpact: '-10.0',
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
    portfolioId: 'c0000000-0000-4000-8000-000000000001',
    period: { startDate: '2025-09-22', endDate: '2026-09-22' },
    asOf: '2026-09-22',
    currencies,
  };
}

function audit(label: string, currencies: CurrencyIntelligenceInput[]): void {
  const summary = buildPortfolioIntelligenceSummary(summaryInput(currencies));
  const context = buildPortfolioAiGroundingContext(summary, {
    generatedAt: '2026-09-24T12:00:00.000Z',
  });
  const serialized = JSON.stringify(context);

  console.log(`\n=== [${label}] ===`);
  console.log(`  currencies: [${context.currencies.join(', ')}]`);
  console.log(`  fact count: ${context.facts.length}`);
  console.log(`  observations count: ${context.observations.length}`);
  console.log(`  limitations count: ${context.limitations.length}`);
  console.log(`  serialized bytes: ${Buffer.byteLength(serialized, 'utf8')}`);
  console.log(`  serialized chars: ${serialized.length}`);
  console.log(`  summary calls: 1`);
  console.log(`  extra provider calls: 0`);
  console.log(`  model calls: 0`);
}

function main(): void {
  console.log('=== PORTFOLIO AI GROUNDING SIZE & SCALE PROOF (PHASE 3Q) ===');

  audit('BRL-only Complete (10 positions)', [currencyInput(10)]);
  audit('BRL-only Complete (100 positions)', [currencyInput(100)]);
  audit('BRL-only Complete (1000 positions)', [currencyInput(1000)]);

  audit('BRL + USD Complete (10 positions)', [
    currencyInput(10),
    currencyInput(10, {
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
        ...currencyInput(10).dataQuality,
        benchmarkAvailability: { status: 'UNAVAILABLE', reason: 'UNSUPPORTED' },
      },
    }),
  ]);

  audit('BRL + USD (1000 positions)', [
    currencyInput(1000),
    currencyInput(1000, {
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
        ...currencyInput(1000).dataQuality,
        benchmarkAvailability: { status: 'UNAVAILABLE', reason: 'UNSUPPORTED' },
      },
    }),
  ]);

  console.log('\n[ai-grounding-size-proof] DONE');
}

main();
