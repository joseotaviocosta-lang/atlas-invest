import { describe, it, expect } from 'vitest';
import { mapToPortfolioIntelligenceViewModel, performanceQueryKey } from '@atlas/ui';

function createMockSummary(overrides: Record<string, unknown> = {}) {
  return {
    portfolioId: 'p1',
    period: { startDate: '2026-09-17', endDate: '2026-10-17' },
    asOf: '2026-10-17',
    currencies: {
      BRL: {
        currency: 'BRL',
        status: 'AVAILABLE',
        dataAvailability: 'COMPLETE',
        overview: {
          currentMarketValue: '100000',
          positionCount: 2,
          valuedPositionCount: 2,
          unvaluedPositionCount: 0,
          status: 'AVAILABLE',
        },
        performance: { twr: '2.35', xirr: '2.10', observationCount: 22, status: 'AVAILABLE' },
        benchmarks: [
          { id: 'IBOV', return: '0.54', differencePercentagePoints: '1.81', status: 'AVAILABLE' },
          { id: 'CDI', return: null, differencePercentagePoints: null, status: 'UNAVAILABLE' },
        ],
        risk: {
          realizedVolatilityAnnualized: '15',
          maximumDrawdown: '-2.5',
          currentDrawdown: '-1.0',
          status: 'AVAILABLE',
        },
        riskAdjusted: { sharpe: '1.1', sortino: '1.4', riskFreeProxy: 'CDI', status: 'AVAILABLE' },
        relativeRisk: {
          benchmark: 'IBOV',
          beta: '0.85',
          correlation: '0.78',
          trackingErrorAnnualized: '8.5',
          status: 'AVAILABLE',
        },
        activePerformance: {
          alpha: '1.5',
          informationRatio: '0.9',
          treynor: '4.2',
          status: 'AVAILABLE',
        },
        tailRisk: {
          confidenceLevel: '95',
          downsideDeviationAnnualized: '10',
          semideviationAnnualized: '8',
          var95: '2.0',
          cvar95: '3.0',
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
        dataQuality: {},
      },
    },
    observations: [
      {
        code: 'PERFORMANCE_VS_IBOV',
        scope: 'BRL',
        status: 'AVAILABLE',
        source: 'INTELLIGENCE_ENGINE',
        values: {
          portfolioReturn: '2.35',
          benchmarkReturn: '0.54',
          differencePercentagePoints: '1.81',
        },
      },
      {
        code: 'PERFORMANCE_VS_CDI',
        scope: 'BRL',
        status: 'AVAILABLE',
        source: 'INTELLIGENCE_ENGINE',
        values: {
          portfolioReturn: '2.35',
          benchmarkReturn: '0.97',
          differencePercentagePoints: '1.38',
        },
      },
      {
        code: 'MAX_DRAWDOWN',
        scope: 'BRL',
        status: 'AVAILABLE',
        source: 'INTELLIGENCE_ENGINE',
        values: { maximumDrawdown: '-2.5' },
      },
    ],
    status: 'COMPLETE',
    dataAvailability: 'AVAILABLE',
    ...overrides,
  };
}

describe('Phase 5B-H3-R2: Selected Benchmark Runtime Isolation & View Model Filtering', () => {
  it('filters benchmarks and observations strictly to IBOV when selectedBenchmark=IBOV', () => {
    const raw = createMockSummary();
    const vm = mapToPortfolioIntelligenceViewModel(raw, 'IBOV');

    expect(vm).not.toBeNull();
    const brl = vm!.currencies[0]!;
    expect(brl.benchmarks).toHaveLength(1);
    expect(brl.benchmarks[0]!.id).toBe('IBOV');
    expect(brl.benchmarks[0]!.label).toBe('Ibovespa');

    // CDI observations must NOT bleed into IBOV view
    const obsCodes = vm!.observations.map((o) => o.code);
    expect(obsCodes).toContain('PERFORMANCE_VS_IBOV');
    expect(obsCodes).not.toContain('PERFORMANCE_VS_CDI');
    expect(obsCodes).toContain('MAX_DRAWDOWN');
  });

  it('filters benchmarks and observations strictly to CDI when selectedBenchmark=CDI', () => {
    const raw = createMockSummary();
    const vm = mapToPortfolioIntelligenceViewModel(raw, 'CDI');

    expect(vm).not.toBeNull();
    const brl = vm!.currencies[0]!;
    expect(brl.benchmarks).toHaveLength(1);
    expect(brl.benchmarks[0]!.id).toBe('CDI');
    expect(brl.benchmarks[0]!.label).toBe('CDI');

    // IBOV observations must NOT bleed into CDI view
    const obsCodes = vm!.observations.map((o) => o.code);
    expect(obsCodes).toContain('PERFORMANCE_VS_CDI');
    expect(obsCodes).not.toContain('PERFORMANCE_VS_IBOV');
    expect(obsCodes).toContain('MAX_DRAWDOWN');
  });

  it('retains all benchmarks when no benchmark is selected ("" or undefined)', () => {
    const raw = createMockSummary();
    const vmNoFilter = mapToPortfolioIntelligenceViewModel(raw);
    const vmEmpty = mapToPortfolioIntelligenceViewModel(raw, '');

    expect(vmNoFilter!.currencies[0]!.benchmarks).toHaveLength(2);
    expect(vmEmpty!.currencies[0]!.benchmarks).toHaveLength(2);

    expect(vmNoFilter!.observations.map((o) => o.code)).toEqual([
      'PERFORMANCE_VS_IBOV',
      'PERFORMANCE_VS_CDI',
      'MAX_DRAWDOWN',
    ]);
  });

  it('performanceQueryKey includes benchmark parameter for distinct cache keys', () => {
    const keyNone = performanceQueryKey('p1', '2026-09-17', '2026-10-17');
    const keyIbov = performanceQueryKey('p1', '2026-09-17', '2026-10-17', 'IBOV');
    const keyCdi = performanceQueryKey('p1', '2026-09-17', '2026-10-17', 'CDI');

    expect(keyNone).toEqual(['portfolio-performance', 'p1', '2026-09-17', '2026-10-17', 'none']);
    expect(keyIbov).toEqual(['portfolio-performance', 'p1', '2026-09-17', '2026-10-17', 'IBOV']);
    expect(keyCdi).toEqual(['portfolio-performance', 'p1', '2026-09-17', '2026-10-17', 'CDI']);

    // Must be completely distinct cache partitions
    expect(keyIbov).not.toEqual(keyCdi);
    expect(keyIbov).not.toEqual(keyNone);
    expect(keyCdi).not.toEqual(keyNone);
  });
});
