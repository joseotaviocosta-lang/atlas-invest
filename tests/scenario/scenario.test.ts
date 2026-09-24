import { describe, it, expect } from 'vitest';
import { Money, Quantity } from '@atlas/domain';
import {
  applyScenarioToSnapshot,
  runScenario,
  validateScenario,
  InvalidScenarioError,
  SCENARIO_ERROR_CODES,
  SCENARIO_PRESETS,
  ScenarioDefinition,
  ScenarioPortfolioSnapshot,
  ScenarioPosition,
} from '@atlas/scenario-engine';

function position(params: {
  assetClass: string;
  quantity: string;
  price: string;
  currency?: string;
  valued?: boolean;
  modifiedDuration?: string | null;
  assetId?: string;
}): ScenarioPosition {
  const currency = params.currency ?? 'BRL';
  const valued = params.valued ?? true;
  return {
    assetId: params.assetId ?? `${params.assetClass}-${params.quantity}-${params.price}`,
    assetClass: params.assetClass,
    quantity: Quantity.from(params.quantity),
    marketPrice: valued ? Money.from(params.price, currency) : null,
    marketValue: valued ? Money.from(params.price, currency).multiply(params.quantity) : null,
    currency: currency as never,
    modifiedDuration:
      params.modifiedDuration !== undefined && params.modifiedDuration !== null
        ? Quantity.from(params.modifiedDuration)
        : null,
  };
}

function snapshot(currency: string, positions: ScenarioPosition[]): ScenarioPortfolioSnapshot {
  return { portfolioId: 'p1', asOf: '2026-09-23', currency: currency as never, positions };
}

// --- Equity shock §75/§77 ----------------------------------------------------

describe('Equity price shock (ADR-161)', () => {
  const positions = [
    position({ assetClass: 'STOCK', quantity: '10', price: '60' }), // 600
    position({ assetClass: 'FIXED_INCOME', quantity: '4', price: '100' }), // 400
  ];

  it('portfolio impact: equity 600 / FI 400, shock −10% → equity 540, FI 400, total 940, −6%', () => {
    const r = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', positions),
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
      portfolioBeta: null,
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.baseValue?.amount).toBe('1000');
    expect(r.stressedValue?.amount).toBe('940');
    expect(r.absoluteImpact?.amount).toBe('-60');
    expect(r.percentageImpact?.value).toBe('-6');
    // Fixed income unchanged.
    const equity = r.components[0]!;
    expect(equity.baseValue?.amount).toBe('600');
    expect(equity.stressedValue?.amount).toBe('540');
  });

  it('−100% wipes eligible equity to 0; +10% and +500% apply', () => {
    const single = [position({ assetClass: 'STOCK', quantity: '10', price: '60' })];
    const zero = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', single),
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-100' },
      portfolioBeta: null,
    });
    expect(zero.stressedValue?.amount).toBe('0');

    const up = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', single),
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '10' },
      portfolioBeta: null,
    });
    expect(up.stressedValue?.amount).toBe('660');

    const max = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', single),
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '500' },
      portfolioBeta: null,
    });
    expect(max.stressedValue?.amount).toBe('3600');
  });

  it('zero shock → unchanged; rejected below −100 and above max', () => {
    const r = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', positions),
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '0' },
      portfolioBeta: null,
    });
    expect(r.stressedValue?.amount).toBe('1000');
    expect(r.absoluteImpact?.amount).toBe('0');

    expect(() => validateScenario({ type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-101' })).toThrow(
      InvalidScenarioError,
    );
    expect(() => validateScenario({ type: 'EQUITY_PRICE_SHOCK', shockPercentage: '501' })).toThrow(
      InvalidScenarioError,
    );
  });

  it('eligibility: only STOCK/FII/ETF/BDR are stressed; FUND/CASH unchanged', () => {
    const r = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', [
        position({ assetClass: 'ETF', quantity: '10', price: '10' }),
        position({ assetClass: 'FII', quantity: '10', price: '10' }),
        position({ assetClass: 'BDR', quantity: '10', price: '10' }),
        position({ assetClass: 'FUND', quantity: '10', price: '10' }),
        position({ assetClass: 'CASH', quantity: '10', price: '10' }),
      ]),
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
      portfolioBeta: null,
    });
    // 3 eligible × 100 = 300 stressed to 270; FUND + CASH 200 unchanged → 470.
    expect(r.stressedValue?.amount).toBe('470');
    expect(r.components[0]!.baseValue?.amount).toBe('300');
  });

  it('exact decimals, frozen, no NaN/Infinity', () => {
    const r = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', [
        position({ assetClass: 'STOCK', quantity: '3', price: '33.3333' }),
      ]),
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
      portfolioBeta: null,
    });
    expect(r.stressedValue?.amount).toMatch(/^-?\d+(\.\d+)?$/);
    expect(JSON.stringify(r)).not.toContain('Infinity');
    expect(JSON.stringify(r)).not.toContain('NaN');
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.components)).toBe(true);
  });
});

