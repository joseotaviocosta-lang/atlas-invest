import { describe, it, expect } from 'vitest';
import { mapToPortfolioIntelligenceViewModel, intelligenceSummaryQueryKey } from '@atlas/ui';

function raw(overrides: Record<string, unknown> = {}, obs: unknown[] = []) {
  return {
    portfolioId: 'p1',
    period: { startDate: '2025-09-22', endDate: '2026-09-22' },
    asOf: '2026-09-22',
    currencies: {
      BRL: {
        currency: 'BRL',
        status: 'AVAILABLE',
        dataAvailability: 'COMPLETE',
        overview: {
          currentMarketValue: '100000',
          positionCount: 12,
          valuedPositionCount: 12,
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
        activePerformance: {
          alpha: '2',
          informationRatio: '1.1',
          treynor: '5',
          status: 'AVAILABLE',
        },
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
          valuationCompleteness: { status: 'AVAILABLE', reason: null },
        },
      },
    },
    observations: obs,
    status: 'AVAILABLE',
    dataAvailability: 'COMPLETE',
    ...overrides,
  };
}

describe('Portfolio Intelligence View Model', () => {
  it('maps consolidated blocks to formatted values', () => {
    const vm = mapToPortfolioIntelligenceViewModel(raw({}));
    expect(vm!.isUnavailable).toBe(false);
    const brl = vm!.currencies[0]!;
    expect(brl.performance.twrFormatted).toBe('12,00%');
    expect(brl.overview.currentMarketValueFormatted).toBe('R$ 100.000,00');
    expect(brl.benchmarks.find((b) => b.id === 'IBOV')!.returnFormatted).toBe('8,00%');
    expect(brl.tailRisk.var95Formatted).toBe('2,50%');
    expect(brl.scenario.hypotheticalLabel).toBe('Hipótese');
  });

  it('renders deterministic factual observation templates', () => {
    const vm = mapToPortfolioIntelligenceViewModel(
      raw({}, [
        {
          code: 'PERFORMANCE_VS_IBOV',
          scope: 'BRL',
          status: 'AVAILABLE',
          source: 'PERFORMANCE',
          values: { portfolioReturn: '12', benchmarkReturn: '8', differencePercentagePoints: '4' },
        },
        {
          code: 'MULTI_CURRENCY_PRESENT',
          scope: 'PORTFOLIO',
          status: 'AVAILABLE',
          source: 'PORTFOLIO',
          values: { currencies: ['BRL', 'USD'] },
        },
      ]),
    );
    expect(vm!.observations[0]!.text).toContain('retorno de 12,00%');
    expect(vm!.observations[0]!.text).toContain('Ibovespa');
    expect(vm!.observations[0]!.text).toContain('4,00%');
    expect(vm!.observations[1]!.text).toContain('BRL, USD');
  });

  it('no recommendation or qualitative judgment wording', () => {
    const vm = mapToPortfolioIntelligenceViewModel(
      raw({}, [
        {
          code: 'EQUITY_DOWN_10_IMPACT',
          scope: 'BRL',
          status: 'AVAILABLE',
          source: 'SCENARIO',
          values: {
            preset: 'EQUITY_DOWN_10',
            baseValue: '100000',
            stressedValue: '90000',
            absoluteImpact: '-10000',
            percentageImpact: '-10',
            hypothetical: 'true',
          },
        },
      ]),
    );
    const text = JSON.stringify(vm);
    expect(text).toContain('Hipótese');
    expect(text).not.toMatch(
      /recomend|deveria|considere comprar|excelente|ruim|arriscado|saudável/i,
    );
  });

  it('partial summary label is non-alarmist', () => {
    const vm = mapToPortfolioIntelligenceViewModel(
      raw({
        status: 'PARTIAL',
        dataAvailability: 'PARTIAL',
        currencies: {
          BRL: {
            ...raw({}).currencies.BRL,
            status: 'PARTIAL',
            dataAvailability: 'PARTIAL',
          },
        },
      }),
    );
    expect(vm!.isPartial).toBe(true);
    expect(vm!.statusLabel).toContain('parcial');
  });

  it('query key isolates period and benchmark partition', () => {
    expect(intelligenceSummaryQueryKey('p', '2025-09-22', '2026-09-22')).toEqual([
      'portfolio-intelligence-summary',
      'p',
      '2025-09-22',
      '2026-09-22',
      'none',
    ]);
    expect(intelligenceSummaryQueryKey('p', '2025-09-22', '2026-09-22', 'IBOV')).toEqual([
      'portfolio-intelligence-summary',
      'p',
      '2025-09-22',
      '2026-09-22',
      'IBOV',
    ]);
    expect(intelligenceSummaryQueryKey('p', '2025-09-22', '2026-09-22', 'CDI')).toEqual([
      'portfolio-intelligence-summary',
      'p',
      '2025-09-22',
      '2026-09-22',
      'CDI',
    ]);
    expect(intelligenceSummaryQueryKey('p', '2025-09-22', '2026-09-22', '')).toEqual([
      'portfolio-intelligence-summary',
      'p',
      '2025-09-22',
      '2026-09-22',
      'none',
    ]);
  });

  it('suppresses misleading 0.00% risk values when status is PARTIAL', () => {
    const vm = mapToPortfolioIntelligenceViewModel(
      raw({
        currencies: {
          BRL: {
            ...raw({}).currencies.BRL,
            risk: {
              realizedVolatilityAnnualized: '0',
              maximumDrawdown: '0',
              currentDrawdown: '0',
              status: 'PARTIAL',
            },
          },
        },
      }),
    );
    const brl = vm!.currencies[0]!;
    expect(brl.risk.maximumDrawdownFormatted).toBe('—');
    expect(brl.risk.currentDrawdownFormatted).toBe('—');
    expect(brl.risk.volatilityFormatted).toBe('—');
  });

  it('preserves genuine 0.00% risk values when status is AVAILABLE', () => {
    const vm = mapToPortfolioIntelligenceViewModel(
      raw({
        currencies: {
          BRL: {
            ...raw({}).currencies.BRL,
            risk: {
              realizedVolatilityAnnualized: '0',
              maximumDrawdown: '0',
              currentDrawdown: '0',
              status: 'AVAILABLE',
            },
          },
        },
      }),
    );
    const brl = vm!.currencies[0]!;
    expect(brl.risk.maximumDrawdownFormatted).toBe('0,00%');
    expect(brl.risk.currentDrawdownFormatted).toBe('0,00%');
    expect(brl.risk.volatilityFormatted).toBe('0,00%');
  });

  it('never performs financial math or scoring', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      'packages/ui/src/view-models/portfolio-intelligence.view-model.ts',
      'utf8',
    );
    expect(code).not.toMatch(/calculateSharpeRatio|calculateBeta|calculateTWR/);
    expect(code).not.toMatch(/\.subtract\(|\.add\(/);
    expect(code).not.toMatch(/riskScore|healthScore|dataQualityScore/);
  });
});
