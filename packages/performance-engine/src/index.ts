import { LocalDate, Currency, Money, Percentage, Quantity } from '@atlas/domain';

export const PERFORMANCE_ENGINE_VERSION = '0.2.0';

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export interface PerformanceObservation {
  date: LocalDate;
  value: Money;
  currency: Currency;
}

export interface PerformanceCashFlow {
  date: LocalDate;
  amount: Money;
  direction: 'INFLOW' | 'OUTFLOW';
}

export interface PerformancePeriod {
  startDate: LocalDate;
  endDate: LocalDate;
}

export const PERFORMANCE_STATUSES = [
  'COMPLETE',
  'PARTIAL',
  'INSUFFICIENT_DATA',
  'INVALID_INPUT',
] as const;
export type PerformanceStatus = (typeof PERFORMANCE_STATUSES)[number];

export const PERFORMANCE_DATA_AVAILABILITIES = ['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'] as const;
export type PerformanceDataAvailability = (typeof PERFORMANCE_DATA_AVAILABILITIES)[number];

export const XIRR_STATUSES = [
  'CONVERGED',
  'NO_SOLUTION',
  'INSUFFICIENT_DATA',
  'NUMERICAL_FAILURE',
] as const;
export type XirrStatus = (typeof XIRR_STATUSES)[number];

export interface PerformanceSubperiod {
  startDate: LocalDate;
  endDate: LocalDate;
  beginningValue: Money;
  endingValue: Money;
  netExternalFlow: Money;
  returnPercentage: Percentage;
}

export interface TimeWeightedReturnResult {
  returnPercentage: Percentage;
  subperiods: readonly PerformanceSubperiod[];
  status: PerformanceStatus;
  dataAvailability: PerformanceDataAvailability;
}

export interface XirrCashFlow {
  date: LocalDate;
  amount: Money;
}

export interface XirrResult {
  returnPercentage: Percentage | null;
  status: XirrStatus;
  iterations: number;
}

export interface PerformanceByCurrency {
  currency: Currency;
  twr: TimeWeightedReturnResult | null;
  xirr: XirrResult | null;
  status: PerformanceStatus;
  dataAvailability: PerformanceDataAvailability;
}