// --- Benchmark shock §78–§81 -------------------------------------------------

describe('Benchmark shock via historical Beta (ADR-162)', () => {
  const oneValue = [position({ assetClass: 'STOCK', quantity: '10', price: '100' })]; // 1000

  it('beta 0.8 + IBOV −10% → estimated −8%, stressed 920', () => {
    const r = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', oneValue),
      scenario: { type: 'BENCHMARK_SHOCK', benchmarkId: 'IBOV', shockPercentage: '-10' },
      portfolioBeta: Quantity.from('0.8'),
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.stressedValue?.amount).toBe('920');
    expect(r.absoluteImpact?.amount).toBe('-80');
    expect(r.percentageImpact?.value).toBe('-8');
  });

  it('negative beta −0.5 + IBOV −10% → +5%', () => {
    const r = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', oneValue),
      scenario: { type: 'BENCHMARK_SHOCK', benchmarkId: 'IBOV', shockPercentage: '-10' },
      portfolioBeta: Quantity.from('-0.5'),
    });
    expect(r.percentageImpact?.value).toBe('5');
    expect(r.stressedValue?.amount).toBe('1050');
  });

  it('beta 0 → zero impact (valid)', () => {
    const r = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', oneValue),
      scenario: { type: 'BENCHMARK_SHOCK', benchmarkId: 'IBOV', shockPercentage: '-10' },
      portfolioBeta: Quantity.zero(),
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.absoluteImpact?.amount).toBe('0');
  });

  it('beta unavailable → UNAVAILABLE, no fallback to 1', () => {
    const r = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', oneValue),
      scenario: { type: 'BENCHMARK_SHOCK', benchmarkId: 'IBOV', shockPercentage: '-10' },
      portfolioBeta: null,
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.stressedValue).toBeNull();
    expect(r.components[0]!.reason).toBe(SCENARIO_ERROR_CODES.BETA_UNAVAILABLE);
  });
});

// --- Conflict §82 ------------------------------------------------------------

