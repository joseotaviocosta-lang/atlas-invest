import { describe, it, expect } from 'vitest';
import { mapToPortfolioBenchmarkRelativeRiskViewModel, relativeRiskQueryKey } from '@atlas/ui';

function raw(params: {
  status?: string;
  availability?: string;
  currency?: string;
  beta?: string | null;
  correlation?: string | null;
  trackingError?: string | null;
}) {
  const currency = params.currency ?? 'BRL';
  const available = params.beta !== null && params.correlation !== null;
  return {
    portfolioId: 'p1',
    period: { startDate: '2026-01-01', endDate: '2026-09-21' },
    benchmark: { id: 'IBOV', name: 'Ibovespa', currency: 'BRL' },
    currencies: {
      [currency]: {
        currency,
        status: params.status ?? 'AVAILABLE',
        alignment:
          available === false
            ? null
            : {
                portfolioIntervalCount: 170,
                benchmarkIntervalCount: 174,
                pairedObservationCount: 168,
                droppedPortfolioIntervalCount: 2,
                droppedBenchmarkIntervalCount: 6,
              },
        beta: params.beta === undefined ? '0.87' : params.beta,
        correlation: params.correlation === undefined ? '0.74' : params.correlation,
        trackingError:
          params.trackingError === null
            ? null
            : {
                frequency: 'DAILY',
                observationCount: 168,
                samplePercentage: '0.76',
                annualizedPercentage:
                  params.trackingError === undefined ? '12.06' : params.trackingError,
                annualizationFactor: '252',
                status: 'AVAILABLE',
              },
      },
    },
    status: params.status ?? 'AVAILABLE',
    dataAvailability: params.availability ?? 'AVAILABLE',
  };
}

describe('Benchmark-Relative Risk View Model', () => {
  it('maps AVAILABLE metrics: ratios without percent, tracking error with percent', () => {
    const vm = mapToPortfolioBenchmarkRelativeRiskViewModel(raw({}));
    expect(vm!.isUnavailable).toBe(false);
    const brl = vm!.currencies[0]!;
    expect(brl.betaFormatted).toBe('0,87');
    expect(brl.correlationFormatted).toBe('0,74');
    expect(brl.trackingErrorFormatted).toBe('12,06%');
    expect(brl.betaFormatted).not.toContain('%');
    expect(brl.correlationFormatted).not.toContain('%');
    expect(brl.trackingErrorFormatted).toContain('%');
    expect(brl.benchmarkLabel).toBe('Referência: Ibovespa');
  });

  it('USD incompatible currency shows compatible-benchmark message', () => {
    const vm = mapToPortfolioBenchmarkRelativeRiskViewModel(
      raw({
        currency: 'USD',
        status: 'UNAVAILABLE',
        availability: 'UNAVAILABLE',
        beta: null,
        correlation: null,
        trackingError: null,
      }),
    );
    const usd = vm!.currencies[0]!;
    expect(usd.isIncompatibleCurrency).toBe(true);
    expect(usd.isUnavailable).toBe(false);
  });

  it('null metrics render — with unavailable label', () => {
    const vm = mapToPortfolioBenchmarkRelativeRiskViewModel(
      raw({
        status: 'INSUFFICIENT_DATA',
        availability: 'UNAVAILABLE',
        beta: null,
        correlation: null,
        trackingError: null,
      }),
    );
    expect(vm!.isUnavailable).toBe(true);
    expect(vm!.statusLabel).toBe(
      'Histórico insuficiente para calcular métricas relativas ao Ibovespa.',
    );
  });

  it('PARTIAL label is non-alarmist', () => {
    const vm = mapToPortfolioBenchmarkRelativeRiskViewModel(
      raw({ status: 'PARTIAL', availability: 'PARTIAL' }),
    );
    expect(vm!.isPartial).toBe(true);
    expect(vm!.statusLabel).toBe('Dados parciais para comparação com o Ibovespa.');
  });

  it('historical language without qualitative interpretation or forecasts', () => {
    const vm = mapToPortfolioBenchmarkRelativeRiskViewModel(raw({}));
    expect(vm!.accessibilitySummary).toContain('históric');
    expect(vm!.accessibilitySummary).toContain('não previsões');
    expect(JSON.stringify(vm)).not.toMatch(/Excelente|Bom\b|Ruim|Abaixo do ideal/);
    expect(JSON.stringify(vm)).not.toMatch(/deve subir|deve cair|previsão de/i);
  });

  it('relative-risk query key isolates period and benchmark', () => {
    expect(relativeRiskQueryKey('p', '2026-01-01', '2026-09-21', 'IBOV')).toEqual([
      'portfolio-relative-risk',
      'p',
      '2026-01-01',
      '2026-09-21',
      'IBOV',
    ]);
  });

  it('never performs relative-risk math', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      'packages/ui/src/view-models/portfolio-benchmark-relative-risk.view-model.ts',
      'utf8',
    );
    expect(code).not.toMatch(/calculateBeta/);
    expect(code).not.toMatch(/calculateCorrelation/);
    expect(code).not.toMatch(/calculateTrackingError/);
    expect(code).not.toMatch(/Math\.sqrt/);
    expect(code).not.toMatch(/Math\.pow/);
    expect(code).not.toMatch(/covariance\s*\(/);
    expect(code).not.toMatch(/activeReturn\s*=(?!=)/);
  });
});
