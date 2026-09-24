import { describe, it, expect } from 'vitest';
import { mapToPortfolioActivePerformanceViewModel, activePerformanceQueryKey } from '@atlas/ui';

function raw(params: {
  status?: string;
  availability?: string;
  currencies?: Record<string, unknown>;
}) {
  return {
    portfolioId: 'p1',
    period: { startDate: '2026-01-01', endDate: '2026-09-21' },
    marketBenchmark: 'IBOV',
    riskFreeProxy: 'CDI',
    currencies: params.currencies ?? {
      BRL: {
        currency: 'BRL',
        status: 'AVAILABLE',
        alpha: { periodPercentage: '2.35' },
        informationRatio: { observationCount: 170, daily: '0.08', annualized: '1.27' },
        treynor: { periodPercentagePerBeta: '7.42' },
      },
    },
    status: params.status ?? 'AVAILABLE',
    dataAvailability: params.availability ?? 'AVAILABLE',
  };
}

describe('Active Performance View Model', () => {
  it('maps AVAILABLE metrics: alpha percentage, IR ratio without percent, treynor percentage', () => {
    const vm = mapToPortfolioActivePerformanceViewModel(raw({}));
    expect(vm!.isUnavailable).toBe(false);
    const brl = vm!.currencies[0]!;
    expect(brl.alpha!.periodFormatted).toBe('+2,35%');
    expect(brl.informationRatio!.annualizedFormatted).toBe('1,27');
    expect(brl.informationRatio!.annualizedFormatted).not.toContain('%');
    expect(brl.treynor!.periodFormatted).toBe('7,42%');
    expect(vm!.marketBenchmarkLabel).toBe('Benchmark de mercado: Ibovespa');
    expect(vm!.riskFreeLabel).toBe('Referência usada: CDI');
  });

  it('BRL + USD: BRL computed, USD unavailable, in the same response', () => {
    const vm = mapToPortfolioActivePerformanceViewModel(
      raw({
        currencies: {
          BRL: {
            currency: 'BRL',
            status: 'AVAILABLE',
            alpha: { periodPercentage: '2.35' },
            informationRatio: { observationCount: 170, daily: '0.08', annualized: '1.27' },
            treynor: { periodPercentagePerBeta: '7.42' },
          },
          USD: {
            currency: 'USD',
            status: 'UNAVAILABLE',
            alpha: null,
            informationRatio: null,
            treynor: null,
          },
        },
      }),
    );
    expect(vm!.currencies).toHaveLength(2);
    const brl = vm!.currencies.find((c) => c.currency === 'BRL')!;
    const usd = vm!.currencies.find((c) => c.currency === 'USD')!;
    expect(brl.isIncompatibleCurrency).toBe(false);
    expect(brl.alpha!.periodFormatted).toBe('+2,35%');
    expect(usd.isIncompatibleCurrency).toBe(true);
    expect(usd.alpha).toBeNull();
    expect(usd.informationRatio).toBeNull();
    expect(usd.treynor).toBeNull();
  });

  it('USD-only portfolio is an incompatible currency', () => {
    const vm = mapToPortfolioActivePerformanceViewModel(
      raw({
        status: 'UNAVAILABLE',
        availability: 'UNAVAILABLE',
        currencies: {
          USD: {
            currency: 'USD',
            status: 'UNAVAILABLE',
            alpha: null,
            informationRatio: null,
            treynor: null,
          },
        },
      }),
    );
    expect(vm!.currencies[0]!.isIncompatibleCurrency).toBe(true);
  });

  it('null metrics render — with unavailable label', () => {
    const vm = mapToPortfolioActivePerformanceViewModel(
      raw({
        status: 'UNAVAILABLE',
        availability: 'UNAVAILABLE',
        currencies: {
          BRL: {
            currency: 'BRL',
            status: 'UNAVAILABLE',
            alpha: null,
            informationRatio: null,
            treynor: null,
          },
        },
      }),
    );
    expect(vm!.isUnavailable).toBe(true);
    expect(vm!.statusLabel).toBe(
      'Histórico insuficiente para calcular métricas de desempenho ativo.',
    );
  });

  it('PARTIAL label is non-alarmist and metric-specific nulls survive', () => {
    const vm = mapToPortfolioActivePerformanceViewModel(
      raw({
        status: 'PARTIAL',
        availability: 'PARTIAL',
        currencies: {
          BRL: {
            currency: 'BRL',
            status: 'PARTIAL',
            alpha: null,
            informationRatio: { observationCount: 170, daily: '0.08', annualized: '1.27' },
            treynor: null,
          },
        },
      }),
    );
    expect(vm!.isPartial).toBe(true);
    const brl = vm!.currencies[0]!;
    expect(brl.alpha).toBeNull();
    expect(brl.treynor).toBeNull();
    expect(brl.informationRatio).not.toBeNull();
    expect(vm!.statusLabel).toBe('Dados parciais para métricas de desempenho ativo.');
  });

  it('historical language without qualitative interpretation or forecasts', () => {
    const vm = mapToPortfolioActivePerformanceViewModel(raw({}));
    expect(vm!.accessibilitySummary).toContain('históric');
    expect(vm!.accessibilitySummary).toContain('não previsões');
    expect(JSON.stringify(vm)).not.toMatch(/Excelente|Bom\b|Ruim|alpha bom|Treynor alto/i);
    expect(JSON.stringify(vm)).not.toMatch(/deve subir|deve cair|previsão de/i);
  });

  it('active performance query key isolates period', () => {
    expect(activePerformanceQueryKey('p', '2026-01-01', '2026-09-21')).toEqual([
      'portfolio-active-performance',
      'p',
      '2026-01-01',
      '2026-09-21',
    ]);
  });

  it('never performs active-performance math', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      'packages/ui/src/view-models/portfolio-active-performance.view-model.ts',
      'utf8',
    );
    expect(code).not.toMatch(/calculateJensenAlpha/);
    expect(code).not.toMatch(/calculateInformationRatio/);
    expect(code).not.toMatch(/calculateTreynorRatio/);
    expect(code).not.toMatch(/expectedReturn\s*=(?!=)/);
    expect(code).not.toMatch(/Math\.sqrt/);
    expect(code).not.toMatch(/Math\.pow/);
  });
});
