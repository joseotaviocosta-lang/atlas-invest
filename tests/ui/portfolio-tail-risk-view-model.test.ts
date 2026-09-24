import { describe, it, expect } from 'vitest';
import {
  mapToPortfolioTailRiskViewModel,
  tailRiskQueryKey,
  TAIL_CONFIDENCE_OPTIONS,
} from '@atlas/ui';

function currencyBlock(overrides: Record<string, unknown> = {}) {
  return {
    currency: 'BRL',
    status: 'AVAILABLE',
    observationCount: 180,
    downsideDeviation: {
      frequency: 'DAILY',
      dailyPercentage: '1.12',
      annualizedPercentage: '17.78',
      negativeObservationCount: 82,
    },
    semideviation: { frequency: 'DAILY', dailyPercentage: '0.98', annualizedPercentage: '15.56' },
    historicalVar: {
      confidenceLevel: '95',
      quantileReturnPercentage: '-2.35',
      lossPercentage: '2.35',
      tailObservationCount: 9,
    },
    historicalCvar: {
      confidenceLevel: '95',
      meanTailReturnPercentage: '-3.10',
      lossPercentage: '3.10',
      tailObservationCount: 9,
    },
    ...overrides,
  };
}

function raw(params: {
  status?: string;
  availability?: string;
  confidenceLevel?: string;
  currencies?: Record<string, unknown>;
}) {
  return {
    portfolioId: 'p1',
    period: { startDate: '2026-01-01', endDate: '2026-09-21' },
    confidenceLevel: params.confidenceLevel ?? '95',
    currencies: params.currencies ?? { BRL: currencyBlock() },
    status: params.status ?? 'AVAILABLE',
    dataAvailability: params.availability ?? 'COMPLETE',
  };
}

describe('Tail Risk View Model', () => {
  it('formats downside/semideviation as % and VaR/CVaR losses as positive magnitudes', () => {
    const vm = mapToPortfolioTailRiskViewModel(raw({}));
    expect(vm!.isUnavailable).toBe(false);
    const brl = vm!.currencies[0]!;
    expect(brl.downsideAnnualizedFormatted).toBe('17,78%');
    expect(brl.semideviationAnnualizedFormatted).toBe('15,56%');
    expect(brl.varLossFormatted).toBe('2,35%');
    expect(brl.cvarLossFormatted).toBe('3,10%');
    // Loss magnitudes are non-negative (no leading minus).
    expect(brl.varLossFormatted.startsWith('-')).toBe(false);
    expect(brl.cvarLossFormatted.startsWith('-')).toBe(false);
    expect(brl.varLabel).toBe('VaR histórico (95%)');
    expect(brl.cvarLabel).toBe('CVaR histórico (95%)');
    expect(brl.varQuantileFormatted).toBe('-2,35%');
  });

  it('confidence 99 relabels the VaR/CVaR cards', () => {
    const vm = mapToPortfolioTailRiskViewModel(raw({ confidenceLevel: '99' }));
    expect(vm!.currencies[0]!.varLabel).toBe('VaR histórico (99%)');
    expect(vm!.currencies[0]!.cvarLabel).toBe('CVaR histórico (99%)');
  });

  it('metric-specific availability: VaR/CVaR null while downside present', () => {
    const vm = mapToPortfolioTailRiskViewModel(
      raw({
        status: 'PARTIAL',
        availability: 'PARTIAL',
        currencies: {
          BRL: currencyBlock({
            status: 'PARTIAL',
            historicalVar: {
              confidenceLevel: '99',
              quantileReturnPercentage: null,
              lossPercentage: null,
              tailObservationCount: 0,
            },
            historicalCvar: {
              confidenceLevel: '99',
              meanTailReturnPercentage: null,
              lossPercentage: null,
              tailObservationCount: 0,
            },
          }),
        },
      }),
    );
    const brl = vm!.currencies[0]!;
    expect(brl.hasDownside).toBe(true);
    expect(brl.hasVar).toBe(false);
    expect(brl.hasCvar).toBe(false);
    expect(brl.varLossFormatted).toBe('—');
  });

  it('unavailable label and currency separation', () => {
    const vm = mapToPortfolioTailRiskViewModel(
      raw({
        status: 'PARTIAL',
        availability: 'PARTIAL',
        currencies: {
          BRL: currencyBlock(),
          USD: currencyBlock({
            currency: 'USD',
            status: 'UNAVAILABLE',
            observationCount: 5,
            downsideDeviation: {
              frequency: 'DAILY',
              dailyPercentage: null,
              annualizedPercentage: null,
              negativeObservationCount: 0,
            },
            semideviation: {
              frequency: 'DAILY',
              dailyPercentage: null,
              annualizedPercentage: null,
            },
            historicalVar: {
              confidenceLevel: '95',
              quantileReturnPercentage: null,
              lossPercentage: null,
              tailObservationCount: 0,
            },
            historicalCvar: {
              confidenceLevel: '95',
              meanTailReturnPercentage: null,
              lossPercentage: null,
              tailObservationCount: 0,
            },
          }),
        },
      }),
    );
    expect(vm!.currencies).toHaveLength(2);
    expect(vm!.currencies.find((c) => c.currency === 'USD')!.isUnavailable).toBe(true);
    expect(vm!.currencies.find((c) => c.currency === 'BRL')!.isUnavailable).toBe(false);
  });

  it('exposes 95/99 confidence options and historical language without guarantees', () => {
    expect(TAIL_CONFIDENCE_OPTIONS.map((o) => o.value)).toEqual(['95', '99']);
    const vm = mapToPortfolioTailRiskViewModel(raw({}));
    expect(vm!.accessibilitySummary).toContain('históric');
    expect(vm!.accessibilitySummary).toContain('não previsões');
    expect(JSON.stringify(vm)).not.toMatch(/perda máxima|você não perderá|certeza|garantia/i);
    expect(JSON.stringify(vm)).not.toMatch(/seguro|arriscado|alto risco|baixo risco/i);
  });

  it('tail risk query key isolates period and confidence', () => {
    expect(tailRiskQueryKey('p', '2026-01-01', '2026-09-21', '95')).toEqual([
      'portfolio-tail-risk',
      'p',
      '2026-01-01',
      '2026-09-21',
      '95',
    ]);
  });

  it('never performs tail-risk math', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      'packages/ui/src/view-models/portfolio-tail-risk.view-model.ts',
      'utf8',
    );
    expect(code).not.toMatch(/calculateDownsideDeviation/);
    expect(code).not.toMatch(/calculateSemideviation/);
    expect(code).not.toMatch(/calculateHistoricalVar/);
    expect(code).not.toMatch(/calculateHistoricalCvar/);
    expect(code).not.toMatch(/\.sort\(/);
    expect(code).not.toMatch(/quantile\s*\(/i);
    expect(code).not.toMatch(/empiricalTailRank/);
    expect(code).not.toMatch(/Math\./);
  });
});
