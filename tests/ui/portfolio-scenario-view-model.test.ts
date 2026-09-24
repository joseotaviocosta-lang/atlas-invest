import { describe, it, expect } from 'vitest';
import {
  mapToPortfolioScenarioViewModel,
  scenarioQueryKey,
  SCENARIO_PRESET_OPTIONS,
} from '@atlas/ui';

function raw(overrides: Record<string, unknown> = {}) {
  return {
    portfolioId: 'p1',
    asOf: '2026-09-23',
    scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
    currencies: {
      BRL: {
        currency: 'BRL',
        status: 'AVAILABLE',
        baseValue: '100000',
        stressedValue: '90000',
        absoluteImpact: '-10000',
        percentageImpact: '-10',
        positionCount: 12,
        valuedPositionCount: 12,
        unvaluedPositionCount: 0,
        components: [
          {
            componentType: 'EQUITY_PRICE_SHOCK',
            status: 'AVAILABLE',
            baseValue: '100000',
            stressedValue: '90000',
            absoluteImpact: '-10000',
            percentageImpact: '-10',
            reason: null,
          },
        ],
      },
    },
    status: 'AVAILABLE',
    dataAvailability: 'COMPLETE',
    ...overrides,
  };
}

describe('Scenario View Model', () => {
  it('formats base/stressed/impact per currency, impact with sign', () => {
    const vm = mapToPortfolioScenarioViewModel(raw({}));
    expect(vm!.isUnavailable).toBe(false);
    const brl = vm!.currencies[0]!;
    expect(brl.baseValueFormatted).toBe('R$ 100.000,00');
    expect(brl.stressedValueFormatted).toBe('R$ 90.000,00');
    expect(brl.absoluteImpactFormatted).toBe('-R$ 10.000,00');
    expect(brl.percentageImpactFormatted).toBe('-10,00%');
    expect(vm!.scenarioLabel).toContain('Choque direto de preços');
  });

  it('USD uses the USD currency formatter', () => {
    const vm = mapToPortfolioScenarioViewModel(
      raw({
        currencies: {
          USD: {
            currency: 'USD',
            status: 'AVAILABLE',
            baseValue: '1000',
            stressedValue: '900',
            absoluteImpact: '-100',
            percentageImpact: '-10',
            positionCount: 1,
            valuedPositionCount: 1,
            unvaluedPositionCount: 0,
            components: [],
          },
        },
      }),
    );
    expect(vm!.currencies[0]!.baseValueFormatted).toBe('USD 1.000,00');
  });

  it('partial: unvalued count and non-alarmist label', () => {
    const vm = mapToPortfolioScenarioViewModel(
      raw({
        status: 'PARTIAL',
        dataAvailability: 'PARTIAL',
        currencies: {
          BRL: {
            currency: 'BRL',
            status: 'PARTIAL',
            baseValue: '1000',
            stressedValue: '900',
            absoluteImpact: '-100',
            percentageImpact: '-10',
            positionCount: 3,
            valuedPositionCount: 2,
            unvaluedPositionCount: 1,
            components: [],
          },
        },
      }),
    );
    expect(vm!.isPartial).toBe(true);
    expect(vm!.currencies[0]!.unvaluedPositionCount).toBe(1);
    expect(vm!.statusLabel).toBe('Algumas posições não puderam ser avaliadas neste cenário.');
  });

  it('beta note and rate-unsupported reason are surfaced', () => {
    const vm = mapToPortfolioScenarioViewModel(
      raw({
        status: 'PARTIAL',
        currencies: {
          BRL: {
            currency: 'BRL',
            status: 'PARTIAL',
            baseValue: '1000',
            stressedValue: '920',
            absoluteImpact: '-80',
            percentageImpact: '-8',
            positionCount: 2,
            valuedPositionCount: 2,
            unvaluedPositionCount: 0,
            components: [
              {
                componentType: 'BENCHMARK_SHOCK',
                status: 'AVAILABLE',
                baseValue: '1000',
                stressedValue: '920',
                absoluteImpact: '-80',
                percentageImpact: '-8',
                reason: null,
              },
              {
                componentType: 'RATE_SHOCK',
                status: 'UNAVAILABLE',
                baseValue: null,
                stressedValue: null,
                absoluteImpact: null,
                percentageImpact: null,
                reason: 'SCENARIO.UNSUPPORTED_RATE_SHOCK',
              },
            ],
          },
        },
      }),
    );
    const brl = vm!.currencies[0]!;
    expect(brl.usesBeta).toBe(true);
    expect(brl.rateUnsupported).toBe(true);
    expect(brl.components.find((c) => c.componentType === 'RATE_SHOCK')!.reasonMessage).toContain(
      'sensibilidade de juros',
    );
  });

  it('presets are explicit and rate presets are disabled with a reason', () => {
    const ids = SCENARIO_PRESET_OPTIONS.map((p) => p.id);
    expect(ids).toContain('MARKET_DOWN_10');
    expect(ids).toContain('IBOV_DOWN_10');
    expect(ids).toContain('CUSTOM');
    const rates = SCENARIO_PRESET_OPTIONS.find((p) => p.id === 'RATES_UP_100BPS')!;
    expect(rates.disabled).toBe(true);
    expect(rates.disabledReason).toContain('sensibilidade de juros');
  });

  it('no forecast/probability/guarantee wording', () => {
    const vm = mapToPortfolioScenarioViewModel(raw({}));
    const text = JSON.stringify(vm);
    expect(text).not.toMatch(/previsão de|vai cair|probabilidade|perda esperada|garantia/i);
    expect(text).toContain('Hipótese');
  });

  it('scenario query key isolates portfolio and asOf', () => {
    expect(scenarioQueryKey('p', '2026-09-23')).toEqual(['portfolio-scenario', 'p', '2026-09-23']);
  });

  it('never performs scenario math', async () => {
    const fs = await import('fs');
    const code = fs.readFileSync(
      'packages/ui/src/view-models/portfolio-scenario.view-model.ts',
      'utf8',
    );
    expect(code).not.toMatch(/stressedValue\s*=(?!=)/);
    expect(code).not.toMatch(/shockFactor/);
    expect(code).not.toMatch(/modifiedDuration\s*\*/);
    expect(code).not.toMatch(/\.multiply\(/);
    expect(code).not.toMatch(/Math\./);
  });
});
