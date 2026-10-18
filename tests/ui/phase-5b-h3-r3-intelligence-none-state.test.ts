import { describe, it, expect } from 'vitest';
import { mapToPortfolioIntelligenceViewModel, intelligenceSummaryQueryKey } from '@atlas/ui';

function createMockSummary() {
  return {
    portfolioId: 'p-h3-r3',
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
          { id: 'CDI', return: '0.97', differencePercentagePoints: '1.38', status: 'AVAILABLE' },
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
        dataQuality: {
          benchmarkAvailability: { status: 'AVAILABLE', reason: null },
        },
      },
    },
    observations: [
      {
        code: 'PERFORMANCE_VS_IBOV',
        scope: 'BRL',
        status: 'AVAILABLE',
        source: 'PERFORMANCE',
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
        source: 'PERFORMANCE',
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
        source: 'RISK',
        values: { maximumDrawdown: '-2.5' },
      },
    ],
    status: 'COMPLETE',
    dataAvailability: 'AVAILABLE',
  };
}

describe('Phase 5B-H3-R3: Intelligence Summary Selected-Benchmark Isolation & None-State', () => {
  it('CASE A: selectedBenchmark=IBOV -> benchmarks has only IBOV and observations contain only IBOV comparison', () => {
    const raw = createMockSummary();
    const vm = mapToPortfolioIntelligenceViewModel(raw, 'IBOV');

    expect(vm).not.toBeNull();
    const brl = vm!.currencies[0]!;
    expect(brl.benchmarks).toHaveLength(1);
    expect(brl.benchmarks[0]!.id).toBe('IBOV');
    expect(brl.benchmarks[0]!.label).toBe('Ibovespa');
    expect(brl.benchmarks[0]!.returnFormatted).toBe('0,54%');

    const obsCodes = vm!.observations.map((o) => o.code);
    expect(obsCodes).toContain('PERFORMANCE_VS_IBOV');
    expect(obsCodes).not.toContain('PERFORMANCE_VS_CDI');
    expect(obsCodes).toContain('MAX_DRAWDOWN');
  });

  it('CASE B: selectedBenchmark=CDI -> benchmarks has only CDI and observations contain only CDI comparison', () => {
    const raw = createMockSummary();
    const vm = mapToPortfolioIntelligenceViewModel(raw, 'CDI');

    expect(vm).not.toBeNull();
    const brl = vm!.currencies[0]!;
    expect(brl.benchmarks).toHaveLength(1);
    expect(brl.benchmarks[0]!.id).toBe('CDI');
    expect(brl.benchmarks[0]!.label).toBe('CDI');
    expect(brl.benchmarks[0]!.returnFormatted).toBe('0,97%');

    const obsCodes = vm!.observations.map((o) => o.code);
    expect(obsCodes).toContain('PERFORMANCE_VS_CDI');
    expect(obsCodes).not.toContain('PERFORMANCE_VS_IBOV');
    expect(obsCodes).toContain('MAX_DRAWDOWN');
  });

  it('CASE C: selectedBenchmark="" (Sem benchmark) -> benchmarks array is empty and all benchmark observations are suppressed', () => {
    const raw = createMockSummary();
    const vm = mapToPortfolioIntelligenceViewModel(raw, '');

    expect(vm).not.toBeNull();
    const brl = vm!.currencies[0]!;
    expect(brl.benchmarks).toHaveLength(0);

    const obsCodes = vm!.observations.map((o) => o.code);
    expect(obsCodes).not.toContain('PERFORMANCE_VS_IBOV');
    expect(obsCodes).not.toContain('PERFORMANCE_VS_CDI');
    expect(obsCodes).toContain('MAX_DRAWDOWN');
  });

  it('selectedBenchmark="none" -> benchmarks array is empty and all benchmark observations are suppressed', () => {
    const raw = createMockSummary();
    const vm = mapToPortfolioIntelligenceViewModel(raw, 'none');

    expect(vm).not.toBeNull();
    const brl = vm!.currencies[0]!;
    expect(brl.benchmarks).toHaveLength(0);

    const obsCodes = vm!.observations.map((o) => o.code);
    expect(obsCodes).not.toContain('PERFORMANCE_VS_IBOV');
    expect(obsCodes).not.toContain('PERFORMANCE_VS_CDI');
    expect(obsCodes).toContain('MAX_DRAWDOWN');
  });

  it('intelligenceSummaryQueryKey partitions cache by benchmark strictly into 5-tuple', () => {
    const keyDefault = intelligenceSummaryQueryKey('p1', '2026-09-17', '2026-10-17');
    const keyEmpty = intelligenceSummaryQueryKey('p1', '2026-09-17', '2026-10-17', '');
    const keyNone = intelligenceSummaryQueryKey('p1', '2026-09-17', '2026-10-17', 'none');
    const keyIbov = intelligenceSummaryQueryKey('p1', '2026-09-17', '2026-10-17', 'IBOV');
    const keyCdi = intelligenceSummaryQueryKey('p1', '2026-09-17', '2026-10-17', 'CDI');

    expect(keyDefault).toEqual([
      'portfolio-intelligence-summary',
      'p1',
      '2026-09-17',
      '2026-10-17',
      'none',
    ]);
    expect(keyEmpty).toEqual([
      'portfolio-intelligence-summary',
      'p1',
      '2026-09-17',
      '2026-10-17',
      'none',
    ]);
    expect(keyNone).toEqual([
      'portfolio-intelligence-summary',
      'p1',
      '2026-09-17',
      '2026-10-17',
      'none',
    ]);
    expect(keyIbov).toEqual([
      'portfolio-intelligence-summary',
      'p1',
      '2026-09-17',
      '2026-10-17',
      'IBOV',
    ]);
    expect(keyCdi).toEqual([
      'portfolio-intelligence-summary',
      'p1',
      '2026-09-17',
      '2026-10-17',
      'CDI',
    ]);

    // Cache partition proof
    expect(keyIbov).not.toEqual(keyCdi);
    expect(keyIbov).not.toEqual(keyNone);
    expect(keyCdi).not.toEqual(keyNone);
  });
});
