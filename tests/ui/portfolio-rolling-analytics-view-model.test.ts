import { describe, it, expect } from 'vitest';
import {
  mapToPortfolioRollingAnalyticsViewModel,
  rollingAnalyticsQueryKey,
  ROLLING_WINDOW_OPTIONS,
  ROLLING_METRIC_OPTIONS,
} from '@atlas/ui';

function volPoint(start: string, end: string, value: string | null) {
  return {
    windowStartDate: start,
    endDate: end,
    observationCount: 20,
    annualizedPercentage: value,
    status: value === null ? 'UNAVAILABLE' : 'AVAILABLE',
  };
}

function raw(params: {
  status?: string;
  availability?: string;
  currencies?: Record<string, unknown>;
}) {
  return {
    portfolioId: 'p1',
    period: { startDate: '2026-01-01', endDate: '2026-09-21' },
    window: 20,
    currencies: params.currencies ?? {
      BRL: {
        currency: 'BRL',
        rollingVolatility: {
          window: 20,
          status: 'AVAILABLE',
          points: [
            volPoint('2026-01-02', '2026-01-29', '18.42'),
            volPoint('2026-01-05', '2026-02-02', '19.10'),
          ],
        },
        rollingSharpe: {
          window: 20,
          status: 'AVAILABLE',
          points: [
            {
              windowStartDate: '2026-01-02',
              endDate: '2026-01-29',
              observationCount: 20,
              annualized: '1.37',
              status: 'AVAILABLE',
            },
          ],
        },
        rollingBeta: {
          window: 20,
          status: 'AVAILABLE',
          points: [
            {
              windowStartDate: '2026-01-02',
              endDate: '2026-01-29',
              observationCount: 20,
              beta: '0.87',
              status: 'AVAILABLE',
            },
          ],
        },
      },
    },
    status: params.status ?? 'AVAILABLE',
    dataAvailability: params.availability ?? 'COMPLETE',
  };
}

describe('Rolling Analytics View Model', () => {
  it('formats volatility as % and Beta/Sharpe as ratios, with window label', () => {
    const vm = mapToPortfolioRollingAnalyticsViewModel(raw({}));
    expect(vm!.isUnavailable).toBe(false);
    expect(vm!.windowLabel).toBe('20 pregões');
    const brl = vm!.currencies[0]!;
    expect(brl.volatility.points[0]!.value).toBe('18,42%');
    expect(brl.volatility.points[0]!.value).toContain('%');
    expect(brl.sharpe.points[0]!.value).toBe('1,37');
    expect(brl.sharpe.points[0]!.value).not.toContain('%');
    expect(brl.beta.points[0]!.value).toBe('0,87');
    expect(brl.beta.points[0]!.value).not.toContain('%');
    expect(brl.volatility.points[0]!.tooltip).toContain('Janela: 20 pregões');
  });

  it('null point is preserved as a gap (— and null raw), never connected', () => {
    const vm = mapToPortfolioRollingAnalyticsViewModel(
      raw({
        currencies: {
          BRL: {
            currency: 'BRL',
            rollingVolatility: {
              window: 20,
              status: 'PARTIAL',
              points: [
                volPoint('2026-01-02', '2026-01-29', '18.42'),
                volPoint('2026-01-05', '2026-02-02', null),
              ],
            },
            rollingSharpe: { window: 20, status: 'UNAVAILABLE', points: [] },
            rollingBeta: { window: 20, status: 'UNAVAILABLE', points: [] },
          },
        },
        status: 'PARTIAL',
        availability: 'PARTIAL',
      }),
    );
    const brl = vm!.currencies[0]!;
    expect(brl.volatility.points[1]!.value).toBe('—');
    expect(brl.volatility.points[1]!.valueRaw).toBeNull();
    expect(brl.volatility.isAvailable).toBe(true);
  });

  it('USD shows volatility only; Sharpe/Beta empty', () => {
    const vm = mapToPortfolioRollingAnalyticsViewModel(
      raw({
        currencies: {
          USD: {
            currency: 'USD',
            rollingVolatility: {
              window: 20,
              status: 'AVAILABLE',
              points: [volPoint('2026-01-02', '2026-01-29', '12.00')],
            },
            rollingSharpe: { window: 20, status: 'UNAVAILABLE', points: [] },
            rollingBeta: { window: 20, status: 'UNAVAILABLE', points: [] },
          },
        },
      }),
    );
    const usd = vm!.currencies[0]!;
    expect(usd.isIncompatibleCurrency).toBe(true);
    expect(usd.volatility.isAvailable).toBe(true);
    expect(usd.sharpe.isEmpty).toBe(true);
    expect(usd.beta.isEmpty).toBe(true);
  });

  it('PARTIAL and UNAVAILABLE labels are non-alarmist', () => {
    const partial = mapToPortfolioRollingAnalyticsViewModel(
      raw({ status: 'PARTIAL', availability: 'PARTIAL' }),
    );
    expect(partial!.isPartial).toBe(true);
    expect(partial!.statusLabel).toBe('Dados parciais para análise móvel.');
    const unavailable = mapToPortfolioRollingAnalyticsViewModel(
      raw({
        status: 'UNAVAILABLE',
        availability: 'UNAVAILABLE',
        currencies: {
          BRL: {
            currency: 'BRL',
            rollingVolatility: { window: 20, status: 'UNAVAILABLE', points: [] },
            rollingSharpe: { window: 20, status: 'UNAVAILABLE', points: [] },
            rollingBeta: { window: 20, status: 'UNAVAILABLE', points: [] },
          },
        },
      }),
    );
    expect(unavailable!.isUnavailable).toBe(true);
    expect(unavailable!.statusLabel).toBe('Histórico insuficiente para esta janela.');
  });

  it('exposes 20/60/120 windows and three metrics with tooltips', () => {
    expect(ROLLING_WINDOW_OPTIONS.map((o) => o.value)).toEqual([20, 60, 120]);
    expect(ROLLING_WINDOW_OPTIONS.map((o) => o.label)).toEqual([
      '20 pregões',
      '60 pregões',
      '120 pregões',
    ]);
    expect(ROLLING_METRIC_OPTIONS.map((o) => o.value)).toEqual(['VOLATILITY', 'BETA', 'SHARPE']);
  });

  it('rolling query key isolates period and window', () => {
    expect(rollingAnalyticsQueryKey('p', '2026-01-01', '2026-09-21', 60)).toEqual([
      'portfolio-rolling-analytics',
      'p',
      '2026-01-01',
      '2026-09-21',
      60,
    ]);
  });

  it('never performs rolling math', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      'packages/ui/src/view-models/portfolio-rolling-analytics.view-model.ts',
      'utf8',
    );
    expect(code).not.toMatch(/calculateRollingVolatility/);
    expect(code).not.toMatch(/calculateRollingBeta/);
    expect(code).not.toMatch(/calculateRollingSharpe/);
    expect(code).not.toMatch(/\.slice\(/);
    expect(code).not.toMatch(/Math\.sqrt/);
    expect(code).not.toMatch(/sampleVariance/);
    expect(code).not.toMatch(/covariance\s*\(/);
  });
});
