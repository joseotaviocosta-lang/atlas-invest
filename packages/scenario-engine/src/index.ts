import { Currency, Money, Percentage, Quantity } from '@atlas/domain';

export const SCENARIO_ENGINE_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Deterministic what-if scenario engine (3O, ADR-159â€“ADR-165).
//
// PURE / DETERMINISTIC / ZERO I/O. Applies explicit, auditable hypothetical
// shocks to a market-value snapshot. NEVER a forecast, probability or
// simulation. NEVER mutates the ledger, portfolio state or the input snapshot.
// Depends only on public @atlas/domain primitives. All outputs frozen.
// ---------------------------------------------------------------------------

export const SCENARIO_TYPES = [
  'EQUITY_PRICE_SHOCK',
  'BENCHMARK_SHOCK',
  'RATE_SHOCK',
  'COMBINED',
] as const;
export type ScenarioType = (typeof SCENARIO_TYPES)[number];

export const SCENARIO_COMPONENT_TYPES = [
  'EQUITY_PRICE_SHOCK',
  'BENCHMARK_SHOCK',
  'RATE_SHOCK',
] as const;
export type ScenarioComponentType = (typeof SCENARIO_COMPONENT_TYPES)[number];

export const SCENARIO_STATUSES = ['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'] as const;
export type ScenarioStatus = (typeof SCENARIO_STATUSES)[number];

export const SCENARIO_DATA_AVAILABILITIES = ['COMPLETE', 'PARTIAL', 'UNAVAILABLE'] as const;
export type ScenarioDataAvailability = (typeof SCENARIO_DATA_AVAILABILITIES)[number];

/** Asset classes eligible for a direct equity price shock (canonical domain names). */
export const EQUITY_SHOCK_ASSET_CLASSES = ['STOCK', 'FII', 'ETF', 'BDR'] as const;
export type EquityShockAssetClass = (typeof EQUITY_SHOCK_ASSET_CLASSES)[number];

/** Asset classes eligible for a rate shock ONLY when explicit modified duration exists. */
export const RATE_SHOCK_ASSET_CLASSES = ['FIXED_INCOME', 'TREASURY'] as const;

export const SCENARIO_BENCHMARKS = ['IBOV'] as const;
export type ScenarioBenchmarkId = (typeof SCENARIO_BENCHMARKS)[number];

export const SCENARIO_LIMITS = {
  minEquityShockPercentage: '-100',
  maxEquityShockPercentage: '500',
  minBenchmarkShockPercentage: '-100',
  maxBenchmarkShockPercentage: '500',
  minRateShockBps: '-10000',
  maxRateShockBps: '10000',
} as const;

export const SCENARIO_ERROR_CODES = {
  INVALID_TYPE: 'SCENARIO.INVALID_TYPE',
  INVALID_SHOCK: 'SCENARIO.INVALID_SHOCK',
  CONFLICTING_SHOCKS: 'SCENARIO.CONFLICTING_SHOCKS',
  UNSUPPORTED_RATE_SHOCK: 'SCENARIO.UNSUPPORTED_RATE_SHOCK',
  BETA_UNAVAILABLE: 'SCENARIO.BETA_UNAVAILABLE',
  RATE_SHOCK_NEGATIVE_VALUE: 'SCENARIO.RATE_SHOCK_NEGATIVE_VALUE',
} as const;
export type ScenarioErrorCode = (typeof SCENARIO_ERROR_CODES)[keyof typeof SCENARIO_ERROR_CODES];