describe('Conflicting shocks (ADR-164)', () => {
  it('equity + benchmark in the same scenario → InvalidScenarioError CONFLICTING_SHOCKS', () => {
    let caught: InvalidScenarioError | null = null;
    try {
      validateScenario({
        type: 'COMBINED',
        equityShockPercentage: '-10',
        benchmarkShockPercentage: '-10',
      });
    } catch (err) {
      caught = err as InvalidScenarioError;
    }
    expect(caught?.code).toBe(SCENARIO_ERROR_CODES.CONFLICTING_SHOCKS);
  });

  it('engine-level guard: applyScenarioToSnapshot also rejects equity + benchmark (no bypass)', () => {
    let caught: InvalidScenarioError | null = null;
    try {
      applyScenarioToSnapshot({
        snapshot: snapshot('BRL', [
          position({ assetClass: 'STOCK', quantity: '10', price: '100' }),
        ]),
        scenario: {
          type: 'COMBINED',
          equityShockPercentage: '-10',
          benchmarkShockPercentage: '-10',
        },
        portfolioBeta: Quantity.from('0.8'),
      });
    } catch (err) {
      caught = err as InvalidScenarioError;
    }
    expect(caught?.code).toBe(SCENARIO_ERROR_CODES.CONFLICTING_SHOCKS);
  });

  it('valid combinations: equity only, benchmark only, equity+rate, benchmark+rate', () => {
    const stock = [position({ assetClass: 'STOCK', quantity: '10', price: '100' })];
    const equityOnly = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', stock),
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
      portfolioBeta: null,
    });
    expect(equityOnly.status).toBe('AVAILABLE');

    const benchmarkOnly = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', stock),
      scenario: { type: 'BENCHMARK_SHOCK', benchmarkId: 'IBOV', shockPercentage: '-10' },
      portfolioBeta: Quantity.from('0.8'),
    });
    expect(benchmarkOnly.status).toBe('AVAILABLE');

    const equityRate = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', stock),
      scenario: { type: 'COMBINED', equityShockPercentage: '-10', rateShockBps: '100' },
      portfolioBeta: null,
    });
    expect(equityRate.status).toBe('PARTIAL');
    expect(equityRate.components.find((c) => c.componentType === 'RATE_SHOCK')!.reason).toBe(
      SCENARIO_ERROR_CODES.UNSUPPORTED_RATE_SHOCK,
    );

    const benchmarkRate = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', stock),
      scenario: {
        type: 'COMBINED',
        benchmarkShockPercentage: '-10',
        benchmarkId: 'IBOV',
        rateShockBps: '100',
      },
      portfolioBeta: Quantity.from('0.8'),
    });
    expect(benchmarkRate.status).toBe('PARTIAL');
    expect(
      benchmarkRate.components.find((c) => c.componentType === 'BENCHMARK_SHOCK')!.status,
    ).toBe('AVAILABLE');
    expect(benchmarkRate.components.find((c) => c.componentType === 'RATE_SHOCK')!.reason).toBe(
      SCENARIO_ERROR_CODES.UNSUPPORTED_RATE_SHOCK,
    );
  });
});

// --- Rate shock §84–§87 ------------------------------------------------------

describe('Rate shock boundary (ADR-163)', () => {
  it('no explicit modified duration → UNAVAILABLE / UNSUPPORTED (never inferred)', () => {
    const r = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', [
        position({ assetClass: 'FIXED_INCOME', quantity: '10', price: '100' }),
      ]),
      scenario: { type: 'RATE_SHOCK', rateShockBps: '100' },
      portfolioBeta: null,
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.components[0]!.reason).toBe(SCENARIO_ERROR_CODES.UNSUPPORTED_RATE_SHOCK);
  });

  it('with explicit modified duration 5 + 100 bps → −5%, stressed 950', () => {
    const r = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', [
        position({
          assetClass: 'FIXED_INCOME',
          quantity: '10',
          price: '100',
          modifiedDuration: '5',
        }),
      ]),
      scenario: { type: 'RATE_SHOCK', rateShockBps: '100' },
      portfolioBeta: null,
    });
    expect(r.status).toBe('AVAILABLE');
    expect(r.stressedValue?.amount).toBe('950');
    expect(r.percentageImpact?.value).toBe('-5');
  });

  it('−100 bps with duration 5 → +5%', () => {
    const r = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', [
        position({
          assetClass: 'TREASURY',
          quantity: '10',
          price: '100',
          modifiedDuration: '5',
        }),
      ]),
      scenario: { type: 'RATE_SHOCK', rateShockBps: '-100' },
      portfolioBeta: null,
    });
    expect(r.percentageImpact?.value).toBe('5');
    expect(r.stressedValue?.amount).toBe('1050');
  });

  it('extreme shock producing non-positive value → UNAVAILABLE (no absurd value)', () => {
    const r = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', [
        position({
          assetClass: 'FIXED_INCOME',
          quantity: '10',
          price: '100',
          modifiedDuration: '50',
        }),
      ]),
      scenario: { type: 'RATE_SHOCK', rateShockBps: '10000' }, // -50 × 1.00 = -50 → factor -49
      portfolioBeta: null,
    });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.components[0]!.reason).toBe(SCENARIO_ERROR_CODES.RATE_SHOCK_NEGATIVE_VALUE);
  });
});

// --- Combined §88 ------------------------------------------------------------

