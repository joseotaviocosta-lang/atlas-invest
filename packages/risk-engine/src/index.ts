import { LocalDate, Currency, Percentage, Quantity } from '@atlas/domain';

export const RISK_ENGINE_VERSION = '0.6.0';

// ---------------------------------------------------------------------------
// Canonical contracts (ADR-127, ADR-128)
//
// Pure financial inputs only. The engine NEVER receives view models, chart
// display samples, ledgers, prices, providers, Prisma, React or Nest types.
// Only public @atlas/domain primitives (LocalDate, Currency, Percentage,
// Quantity). DecimalValue / raw Decimal are never imported or re-exported.
// ---------------------------------------------------------------------------

export const RISK_FREQUENCIES = ['DAILY'] as const;
export type RiskObservationFrequency = (typeof RISK_FREQUENCIES)[number];

export const RISK_STATUSES = ['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

/**
 * One TWR subperiod return ending at `date` (civil).
 *
 * `returnPercentage` uses percent-point convention: `Percentage.from('1')`
 * is +1%, `Percentage.from('-1')` is -1%. Subperiod returns come from the
 * performance engine (`calculateTWR(...).subperiods`), so external cash
 * flows are already neutralized and internal transfers already net to zero.
 * Cumulative-return levels must NEVER be fed here as if they were returns.
 */
export interface RiskSubperiodReturn {
  date: LocalDate;
  returnPercentage: Percentage;
}

/**
 * Cumulative TWR level at `date`, normalized to "0" at the period start
 * (3H series semantics). Used only where a wealth path is required
 * (drawdown). Volatility never consumes cumulative levels directly.
 */
export interface RiskCumulativePoint {
  date: LocalDate;
  cumulativeReturn: Percentage;
}

export interface RealizedVolatilityResult {
  frequency: RiskObservationFrequency;
  observationCount: number;
  /** Daily sample std dev in percent points, e.g. "0.84". Null when UNAVAILABLE. */
  samplePercentage: Percentage | null;
  /** Annualized vol in percent points, e.g. "13.34". Null when UNAVAILABLE. */
  annualizedPercentage: Percentage | null;
  annualizationFactor: '252';
  status: RiskStatus;
}

export interface DrawdownResult {
  /** Most negative drawdown in percent points, e.g. "-25". Never positive. Null when UNAVAILABLE. */
  maximumPercentage: Percentage | null;
  peakDate: LocalDate | null;
  troughDate: LocalDate | null;
  /** First date after trough with wealth >= previous peak. Null when open or when no drawdown occurred. */
  recoveryDate: LocalDate | null;
  /** Drawdown at the last observation (<= 0; "0" at a new high). Null when UNAVAILABLE. */
  currentPercentage: Percentage | null;
  status: RiskStatus;
}

export interface PortfolioRiskMetrics {
  currency: Currency;
  frequency: RiskObservationFrequency;
  volatility: RealizedVolatilityResult;
  drawdown: DrawdownResult;
  status: RiskStatus;
}

export class InvalidRiskInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRiskInputError';
  }
}

// ---------------------------------------------------------------------------
// Decimal math boundary (ADR-129)
//
// Financial exactness (sums, means, variances) uses Quantity (decimal.js,
// 40 digits, ROUND_HALF_UP) — never IEEE floats. The square root is
// mathematically irrational, so it is computed by Newton-Raphson iteration
// in the SAME decimal arithmetic, converged to decimal equality
// (max 100 iterations). This is the ONLY irrational operation in the
// engine; there is no Math.sqrt / Math.pow / Number() / parseFloat anywhere
// in this package.
// ---------------------------------------------------------------------------

const HUNDRED = '100';
const ANNUALIZATION_DAYS = '252';
const MAX_SQRT_ITERATIONS = 100;

function toRatio(percent: Percentage): Quantity {
  return Quantity.from(percent.value).divide(HUNDRED);
}

function toPercent(ratio: Quantity): Percentage {
  return Percentage.from(ratio.multiply(HUNDRED).toString());
}

/**
 * Decimal square root via Newton-Raphson: x <- (x + v / x) / 2.
 * Converges quadratically; at 40-digit precision ~6 correct-digit doublings
 * suffice, 100 iterations is a fail-safe ceiling. Throws
 * InvalidRiskInputError on negative input (fail-closed).
 */
export function decimalSqrt(value: Quantity): Quantity {
  if (value.isNegative()) {
    throw new InvalidRiskInputError(
      `Cannot compute square root of negative value '${value.toString()}'`,
    );
  }
  if (value.isZero()) return Quantity.zero();
  const two = Quantity.from('2');
  let x = value.compare(Quantity.from('1')) >= 0 ? value : Quantity.from('1');
  for (let i = 0; i < MAX_SQRT_ITERATIONS; i++) {
    const next = x.add(value.divide(x)).divide(two);
    if (next.equals(x)) return Object.freeze(next) as Quantity;
    x = next;
  }
  return Object.freeze(x) as Quantity;
}

function sortSubperiods(input: readonly RiskSubperiodReturn[]): RiskSubperiodReturn[] {
  return [...input].sort((a, b) => a.date.compare(b.date));
}