export class InvalidScenarioError extends Error {
  readonly code: ScenarioErrorCode;
  constructor(code: ScenarioErrorCode, message: string) {
    super(message);
    this.name = 'InvalidScenarioError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Scenario definitions (explicit, deterministic inputs)
// ---------------------------------------------------------------------------

export interface EquityPriceShockDefinition {
  type: 'EQUITY_PRICE_SHOCK';
  shockPercentage: string;
}

export interface BenchmarkShockDefinition {
  type: 'BENCHMARK_SHOCK';
  benchmarkId: ScenarioBenchmarkId;
  shockPercentage: string;
}

export interface RateShockDefinition {
  type: 'RATE_SHOCK';
  /** Basis points, e.g. "100" = +1.00 percentage point. */
  rateShockBps: string;
}

export interface CombinedScenarioDefinition {
  type: 'COMBINED';
  equityShockPercentage?: string;
  benchmarkShockPercentage?: string;
  benchmarkId?: ScenarioBenchmarkId;
  rateShockBps?: string;
}

export type ScenarioDefinition =
  | EquityPriceShockDefinition
  | BenchmarkShockDefinition
  | RateShockDefinition
  | CombinedScenarioDefinition;

// ---------------------------------------------------------------------------
// Snapshot (market-value inputs only â€” NEVER cost basis)
// ---------------------------------------------------------------------------

export interface ScenarioPosition {
  assetId: string;
  /** Canonical asset class (AssetType). */
  assetClass: string;
  quantity: Quantity;
  /** Current/historical market price per unit. Null when unavailable. */
  marketPrice: Money | null;
  /** Current/historical market value. Null when unavailable (never implicit zero). */
  marketValue: Money | null;
  currency: Currency;
  /**
   * Explicit modified duration, ONLY if the domain provides it. The engine
   * never infers duration from maturity/coupon/yield (ADR-163).
   */
  modifiedDuration: Quantity | null;
}

export interface ScenarioPortfolioSnapshot {
  portfolioId: string;
  asOf: string;
  currency: Currency;
  positions: readonly ScenarioPosition[];
}

export interface ScenarioComponentResult {
  componentType: ScenarioComponentType;
  baseValue: Money | null;
  stressedValue: Money | null;
  absoluteImpact: Money | null;
  percentageImpact: Percentage | null;
  status: ScenarioStatus;
  reason: string | null;
}

export interface ScenarioCurrencyResult {
  currency: Currency;
  status: ScenarioStatus;
  baseValue: Money | null;
  stressedValue: Money | null;
  absoluteImpact: Money | null;
  percentageImpact: Percentage | null;
  positionCount: number;
  valuedPositionCount: number;
  unvaluedPositionCount: number;
  components: readonly ScenarioComponentResult[];
}

export interface ScenarioResult {
  scenario: ScenarioDefinition;
  currencies: readonly ScenarioCurrencyResult[];
  status: ScenarioStatus;
  dataAvailability: ScenarioDataAvailability;
}

// --- helpers ----------------------------------------------------------------

const HUNDRED = '100';
const TEN_THOUSAND = '10000';

function one(): Quantity {
  return Quantity.from('1');
}

function toQuantity(value: string): Quantity {
  try {
    return Quantity.from(value);
  } catch {
    throw new InvalidScenarioError(
      SCENARIO_ERROR_CODES.INVALID_SHOCK,
      `Invalid numeric value '${value}'`,
    );
  }
}

/** factor = 1 + shockPercentage/100 */
function shockFactor(shockPercentage: string): Quantity {
  return one().add(toQuantity(shockPercentage).divide(HUNDRED));
}

function assertWithin(value: string, min: string, max: string, label: string): void {
  const v = toQuantity(value);
  if (v.compare(toQuantity(min)) < 0 || v.compare(toQuantity(max)) > 0) {
    throw new InvalidScenarioError(
      SCENARIO_ERROR_CODES.INVALID_SHOCK,
      `Invalid ${label} '${value}'. Allowed range: ${min}..${max}`,
    );
  }
}

function isEquityEligible(assetClass: string): boolean {
  return (EQUITY_SHOCK_ASSET_CLASSES as readonly string[]).includes(assetClass);
}

function isRateEligible(assetClass: string): boolean {
  return (RATE_SHOCK_ASSET_CLASSES as readonly string[]).includes(assetClass);
}

function isValued(position: ScenarioPosition): boolean {
  return position.marketValue !== null && position.marketPrice !== null;
}

function percentageImpactOf(absolute: Money, base: Money): Percentage | null {
  if (base.isZero()) return null;
  const ratio = Quantity.from(absolute.amount).divide(Quantity.from(base.amount)).multiply(HUNDRED);
  return Percentage.from(ratio.toString());
}

function buildComponent(input: {
  componentType: ScenarioComponentType;
  currency: Currency;
  baseValue: Money | null;
  stressedValue: Money | null;
  status: ScenarioStatus;
  reason?: string | null;
}): ScenarioComponentResult {
  const base = input.baseValue;
  const stressed = input.stressedValue;
  const absolute = base && stressed ? stressed.subtract(base) : null;
  const percentage = absolute && base ? percentageImpactOf(absolute, base) : null;
  return Object.freeze({
    componentType: input.componentType,
    baseValue: base,
    stressedValue: stressed,
    absoluteImpact: absolute,
    percentageImpact: percentage,
    status: input.status,
    reason: input.reason ?? null,
  });
}

// --- validation -------------------------------------------------------------

export function validateScenario(scenario: ScenarioDefinition): void {
  if (!scenario || !(SCENARIO_TYPES as readonly string[]).includes(scenario.type)) {
    throw new InvalidScenarioError(
      SCENARIO_ERROR_CODES.INVALID_TYPE,
      `Invalid scenario type '${scenario ? scenario.type : 'undefined'}'. Supported: ${SCENARIO_TYPES.join(', ')}`,
    );
  }

  switch (scenario.type) {
    case 'EQUITY_PRICE_SHOCK':
      assertWithin(
        scenario.shockPercentage,
        SCENARIO_LIMITS.minEquityShockPercentage,
        SCENARIO_LIMITS.maxEquityShockPercentage,
        'equity shock percentage',
      );
      break;
    case 'BENCHMARK_SHOCK':
      if (!(SCENARIO_BENCHMARKS as readonly string[]).includes(scenario.benchmarkId)) {
        throw new InvalidScenarioError(
          SCENARIO_ERROR_CODES.INVALID_TYPE,
          `Unsupported benchmark '${scenario.benchmarkId}'. Supported: ${SCENARIO_BENCHMARKS.join(', ')}`,
        );
      }
      assertWithin(
        scenario.shockPercentage,
        SCENARIO_LIMITS.minBenchmarkShockPercentage,
        SCENARIO_LIMITS.maxBenchmarkShockPercentage,
        'benchmark shock percentage',
      );
      break;
    case 'RATE_SHOCK':
      assertWithin(
        scenario.rateShockBps,
        SCENARIO_LIMITS.minRateShockBps,
        SCENARIO_LIMITS.maxRateShockBps,
        'rate shock (bps)',
      );
      break;
    case 'COMBINED': {
      const hasEquity = scenario.equityShockPercentage !== undefined;
      const hasBenchmark = scenario.benchmarkShockPercentage !== undefined;
      const hasRate = scenario.rateShockBps !== undefined;
      if (hasEquity && hasBenchmark) {
        throw new InvalidScenarioError(
          SCENARIO_ERROR_CODES.CONFLICTING_SHOCKS,
          'A combined scenario cannot apply a direct equity shock and a benchmark shock to the same exposure (double counting).',
        );
      }
      if (!hasEquity && !hasBenchmark && !hasRate) {
        throw new InvalidScenarioError(
          SCENARIO_ERROR_CODES.INVALID_SHOCK,
          'A combined scenario requires at least one shock.',
        );
      }
      if (hasEquity) {
        assertWithin(
          scenario.equityShockPercentage!,
          SCENARIO_LIMITS.minEquityShockPercentage,
          SCENARIO_LIMITS.maxEquityShockPercentage,
          'equity shock percentage',
        );
      }
      if (hasBenchmark) {
        const benchmarkId = scenario.benchmarkId ?? 'IBOV';
        if (!(SCENARIO_BENCHMARKS as readonly string[]).includes(benchmarkId)) {
          throw new InvalidScenarioError(
            SCENARIO_ERROR_CODES.INVALID_TYPE,
            `Unsupported benchmark '${benchmarkId}'. Supported: ${SCENARIO_BENCHMARKS.join(', ')}`,
          );
        }
        assertWithin(
          scenario.benchmarkShockPercentage!,
          SCENARIO_LIMITS.minBenchmarkShockPercentage,
          SCENARIO_LIMITS.maxBenchmarkShockPercentage,
          'benchmark shock percentage',
        );
      }
      if (hasRate) {
        assertWithin(
          scenario.rateShockBps!,
          SCENARIO_LIMITS.minRateShockBps,
          SCENARIO_LIMITS.maxRateShockBps,
          'rate shock (bps)',
        );
      }
      break;
    }
  }
}

// --- component appliers -----------------------------------------------------

function applyEquityShock(
  snapshot: ScenarioPortfolioSnapshot,
  shockPercentage: string,
): ScenarioComponentResult {
  const factor = shockFactor(shockPercentage);
  let base = Money.zero(snapshot.currency);
  let stressed = Money.zero(snapshot.currency);
  let eligibleCount = 0;
  for (const position of snapshot.positions) {
    if (!isEquityEligible(position.assetClass) || !isValued(position)) continue;
    const stressedPrice = position.marketPrice!.multiply(factor);
    const stressedValue = stressedPrice.multiply(position.quantity.value);
    base = base.add(position.marketValue!);
    stressed = stressed.add(stressedValue);
    eligibleCount += 1;
  }
  if (eligibleCount === 0) {
    return buildComponent({
      componentType: 'EQUITY_PRICE_SHOCK',
      currency: snapshot.currency,
      baseValue: null,
      stressedValue: null,
      status: 'UNAVAILABLE',
      reason: 'No valued equity-eligible positions.',
    });
  }
  return buildComponent({
    componentType: 'EQUITY_PRICE_SHOCK',
    currency: snapshot.currency,
    baseValue: base,
    stressedValue: stressed,
    status: 'AVAILABLE',
  });
}

function applyBenchmarkShock(
  snapshot: ScenarioPortfolioSnapshot,
  baseValue: Money,
  portfolioBeta: Quantity | null,
  shockPercentage: string,
): ScenarioComponentResult {
  if (!portfolioBeta) {
    return buildComponent({
      componentType: 'BENCHMARK_SHOCK',
      currency: snapshot.currency,
      baseValue,
      stressedValue: null,
      status: 'UNAVAILABLE',
      reason: SCENARIO_ERROR_CODES.BETA_UNAVAILABLE,
    });
  }
  if (baseValue.isZero()) {
    return buildComponent({
      componentType: 'BENCHMARK_SHOCK',
      currency: snapshot.currency,
      baseValue: null,
      stressedValue: null,
      status: 'UNAVAILABLE',
      reason: 'No valued positions.',
    });
  }
  // estimatedReturn% = beta Ã— benchmarkShock%; stressed = base Ã— (1 + estimatedReturn/100)
  const estimatedReturn = portfolioBeta.multiply(toQuantity(shockPercentage));
  const factor = one().add(estimatedReturn.divide(HUNDRED));
  const stressed = baseValue.multiply(factor);
  return buildComponent({
    componentType: 'BENCHMARK_SHOCK',
    currency: snapshot.currency,
    baseValue,
    stressedValue: stressed,
    status: 'AVAILABLE',
  });
}

function applyRateShock(
  snapshot: ScenarioPortfolioSnapshot,
  rateShockBps: string,
): ScenarioComponentResult {
  const eligible = snapshot.positions.filter(
    (p) => isRateEligible(p.assetClass) && isValued(p) && p.modifiedDuration !== null,
  );
  if (eligible.length === 0) {
    // No explicit modified duration in the model â†’ UNSUPPORTED. Never inferred.
    return buildComponent({
      componentType: 'RATE_SHOCK',
      currency: snapshot.currency,
      baseValue: null,
      stressedValue: null,
      status: 'UNAVAILABLE',
      reason: SCENARIO_ERROR_CODES.UNSUPPORTED_RATE_SHOCK,
    });
  }
  // rateShockDecimal = bps / 10000; linear duration approximation: Î”V/V = -D_mod Ã— Î”r
  const rateDecimal = toQuantity(rateShockBps).divide(TEN_THOUSAND);
  let base = Money.zero(snapshot.currency);
  let stressed = Money.zero(snapshot.currency);
  for (const position of eligible) {
    const priceChange = position.modifiedDuration!.multiply(rateDecimal).negate();
    const factor = one().add(priceChange);
    if (factor.compare(Quantity.zero()) <= 0) {
      return buildComponent({
        componentType: 'RATE_SHOCK',
        currency: snapshot.currency,
        baseValue: null,
        stressedValue: null,
        status: 'UNAVAILABLE',
        reason: SCENARIO_ERROR_CODES.RATE_SHOCK_NEGATIVE_VALUE,
      });
    }
    base = base.add(position.marketValue!);
    stressed = stressed.add(position.marketValue!.multiply(factor));
  }
  return buildComponent({
    componentType: 'RATE_SHOCK',
    currency: snapshot.currency,
    baseValue: base,
    stressedValue: stressed,
    status: 'AVAILABLE',
  });
}

// ---------------------------------------------------------------------------
// applyScenarioToSnapshot â€” pure per-currency scenario application.
// baseValue = sum of valued positions only (never a fabricated zero).
// ---------------------------------------------------------------------------

export function applyScenarioToSnapshot(input: {
  snapshot: ScenarioPortfolioSnapshot;
  scenario: ScenarioDefinition;
  /** Portfolio beta vs the benchmark (3K), same currency. Null when unavailable. */
  portfolioBeta: Quantity | null;
}): ScenarioCurrencyResult {
  validateScenario(input.scenario);
  const { snapshot, scenario } = input;

  let baseValue = Money.zero(snapshot.currency);
  let valuedPositionCount = 0;
  for (const position of snapshot.positions) {
    if (!isValued(position)) continue;
    baseValue = baseValue.add(position.marketValue!);
    valuedPositionCount += 1;
  }
  const positionCount = snapshot.positions.length;
  const unvaluedPositionCount = positionCount - valuedPositionCount;
  const hasValued = valuedPositionCount > 0;

  const components: ScenarioComponentResult[] = [];
  switch (scenario.type) {
    case 'EQUITY_PRICE_SHOCK':
      components.push(applyEquityShock(snapshot, scenario.shockPercentage));
      break;
    case 'BENCHMARK_SHOCK':
      components.push(
        applyBenchmarkShock(snapshot, baseValue, input.portfolioBeta, scenario.shockPercentage),
      );
      break;
    case 'RATE_SHOCK':
      components.push(applyRateShock(snapshot, scenario.rateShockBps));
      break;
    case 'COMBINED': {
      if (scenario.equityShockPercentage !== undefined) {
        components.push(applyEquityShock(snapshot, scenario.equityShockPercentage));
      }
      if (scenario.benchmarkShockPercentage !== undefined) {
        components.push(
          applyBenchmarkShock(
            snapshot,
            baseValue,
            input.portfolioBeta,
            scenario.benchmarkShockPercentage,
          ),
        );
      }
      if (scenario.rateShockBps !== undefined) {
        components.push(applyRateShock(snapshot, scenario.rateShockBps));
      }
      break;
    }
  }

  // Combined stressed value: apply each available component's delta to the base.
  const availableComponents = components.filter(
    (c) => c.status === 'AVAILABLE' && c.stressedValue !== null,
  );
  const anyUnavailable = components.some((c) => c.status === 'UNAVAILABLE');

  let stressedValue: Money | null = null;
  if (hasValued && availableComponents.length > 0) {
    // Additive deltas on the same base; components never overlap by construction.
    // When a component is unavailable (e.g. unsupported rate shock), the
    // supported components still drive the stressed value and the status is
    // PARTIAL â€” the unsupported component is never fabricated.
    let stressed = baseValue;
    for (const component of availableComponents) {
      stressed = stressed.add(component.stressedValue!.subtract(component.baseValue!));
    }
    stressedValue = stressed;
  }

  const absoluteImpact = stressedValue && hasValued ? stressedValue.subtract(baseValue) : null;
  const percentageImpact =
    absoluteImpact && hasValued ? percentageImpactOf(absoluteImpact, baseValue) : null;

  let status: ScenarioStatus;
  if (!hasValued || availableComponents.length === 0) status = 'UNAVAILABLE';
  else if (anyUnavailable || unvaluedPositionCount > 0) status = 'PARTIAL';
  else status = 'AVAILABLE';

  return Object.freeze({
    currency: snapshot.currency,
    status,
    baseValue: hasValued ? baseValue : null,
    stressedValue,
    absoluteImpact,
    percentageImpact,
    positionCount,
    valuedPositionCount,
    unvaluedPositionCount,
    components: Object.freeze(components) as readonly ScenarioComponentResult[],
  });
}

// ---------------------------------------------------------------------------
// runScenario â€” orchestrates snapshots (per currency) + per-currency beta.
// ---------------------------------------------------------------------------

export function runScenario(input: {
  scenario: ScenarioDefinition;
  snapshots: readonly ScenarioPortfolioSnapshot[];
  portfolioBetaByCurrency: Record<string, Quantity | null>;
}): ScenarioResult {
  validateScenario(input.scenario);

  const currencies = input.snapshots.map((snapshot) =>
    applyScenarioToSnapshot({
      snapshot,
      scenario: input.scenario,
      portfolioBeta: input.portfolioBetaByCurrency[snapshot.currency] ?? null,
    }),
  );

  let status: ScenarioStatus;
  if (currencies.length === 0) status = 'UNAVAILABLE';
  else if (currencies.every((c) => c.status === 'UNAVAILABLE')) status = 'UNAVAILABLE';
  else if (currencies.every((c) => c.status === 'AVAILABLE')) status = 'AVAILABLE';
  else status = 'PARTIAL';

  const dataAvailability: ScenarioDataAvailability =
    status === 'AVAILABLE' ? 'COMPLETE' : status === 'PARTIAL' ? 'PARTIAL' : 'UNAVAILABLE';

  return Object.freeze({
    scenario: input.scenario,
    currencies: Object.freeze(currencies) as readonly ScenarioCurrencyResult[],
    status,
    dataAvailability,
  });
}

// ---------------------------------------------------------------------------
// Predefined scenarios (UX convenience only â€” all map to explicit inputs).
// No crisis/dated names (ADR-160 Â§36).
// ---------------------------------------------------------------------------

export const SCENARIO_PRESETS = [
  { id: 'MARKET_DOWN_10', definition: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-10' } },
  { id: 'MARKET_DOWN_20', definition: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '-20' } },
  { id: 'MARKET_UP_10', definition: { type: 'EQUITY_PRICE_SHOCK', shockPercentage: '10' } },
  {
    id: 'IBOV_DOWN_10',
    definition: { type: 'BENCHMARK_SHOCK', benchmarkId: 'IBOV', shockPercentage: '-10' },
  },
  { id: 'RATES_UP_100BPS', definition: { type: 'RATE_SHOCK', rateShockBps: '100' } },
  { id: 'RATES_DOWN_100BPS', definition: { type: 'RATE_SHOCK', rateShockBps: '-100' } },
] as const satisfies readonly { id: string; definition: ScenarioDefinition }[];