describe('Combined scenario', () => {
  it('equity + unsupported rate: equity drives the value, status PARTIAL', () => {
    const r = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', [
        position({ assetClass: 'STOCK', quantity: '10', price: '60' }),
        position({ assetClass: 'FIXED_INCOME', quantity: '4', price: '100' }),
      ]),
      scenario: { type: 'COMBINED', equityShockPercentage: '-10', rateShockBps: '100' },
      portfolioBeta: null,
    });
    expect(r.status).toBe('PARTIAL');
    // Equity 600 → 540; FI unchanged (rate unsupported) → total 940.
    expect(r.stressedValue?.amount).toBe('940');
    const rate = r.components.find((c) => c.componentType === 'RATE_SHOCK')!;
    expect(rate.status).toBe('UNAVAILABLE');
    expect(rate.reason).toBe(SCENARIO_ERROR_CODES.UNSUPPORTED_RATE_SHOCK);
  });
});

// --- Multi-currency §89 ------------------------------------------------------

describe('Multi-currency segregation', () => {
  it('BRL and USD are computed independently (no FX aggregation)', () => {
    const result = runScenario({
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
      snapshots: [
        snapshot('BRL', [position({ assetClass: 'STOCK', quantity: '10', price: '60' })]),
        snapshot('USD', [
          position({ assetClass: 'STOCK', quantity: '10', price: '20', currency: 'USD' }),
        ]),
      ],
      portfolioBetaByCurrency: { BRL: null, USD: null },
    });
    expect(result.currencies).toHaveLength(2);
    expect(result.currencies.find((c) => c.currency === 'BRL')!.stressedValue?.amount).toBe('540');
    expect(result.currencies.find((c) => c.currency === 'USD')!.stressedValue?.amount).toBe('180');
  });
});

// --- Partial valuation §90 ---------------------------------------------------

describe('Partial valuation', () => {
  it('3 positions, 2 valued, 1 missing → PARTIAL, unvaluedPositionCount = 1', () => {
    const r = applyScenarioToSnapshot({
      snapshot: snapshot('BRL', [
        position({ assetClass: 'STOCK', quantity: '10', price: '60' }),
        position({ assetClass: 'STOCK', quantity: '10', price: '40' }),
        position({ assetClass: 'STOCK', quantity: '10', price: '0', valued: false }),
      ]),
      scenario: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' },
      portfolioBeta: null,
    });
    expect(r.status).toBe('PARTIAL');
    expect(r.positionCount).toBe(3);
    expect(r.valuedPositionCount).toBe(2);
    expect(r.unvaluedPositionCount).toBe(1);
    expect(r.baseValue?.amount).toBe('1000');
    expect(r.stressedValue?.amount).toBe('900');
  });
});

// --- Immutability §93 --------------------------------------------------------

describe('Immutability', () => {
  it('does not mutate the snapshot, positions or scenario', () => {
    const positions = [position({ assetClass: 'STOCK', quantity: '10', price: '60' })];
    const snap = snapshot('BRL', positions);
    const scenario: ScenarioDefinition = { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' };
    const beforeValue = positions[0]!.marketValue?.amount;
    applyScenarioToSnapshot({ snapshot: snap, scenario, portfolioBeta: null });
    expect(positions[0]!.marketValue?.amount).toBe(beforeValue);
    expect(snap.positions).toBe(positions);
    expect(scenario.shockPercentage).toBe('-10');
  });
});

// --- Presets §35 -------------------------------------------------------------

describe('Predefined scenarios', () => {
  it('all presets map to explicit, valid definitions (no crisis names)', () => {
    const ids = SCENARIO_PRESETS.map((p) => p.id);
    expect(ids).toEqual([
      'MARKET_DOWN_10',
      'MARKET_DOWN_20',
      'MARKET_UP_10',
      'IBOV_DOWN_10',
      'RATES_UP_100BPS',
      'RATES_DOWN_100BPS',
    ]);
    for (const preset of SCENARIO_PRESETS) {
      expect(() => validateScenario(preset.definition)).not.toThrow();
    }
    expect(ids.join(',')).not.toMatch(/2008|covid|black.?monday|crisis/i);
  });
});
