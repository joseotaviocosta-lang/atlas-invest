import { describe, it, expect } from 'vitest';
import { mapToPortfolioRiskAdjustedViewModel, riskAdjustedQueryKey } from '@atlas/ui';

function raw(params: {
  status?: string;
  availability?: string;
  proxy?: string | null;
  sharpeAnnualized?: string | null;
  sortinoAnnualized?: string | null;
}) {
  return {
    portfolioId: 'p1',
    period: { startDate: '2026-01-01', endDate: '2026-09-21' },
    currencies: {
      BRL: {
        currency: 'BRL',
        frequency: 'DAILY',
        status: params.status ?? 'AVAILABLE',
        dataAvailability: params.availability ?? 'AVAILABLE',
        riskFreeProxy: params.proxy === undefined ? 'CDI' : params.proxy,
        sharpe:
          params.sharpeAnnualized === undefined && params.proxy !== null
            ? {
                observationCount: 178,
                meanDailyExcessPercentage: '0.05',
                daily: '0.078',
                annualized: '1.24',
                annualizationFactor: '252',
                status: 'AVAILABLE',
              }
            : params.sharpeAnnualized !== undefined && params.sharpeAnnualized !== null
              ? {
                  observationCount: 178,
                  meanDailyExcessPercentage: '0.05',
                  daily: '0.078',
                  annualized: params.sharpeAnnualized,
                  annualizationFactor: '252',
                  status: 'AVAILABLE',
                }
              : null,
        sortino:
          params.sortinoAnnualized === undefined && params.proxy !== null
            ? {
                observationCount: 178,
                downsideObservationCount: 71,
                downsideDeviationPercentage: '0.42',
                daily: '0.118',
                annualized: '1.87',
                annualizationFactor: '252',
                status: 'AVAILABLE',
              }
            : params.sortinoAnnualized !== undefined && params.sortinoAnnualized !== null
              ? {
                  observationCount: 178,
                  downsideObservationCount: 71,
                  downsideDeviationPercentage: '0.42',
                  daily: '0.118',
                  annualized: params.sortinoAnnualized,
                  annualizationFactor: '252',
                  status: 'AVAILABLE',
                }
              : null,
      },
    },
    status: params.status ?? 'AVAILABLE',
    dataAvailability: params.availability ?? 'AVAILABLE',
  };
}

describe('Risk-Adjusted View Model', () => {
  it('maps AVAILABLE Sharpe/Sortino as ratios without percent', () => {
    const vm = mapToPortfolioRiskAdjustedViewModel(raw({}));
    expect(vm!.isUnavailable).toBe(false);
    const brl = vm!.currencies[0]!;
    expect(brl.sharpe!.annualizedFormatted).toBe('1,24');
    expect(brl.sortino!.annualizedFormatted).toBe('1,87');
    expect(brl.sharpe!.annualizedFormatted).not.toContain('%');
    expect(brl.sortino!.annualizedFormatted).not.toContain('%');
    expect(brl.riskFreeLabel).toBe('Referência usada: CDI');
  });

  it('USD incompatible currency shows compatible-reference message', () => {
    const vm = mapToPortfolioRiskAdjustedViewModel({
      ...raw({ status: 'UNAVAILABLE', availability: 'UNAVAILABLE', proxy: null }),
      currencies: {
        USD: {
          currency: 'USD',
          frequency: 'DAILY',
          status: 'UNAVAILABLE',
          dataAvailability: 'UNAVAILABLE',
          riskFreeProxy: null,
          sharpe: null,
          sortino: null,
        },
      },
    });
    expect(vm!.currencies[0]!.isIncompatibleCurrency).toBe(true);
  });

  it('null ratios render — with unavailable label', () => {
    const vm = mapToPortfolioRiskAdjustedViewModel(
      raw({
        status: 'INSUFFICIENT_DATA',
        availability: 'UNAVAILABLE',
        sharpeAnnualized: null,
        sortinoAnnualized: null,
      }),
    );
    expect(vm!.isUnavailable).toBe(true);
    expect(vm!.statusLabel).toBe('Histórico insuficiente para calcular Sharpe e Sortino.');
  });

  it('PARTIAL label is non-alarmist', () => {
    const vm = mapToPortfolioRiskAdjustedViewModel(
      raw({ status: 'PARTIAL', availability: 'PARTIAL' }),
    );
    expect(vm!.isPartial).toBe(true);
    expect(vm!.statusLabel).toBe('Dados parciais para retorno ajustado ao risco.');
  });

  it('historical language without qualitative interpretation', () => {
    const vm = mapToPortfolioRiskAdjustedViewModel(raw({}));
    expect(vm!.accessibilitySummary).toContain('históric');
    expect(vm!.accessibilitySummary).toContain('não previsões');
    expect(vm!.accessibilitySummary).not.toMatch(/risco futuro/i);
    expect(JSON.stringify(vm)).not.toMatch(/Excelente|Bom\b|Ruim|Abaixo do ideal/);
  });

  it('risk-adjusted query key isolates period', () => {
    expect(riskAdjustedQueryKey('p', '2026-01-01', '2026-09-21')).toEqual([
      'portfolio-risk-adjusted',
      'p',
      '2026-01-01',
      '2026-09-21',
    ]);
  });

  it('never performs risk-adjusted math', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      'packages/ui/src/view-models/portfolio-risk-adjusted.view-model.ts',
      'utf8',
    );
    expect(code).not.toMatch(/calculateSharpeRatio/);
    expect(code).not.toMatch(/calculateSortinoRatio/);
    expect(code).not.toMatch(/Math\.sqrt/);
    expect(code).not.toMatch(/Math\.pow/);
    expect(code).not.toMatch(/downsideDeviation\s*=/);
  });
});
