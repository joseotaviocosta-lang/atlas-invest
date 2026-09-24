import { describe, it, expect } from 'vitest';
import { mapToPortfolioRiskViewModel, riskQueryKey } from '@atlas/ui';

function raw(params: {
  status?: string;
  availability?: string;
  vol?: { sample: string | null; ann: string | null; count?: number; status?: string };
  dd?: {
    max: string | null;
    peak?: string | null;
    trough?: string | null;
    rec?: string | null;
    cur?: string | null;
    status?: string;
  };
}) {
  const vol = params.vol ?? { sample: '0.84', ann: '13.34' };
  const dd = params.dd ?? {
    max: '-12.48',
    peak: '2026-03-10',
    trough: '2026-05-20',
    rec: '2026-07-02',
    cur: '-2.11',
  };
  return {
    portfolioId: 'p1',
    period: { startDate: '2026-01-01', endDate: '2026-09-21' },
    currencies: {
      BRL: {
        currency: 'BRL',
        frequency: 'DAILY',
        status: params.status ?? 'AVAILABLE',
        dataAvailability: params.availability ?? 'AVAILABLE',
        volatility: {
          frequency: 'DAILY',
          observationCount: vol.count ?? 178,
          samplePercentage: vol.sample,
          annualizedPercentage: vol.ann,
          annualizationFactor: '252',
          status: vol.status ?? 'AVAILABLE',
        },
        drawdown: {
          maximumPercentage: dd.max,
          peakDate: dd.peak ?? null,
          troughDate: dd.trough ?? null,
          recoveryDate: dd.rec ?? null,
          currentPercentage: dd.cur ?? null,
          status: dd.status ?? 'AVAILABLE',
        },
      },
    },
    status: params.status ?? 'AVAILABLE',
    dataAvailability: params.availability ?? 'AVAILABLE',
  };
}

describe('Risk View Model', () => {
  it('maps AVAILABLE volatility/drawdown', () => {
    const vm = mapToPortfolioRiskViewModel(raw({}));
    expect(vm!.isUnavailable).toBe(false);
    expect(vm!.isPartial).toBe(false);
    const brl = vm!.currencies[0]!;
    expect(brl.volatility.annualizedFormatted).toContain('13');
    expect(brl.drawdown.maximumFormatted).toContain('12');
    expect(brl.drawdown.currentFormatted).toContain('2');
    expect(brl.volatility.annualizationFactor).toBe('252');
    expect(brl.drawdown.peakDisplay).toBe('10/03/2026');
    expect(brl.drawdown.troughDisplay).toBe('20/05/2026');
    expect(brl.drawdown.recoveryDisplay).toBe('02/07/2026');
    expect(brl.drawdown.isRecovered).toBe(true);
  });

  it('open drawdown shows unrecovered state', () => {
    const vm = mapToPortfolioRiskViewModel(
      raw({ dd: { max: '-25', peak: '2026-03-10', trough: '2026-05-20', rec: null, cur: '-25' } }),
    );
    const brl = vm!.currencies[0]!;
    expect(brl.drawdown.isRecovered).toBe(false);
    expect(brl.drawdown.recoveryDisplay).toBeNull();
  });

  it('null metrics render — and mark unavailable', () => {
    const vm = mapToPortfolioRiskViewModel({
      ...raw({ status: 'INSUFFICIENT_DATA', availability: 'UNAVAILABLE' }),
      currencies: {
        BRL: {
          currency: 'BRL',
          frequency: 'DAILY',
          status: 'INSUFFICIENT_DATA',
          dataAvailability: 'UNAVAILABLE',
          volatility: {
            frequency: 'DAILY',
            observationCount: 0,
            samplePercentage: null,
            annualizedPercentage: null,
            annualizationFactor: '252',
            status: 'UNAVAILABLE',
          },
          drawdown: {
            maximumPercentage: null,
            peakDate: null,
            troughDate: null,
            recoveryDate: null,
            currentPercentage: null,
            status: 'UNAVAILABLE',
          },
        },
      },
    });
    expect(vm!.isUnavailable).toBe(true);
    expect(vm!.currencies[0]!.volatility.annualizedFormatted).toBe('—');
    expect(vm!.currencies[0]!.drawdown.maximumFormatted).toBe('—');
    expect(vm!.statusLabel).toBe('Histórico insuficiente para calcular métricas de risco.');
  });

  it('PARTIAL label is non-alarmist', () => {
    const vm = mapToPortfolioRiskViewModel(raw({ status: 'PARTIAL', availability: 'PARTIAL' }));
    expect(vm!.isPartial).toBe(true);
    expect(vm!.statusLabel).toBe('Dados parciais para métricas de risco.');
  });

  it('uses historical language, never predictions', () => {
    const vm = mapToPortfolioRiskViewModel(raw({}));
    expect(vm!.accessibilitySummary).toContain('históric');
    expect(vm!.accessibilitySummary).toContain('não previsões');
    expect(vm!.accessibilitySummary).not.toMatch(/risco futuro/i);
    expect(vm!.accessibilitySummary).not.toMatch(/vai subir|vai cair|retorno esperado/i);
    expect(vm!.statusLabel).not.toMatch(/baixo|alto|risco futuro/i);
  });

  it('risk query key isolates period', () => {
    expect(riskQueryKey('p', '2026-01-01', '2026-09-21')).toEqual([
      'portfolio-risk',
      'p',
      '2026-01-01',
      '2026-09-21',
    ]);
  });

  it('never performs risk math', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      'packages/ui/src/view-models/portfolio-risk.view-model.ts',
      'utf8',
    );
    expect(code).not.toMatch(/calculateRealizedVolatility/);
    expect(code).not.toMatch(/calculateDrawdown/);
    expect(code).not.toMatch(/Math\.sqrt/);
    expect(code).not.toMatch(/Math\.pow/);
    expect(code).not.toMatch(/calculateVariance|sampleVariance|computeVariance/);
  });
});