export interface PortfolioPerformance {
  period: PerformancePeriod;
  currencies: Record<string, PerformanceByCurrency>;
  status: PerformanceStatus;
  dataAvailability: PerformanceDataAvailability;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertValidPeriod(period: PerformancePeriod): void {
  if (period.startDate.compare(period.endDate) > 0) {
    throw new Error('INVALID_PERIOD');
  }
}

function sortObservations(obs: PerformanceObservation[]): PerformanceObservation[] {
  return [...obs].sort((a, b) => a.date.compare(b.date));
}

function sortCashFlows(flows: PerformanceCashFlow[]): PerformanceCashFlow[] {
  return [...flows].sort((a, b) => a.date.compare(b.date));
}

function daysBetween(a: LocalDate, b: LocalDate): number {
  const da = Date.UTC(a.year, a.month - 1, a.day);
  const db = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

function aggregateCashFlowsByDate(flows: PerformanceCashFlow[]): Map<string, Money> {
  const map = new Map<string, Money>();
  for (const cf of flows) {
    const key = cf.date.toString();
    const signed = cf.direction === 'INFLOW' ? cf.amount : cf.amount.negate();
    const existing = map.get(key);
    if (existing) {
      // Need same currency
      if (existing.currency !== signed.currency) throw new Error('CURRENCY_MISMATCH');
      map.set(key, existing.add(signed));
    } else {
      map.set(key, signed);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// TWR
// ---------------------------------------------------------------------------

export function calculateTWR(input: {
  observations: PerformanceObservation[];
  cashFlows: PerformanceCashFlow[];
  period: PerformancePeriod;
  currency: Currency;
}): TimeWeightedReturnResult {
  try {
    assertValidPeriod(input.period);
  } catch {
    return Object.freeze({
      returnPercentage: Percentage.from('0'),
      subperiods: Object.freeze([]),
      status: 'INVALID_INPUT',
      dataAvailability: 'UNAVAILABLE',
    });
  }

  const currency = input.currency;
  // Filter by currency and within period
  const obs = sortObservations(
    input.observations.filter(
      (o) =>
        o.currency === currency &&
        o.date.compare(input.period.startDate) >= 0 &&
        o.date.compare(input.period.endDate) <= 0,
    ),
  );
  const flows = sortCashFlows(
    input.cashFlows.filter(
      (f) =>
        f.amount.currency === currency &&
        f.date.compare(input.period.startDate) >= 0 &&
        f.date.compare(input.period.endDate) <= 0,
    ),
  );

  if (obs.length < 2) {
    return Object.freeze({
      returnPercentage: Percentage.from('0'),
      subperiods: Object.freeze([]),
      status: 'INSUFFICIENT_DATA',
      dataAvailability: 'UNAVAILABLE',
    });
  }

  // Check duplicate dates
  const dateSet = new Set<string>();
  for (const o of obs) {
    const key = o.date.toString();
    if (dateSet.has(key)) {
      return Object.freeze({
        returnPercentage: Percentage.from('0'),
        subperiods: Object.freeze([]),
        status: 'INVALID_INPUT',
        dataAvailability: 'UNAVAILABLE',
      });
    }
    dateSet.add(key);
  }

  // Check for negative portfolio value (not allowed)
  for (const o of obs) {
    if (o.value.isNegative()) {
      return Object.freeze({
        returnPercentage: Percentage.from('0'),
        subperiods: Object.freeze([]),
        status: 'INVALID_INPUT',
        dataAvailability: 'UNAVAILABLE',
      });
    }
  }

  // Aggregate flows by date for netting
  const flowByDate = aggregateCashFlowsByDate(flows);

  const subperiods: PerformanceSubperiod[] = [];
  let chainFactor = Quantity.from('1');

  for (let i = 0; i < obs.length - 1; i++) {
    const startObs = obs[i]!;
    const endObs = obs[i + 1]!;

    const beginningValue = startObs.value;
    const endingValue = endObs.value;

    if (beginningValue.isZero()) {
      return Object.freeze({
        returnPercentage: Percentage.from('0'),
        subperiods: Object.freeze([]),
        status: 'INVALID_INPUT',
        dataAvailability: 'UNAVAILABLE',
      });
    }

    // Sum flows that occur on end date (flows at end of subperiod)
    // Flows are assumed at end of day (end of subperiod)
    // For simplicity, flows on endDate are considered part of this subperiod
    let netFlow = Money.zero(currency);
    const endKey = endObs.date.toString();
    if (flowByDate.has(endKey)) {
      netFlow = flowByDate.get(endKey)!;
    }
    // Also include flows between start and end (exclusive of start, inclusive of end)
    // For foundation, we only consider flows on observation dates for simplicity
    // If there are flows between observations without valuation, we cannot compute accurately
    // So we document limitation: valuation intraday not available, TWR assumes flows at boundaries

    // Check for flows between observations that are not on observation dates
    // If there is a flow date that is not in observations, we treat it as needing a valuation
    // For now, we ignore flows that are not on observation dates (they will be in next subperiod if next observation exists)
    // This is a limitation documented for 3C

    // Subperiod return: R = (Ending - Beginning - NetFlow) / Beginning
    // This assumes flow at end
    const numerator = endingValue.subtract(beginningValue).subtract(netFlow);
    // Avoid float: use Money and Quantity
    // numerator / beginningValue = (numerator.amount / beginningValue.amount)
    // Use Quantity for division
    const numQty = Quantity.from(numerator.amount);
    const denQty = Quantity.from(beginningValue.amount);
    if (denQty.isZero()) {
      return Object.freeze({
        returnPercentage: Percentage.from('0'),
        subperiods: Object.freeze([]),
        status: 'INVALID_INPUT',
        dataAvailability: 'UNAVAILABLE',
      });
    }
    const ratio = numQty.divide(denQty); // R as decimal
    const percent = Percentage.from(ratio.multiply(Quantity.from('100')).value);

    // Chain: (1 + r) factor
    const onePlusR = ratio.add(Quantity.from('1'));
    chainFactor = chainFactor.multiply(onePlusR);

    subperiods.push(
      Object.freeze({
        startDate: startObs.date,
        endDate: endObs.date,
        beginningValue,
        endingValue,
        netExternalFlow: netFlow,
        returnPercentage: percent,
      }),
    );
  }

  // Overall TWR: chainFactor - 1
  const overallRatio = chainFactor.subtract(Quantity.from('1'));
  const overallPercent = Percentage.from(overallRatio.multiply(Quantity.from('100')).value);

  const status: PerformanceStatus = 'COMPLETE';
  const dataAvailability: PerformanceDataAvailability = 'AVAILABLE';

  return Object.freeze({
    returnPercentage: overallPercent,
    subperiods: Object.freeze(subperiods),
    status,
    dataAvailability,
  });
}

// ---------------------------------------------------------------------------
// XIRR
// ---------------------------------------------------------------------------

export function calculateXIRR(input: {
  cashFlows: XirrCashFlow[];
  endingValue?: { date: LocalDate; amount: Money };
  currency: Currency;
  guess?: number;
  maxIterations?: number;
  tolerance?: number;
}): XirrResult {
  const currency = input.currency;
  const flows = [...input.cashFlows];
  if (input.endingValue) {
    flows.push({ date: input.endingValue.date, amount: input.endingValue.amount });
  }

  // Filter by currency
  const filtered = flows.filter((f) => f.amount.currency === currency);
  if (filtered.length < 2) {
    return Object.freeze({ returnPercentage: null, status: 'INSUFFICIENT_DATA', iterations: 0 });
  }

  // Need at least one positive and one negative
  let hasPositive = false;
  let hasNegative = false;
  for (const f of filtered) {
    if (f.amount.isPositive()) hasPositive = true;
    if (f.amount.isNegative()) hasNegative = true;
  }
  if (!hasPositive || !hasNegative) {
    return Object.freeze({ returnPercentage: null, status: 'NO_SOLUTION', iterations: 0 });
  }

  // Sort by date
  const sorted = [...filtered].sort((a, b) => a.date.compare(b.date));
  const firstDate = sorted[0]!.date;

  // Convert to days and years
  const datedAmounts: Array<{ t: number; amount: number }> = sorted.map((f) => {
    const days = daysBetween(firstDate, f.date);
    const t = days / 365.2425; // years
    // Use float for amount, but with decimal string parsing via Number (controlled)
    // Document precision: XIRR uses JS float with tolerance 1e-7
    const amountNum = Number(f.amount.amount);
    return { t, amount: amountNum };
  });

  const maxIter = input.maxIterations ?? 100;
  const tolerance = input.tolerance ?? 1e-7;
  const guess = input.guess ?? 0.1;
  let iterations = 0;

  // Newton-Raphson
  let rate = guess;
  for (let i = 0; i < maxIter; i++) {
    iterations++;
    let f = 0;
    let fPrime = 0;
    for (const { t, amount } of datedAmounts) {
      const denom = Math.pow(1 + rate, t);
      if (!Number.isFinite(denom) || denom === 0) {
        // fallback to bisection
        break;
      }
      f += amount / denom;
      fPrime += (-t * amount) / (denom * (1 + rate));
    }
    if (!Number.isFinite(f) || !Number.isFinite(fPrime) || fPrime === 0) {
      break;
    }
    const newRate = rate - f / fPrime;
    if (!Number.isFinite(newRate)) break;
    if (Math.abs(newRate - rate) < tolerance && Math.abs(f) < tolerance) {
      rate = newRate;
      // Check bounds and finiteness
      if (!Number.isFinite(rate) || rate <= -1 || Math.abs(rate) > 1000) {
        return Object.freeze({ returnPercentage: null, status: 'NUMERICAL_FAILURE', iterations });
      }
      const pct = Percentage.from((rate * 100).toString());
      return Object.freeze({ returnPercentage: pct, status: 'CONVERGED', iterations });
    }
    rate = newRate;
    if (rate <= -0.9999) rate = -0.9999;
    if (rate > 1000) rate = 1000;
  }

  // Bisection fallback: search in [-0.9999, 10] (i.e., -99.99% to 1000%)
  let low = -0.9999;
  let high = 10;
  let fLow = 0;
  let fHigh = 0;
  for (const { t, amount } of datedAmounts) {
    fLow += amount / Math.pow(1 + low, t);
    fHigh += amount / Math.pow(1 + high, t);
  }
  if (fLow * fHigh > 0) {
    return Object.freeze({ returnPercentage: null, status: 'NO_SOLUTION', iterations });
  }
  for (let i = 0; i < maxIter; i++) {
    iterations++;
    const mid = (low + high) / 2;
    let fMid = 0;
    for (const { t, amount } of datedAmounts) {
      fMid += amount / Math.pow(1 + mid, t);
    }
    if (Math.abs(fMid) < tolerance) {
      const pct = Percentage.from((mid * 100).toString());
      return Object.freeze({ returnPercentage: pct, status: 'CONVERGED', iterations });
    }
    let fLowCurrent = 0;
    for (const { t, amount } of datedAmounts) {
      fLowCurrent += amount / Math.pow(1 + low, t);
    }
    if (fLowCurrent * fMid < 0) {
      high = mid;
    } else {
      low = mid;
    }
    if (Math.abs(high - low) < tolerance) {
      const mid2 = (low + high) / 2;
      const pct = Percentage.from((mid2 * 100).toString());
      return Object.freeze({ returnPercentage: pct, status: 'CONVERGED', iterations });
    }
  }

  return Object.freeze({ returnPercentage: null, status: 'NUMERICAL_FAILURE', iterations });
}

// ---------------------------------------------------------------------------
// Portfolio Performance (multi-currency)
// ---------------------------------------------------------------------------

export function calculatePortfolioPerformance(input: {
  period: PerformancePeriod;
  observationsByCurrency: Record<string, PerformanceObservation[]>;
  cashFlowsByCurrency: Record<string, PerformanceCashFlow[]>;
}): PortfolioPerformance {
  try {
    assertValidPeriod(input.period);
  } catch {
    return Object.freeze({
      period: input.period,
      currencies: Object.freeze({}),
      status: 'INVALID_INPUT',
      dataAvailability: 'UNAVAILABLE',
    });
  }

  const currencies = new Set<string>([
    ...Object.keys(input.observationsByCurrency),
    ...Object.keys(input.cashFlowsByCurrency),
  ]);

  const resultCurrencies: Record<string, PerformanceByCurrency> = {};
  let overallStatus: PerformanceStatus = 'COMPLETE';
  let overallAvailability: PerformanceDataAvailability = 'AVAILABLE';
  let hasAnyAvailable = false;
  let hasAnyUnavailable = false;

  for (const cur of currencies) {
    const obs = input.observationsByCurrency[cur] ?? [];
    const flows = input.cashFlowsByCurrency[cur] ?? [];
    const currency = cur as Currency;

    if (obs.length < 2) {
      resultCurrencies[cur] = Object.freeze({
        currency,
        twr: null,
        xirr: null,
        status: 'INSUFFICIENT_DATA',
        dataAvailability: 'UNAVAILABLE',
      });
      hasAnyUnavailable = true;
      if (overallStatus === 'COMPLETE') overallStatus = 'PARTIAL';
      overallAvailability = 'UNAVAILABLE';
      continue;
    }

    const twr = calculateTWR({
      observations: obs,
      cashFlows: flows,
      period: input.period,
      currency,
    });
    // For XIRR, convert cash flows to XirrCashFlow and add ending value as observation
    const xirrFlows: XirrCashFlow[] = flows.map((f) => ({
      date: f.date,
      amount: f.direction === 'INFLOW' ? f.amount.negate() : f.amount,
    }));
    // XIRR: deposits are outflow from investor (negative), withdrawals are inflow (positive)
    // But our PerformanceCashFlow direction INFLOW = deposit (adds to portfolio), OUTFLOW = withdrawal
    // For XIRR from investor perspective: deposit is outflow (negative), withdrawal is inflow (positive)
    // So we negate: INFLOW (deposit) -> negative, OUTFLOW (withdrawal) -> positive
    // Actually we did: INFLOW -> negate, OUTFLOW -> keep? Let's define: INFLOW = external contribution (deposit) is cash outflow from investor, so negative for XIRR
    // OUTFLOW = withdrawal is cash inflow to investor, positive
    // So we map accordingly
    const endingObs = obs[obs.length - 1];
    const xirr = calculateXIRR({
      cashFlows: xirrFlows,
      endingValue: endingObs ? { date: endingObs.date, amount: endingObs.value } : undefined,
      currency,
    });

    const status: PerformanceStatus =
      twr.status === 'COMPLETE' && xirr.status === 'CONVERGED'
        ? 'COMPLETE'
        : twr.status === 'INSUFFICIENT_DATA'
          ? 'INSUFFICIENT_DATA'
          : 'PARTIAL';
    const availability: PerformanceDataAvailability =
      twr.dataAvailability === 'AVAILABLE' ? 'AVAILABLE' : 'UNAVAILABLE';

    if (availability === 'AVAILABLE') hasAnyAvailable = true;
    else hasAnyUnavailable = true;

    resultCurrencies[cur] = Object.freeze({
      currency,
      twr,
      xirr,
      status,
      dataAvailability: availability,
    });

    if (status !== 'COMPLETE' && overallStatus === 'COMPLETE') overallStatus = 'PARTIAL';
  }

  if (hasAnyAvailable && hasAnyUnavailable) {
    overallAvailability = 'PARTIAL';
  } else if (!hasAnyAvailable) {
    overallAvailability = 'UNAVAILABLE';
  }

  return Object.freeze({
    period: input.period,
    currencies: Object.freeze(resultCurrencies),
    status: overallStatus,
    dataAvailability: overallAvailability,
  });
}

// ---------------------------------------------------------------------------
// Performance Series (3H) — cumulative TWR time series, pure, zero I/O
// ADR-122, ADR-123, ADR-124
//
// A series point is the cumulative TWR from `period.startDate` (exclusive
// boundary, normalized to 0%) up to the point date, with external cash flows
// neutralized per 3C subperiod semantics. Raw market-value ratios
// (value(date)/value(start)-1) are NEVER used: they would be distorted by
// deposits/withdrawals.
// ---------------------------------------------------------------------------

export const PERFORMANCE_SERIES_GRANULARITIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'AUTO'] as const;
export type PerformanceSeriesGranularity = (typeof PERFORMANCE_SERIES_GRANULARITIES)[number];

export const RESOLVED_SERIES_GRANULARITIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type ResolvedSeriesGranularity = (typeof RESOLVED_SERIES_GRANULARITIES)[number];

/** Hard cap on display points returned to Web/Mobile. */
export const MAX_PERFORMANCE_SERIES_POINTS = 400;

export const PERFORMANCE_SERIES_POINT_STATUSES = ['COMPLETE', 'PARTIAL', 'UNAVAILABLE'] as const;
export type PerformanceSeriesPointStatus = (typeof PERFORMANCE_SERIES_POINT_STATUSES)[number];

export interface PerformanceSeriesPoint {
  date: LocalDate;
  /** Cumulative TWR from period start, normalized to "0" at start. Null when unavailable (never "0" invented). */
  cumulativeReturn: Percentage | null;
  status: PerformanceSeriesPointStatus;
}

export interface PortfolioPerformanceSeries {
  currency: Currency;
  startDate: LocalDate;
  endDate: LocalDate;
  granularity: ResolvedSeriesGranularity;
  points: readonly PerformanceSeriesPoint[];
  status: PerformanceStatus;
  dataAvailability: PerformanceDataAvailability;
}

export function assertValidSeriesGranularity(value: string): PerformanceSeriesGranularity {
  if ((PERFORMANCE_SERIES_GRANULARITIES as readonly string[]).includes(value)) {
    return value as PerformanceSeriesGranularity;
  }
  throw new Error(
    `Invalid granularity '${value}'. Supported: ${PERFORMANCE_SERIES_GRANULARITIES.join(', ')}`,
  );
}

/**
 * Resolves AUTO granularity from the civil period length (ADR-124):
 * <=90 days -> DAILY, 91-365 days -> WEEKLY, >365 days -> MONTHLY.
 * Explicit DAILY/WEEKLY/MONTHLY pass through unchanged.
 */
export function resolveSeriesGranularity(input: {
  startDate: LocalDate;
  endDate: LocalDate;
  requested: PerformanceSeriesGranularity;
}): ResolvedSeriesGranularity {
  if (input.requested !== 'AUTO') return input.requested;
  const days = daysBetween(input.startDate, input.endDate);
  if (days <= 90) return 'DAILY';
  if (days <= 365) return 'WEEKLY';
  return 'MONTHLY';
}

function addDaysLocal(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return LocalDate.fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Selects DISPLAY dates for the chart (ADR-124). Calculation boundaries
 * (external-flow dates) are a separate concept handled by the application
 * layer, which must value the portfolio at flow dates even when they are
 * not display dates.
 *
 * - DAILY: every civil date in [start, end].
 * - WEEKLY: every 7th civil date from start (deterministic week boundary),
 *   using the last civil date of the week window (no trading-day invention).
 * - MONTHLY: last civil date of each month in (start, end].
 * - startDate and endDate are ALWAYS included.
 * - Output is capped at MAX_PERFORMANCE_SERIES_POINTS (widens step, keeps endpoints).
 */
export function selectDisplayDates(input: {
  startDate: LocalDate;
  endDate: LocalDate;
  granularity: ResolvedSeriesGranularity;
}): LocalDate[] {
  const { startDate, endDate, granularity } = input;
  if (startDate.compare(endDate) > 0) throw new Error('INVALID_PERIOD');

  const dates: LocalDate[] = [];
  if (granularity === 'DAILY') {
    let current = startDate;
    while (current.compare(endDate) <= 0) {
      dates.push(current);
      current = addDaysLocal(current, 1);
    }
  } else if (granularity === 'WEEKLY') {
    const current = startDate;
    dates.push(current);
    let cursor = addDaysLocal(startDate, 7);
    while (cursor.compare(endDate) < 0) {
      dates.push(cursor);
      cursor = addDaysLocal(cursor, 7);
    }
    if (endDate.compare(startDate) > 0) dates.push(endDate);
  } else {
    dates.push(startDate);
    // Include the start month's month-end when it falls strictly inside (start, end].
    const startMonthEnd = LocalDate.fromParts(
      startDate.year,
      startDate.month,
      lastDayOfMonth(startDate.year, startDate.month),
    );
    if (startMonthEnd.compare(startDate) > 0 && startMonthEnd.compare(endDate) < 0) {
      dates.push(startMonthEnd);
    }
    let y = startDate.year;
    let m = startDate.month;
    for (;;) {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
      const monthEnd = LocalDate.fromParts(y, m, lastDayOfMonth(y, m));
      if (monthEnd.compare(endDate) >= 0) break;
      if (monthEnd.compare(startDate) > 0) dates.push(monthEnd);
      if (y > endDate.year + 1) break;
    }
    if (endDate.compare(startDate) > 0) dates.push(endDate);
  }

  const deduped = dates
    .map((d) => d.toString())
    .filter((s, i, arr) => arr.indexOf(s) === i)
    .map((s) => LocalDate.from(s))
    .sort((a, b) => a.compare(b));

  if (deduped.length <= MAX_PERFORMANCE_SERIES_POINTS) return deduped;
  // Widen deterministically: keep endpoints, stride through the middle.
  const first = deduped[0]!;
  const last = deduped[deduped.length - 1]!;
  const middle = deduped.slice(1, -1);
  const keep = MAX_PERFORMANCE_SERIES_POINTS - 2;
  const stride = Math.ceil(middle.length / keep);
  const sampled = middle.filter((_, i) => i % stride === 0).slice(0, keep);
  return [first, ...sampled, last];
}

/**
 * Computes the cumulative TWR series (ADR-123). Each display point D is
 * `calculateTWR` over calculation observations in [start, D] with flows in
 * [start, D] — i.e. chaining (1+r1)...(1+rn)-1 up to D with exact decimal
 * arithmetic. The application layer MUST include flow-date valuations in
 * `observations` (calculation boundaries) even when they are not display
 * dates; otherwise TWR neutralization degrades.
 *
 * - First point (startDate) is always exactly "0" when the start valuation
 *   exists, else UNAVAILABLE/null.
 * - Points without sufficient observations are UNAVAILABLE/null (never "0").
 * - `availabilityByDate` (from the historical valuation builder) marks
 *   PARTIAL points; PARTIAL never becomes COMPLETE.
 * - Final point uses the same inputs as the summary endpoint, so
 *   `series[last].cumulativeReturn === summary TWR` by construction.
 */
export function calculatePerformanceSeries(input: {
  observations: PerformanceObservation[];
  cashFlows: PerformanceCashFlow[];
  period: PerformancePeriod;
  currency: Currency;
  displayDates: LocalDate[];
  granularity: ResolvedSeriesGranularity;
  availabilityByDate?: Record<string, PerformanceDataAvailability>;
}): PortfolioPerformanceSeries {
  const { period, currency } = input;
  const sortedDisplay = [...input.displayDates].sort((a, b) => a.compare(b));
  const inPeriodDisplay = sortedDisplay.filter(
    (d) => d.compare(period.startDate) >= 0 && d.compare(period.endDate) <= 0,
  );

  const empty = (
    status: PerformanceStatus,
    availability: PerformanceDataAvailability,
  ): PortfolioPerformanceSeries =>
    Object.freeze({
      currency,
      startDate: period.startDate,
      endDate: period.endDate,
      granularity: input.granularity,
      points: Object.freeze([]),
      status,
      dataAvailability: availability,
    });

  if (period.startDate.compare(period.endDate) > 0) {
    return empty('INVALID_INPUT', 'UNAVAILABLE');
  }
  if (inPeriodDisplay.length === 0) {
    return empty('INSUFFICIENT_DATA', 'UNAVAILABLE');
  }

  const points: PerformanceSeriesPoint[] = [];
  let hasAvailable = false;
  let hasUnavailable = false;
  let hasPartial = false;

  for (const displayDate of inPeriodDisplay) {
    const obsUpTo = input.observations.filter(
      (o) =>
        o.currency === currency &&
        o.date.compare(period.startDate) >= 0 &&
        o.date.compare(displayDate) <= 0,
    );
    const flowsUpTo = input.cashFlows.filter(
      (f) =>
        f.amount.currency === currency &&
        f.date.compare(period.startDate) >= 0 &&
        f.date.compare(displayDate) <= 0,
    );

    if (displayDate.compare(period.startDate) === 0) {
      // Normalization anchor: 0% iff the start valuation exists.
      const startObs = obsUpTo.filter((o) => o.date.compare(period.startDate) === 0);
      if (startObs.length === 0) {
        hasUnavailable = true;
        points.push(
          Object.freeze({
            date: displayDate,
            cumulativeReturn: null,
            status: 'UNAVAILABLE' as const,
          }),
        );
      } else {
        const partial = input.availabilityByDate?.[displayDate.toString()] === 'PARTIAL';
        if (partial) hasPartial = true;
        else hasAvailable = true;
        points.push(
          Object.freeze({
            date: displayDate,
            cumulativeReturn: Percentage.from('0'),
            status: (partial ? 'PARTIAL' : 'COMPLETE') as PerformanceSeriesPointStatus,
          }),
        );
      }
      continue;
    }

    if (obsUpTo.length < 2) {
      hasUnavailable = true;
      points.push(
        Object.freeze({
          date: displayDate,
          cumulativeReturn: null,
          status: 'UNAVAILABLE' as const,
        }),
      );
      continue;
    }

    const twr = calculateTWR({
      observations: obsUpTo,
      cashFlows: flowsUpTo,
      period: { startDate: period.startDate, endDate: displayDate },
      currency,
    });
    if (twr.status !== 'COMPLETE') {
      hasUnavailable = true;
      points.push(
        Object.freeze({
          date: displayDate,
          cumulativeReturn: null,
          status: 'UNAVAILABLE' as const,
        }),
      );
      continue;
    }
    const partial = input.availabilityByDate?.[displayDate.toString()] === 'PARTIAL';
    if (partial) hasPartial = true;
    else hasAvailable = true;
    points.push(
      Object.freeze({
        date: displayDate,
        cumulativeReturn: twr.returnPercentage,
        status: (partial ? 'PARTIAL' : 'COMPLETE') as PerformanceSeriesPointStatus,
      }),
    );
  }

  let status: PerformanceStatus = 'COMPLETE';
  let dataAvailability: PerformanceDataAvailability = 'AVAILABLE';
  if (!hasAvailable && !hasPartial) {
    status = 'INSUFFICIENT_DATA';
    dataAvailability = 'UNAVAILABLE';
  } else if (hasUnavailable || hasPartial) {
    status = hasAvailable || hasPartial ? 'PARTIAL' : 'INSUFFICIENT_DATA';
    dataAvailability = 'PARTIAL';
    if (!hasAvailable && !hasPartial) dataAvailability = 'UNAVAILABLE';
  }

  return Object.freeze({
    currency,
    startDate: period.startDate,
    endDate: period.endDate,
    granularity: input.granularity,
    points: Object.freeze(points),
    status,
    dataAvailability,
  });
}

// Legacy stub for compatibility
export interface PerformanceTimeframe {
  startDate: LocalDate;
  endDate: LocalDate;
}

export interface BenchmarkComparison {
  benchmark: string;
  portfolioReturn: Percentage;
  benchmarkReturn: Percentage;
  alpha: Percentage;
}

export interface PerformanceEngineContract {
  calculateTWR(portfolioId: string, timeframe: PerformanceTimeframe): Percentage;
  calculateXIRR(portfolioId: string, timeframe: PerformanceTimeframe): Percentage;
  calculateReturn(portfolioId: string, timeframe: PerformanceTimeframe): Percentage;
  compareBenchmark(
    portfolioId: string,
    benchmark: string,
    timeframe: PerformanceTimeframe,
  ): BenchmarkComparison;
  calculateContribution(
    portfolioId: string,
    timeframe: PerformanceTimeframe,
  ): Record<string, Percentage>;
}