function hasDuplicateDates(input: readonly RiskSubperiodReturn[]): boolean {
  const seen = new Set<string>();
  for (const r of input) {
    const key = r.date.toString();
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Layer B — statistical risk observations (ADR-132)
//
// Layer A (TWR calculation boundaries) may include any civil date needed for
// flow neutralization. Layer B keeps only subperiods ending on ECONOMIC
// observation dates: dates with ≥1 position valued at an EXACT price
// (priceDate === date), plus the period start anchor. A Saturday/Sunday/
// holiday resolved purely via PREVIOUS_TRADING_DAY carries no new market
// information and must never enter the volatility sample as an artificial
// 0% — even though its valuation is a valid TWR boundary. Flow-only dates
// on non-market days are likewise TWR boundaries, not statistical returns.
// ---------------------------------------------------------------------------

export function selectRiskStatisticalReturns(input: {
  subperiodReturns: readonly RiskSubperiodReturn[];
  economicDates: readonly LocalDate[];
}): RiskSubperiodReturn[] {
  const economicKeys = new Set<string>(input.economicDates.map((d) => d.toString()));
  const selected = sortSubperiods(input.subperiodReturns).filter((r) =>
    economicKeys.has(r.date.toString()),
  );
  return Object.freeze(selected) as RiskSubperiodReturn[];
}

// ---------------------------------------------------------------------------
// Realized volatility (ADR-128)
//
// r1..rn            subperiod TWR ratios (percent/100)
// mean              = Σr / n
// sampleVariance    = Σ(r − mean)² / (n − 1)      (sample, NOT population)
// sampleVolatility  = sqrt(sampleVariance)
// annualized        = sampleVolatility × sqrt(252) (daily market convention)
//
// n < 2 → UNAVAILABLE with nulls (volatility is never invented as zero).
// n ≥ 2 with all-equal returns → exactly "0" (known, not missing).
// ---------------------------------------------------------------------------

export function calculateRealizedVolatility(input: {
  returns: readonly RiskSubperiodReturn[];
  frequency?: RiskObservationFrequency;
  partial?: boolean;
}): RealizedVolatilityResult {
  const frequency: RiskObservationFrequency = input.frequency ?? 'DAILY';
  const sorted = sortSubperiods(input.returns);

  const unavailable = (): RealizedVolatilityResult =>
    Object.freeze({
      frequency,
      observationCount: sorted.length,
      samplePercentage: null,
      annualizedPercentage: null,
      annualizationFactor: '252' as const,
      status: 'UNAVAILABLE' as const,
    });

  if (sorted.length < 2 || hasDuplicateDates(sorted)) return unavailable();

  const ratios = sorted.map((r) => toRatio(r.returnPercentage));
  const n = Quantity.from(String(ratios.length));
  let sum = Quantity.zero();
  for (const r of ratios) sum = sum.add(r);
  const mean = sum.divide(n);

  let squaredDeviations = Quantity.zero();
  for (const r of ratios) {
    const deviation = r.subtract(mean);
    squaredDeviations = squaredDeviations.add(deviation.multiply(deviation));
  }
  const variance = squaredDeviations.divide(Quantity.from(String(ratios.length - 1)));

  const sampleVolatility = decimalSqrt(variance);
  const annualized = sampleVolatility.multiply(decimalSqrt(Quantity.from(ANNUALIZATION_DAYS)));

  const status: RiskStatus = input.partial === true ? 'PARTIAL' : 'AVAILABLE';
  return Object.freeze({
    frequency,
    observationCount: sorted.length,
    samplePercentage: toPercent(sampleVolatility),
    annualizedPercentage: toPercent(annualized),
    annualizationFactor: '252' as const,
    status,
  });
}

// ---------------------------------------------------------------------------
// Drawdown (ADR-130)
//
// wealthIndex_t   = 1 + cumulativeReturn_t   (ratio; anchor wealth_0 = 1 at
//                   startDate, i.e. normalized 0%)
// runningPeak_t   = max(runningPeak_{t−1}, wealthIndex_t)
// drawdown_t      = wealthIndex_t / runningPeak_t − 1   (always ≤ 0)
//
// Maximum drawdown is the most negative drawdown_t. Sign convention is
// explicit: drawdowns are negative ("-25"), never unsigned magnitudes.
// peakDate  = peak anchoring the maximum drawdown (startDate when the path
//             never draws down — the unbroken high starts at the anchor).
// troughDate = date of the maximum drawdown (startDate when max is 0).
// recoveryDate = first date strictly after troughDate with wealth ≥ the
//             anchoring peak; null when open or when no drawdown occurred.
// currentPercentage = drawdown at the last point ("0" at a new high).
// ---------------------------------------------------------------------------

export function calculateDrawdown(input: {
  startDate: LocalDate;
  cumulativePoints: readonly RiskCumulativePoint[];
  partial?: boolean;
}): DrawdownResult {
  const sorted = [...input.cumulativePoints].sort((a, b) => a.date.compare(b.date));

  const unavailable = (): DrawdownResult =>
    Object.freeze({
      maximumPercentage: null,
      peakDate: null,
      troughDate: null,
      recoveryDate: null,
      currentPercentage: null,
      status: 'UNAVAILABLE' as const,
    });

  if (sorted.length === 0) return unavailable();

  const one = Quantity.from('1');
  let peak = one;
  let peakDate: LocalDate = input.startDate;
  let maxDrawdown = Quantity.zero();
  let maxPeak = one;
  let maxPeakDate: LocalDate = input.startDate;
  let maxTroughDate: LocalDate = input.startDate;
  let currentDrawdown = Quantity.zero();

  for (const point of sorted) {
    const wealth = one.add(toRatio(point.cumulativeReturn));
    if (wealth.compare(peak) > 0) {
      peak = wealth;
      peakDate = point.date;
      currentDrawdown = Quantity.zero();
    } else {
      const dd = wealth.divide(peak).subtract(one);
      currentDrawdown = dd;
      if (dd.compare(maxDrawdown) < 0) {
        maxDrawdown = dd;
        maxPeak = peak;
        maxPeakDate = peakDate;
        maxTroughDate = point.date;
      }
    }
  }

  let recoveryDate: LocalDate | null = null;
  if (maxDrawdown.compare(Quantity.zero()) < 0) {
    let afterTrough = false;
    for (const point of sorted) {
      if (!afterTrough) {
        if (point.date.compare(maxTroughDate) === 0) afterTrough = true;
        continue;
      }
      const wealth = one.add(toRatio(point.cumulativeReturn));
      if (wealth.compare(maxPeak) >= 0) {
        recoveryDate = point.date;
        break;
      }
    }
  }

  const status: RiskStatus = input.partial === true ? 'PARTIAL' : 'AVAILABLE';
  return Object.freeze({
    maximumPercentage: toPercent(maxDrawdown),
    peakDate: maxPeakDate,
    troughDate: maxTroughDate,
    recoveryDate,
    currentPercentage: toPercent(currentDrawdown),
    status,
  });
}

/**
 * Derives the cumulative TWR wealth path from subperiod returns by exact
 * chaining (wealth_t = wealth_{t−1} × (1 + r_t)) and computes drawdown over
 * it. The SAME subperiod trajectory feeds volatility, so both metrics are
 * consistent by construction (§79).
 */
export function calculateDrawdownFromSubperiods(input: {
  startDate: LocalDate;
  subperiodReturns: readonly RiskSubperiodReturn[];
  partial?: boolean;
}): DrawdownResult {
  const sorted = sortSubperiods(input.subperiodReturns);
  if (sorted.length === 0) {
    return Object.freeze({
      maximumPercentage: null,
      peakDate: null,
      troughDate: null,
      recoveryDate: null,
      currentPercentage: null,
      status: 'UNAVAILABLE' as const,
    });
  }
  if (hasDuplicateDates(sorted)) {
    return Object.freeze({
      maximumPercentage: null,
      peakDate: null,
      troughDate: null,
      recoveryDate: null,
      currentPercentage: null,
      status: 'UNAVAILABLE' as const,
    });
  }
  const one = Quantity.from('1');
  let wealth = one;
  const cumulativePoints: RiskCumulativePoint[] = sorted.map((r) => {
    wealth = wealth.multiply(one.add(toRatio(r.returnPercentage)));
    return { date: r.date, cumulativeReturn: toPercent(wealth.subtract(one)) };
  });
  return calculateDrawdown({
    startDate: input.startDate,
    cumulativePoints,
    partial: input.partial,
  });
}

// ---------------------------------------------------------------------------
// Combined per-currency risk metrics
// ---------------------------------------------------------------------------

export function calculateRiskMetrics(input: {
  currency: Currency;
  frequency?: RiskObservationFrequency;
  startDate: LocalDate;
  subperiodReturns: readonly RiskSubperiodReturn[];
  dataAvailability?: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
}): PortfolioRiskMetrics {
  const frequency: RiskObservationFrequency = input.frequency ?? 'DAILY';
  const partial = input.dataAvailability === 'PARTIAL';

  const volatility = calculateRealizedVolatility({
    returns: input.subperiodReturns,
    frequency,
    partial,
  });
  const drawdown = calculateDrawdownFromSubperiods({
    startDate: input.startDate,
    subperiodReturns: input.subperiodReturns,
    partial,
  });

  let status: RiskStatus = 'AVAILABLE';
  if (volatility.status === 'UNAVAILABLE' && drawdown.status === 'UNAVAILABLE') {
    status = 'UNAVAILABLE';
  } else if (volatility.status === 'PARTIAL' || drawdown.status === 'PARTIAL') {
    status = 'PARTIAL';
  } else if (volatility.status === 'UNAVAILABLE' || drawdown.status === 'UNAVAILABLE') {
    status = 'PARTIAL';
  }

  return Object.freeze({
    currency: input.currency,
    frequency,
    volatility: Object.freeze(volatility),
    drawdown: Object.freeze(drawdown),
    status,
  });
}

// ---------------------------------------------------------------------------
// Risk-adjusted performance foundation (3J, ADR-133–ADR-137)
//
// Sharpe and Sortino consume ALIGNED economic observations: portfolio TWR
// subperiod returns (Layer B, ADR-132) paired per civil date with reference
// (risk-free proxy) daily returns. The engine never fetches references,
// never assumes a rate, and never annualizes a pseudo-daily difference of
// annualized figures: excess is always per-observation,
// excess_t = portfolioReturn_t − riskFreeReturn_t, in exact decimal.
// ---------------------------------------------------------------------------

export const RISK_FREE_PROXIES = ['CDI'] as const;
export type RiskFreeProxy = (typeof RISK_FREE_PROXIES)[number];

/**
 * One aligned observation: portfolio and reference daily returns for the
 * SAME economic date. Both use percent-point convention
 * (`Percentage.from('0.05')` = +0.05%/day). Alignment (intersection) is the
 * caller's responsibility — see `alignRiskFreeObservations`.
 */
export interface RiskAdjustedReturnObservation {
  date: LocalDate;
  portfolioReturn: Percentage;
  riskFreeReturn: Percentage;
}

/**
 * Reference (risk-free proxy) daily observation. Unit-explicit at the
 * boundary: callers convert provider units (e.g. 3G `DAILY_PERCENT`) to the
 * percent-point daily return BEFORE constructing this type.
 */
export interface RiskFreeDailyObservation {
  date: LocalDate;
  dailyReturn: Percentage;
}

export interface SharpeRatioResult {
  frequency: RiskObservationFrequency;
  observationCount: number;
  riskFreeProxy: RiskFreeProxy;
  /** Mean daily excess as percent points (ratio × 100), e.g. "0.05". Null when UNAVAILABLE. */
  meanDailyExcessPercentage: Percentage | null;
  /** Daily Sharpe ratio (unitless), e.g. "0.078". Null when UNAVAILABLE. */
  dailySharpe: Quantity | null;
  /** Annualized Sharpe ratio (unitless), e.g. "1.24". Null when UNAVAILABLE. */
  annualizedSharpe: Quantity | null;
  annualizationFactor: '252';
  status: RiskStatus;
}

export interface SortinoRatioResult {
  frequency: RiskObservationFrequency;
  observationCount: number;
  downsideObservationCount: number;
  riskFreeProxy: RiskFreeProxy;
  /** Downside deviation of daily excess in percent points. Null when UNAVAILABLE. */
  downsideDeviationPercentage: Percentage | null;
  /** Daily Sortino ratio (unitless). Null when UNAVAILABLE. */
  dailySortino: Quantity | null;
  /** Annualized Sortino ratio (unitless). Null when UNAVAILABLE. */
  annualizedSortino: Quantity | null;
  annualizationFactor: '252';
  status: RiskStatus;
}

/**
 * Intersects portfolio statistical dates with reference dates (ADR-137).
 * Only dates present in BOTH series produce aligned observations; missing
 * reference dates are never assumed zero — they are reported so callers can
 * mark PARTIAL/UNAVAILABLE.
 */
export function alignRiskFreeObservations(input: {
  portfolioReturns: readonly RiskSubperiodReturn[];
  referenceReturns: readonly RiskFreeDailyObservation[];
}): {
  aligned: RiskAdjustedReturnObservation[];
  portfolioDatesWithoutReference: LocalDate[];
  referenceDatesWithoutPortfolio: LocalDate[];
} {
  const referenceByDate = new Map<string, Percentage>();
  for (const r of input.referenceReturns) {
    if (!referenceByDate.has(r.date.toString())) {
      referenceByDate.set(r.date.toString(), r.dailyReturn);
    }
  }
  const portfolioByDate = new Map<string, Percentage>();
  for (const r of input.portfolioReturns) {
    if (!portfolioByDate.has(r.date.toString())) {
      portfolioByDate.set(r.date.toString(), r.returnPercentage);
    }
  }
  const aligned: RiskAdjustedReturnObservation[] = [];
  const portfolioDatesWithoutReference: LocalDate[] = [];
  for (const r of sortSubperiods(input.portfolioReturns)) {
    const ref = referenceByDate.get(r.date.toString());
    if (ref === undefined) {
      portfolioDatesWithoutReference.push(r.date);
    } else {
      aligned.push({ date: r.date, portfolioReturn: r.returnPercentage, riskFreeReturn: ref });
    }
  }
  const portfolioKeys = new Set(portfolioByDate.keys());
  const referenceDatesWithoutPortfolio: LocalDate[] = input.referenceReturns
    .filter((r) => !portfolioKeys.has(r.date.toString()))
    .map((r) => r.date);
  return {
    aligned: Object.freeze(aligned) as RiskAdjustedReturnObservation[],
    portfolioDatesWithoutReference: Object.freeze(portfolioDatesWithoutReference) as LocalDate[],
    referenceDatesWithoutPortfolio: Object.freeze(referenceDatesWithoutPortfolio) as LocalDate[],
  };
}

function excessRatios(observations: readonly RiskAdjustedReturnObservation[]): Quantity[] {
  return observations.map((o) => toRatio(o.portfolioReturn).subtract(toRatio(o.riskFreeReturn)));
}

function meanOf(ratios: readonly Quantity[]): Quantity {
  let sum = Quantity.zero();
  for (const r of ratios) sum = sum.add(r);
  return sum.divide(Quantity.from(String(ratios.length)));
}

function hasDuplicateObservationDates(
  observations: readonly RiskAdjustedReturnObservation[],
): boolean {
  const seen = new Set<string>();
  for (const o of observations) {
    const key = o.date.toString();
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Sharpe ratio (ADR-135)
//
// excess_t            = portfolioReturn_t − riskFreeReturn_t (ratios)
// meanExcess          = Σexcess / n
// sampleStddev        = sqrt(Σ(excess − mean)² / (n − 1))   (sample, n−1)
// sharpeDaily         = meanExcess / sampleStddev
// sharpeAnnualized    = sharpeDaily × sqrt(252)
//
// n < 2 → UNAVAILABLE. sampleStddev = 0 → UNAVAILABLE (null, never
// Infinity/NaN — even when the mean is positive).
// ---------------------------------------------------------------------------

export function calculateSharpeRatio(input: {
  observations: readonly RiskAdjustedReturnObservation[];
  frequency?: RiskObservationFrequency;
  riskFreeProxy?: RiskFreeProxy;
  partial?: boolean;
}): SharpeRatioResult {
  const frequency: RiskObservationFrequency = input.frequency ?? 'DAILY';
  const riskFreeProxy: RiskFreeProxy = input.riskFreeProxy ?? 'CDI';

  const unavailable = (count: number): SharpeRatioResult =>
    Object.freeze({
      frequency,
      observationCount: count,
      riskFreeProxy,
      meanDailyExcessPercentage: null,
      dailySharpe: null,
      annualizedSharpe: null,
      annualizationFactor: '252' as const,
      status: 'UNAVAILABLE' as const,
    });

  const sorted = [...input.observations].sort((a, b) => a.date.compare(b.date));
  if (sorted.length < 2 || hasDuplicateObservationDates(sorted)) {
    return unavailable(sorted.length);
  }

  const excess = excessRatios(sorted);
  const mean = meanOf(excess);
  let squaredDeviations = Quantity.zero();
  for (const e of excess) {
    const deviation = e.subtract(mean);
    squaredDeviations = squaredDeviations.add(deviation.multiply(deviation));
  }
  const stddev = decimalSqrt(squaredDeviations.divide(Quantity.from(String(excess.length - 1))));
  if (stddev.isZero()) return unavailable(sorted.length);

  const daily = mean.divide(stddev);
  const annualized = daily.multiply(decimalSqrt(Quantity.from('252')));

  const status: RiskStatus = input.partial === true ? 'PARTIAL' : 'AVAILABLE';
  return Object.freeze({
    frequency,
    observationCount: sorted.length,
    riskFreeProxy,
    meanDailyExcessPercentage: toPercent(mean),
    dailySharpe: daily,
    annualizedSharpe: annualized,
    annualizationFactor: '252' as const,
    status,
  });
}

// ---------------------------------------------------------------------------
// Sortino ratio (ADR-136)
//
// excess_t            = portfolioReturn_t − riskFreeReturn_t (ratios;
//                       target is the reference itself, so downside is
//                       measured on excess with threshold 0)
// downsideDeviation   = sqrt(Σ min(excess_t, 0)² / n)   (denominator n =
//                       ALL observations — documented convention)
// sortinoDaily        = meanExcess / downsideDeviation
// sortinoAnnualized   = sortinoDaily × sqrt(252)
//
// n < 2 → UNAVAILABLE. downsideDeviation = 0 (no negative excess) →
// UNAVAILABLE (null, never Infinity).
// ---------------------------------------------------------------------------

export function calculateSortinoRatio(input: {
  observations: readonly RiskAdjustedReturnObservation[];
  frequency?: RiskObservationFrequency;
  riskFreeProxy?: RiskFreeProxy;
  partial?: boolean;
}): SortinoRatioResult {
  const frequency: RiskObservationFrequency = input.frequency ?? 'DAILY';
  const riskFreeProxy: RiskFreeProxy = input.riskFreeProxy ?? 'CDI';

  const unavailable = (count: number, downsideCount: number): SortinoRatioResult =>
    Object.freeze({
      frequency,
      observationCount: count,
      downsideObservationCount: downsideCount,
      riskFreeProxy,
      downsideDeviationPercentage: null,
      dailySortino: null,
      annualizedSortino: null,
      annualizationFactor: '252' as const,
      status: 'UNAVAILABLE' as const,
    });

  const sorted = [...input.observations].sort((a, b) => a.date.compare(b.date));
  if (sorted.length < 2 || hasDuplicateObservationDates(sorted)) {
    return unavailable(sorted.length, 0);
  }

  const excess = excessRatios(sorted);
  const mean = meanOf(excess);
  const zero = Quantity.zero();
  let downsideSquares = Quantity.zero();
  let downsideCount = 0;
  for (const e of excess) {
    if (e.compare(zero) < 0) {
      downsideSquares = downsideSquares.add(e.multiply(e));
      downsideCount += 1;
    }
  }
  const downsideDeviation = decimalSqrt(
    downsideSquares.divide(Quantity.from(String(excess.length))),
  );
  if (downsideDeviation.isZero()) return unavailable(sorted.length, downsideCount);

  const daily = mean.divide(downsideDeviation);
  const annualized = daily.multiply(decimalSqrt(Quantity.from('252')));

  const status: RiskStatus = input.partial === true ? 'PARTIAL' : 'AVAILABLE';
  return Object.freeze({
    frequency,
    observationCount: sorted.length,
    downsideObservationCount: downsideCount,
    riskFreeProxy,
    downsideDeviationPercentage: toPercent(downsideDeviation),
    dailySortino: daily,
    annualizedSortino: annualized,
    annualizationFactor: '252' as const,
    status,
  });
}

// ---------------------------------------------------------------------------
// Benchmark-relative risk foundation (3K, ADR-138–ADR-142)
//
// Beta, Pearson correlation and tracking error between portfolio TWR returns
// and a market benchmark (IBOV). A valid pair spans the EXACT SAME economic
// interval: portfolio.startDate === benchmark.startDate AND
// portfolio.endDate === benchmark.endDate. Sharing only an end date is NOT
// enough (ADR-139). Benchmark levels arrive as plain Quantities — provider
// DTOs (Yahoo/Stooq) never leak into this package. Zero I/O.
// ---------------------------------------------------------------------------

export interface RelativeRiskInterval {
  startDate: LocalDate;
  endDate: LocalDate;
  returnPercentage: Percentage;
}

export interface BenchmarkRelativeReturnObservation {
  startDate: LocalDate;
  endDate: LocalDate;
  portfolioReturn: Percentage;
  benchmarkReturn: Percentage;
}

/** A benchmark level (index close) at an economic date. */
export interface RelativeRiskBenchmarkLevel {
  date: LocalDate;
  level: Quantity;
}

export interface RelativeRiskAlignmentResult {
  portfolioIntervalCount: number;
  benchmarkIntervalCount: number;
  pairedObservationCount: number;
  droppedPortfolioIntervalCount: number;
  droppedBenchmarkIntervalCount: number;
  status: RiskStatus;
  observations: readonly BenchmarkRelativeReturnObservation[];
}

export interface BetaResult {
  observationCount: number;
  /** Unitless ratio, e.g. "0.87". Null when UNAVAILABLE. */
  beta: Quantity | null;
  status: RiskStatus;
}

export interface CorrelationResult {
  observationCount: number;
  /** Unitless ratio in [-1, 1], e.g. "0.74". Null when UNAVAILABLE. */
  correlation: Quantity | null;
  status: RiskStatus;
}

export interface TrackingErrorResult {
  frequency: RiskObservationFrequency;
  observationCount: number;
  /** Daily sample std dev of active returns, percent points. Null when UNAVAILABLE. */
  samplePercentage: Percentage | null;
  /** Annualized tracking error, percent points. Null when UNAVAILABLE. */
  annualizedPercentage: Percentage | null;
  annualizationFactor: '252';
  status: RiskStatus;
}

export interface BenchmarkRelativeRiskResult {
  currency: Currency;
  observationCount: number;
  beta: Quantity | null;
  correlation: Quantity | null;
  trackingError: TrackingErrorResult;
  status: RiskStatus;
}

/** Canonical pairing key: `startDate::endDate`. Never the end date alone. */
export function relativeRiskPairKey(interval: {
  startDate: LocalDate;
  endDate: LocalDate;
}): string {
  return `${interval.startDate.toString()}::${interval.endDate.toString()}`;
}

function sortIntervals<T extends { startDate: LocalDate; endDate: LocalDate }>(
  input: readonly T[],
): T[] {
  return [...input].sort(
    (a, b) => a.startDate.compare(b.startDate) || a.endDate.compare(b.endDate),
  );
}

function dedupeIntervals<T extends { startDate: LocalDate; endDate: LocalDate }>(
  input: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const interval of sortIntervals(input)) {
    const key = relativeRiskPairKey(interval);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(interval);
  }
  return out;
}

function dedupeDates(input: readonly LocalDate[]): LocalDate[] {
  const seen = new Set<string>();
  const out: LocalDate[] = [];
  for (const date of [...input].sort((a, b) => a.compare(b))) {
    const key = date.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(date);
  }
  return out;
}

/**
 * Aligns portfolio and benchmark interval returns by the EXACT pair identity
 * `(startDate, endDate)` (ADR-139). Intervals that only share an end date are
 * dropped, never paired. Duplicate keys are deduplicated deterministically
 * (first in canonical order wins). Missing benchmark data is never zero-filled.
 */
export function alignBenchmarkRelativeReturns(input: {
  portfolioIntervals: readonly RelativeRiskInterval[];
  benchmarkIntervals: readonly RelativeRiskInterval[];
  partial?: boolean;
}): RelativeRiskAlignmentResult {
  const portfolio = dedupeIntervals(input.portfolioIntervals);
  const benchmark = dedupeIntervals(input.benchmarkIntervals);

  const benchmarkByKey = new Map<string, RelativeRiskInterval>();
  for (const b of benchmark) benchmarkByKey.set(relativeRiskPairKey(b), b);

  const observations: BenchmarkRelativeReturnObservation[] = [];
  const matchedPortfolioKeys = new Set<string>();
  for (const p of portfolio) {
    const key = relativeRiskPairKey(p);
    const b = benchmarkByKey.get(key);
    if (!b) continue;
    matchedPortfolioKeys.add(key);
    observations.push(
      Object.freeze({
        startDate: p.startDate,
        endDate: p.endDate,
        portfolioReturn: p.returnPercentage,
        benchmarkReturn: b.returnPercentage,
      }),
    );
  }

  const droppedPortfolioIntervalCount = portfolio.length - matchedPortfolioKeys.size;
  const droppedBenchmarkIntervalCount = benchmark.filter(
    (b) => !matchedPortfolioKeys.has(relativeRiskPairKey(b)),
  ).length;

  let status: RiskStatus;
  if (observations.length === 0) status = 'UNAVAILABLE';
  else if (droppedPortfolioIntervalCount > 0 || droppedBenchmarkIntervalCount > 0)
    status = 'PARTIAL';
  else status = 'AVAILABLE';
  if (status === 'AVAILABLE' && input.partial === true) status = 'PARTIAL';

  return Object.freeze({
    portfolioIntervalCount: portfolio.length,
    benchmarkIntervalCount: benchmark.length,
    pairedObservationCount: observations.length,
    droppedPortfolioIntervalCount,
    droppedBenchmarkIntervalCount,
    status,
    observations: Object.freeze(observations) as BenchmarkRelativeReturnObservation[],
  });
}

/**
 * Builds portfolio interval returns between consecutive economic boundaries by
 * exact decimal chaining of the daily TWR subperiods in `(start, end]`. A pair
 * with no subperiod in range is skipped (never fabricated as 0%).
 */
export function buildPortfolioIntervals(input: {
  boundaries: readonly LocalDate[];
  subperiodReturns: readonly RiskSubperiodReturn[];
}): RelativeRiskInterval[] {
  const boundaries = dedupeDates(input.boundaries);
  if (boundaries.length < 2)
    return Object.freeze([] as RelativeRiskInterval[]) as RelativeRiskInterval[];
  const subperiods = sortSubperiods(input.subperiodReturns);
  const one = Quantity.from('1');
  const intervals: RelativeRiskInterval[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    let factor = one;
    let count = 0;
    for (const s of subperiods) {
      if (s.date.compare(start) > 0 && s.date.compare(end) <= 0) {
        factor = factor.multiply(one.add(toRatio(s.returnPercentage)));
        count += 1;
      }
    }
    if (count === 0) continue;
    intervals.push(
      Object.freeze({
        startDate: start,
        endDate: end,
        returnPercentage: toPercent(factor.subtract(one)),
      }),
    );
  }
  return Object.freeze(intervals) as RelativeRiskInterval[];
}

/**
 * Builds benchmark interval returns between consecutive boundaries from exact
 * index levels (`endLevel / startLevel - 1`). Boundaries without a legitimate
 * level on either end are skipped — never treated as 0%.
 */
export function buildBenchmarkIntervals(input: {
  boundaries: readonly LocalDate[];
  levels: readonly RelativeRiskBenchmarkLevel[];
}): RelativeRiskInterval[] {
  const levelByDate = new Map<string, Quantity>();
  for (const l of input.levels) {
    if (!levelByDate.has(l.date.toString())) levelByDate.set(l.date.toString(), l.level);
  }
  const boundaries = dedupeDates(input.boundaries);
  if (boundaries.length < 2)
    return Object.freeze([] as RelativeRiskInterval[]) as RelativeRiskInterval[];
  const one = Quantity.from('1');
  const intervals: RelativeRiskInterval[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    const startLevel = levelByDate.get(start.toString());
    const endLevel = levelByDate.get(end.toString());
    if (startLevel === undefined || endLevel === undefined || startLevel.isZero()) continue;
    intervals.push(
      Object.freeze({
        startDate: start,
        endDate: end,
        returnPercentage: toPercent(endLevel.divide(startLevel).subtract(one)),
      }),
    );
  }
  return Object.freeze(intervals) as RelativeRiskInterval[];
}

// --- Statistical primitives (exact decimal) ---------------------------------

function meanRatios(ratios: readonly Quantity[]): Quantity {
  let sum = Quantity.zero();
  for (const r of ratios) sum = sum.add(r);
  return sum.divide(Quantity.from(String(ratios.length)));
}

function sampleVarianceOf(ratios: readonly Quantity[]): Quantity {
  const mean = meanRatios(ratios);
  let squared = Quantity.zero();
  for (const r of ratios) {
    const d = r.subtract(mean);
    squared = squared.add(d.multiply(d));
  }
  return squared.divide(Quantity.from(String(ratios.length - 1)));
}

function sampleCovarianceOf(a: readonly Quantity[], b: readonly Quantity[]): Quantity {
  const meanA = meanRatios(a);
  const meanB = meanRatios(b);
  let sum = Quantity.zero();
  for (let i = 0; i < a.length; i++) {
    sum = sum.add(a[i]!.subtract(meanA).multiply(b[i]!.subtract(meanB)));
  }
  return sum.divide(Quantity.from(String(a.length - 1)));
}

function toReturnRatios(observations: readonly BenchmarkRelativeReturnObservation[]): {
  portfolio: Quantity[];
  benchmark: Quantity[];
} {
  return {
    portfolio: observations.map((o) => toRatio(o.portfolioReturn)),
    benchmark: observations.map((o) => toRatio(o.benchmarkReturn)),
  };
}

function hasDuplicatePairKeys(
  observations: readonly BenchmarkRelativeReturnObservation[],
): boolean {
  const seen = new Set<string>();
  for (const o of observations) {
    const key = relativeRiskPairKey(o);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/**
 * Pearson correlation clamp tolerance (ADR-141). Exact decimal arithmetic can
 * produce a residual such as 1.0000000000000000001; only a residual within
 * this tolerance is clamped to ±1. A genuinely out-of-range value (e.g. 1.01)
 * is never hidden.
 */
const CORRELATION_CLAMP_TOLERANCE = '1e-18';

function clampCorrelation(value: Quantity): Quantity {
  const one = Quantity.from('1');
  const tolerance = Quantity.from(CORRELATION_CLAMP_TOLERANCE);
  const magnitude = value.abs();
  if (magnitude.compare(one) <= 0) return value;
  if (magnitude.subtract(one).compare(tolerance) <= 0) {
    return value.isNegative() ? one.negate() : one;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Beta (ADR-140)
//
// beta = sampleCovariance(Rp, Rb) / sampleVariance(Rb)   (both n − 1)
// n < 2 → UNAVAILABLE. variance(Rb) = 0 → UNAVAILABLE (null, never Infinity).
// ---------------------------------------------------------------------------

export function calculateBeta(input: {
  observations: readonly BenchmarkRelativeReturnObservation[];
  partial?: boolean;
}): BetaResult {
  const sorted = sortObservationsByInterval(input.observations);
  const unavailable = (): BetaResult =>
    Object.freeze({
      observationCount: sorted.length,
      beta: null,
      status: 'UNAVAILABLE' as const,
    });
  if (sorted.length < 2 || hasDuplicatePairKeys(sorted)) return unavailable();

  const { portfolio, benchmark } = toReturnRatios(sorted);
  const varianceBenchmark = sampleVarianceOf(benchmark);
  if (varianceBenchmark.isZero()) return unavailable();

  const beta = sampleCovarianceOf(portfolio, benchmark).divide(varianceBenchmark);
  return Object.freeze({
    observationCount: sorted.length,
    beta,
    status: (input.partial === true ? 'PARTIAL' : 'AVAILABLE') as RiskStatus,
  });
}

// ---------------------------------------------------------------------------
// Pearson correlation (ADR-141)
//
// corr = covariance(Rp, Rb) / (sampleStdDev(Rp) × sampleStdDev(Rb))
// n < 2 or either stddev = 0 → UNAVAILABLE (null, never NaN).
// ---------------------------------------------------------------------------

export function calculateCorrelation(input: {
  observations: readonly BenchmarkRelativeReturnObservation[];
  partial?: boolean;
}): CorrelationResult {
  const sorted = sortObservationsByInterval(input.observations);
  const unavailable = (): CorrelationResult =>
    Object.freeze({
      observationCount: sorted.length,
      correlation: null,
      status: 'UNAVAILABLE' as const,
    });
  if (sorted.length < 2 || hasDuplicatePairKeys(sorted)) return unavailable();

  const { portfolio, benchmark } = toReturnRatios(sorted);
  const stdPortfolio = decimalSqrt(sampleVarianceOf(portfolio));
  const stdBenchmark = decimalSqrt(sampleVarianceOf(benchmark));
  if (stdPortfolio.isZero() || stdBenchmark.isZero()) return unavailable();

  const raw = sampleCovarianceOf(portfolio, benchmark).divide(stdPortfolio.multiply(stdBenchmark));
  return Object.freeze({
    observationCount: sorted.length,
    correlation: clampCorrelation(raw),
    status: (input.partial === true ? 'PARTIAL' : 'AVAILABLE') as RiskStatus,
  });
}

// ---------------------------------------------------------------------------
// Tracking error (ADR-142)
//
// active_t = Rp_t − Rb_t (percent points)
// dailyTrackingError = sampleStdDev(active)   (n − 1)
// annualized = dailyTrackingError × sqrt(252)
// n < 2 → UNAVAILABLE. Identical returns → exactly "0" (known, not missing).
// ---------------------------------------------------------------------------

export function calculateTrackingError(input: {
  observations: readonly BenchmarkRelativeReturnObservation[];
  frequency?: RiskObservationFrequency;
  partial?: boolean;
}): TrackingErrorResult {
  const frequency: RiskObservationFrequency = input.frequency ?? 'DAILY';
  const sorted = sortObservationsByInterval(input.observations);
  const unavailable = (): TrackingErrorResult =>
    Object.freeze({
      frequency,
      observationCount: sorted.length,
      samplePercentage: null,
      annualizedPercentage: null,
      annualizationFactor: '252' as const,
      status: 'UNAVAILABLE' as const,
    });
  if (sorted.length < 2 || hasDuplicatePairKeys(sorted)) return unavailable();

  const active = sorted.map((o) => toRatio(o.portfolioReturn).subtract(toRatio(o.benchmarkReturn)));
  const daily = decimalSqrt(sampleVarianceOf(active));
  const annualized = daily.multiply(decimalSqrt(Quantity.from(ANNUALIZATION_DAYS)));

  return Object.freeze({
    frequency,
    observationCount: sorted.length,
    samplePercentage: toPercent(daily),
    annualizedPercentage: toPercent(annualized),
    annualizationFactor: '252' as const,
    status: (input.partial === true ? 'PARTIAL' : 'AVAILABLE') as RiskStatus,
  });
}

// ---------------------------------------------------------------------------
// Combined benchmark-relative risk (Beta + Correlation + Tracking Error)
// ---------------------------------------------------------------------------

export function calculateBenchmarkRelativeRisk(input: {
  currency: Currency;
  observations: readonly BenchmarkRelativeReturnObservation[];
  frequency?: RiskObservationFrequency;
  partial?: boolean;
}): BenchmarkRelativeRiskResult {
  const beta = calculateBeta({ observations: input.observations, partial: input.partial });
  const correlation = calculateCorrelation({
    observations: input.observations,
    partial: input.partial,
  });
  const trackingError = calculateTrackingError({
    observations: input.observations,
    frequency: input.frequency,
    partial: input.partial,
  });

  let status: RiskStatus;
  if (
    beta.status === 'AVAILABLE' &&
    correlation.status === 'AVAILABLE' &&
    trackingError.status === 'AVAILABLE'
  ) {
    status = 'AVAILABLE';
  } else if (
    beta.status === 'UNAVAILABLE' &&
    correlation.status === 'UNAVAILABLE' &&
    trackingError.status === 'UNAVAILABLE'
  ) {
    status = 'UNAVAILABLE';
  } else {
    status = 'PARTIAL';
  }

  return Object.freeze({
    currency: input.currency,
    observationCount: input.observations.length,
    beta: beta.beta,
    correlation: correlation.correlation,
    trackingError: Object.freeze(trackingError),
    status,
  });
}

function sortObservationsByInterval(
  input: readonly BenchmarkRelativeReturnObservation[],
): BenchmarkRelativeReturnObservation[] {
  return [...input].sort(
    (a, b) => a.startDate.compare(b.startDate) || a.endDate.compare(b.endDate),
  );
}

// ---------------------------------------------------------------------------
// Active performance foundation (3L, ADR-143–ADR-147)
//
// Jensen's Alpha, Information Ratio and Treynor Ratio over period-consistent
// inputs. Every scalar return (portfolio, risk-free, market) MUST describe the
// SAME economic period, and Beta / paired observations MUST come from that same
// period (ADR-147). The engine never mixes an annual portfolio return with a
// daily CDI/IBOV return, never fetches references and never predicts.
// ---------------------------------------------------------------------------

export interface ActivePerformanceInputs {
  currency: Currency;
  /** Portfolio TWR for the period (Rp). */
  portfolioReturn: Percentage;
  /** CDI accumulated return for the SAME period (Rf). Null when unavailable. */
  riskFreeReturn: Percentage | null;
  /** IBOV return for the SAME period (Rm). Null when unavailable. */
  marketReturn: Percentage | null;
  /** Beta from the SAME period's paired daily economic returns. Null when unavailable. */
  beta: Quantity | null;
  /** Paired daily economic observations (3K) for the Information Ratio. */
  observations: readonly BenchmarkRelativeReturnObservation[];
  partial?: boolean;
}

export interface JensenAlphaResult {
  /** Period Alpha in percent points (NOT annualized). Null when UNAVAILABLE. */
  periodPercentage: Percentage | null;
  status: RiskStatus;
}

export interface InformationRatioResult {
  frequency: RiskObservationFrequency;
  observationCount: number;
  /** Mean daily active return in percent points. Null when UNAVAILABLE. */
  meanDailyActivePercentage: Percentage | null;
  /** Daily Information Ratio (unitless). Null when UNAVAILABLE. */
  daily: Quantity | null;
  /** Annualized Information Ratio (unitless). Null when UNAVAILABLE. */
  annualized: Quantity | null;
  annualizationFactor: '252';
  status: RiskStatus;
}

export interface TreynorRatioResult {
  /** Period excess return per unit of Beta, in percent points. Null when UNAVAILABLE. */
  periodPercentagePerBeta: Percentage | null;
  status: RiskStatus;
}

export interface ActivePerformanceResult {
  currency: Currency;
  alpha: JensenAlphaResult;
  informationRatio: InformationRatioResult;
  treynor: TreynorRatioResult;
  status: RiskStatus;
}

// ---------------------------------------------------------------------------
// Jensen's Alpha (ADR-144)
//
// alpha_period = Rp − [ Rf + Beta × (Rm − Rf) ]
// Rp, Rf, Rm and Beta all describe the SAME period. Beta = null → UNAVAILABLE
// (never a fabricated expected return). The result is the PERIOD alpha — it is
// never silently annualized (ADR-144).
// ---------------------------------------------------------------------------

export function calculateJensenAlpha(input: {
  portfolioReturn: Percentage;
  riskFreeReturn: Percentage | null;
  marketReturn: Percentage | null;
  beta: Quantity | null;
  partial?: boolean;
}): JensenAlphaResult {
  if (!input.beta || !input.riskFreeReturn || !input.marketReturn) {
    return Object.freeze({ periodPercentage: null, status: 'UNAVAILABLE' as const });
  }
  const rp = toRatio(input.portfolioReturn);
  const rf = toRatio(input.riskFreeReturn);
  const rm = toRatio(input.marketReturn);
  const expected = rf.add(input.beta.multiply(rm.subtract(rf)));
  const alpha = rp.subtract(expected);
  return Object.freeze({
    periodPercentage: toPercent(alpha),
    status: (input.partial === true ? 'PARTIAL' : 'AVAILABLE') as RiskStatus,
  });
}

// ---------------------------------------------------------------------------
// Information Ratio (ADR-145)
//
// active_t = Rp_t − Rm_t (percent points) on the SAME paired daily economic
// intervals as 3K (never re-aligned by end date).
// meanActive = Σactive / n
// dailyTrackingError = sampleStdDev(active)   (n − 1) — EXACTLY the 3K daily
//   tracking error convention, never recomputed with another one.
// informationRatioDaily = meanActive / dailyTrackingError
// annualized = daily × sqrt(252)
//
// n < 2 or dailyTrackingError = 0 → UNAVAILABLE (null, never Infinity/NaN).
// ---------------------------------------------------------------------------

export function calculateInformationRatio(input: {
  observations: readonly BenchmarkRelativeReturnObservation[];
  frequency?: RiskObservationFrequency;
  partial?: boolean;
}): InformationRatioResult {
  const frequency: RiskObservationFrequency = input.frequency ?? 'DAILY';
  const sorted = sortObservationsByInterval(input.observations);
  const unavailable = (): InformationRatioResult =>
    Object.freeze({
      frequency,
      observationCount: sorted.length,
      meanDailyActivePercentage: null,
      daily: null,
      annualized: null,
      annualizationFactor: '252' as const,
      status: 'UNAVAILABLE' as const,
    });
  if (sorted.length < 2 || hasDuplicatePairKeys(sorted)) return unavailable();

  const active = sorted.map((o) => toRatio(o.portfolioReturn).subtract(toRatio(o.benchmarkReturn)));
  const mean = meanRatios(active);
  const trackingError = decimalSqrt(sampleVarianceOf(active));
  if (trackingError.isZero()) return unavailable();

  const daily = mean.divide(trackingError);
  const annualized = daily.multiply(decimalSqrt(Quantity.from(ANNUALIZATION_DAYS)));
  return Object.freeze({
    frequency,
    observationCount: sorted.length,
    meanDailyActivePercentage: toPercent(mean),
    daily,
    annualized,
    annualizationFactor: '252' as const,
    status: (input.partial === true ? 'PARTIAL' : 'AVAILABLE') as RiskStatus,
  });
}

// ---------------------------------------------------------------------------
// Treynor Ratio (ADR-146)
//
// treynor_period = (Rp − Rf) / Beta, all from the SAME period.
// Beta = null OR Beta = 0 → UNAVAILABLE (null, never Infinity/NaN). Negative
// Beta is mathematically valid and simply flips the sign.
// Unit: percent points of period excess return per unit of Beta
// ("periodPercentagePerBeta").
// ---------------------------------------------------------------------------

export function calculateTreynorRatio(input: {
  portfolioReturn: Percentage;
  riskFreeReturn: Percentage | null;
  beta: Quantity | null;
  partial?: boolean;
}): TreynorRatioResult {
  if (!input.beta || input.beta.isZero() || !input.riskFreeReturn) {
    return Object.freeze({ periodPercentagePerBeta: null, status: 'UNAVAILABLE' as const });
  }
  const excess = toRatio(input.portfolioReturn).subtract(toRatio(input.riskFreeReturn));
  const treynor = excess.divide(input.beta);
  return Object.freeze({
    periodPercentagePerBeta: toPercent(treynor),
    status: (input.partial === true ? 'PARTIAL' : 'AVAILABLE') as RiskStatus,
  });
}

// ---------------------------------------------------------------------------
// Combined active performance (metric-specific availability, ADR-143)
//
// Alpha and Treynor depend on Beta (and CDI); the Information Ratio depends
// only on paired active returns. Status is AVAILABLE when all three are
// available, UNAVAILABLE when all three are unavailable, and PARTIAL otherwise
// — metric-level nulls are preserved, never forced all-or-nothing.
// ---------------------------------------------------------------------------

export function calculateActivePerformance(
  input: ActivePerformanceInputs,
): ActivePerformanceResult {
  const alpha = calculateJensenAlpha({
    portfolioReturn: input.portfolioReturn,
    riskFreeReturn: input.riskFreeReturn,
    marketReturn: input.marketReturn,
    beta: input.beta,
    partial: input.partial,
  });
  const informationRatio = calculateInformationRatio({
    observations: input.observations,
    partial: input.partial,
  });
  const treynor = calculateTreynorRatio({
    portfolioReturn: input.portfolioReturn,
    riskFreeReturn: input.riskFreeReturn,
    beta: input.beta,
    partial: input.partial,
  });

  let status: RiskStatus;
  if (
    alpha.status === 'AVAILABLE' &&
    informationRatio.status === 'AVAILABLE' &&
    treynor.status === 'AVAILABLE'
  ) {
    status = 'AVAILABLE';
  } else if (
    alpha.status === 'UNAVAILABLE' &&
    informationRatio.status === 'UNAVAILABLE' &&
    treynor.status === 'UNAVAILABLE'
  ) {
    status = 'UNAVAILABLE';
  } else {
    status = 'PARTIAL';
  }

  return Object.freeze({
    currency: input.currency,
    alpha: Object.freeze(alpha),
    informationRatio: Object.freeze(informationRatio),
    treynor: Object.freeze(treynor),
    status,
  });
}

// ---------------------------------------------------------------------------
// Rolling analytics foundation (3M, ADR-148–ADR-152)
//
// A rolling window is a count of VALID ECONOMIC OBSERVATIONS, never calendar
// days (ADR-149). Rolling metrics reuse the canonical source observations of
// prior phases verbatim (3I Layer-B returns, 3J aligned portfolio/CDI
// observations, 3K paired intervals) — no formula is duplicated and no
// alignment is redone. Partial windows are forbidden: the first point only
// appears once W observations exist (points = max(0, n − W + 1)). Pure,
// deterministic, zero I/O, frozen outputs.
// ---------------------------------------------------------------------------

export const ROLLING_WINDOWS = [20, 60, 120] as const;
export type RollingWindow = (typeof ROLLING_WINDOWS)[number];

export class InvalidRollingWindowError extends Error {
  constructor(value: string) {
    super(`Invalid rolling window '${value}'. Supported: ${ROLLING_WINDOWS.join(', ')}`);
    this.name = 'InvalidRollingWindowError';
  }
}

export function assertValidRollingWindow(value: string | number): RollingWindow {
  const str = String(value);
  if (str === '20') return 20;
  if (str === '60') return 60;
  if (str === '120') return 120;
  throw new InvalidRollingWindowError(str);
}

export interface RollingVolatilityPoint {
  windowStartDate: LocalDate;
  endDate: LocalDate;
  observationCount: number;
  /** Annualized volatility (percent points). Null when the point is UNAVAILABLE. */
  annualizedPercentage: Percentage | null;
  status: RiskStatus;
}

export interface RollingVolatilitySeries {
  window: RollingWindow;
  frequency: RiskObservationFrequency;
  status: RiskStatus;
  points: readonly RollingVolatilityPoint[];
}

export interface RollingSharpePoint {
  windowStartDate: LocalDate;
  endDate: LocalDate;
  observationCount: number;
  /** Annualized Sharpe (unitless ratio). Null when the point is UNAVAILABLE. */
  annualized: Quantity | null;
  status: RiskStatus;
}

export interface RollingSharpeSeries {
  window: RollingWindow;
  frequency: RiskObservationFrequency;
  status: RiskStatus;
  points: readonly RollingSharpePoint[];
}

export interface RollingBetaPoint {
  windowStartDate: LocalDate;
  endDate: LocalDate;
  observationCount: number;
  /** Beta (unitless ratio). Null when the point is UNAVAILABLE. */
  beta: Quantity | null;
  status: RiskStatus;
}

export interface RollingBetaSeries {
  window: RollingWindow;
  status: RiskStatus;
  points: readonly RollingBetaPoint[];
}

function rollingSeriesStatus(
  windowAvailable: boolean,
  anyPointUnavailable: boolean,
  partial: boolean,
): RiskStatus {
  if (!windowAvailable) return 'UNAVAILABLE';
  if (partial || anyPointUnavailable) return 'PARTIAL';
  return 'AVAILABLE';
}

// ---------------------------------------------------------------------------
// Rolling volatility (ADR-150) — reuses calculateRealizedVolatility (3I).
// ---------------------------------------------------------------------------

export function calculateRollingVolatility(input: {
  returns: readonly RiskSubperiodReturn[];
  window: RollingWindow;
  frequency?: RiskObservationFrequency;
  partial?: boolean;
}): RollingVolatilitySeries {
  const frequency: RiskObservationFrequency = input.frequency ?? 'DAILY';
  const window = input.window;
  const sorted = sortSubperiods(input.returns);

  const empty = (status: RiskStatus): RollingVolatilitySeries =>
    Object.freeze({
      window,
      frequency,
      status,
      points: Object.freeze([]) as readonly RollingVolatilityPoint[],
    });

  if (sorted.length < window) return empty('UNAVAILABLE');

  const points: RollingVolatilityPoint[] = [];
  let anyPointUnavailable = false;
  for (let i = 0; i + window <= sorted.length; i++) {
    const slice = sorted.slice(i, i + window);
    const value = calculateRealizedVolatility({ returns: slice, frequency }).annualizedPercentage;
    if (!value) anyPointUnavailable = true;
    points.push(
      Object.freeze({
        windowStartDate: slice[0]!.date,
        endDate: slice[window - 1]!.date,
        observationCount: window,
        annualizedPercentage: value,
        status: value ? 'AVAILABLE' : 'UNAVAILABLE',
      }),
    );
  }

  return Object.freeze({
    window,
    frequency,
    status: rollingSeriesStatus(true, anyPointUnavailable, input.partial === true),
    points: Object.freeze(points) as readonly RollingVolatilityPoint[],
  });
}

// ---------------------------------------------------------------------------
// Rolling Sharpe (ADR-152) — reuses calculateSharpeRatio (3J) over already
// aligned portfolio/CDI observations. CDI is never zero-filled.
// ---------------------------------------------------------------------------

export function calculateRollingSharpe(input: {
  observations: readonly RiskAdjustedReturnObservation[];
  window: RollingWindow;
  frequency?: RiskObservationFrequency;
  partial?: boolean;
}): RollingSharpeSeries {
  const frequency: RiskObservationFrequency = input.frequency ?? 'DAILY';
  const window = input.window;
  const sorted = [...input.observations].sort((a, b) => a.date.compare(b.date));

  const empty = (status: RiskStatus): RollingSharpeSeries =>
    Object.freeze({
      window,
      frequency,
      status,
      points: Object.freeze([]) as readonly RollingSharpePoint[],
    });

  if (sorted.length < window) return empty('UNAVAILABLE');

  const points: RollingSharpePoint[] = [];
  let anyPointUnavailable = false;
  for (let i = 0; i + window <= sorted.length; i++) {
    const slice = sorted.slice(i, i + window);
    const value = calculateSharpeRatio({ observations: slice, frequency }).annualizedSharpe;
    if (!value) anyPointUnavailable = true;
    points.push(
      Object.freeze({
        windowStartDate: slice[0]!.date,
        endDate: slice[window - 1]!.date,
        observationCount: window,
        annualized: value,
        status: value ? 'AVAILABLE' : 'UNAVAILABLE',
      }),
    );
  }

  return Object.freeze({
    window,
    frequency,
    status: rollingSeriesStatus(true, anyPointUnavailable, input.partial === true),
    points: Object.freeze(points) as readonly RollingSharpePoint[],
  });
}

// ---------------------------------------------------------------------------
// Rolling Beta (ADR-151) — reuses calculateBeta (3K) over already paired
// intervals. No realignment: the exact (startDate, endDate) identity is
// preserved from the source.
// ---------------------------------------------------------------------------

export function calculateRollingBeta(input: {
  observations: readonly BenchmarkRelativeReturnObservation[];
  window: RollingWindow;
  partial?: boolean;
}): RollingBetaSeries {
  const window = input.window;
  const sorted = sortObservationsByInterval(input.observations);

  const empty = (status: RiskStatus): RollingBetaSeries =>
    Object.freeze({
      window,
      status,
      points: Object.freeze([]) as readonly RollingBetaPoint[],
    });

  if (sorted.length < window) return empty('UNAVAILABLE');

  const points: RollingBetaPoint[] = [];
  let anyPointUnavailable = false;
  for (let i = 0; i + window <= sorted.length; i++) {
    const slice = sorted.slice(i, i + window);
    const value = calculateBeta({ observations: slice }).beta;
    if (!value) anyPointUnavailable = true;
    points.push(
      Object.freeze({
        windowStartDate: slice[0]!.startDate,
        endDate: slice[window - 1]!.endDate,
        observationCount: window,
        beta: value,
        status: value ? 'AVAILABLE' : 'UNAVAILABLE',
      }),
    );
  }

  return Object.freeze({
    window,
    status: rollingSeriesStatus(true, anyPointUnavailable, input.partial === true),
    points: Object.freeze(points) as readonly RollingBetaPoint[],
  });
}

// ---------------------------------------------------------------------------
// Downside & tail risk foundation (3N, ADR-153–ADR-158)
//
// Downside deviation (target 0%), semideviation (target = sample mean) and
// HISTORICAL (empirical) VaR/CVaR over the canonical 3I Layer-B economic TWR
// returns. No parametric assumptions, no sqrt-time scaling, no monetary VaR,
// no per-point I/O. Quantile method is frozen: nearest-rank empirical quantile.
// Pure, deterministic, exact decimal, frozen outputs.
// ---------------------------------------------------------------------------

export const TAIL_CONFIDENCE_LEVELS = ['95', '99'] as const;
export type TailConfidenceLevel = (typeof TAIL_CONFIDENCE_LEVELS)[number];

export class InvalidTailConfidenceLevelError extends Error {
  constructor(value: string) {
    super(
      `Invalid tail confidence level '${value}'. Supported: ${TAIL_CONFIDENCE_LEVELS.join(', ')}`,
    );
    this.name = 'InvalidTailConfidenceLevelError';
  }
}

export function assertValidTailConfidenceLevel(value: string | number): TailConfidenceLevel {
  const str = String(value);
  if (str === '95') return '95';
  if (str === '99') return '99';
  throw new InvalidTailConfidenceLevelError(str);
}

/** Minimum sample size required for a statistically defensible empirical tail (ADR-158). */
export function minimumTailSampleSize(confidenceLevel: TailConfidenceLevel): number {
  return confidenceLevel === '95' ? 20 : 100;
}

/**
 * Nearest-rank empirical rank (ADR-156): `rank = ceil(tailProbability × n)`,
 * clamped to `[1, n]`, computed with integer ceil division. `95 → n/20`,
 * `99 → n/100`. The SAME rank defines both the VaR threshold and the CVaR tail
 * size (ADR-157).
 */
function empiricalTailRank(n: number, confidenceLevel: TailConfidenceLevel): number {
  const divisor = confidenceLevel === '95' ? 20 : 100;
  const rank = Math.floor((n + divisor - 1) / divisor);
  if (rank < 1) return 1;
  return rank;
}

function compareReturnRatios(a: Percentage, b: Percentage): number {
  return Quantity.from(a.value).compare(Quantity.from(b.value));
}

/** Returns a NEW array sorted ascending by return; never mutates the input. */
function sortReturnsAscending(input: readonly RiskSubperiodReturn[]): RiskSubperiodReturn[] {
  return [...input].sort((a, b) => compareReturnRatios(a.returnPercentage, b.returnPercentage));
}

export interface DownsideDeviationResult {
  frequency: RiskObservationFrequency;
  observationCount: number;
  negativeObservationCount: number;
  /** Daily downside deviation (percent points). Null when UNAVAILABLE. */
  dailyPercentage: Percentage | null;
  /** Annualized downside deviation (percent points). Null when UNAVAILABLE. */
  annualizedPercentage: Percentage | null;
  annualizationFactor: '252';
  status: RiskStatus;
}

export interface SemideviationResult {
  frequency: RiskObservationFrequency;
  observationCount: number;
  /** Daily semideviation (percent points). Null when UNAVAILABLE. */
  dailyPercentage: Percentage | null;
  /** Annualized semideviation (percent points). Null when UNAVAILABLE. */
  annualizedPercentage: Percentage | null;
  annualizationFactor: '252';
  status: RiskStatus;
}

export interface HistoricalVarResult {
  confidenceLevel: TailConfidenceLevel;
  observationCount: number;
  /** Return at the empirical tail threshold (percent points; typically <= 0). Null when UNAVAILABLE. */
  quantileReturnPercentage: Percentage | null;
  /** Loss magnitude, always >= 0 (percent points). Null when UNAVAILABLE. */
  lossPercentage: Percentage | null;
  /** Deterministic tail size (nearest-rank). 0 when UNAVAILABLE. */
  tailObservationCount: number;
  status: RiskStatus;
}

export interface HistoricalCvarResult {
  confidenceLevel: TailConfidenceLevel;
  observationCount: number;
  /** Mean of the tail returns (percent points; typically <= 0). Null when UNAVAILABLE. */
  meanTailReturnPercentage: Percentage | null;
  /** Loss magnitude, always >= 0 (percent points). Null when UNAVAILABLE. */
  lossPercentage: Percentage | null;
  tailObservationCount: number;
  status: RiskStatus;
}

export interface TailRiskResult {
  currency: Currency;
  frequency: RiskObservationFrequency;
  observationCount: number;
  confidenceLevel: TailConfidenceLevel;
  downsideDeviation: DownsideDeviationResult;
  semideviation: SemideviationResult;
  historicalVar: HistoricalVarResult;
  historicalCvar: HistoricalCvarResult;
  status: RiskStatus;
}

// ---------------------------------------------------------------------------
// Downside deviation (ADR-154) — target = 0%.
// downside_t = min(r_t, 0); sqrt(Σ downside_t² / n) × sqrt(252). n < 2 →
// UNAVAILABLE. All non-negative returns → exactly 0 (known, not missing).
// ---------------------------------------------------------------------------

export function calculateDownsideDeviation(input: {
  returns: readonly RiskSubperiodReturn[];
  frequency?: RiskObservationFrequency;
  partial?: boolean;
}): DownsideDeviationResult {
  const frequency: RiskObservationFrequency = input.frequency ?? 'DAILY';
  const sorted = sortSubperiods(input.returns);
  const unavailable = (): DownsideDeviationResult =>
    Object.freeze({
      frequency,
      observationCount: sorted.length,
      negativeObservationCount: 0,
      dailyPercentage: null,
      annualizedPercentage: null,
      annualizationFactor: '252' as const,
      status: 'UNAVAILABLE' as const,
    });
  if (sorted.length < 2 || hasDuplicateDates(sorted)) return unavailable();

  const zero = Quantity.zero();
  let sumSquares = Quantity.zero();
  let negativeObservationCount = 0;
  for (const r of sorted) {
    const ratio = toRatio(r.returnPercentage);
    if (ratio.compare(zero) < 0) {
      sumSquares = sumSquares.add(ratio.multiply(ratio));
      negativeObservationCount += 1;
    }
  }
  const daily = decimalSqrt(sumSquares.divide(Quantity.from(String(sorted.length))));
  const annualized = daily.multiply(decimalSqrt(Quantity.from(ANNUALIZATION_DAYS)));
  return Object.freeze({
    frequency,
    observationCount: sorted.length,
    negativeObservationCount,
    dailyPercentage: toPercent(daily),
    annualizedPercentage: toPercent(annualized),
    annualizationFactor: '252' as const,
    status: (input.partial === true ? 'PARTIAL' : 'AVAILABLE') as RiskStatus,
  });
}

// ---------------------------------------------------------------------------
// Semideviation (ADR-155) — target = sample mean.
// mean = Σr / n; d_t = min(r_t − mean, 0); sqrt(Σ d_t² / n) × sqrt(252).
// Distinct from downside deviation. Constant series → exactly 0.
// ---------------------------------------------------------------------------

export function calculateSemideviation(input: {
  returns: readonly RiskSubperiodReturn[];
  frequency?: RiskObservationFrequency;
  partial?: boolean;
}): SemideviationResult {
  const frequency: RiskObservationFrequency = input.frequency ?? 'DAILY';
  const sorted = sortSubperiods(input.returns);
  const unavailable = (): SemideviationResult =>
    Object.freeze({
      frequency,
      observationCount: sorted.length,
      dailyPercentage: null,
      annualizedPercentage: null,
      annualizationFactor: '252' as const,
      status: 'UNAVAILABLE' as const,
    });
  if (sorted.length < 2 || hasDuplicateDates(sorted)) return unavailable();

  const ratios = sorted.map((r) => toRatio(r.returnPercentage));
  const mean = meanRatios(ratios);
  const zero = Quantity.zero();
  let sumSquares = Quantity.zero();
  for (const ratio of ratios) {
    const deviation = ratio.subtract(mean);
    if (deviation.compare(zero) < 0) sumSquares = sumSquares.add(deviation.multiply(deviation));
  }
  const daily = decimalSqrt(sumSquares.divide(Quantity.from(String(ratios.length))));
  const annualized = daily.multiply(decimalSqrt(Quantity.from(ANNUALIZATION_DAYS)));
  return Object.freeze({
    frequency,
    observationCount: sorted.length,
    dailyPercentage: toPercent(daily),
    annualizedPercentage: toPercent(annualized),
    annualizationFactor: '252' as const,
    status: (input.partial === true ? 'PARTIAL' : 'AVAILABLE') as RiskStatus,
  });
}

// ---------------------------------------------------------------------------
// Historical VaR (ADR-156) — empirical, nearest-rank, loss magnitude.
// Requires n >= minimumTailSampleSize(confidence). rank = ceil((1−c) × n).
// quantile = sorted[rank−1]; loss = max(0, −quantile). Never negative.
// ---------------------------------------------------------------------------

function buildHistoricalVar(
  sorted: RiskSubperiodReturn[],
  confidenceLevel: TailConfidenceLevel,
  partial: boolean,
  hasDuplicates: boolean,
): HistoricalVarResult {
  const n = sorted.length;
  const unavailable = (): HistoricalVarResult =>
    Object.freeze({
      confidenceLevel,
      observationCount: n,
      quantileReturnPercentage: null,
      lossPercentage: null,
      tailObservationCount: 0,
      status: 'UNAVAILABLE' as const,
    });
  if (n < minimumTailSampleSize(confidenceLevel) || hasDuplicates) return unavailable();

  const rank = empiricalTailRank(n, confidenceLevel);
  const quantile = toRatio(sorted[rank - 1]!.returnPercentage);
  const zero = Quantity.zero();
  const loss = quantile.compare(zero) < 0 ? quantile.negate() : zero;
  return Object.freeze({
    confidenceLevel,
    observationCount: n,
    quantileReturnPercentage: toPercent(quantile),
    lossPercentage: toPercent(loss),
    tailObservationCount: rank,
    status: (partial ? 'PARTIAL' : 'AVAILABLE') as RiskStatus,
  });
}

// ---------------------------------------------------------------------------
// Historical CVaR (ADR-157) — mean of EXACTLY the first `rank` sorted returns.
// Never "all returns <= threshold" (duplicates must not expand the tail).
// loss = max(0, −meanTail). CVaR loss >= VaR loss in the ordered sample.
// ---------------------------------------------------------------------------

function buildHistoricalCvar(
  sorted: RiskSubperiodReturn[],
  confidenceLevel: TailConfidenceLevel,
  partial: boolean,
  hasDuplicates: boolean,
): HistoricalCvarResult {
  const n = sorted.length;
  const unavailable = (): HistoricalCvarResult =>
    Object.freeze({
      confidenceLevel,
      observationCount: n,
      meanTailReturnPercentage: null,
      lossPercentage: null,
      tailObservationCount: 0,
      status: 'UNAVAILABLE' as const,
    });
  if (n < minimumTailSampleSize(confidenceLevel) || hasDuplicates) return unavailable();

  const rank = empiricalTailRank(n, confidenceLevel);
  let sum = Quantity.zero();
  for (let i = 0; i < rank; i++) sum = sum.add(toRatio(sorted[i]!.returnPercentage));
  const meanTail = sum.divide(Quantity.from(String(rank)));
  const zero = Quantity.zero();
  const loss = meanTail.compare(zero) < 0 ? meanTail.negate() : zero;
  return Object.freeze({
    confidenceLevel,
    observationCount: n,
    meanTailReturnPercentage: toPercent(meanTail),
    lossPercentage: toPercent(loss),
    tailObservationCount: rank,
    status: (partial ? 'PARTIAL' : 'AVAILABLE') as RiskStatus,
  });
}

export function calculateHistoricalVar(input: {
  returns: readonly RiskSubperiodReturn[];
  confidenceLevel: TailConfidenceLevel;
  partial?: boolean;
}): HistoricalVarResult {
  return buildHistoricalVar(
    sortReturnsAscending(input.returns),
    input.confidenceLevel,
    input.partial === true,
    hasDuplicateDates(input.returns),
  );
}

export function calculateHistoricalCvar(input: {
  returns: readonly RiskSubperiodReturn[];
  confidenceLevel: TailConfidenceLevel;
  partial?: boolean;
}): HistoricalCvarResult {
  return buildHistoricalCvar(
    sortReturnsAscending(input.returns),
    input.confidenceLevel,
    input.partial === true,
    hasDuplicateDates(input.returns),
  );
}

// ---------------------------------------------------------------------------
// Combined tail-risk per currency — sorts ONCE and reuses the ordering for both
// VaR and CVaR (ADR-156/ADR-157, §108).
// ---------------------------------------------------------------------------

export function calculateTailRisk(input: {
  currency: Currency;
  returns: readonly RiskSubperiodReturn[];
  confidenceLevel: TailConfidenceLevel;
  frequency?: RiskObservationFrequency;
  partial?: boolean;
}): TailRiskResult {
  const frequency: RiskObservationFrequency = input.frequency ?? 'DAILY';
  const partial = input.partial === true;

  const downsideDeviation = calculateDownsideDeviation({
    returns: input.returns,
    frequency,
    partial,
  });
  const semideviation = calculateSemideviation({ returns: input.returns, frequency, partial });

  const hasDuplicates = hasDuplicateDates(input.returns);
  const sorted = sortReturnsAscending(input.returns);
  const historicalVar = buildHistoricalVar(sorted, input.confidenceLevel, partial, hasDuplicates);
  const historicalCvar = buildHistoricalCvar(sorted, input.confidenceLevel, partial, hasDuplicates);

  const statuses = [
    downsideDeviation.status,
    semideviation.status,
    historicalVar.status,
    historicalCvar.status,
  ];
  let status: RiskStatus;
  if (statuses.every((s) => s === 'AVAILABLE')) status = 'AVAILABLE';
  else if (statuses.every((s) => s === 'UNAVAILABLE')) status = 'UNAVAILABLE';
  else status = 'PARTIAL';

  return Object.freeze({
    currency: input.currency,
    frequency,
    observationCount: input.returns.length,
    confidenceLevel: input.confidenceLevel,
    downsideDeviation: Object.freeze(downsideDeviation),
    semideviation: Object.freeze(semideviation),
    historicalVar: Object.freeze(historicalVar),
    historicalCvar: Object.freeze(historicalCvar),
    status,
  });
}
