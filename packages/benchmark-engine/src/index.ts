import { LocalDate, Currency, Percentage, Quantity } from '@atlas/domain';

export const BENCHMARK_ENGINE_VERSION = '0.2.0';

// ---------------------------------------------------------------------------
// Benchmark Domain
// ---------------------------------------------------------------------------

export const BENCHMARK_IDS = ['IBOV', 'CDI'] as const;
export type BenchmarkId = (typeof BENCHMARK_IDS)[number];

export const BENCHMARK_TYPES = ['PRICE_INDEX', 'RATE_SERIES'] as const;
export type BenchmarkType = (typeof BENCHMARK_TYPES)[number];

export interface BenchmarkDefinition {
  id: BenchmarkId;
  name: string;
  shortName: string;
  currency: Currency;
  type: BenchmarkType;
}

export const BENCHMARK_DEFINITIONS: Record<BenchmarkId, BenchmarkDefinition> = {
  IBOV: {
    id: 'IBOV',
    name: 'Ibovespa',
    shortName: 'IBOV',
    currency: 'BRL' as Currency,
    type: 'PRICE_INDEX',
  },
  CDI: {
    id: 'CDI',
    name: 'CDI',
    shortName: 'CDI',
    currency: 'BRL' as Currency,
    type: 'RATE_SERIES',
  },
};

export class UnsupportedBenchmarkIdError extends Error {
  constructor(id: string) {
    super(`Unsupported benchmark '${id}'. Supported: ${BENCHMARK_IDS.join(', ')}`);
    this.name = 'UnsupportedBenchmarkIdError';
  }
}

export function assertValidBenchmarkId(id: string): BenchmarkId {
  if ((BENCHMARK_IDS as readonly string[]).includes(id)) {
    return id as BenchmarkId;
  }
  throw new UnsupportedBenchmarkIdError(id);
}

// ---------------------------------------------------------------------------
// Benchmark Observation (index level, not Money)
// ---------------------------------------------------------------------------

export interface BenchmarkObservation {
  benchmarkId: BenchmarkId;
  date: LocalDate;
  value: Quantity;
  source: string;
}

export interface BenchmarkDataProvider {
  readonly provider: string;
  getObservation(benchmarkId: BenchmarkId, date: LocalDate): Promise<BenchmarkObservation>;
  getObservations(
    benchmarkId: BenchmarkId,
    from: LocalDate,
    to: LocalDate,
  ): Promise<BenchmarkObservation[]>;
}

export const BENCHMARK_AVAILABILITY = ['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'] as const;
export type BenchmarkAvailability = (typeof BENCHMARK_AVAILABILITY)[number];

// Rate units are explicit and minimal. Only units that the integrated sources
// actually publish are modelled. Annualised rates are intentionally NOT
// modelled in 3G: converting them to a daily factor requires an official
// convention that BCB does not publish for SGS 12 (which is already daily).
export const RATE_UNITS = ['DAILY_PERCENT', 'DAILY_FACTOR'] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

export class UnsupportedRateUnitError extends Error {
  constructor(unit: string) {
    super(
      `Unsupported rate unit '${unit}'. Supported: ${RATE_UNITS.join(', ')}. ` +
        `Rate units must be explicit and must never be converted silently.`,
    );
    this.name = 'UnsupportedRateUnitError';
  }
}

export class UnsupportedBenchmarkTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedBenchmarkTypeError';
  }
}

export interface RateBenchmarkObservation {
  benchmarkId: BenchmarkId;
  date: LocalDate;
  rate: Quantity;
  unit: RateUnit;
  source: string;
}

export interface RateBenchmarkDataProvider {
  readonly provider: string;
  getRateObservation(benchmarkId: BenchmarkId, date: LocalDate): Promise<RateBenchmarkObservation>;
  getRateObservations(
    benchmarkId: BenchmarkId,
    from: LocalDate,
    to: LocalDate,
  ): Promise<RateBenchmarkObservation[]>;
}

// ---------------------------------------------------------------------------
// Benchmark Return Engine (pure, decimal exact)
// ---------------------------------------------------------------------------

export function calculateBenchmarkReturn(input: {
  benchmarkId: BenchmarkId;
  startLevel: Quantity;
  endLevel: Quantity;
}): Percentage {
  const definition = BENCHMARK_DEFINITIONS[input.benchmarkId];
  if (definition.type !== 'PRICE_INDEX') {
    throw new UnsupportedBenchmarkTypeError(
      `calculateBenchmarkReturn only accepts PRICE_INDEX benchmarks, got '${input.benchmarkId}' (${definition.type}). ` +
        `RATE_SERIES benchmarks must use calculateRateBenchmarkReturn.`,
    );
  }
  if (input.startLevel.isZero()) {
    throw new Error('Benchmark startLevel cannot be zero');
  }
  const ratio = input.endLevel.divide(input.startLevel);
  const one = Quantity.from('1');
  const ret = ratio.subtract(one);
  const hundred = Quantity.from('100');
  return Percentage.from(ret.multiply(hundred).toString());
}

export function calculateExcessReturn(input: {
  portfolioTwr: Percentage;
  benchmarkReturn: Percentage;
}): Percentage {
  const port = Quantity.from(input.portfolioTwr.value);
  const bench = Quantity.from(input.benchmarkReturn.value);
  const excess = port.subtract(bench);
  return Percentage.from(excess.toString());
}

export interface RateBenchmarkReturn {
  benchmarkId: BenchmarkId;
  startDate: LocalDate;
  endDate: LocalDate;
  observationCount: number;
  accumulatedFactor: Quantity;
  returnPercentage: Percentage | null;
  status: BenchmarkAvailability;
}

/**
 * Accumulates a RATE_SERIES benchmark over the period `(startDate, endDate]`.
 *
 * Period semantics: the start boundary is EXCLUSIVE and the end boundary is
 * INCLUSIVE, matching the CDI accrual convention (the rate published on day D
 * remunerates the day that ends on D). See ADR-120.
 *
 * Compounding: `dailyFactor = 1 + rate/100` for `DAILY_PERCENT`, or `rate`
 * for `DAILY_FACTOR`; `accumulatedFactor = product(dailyFactor)`;
 * `return = (accumulatedFactor - 1) * 100`. Exact decimal arithmetic only —
 * no floating-point exponentiation, no `parseFloat`, no `Number()`.
 * See ADR-119.
 *
 * Missing observations: a day without a published observation is NEVER treated
 * as a 0% rate. Weekends and exchange holidays are simply absent from the
 * series and are not, by themselves, a data-quality failure.
 *
 * `expectedObservationDates` (optional) is the authoritative set of business
 * days the caller expects (e.g. from an official calendar). When provided and
 * the series covers strictly fewer of them, the result is PARTIAL. When it is
 * not provided, 3G cannot distinguish a holiday from a genuinely missing
 * observation, so the status is AVAILABLE (>=1 observation) or UNAVAILABLE.
 * See ADR-121.
 */
export function calculateRateBenchmarkReturn(input: {
  benchmarkId: BenchmarkId;
  observations: RateBenchmarkObservation[];
  startDate: LocalDate;
  endDate: LocalDate;
  expectedObservationDates?: readonly LocalDate[];
}): RateBenchmarkReturn {
  const definition = BENCHMARK_DEFINITIONS[input.benchmarkId];
  if (definition.type !== 'RATE_SERIES') {
    throw new UnsupportedBenchmarkTypeError(
      `calculateRateBenchmarkReturn only accepts RATE_SERIES benchmarks, got '${input.benchmarkId}' (${definition.type}).`,
    );
  }
  if (input.startDate.compare(input.endDate) > 0) {
    throw new Error(
      `Invalid period: startDate '${input.startDate.toString()}' must be <= endDate '${input.endDate.toString()}'`,
    );
  }

  const one = Quantity.from('1');
  const hundred = Quantity.from('100');

  const relevant = input.observations
    .filter((o) => o.date.compare(input.startDate) > 0 && o.date.compare(input.endDate) <= 0)
    .slice()
    .sort((a, b) => a.date.compare(b.date));

  const unavailable = (): RateBenchmarkReturn =>
    Object.freeze({
      benchmarkId: input.benchmarkId,
      startDate: input.startDate,
      endDate: input.endDate,
      observationCount: 0,
      accumulatedFactor: one,
      returnPercentage: null,
      status: 'UNAVAILABLE' as const,
    });

  if (relevant.length === 0) {
    return unavailable();
  }

  let factor = one;
  for (const obs of relevant) {
    let dailyFactor: Quantity;
    if (obs.unit === 'DAILY_PERCENT') {
      dailyFactor = one.add(obs.rate.divide(hundred));
    } else if (obs.unit === 'DAILY_FACTOR') {
      dailyFactor = obs.rate;
    } else {
      // Defensive: unknown unit must never be compounded as if it were daily.
      throw new UnsupportedRateUnitError(String(obs.unit));
    }
    factor = factor.multiply(dailyFactor);
  }

  const ret = factor.subtract(one).multiply(hundred);
  const returnPercentage = Percentage.from(ret.toString());

  let status: BenchmarkAvailability = 'AVAILABLE';
  if (input.expectedObservationDates) {
    const observedDates = new Set(relevant.map((o) => o.date.toString()));
    const expected = input.expectedObservationDates.filter(
      (d) => d.compare(input.startDate) > 0 && d.compare(input.endDate) <= 0,
    );
    const missing = expected.filter((d) => !observedDates.has(d.toString()));
    if (expected.length > 0 && missing.length > 0) {
      status = 'PARTIAL';
    }
  }

  return Object.freeze({
    benchmarkId: input.benchmarkId,
    startDate: input.startDate,
    endDate: input.endDate,
    observationCount: relevant.length,
    accumulatedFactor: factor,
    returnPercentage,
    status,
  });
}

// ---------------------------------------------------------------------------
// InMemory Benchmark Provider (deterministic, for tests)
// ---------------------------------------------------------------------------

export class InMemoryBenchmarkDataProvider
  implements BenchmarkDataProvider, RateBenchmarkDataProvider
{
  readonly provider = 'IN_MEMORY';
  private readonly levels = new Map<string, Map<string, BenchmarkObservation>>();
  private readonly rates = new Map<string, Map<string, RateBenchmarkObservation>>();
  private readonly maxLookbackDays: number;
  calls = 0;

  constructor(options: { maxLookbackDays?: number } = {}) {
    this.maxLookbackDays = options.maxLookbackDays ?? 7;
  }

  seed(data: { benchmarkId: BenchmarkId; date: string; value: string; source?: string }): void {
    const key = data.benchmarkId;
    let map = this.levels.get(key);
    if (!map) {
      map = new Map();
      this.levels.set(key, map);
    }
    const date = LocalDate.from(data.date);
    const obs: BenchmarkObservation = {
      benchmarkId: data.benchmarkId,
      date,
      value: Quantity.from(data.value),
      source: data.source ?? 'IN_MEMORY',
    };
    map.set(date.toString(), obs);
  }

  async getObservation(benchmarkId: BenchmarkId, date: LocalDate): Promise<BenchmarkObservation> {
    this.calls++;
    assertValidBenchmarkId(benchmarkId);
    const map = this.levels.get(benchmarkId);
    if (!map) throw new Error(`Benchmark ${benchmarkId} not found`);

    const exact = map.get(date.toString());
    if (exact) {
      return Object.freeze({ ...exact });
    }

    // Previous trading day within maxLookback
    let current = date;
    for (let i = 1; i <= this.maxLookbackDays; i++) {
      const prev = addDays(current, -1);
      const candidate = map.get(prev.toString());
      if (candidate) {
        return Object.freeze({ ...candidate });
      }
      current = prev;
    }

    throw new Error(`Benchmark observation not found for ${benchmarkId} on ${date.toString()}`);
  }

  async getObservations(
    benchmarkId: BenchmarkId,
    from: LocalDate,
    to: LocalDate,
  ): Promise<BenchmarkObservation[]> {
    this.calls++;
    if (from.compare(to) > 0) throw new Error('Invalid range');
    const map = this.levels.get(benchmarkId);
    if (!map) return [];
    const result: BenchmarkObservation[] = [];
    let current = from;
    while (current.compare(to) <= 0) {
      const obs = map.get(current.toString());
      if (obs) result.push(Object.freeze({ ...obs }));
      current = addDays(current, 1);
    }
    return result;
  }

  // Rate benchmark support for CDI
  seedRate(data: { benchmarkId: BenchmarkId; date: string; rate: string; unit?: RateUnit }): void {
    const key = data.benchmarkId;
    let map = this.rates.get(key);
    if (!map) {
      map = new Map();
      this.rates.set(key, map);
    }
    const date = LocalDate.from(data.date);
    const obs: RateBenchmarkObservation = {
      benchmarkId: data.benchmarkId,
      date,
      rate: Quantity.from(data.rate),
      unit: (data.unit as RateUnit) ?? 'DAILY_PERCENT',
      source: 'IN_MEMORY',
    };
    map.set(date.toString(), obs);
  }

  async getRateObservation(
    benchmarkId: BenchmarkId,
    date: LocalDate,
  ): Promise<RateBenchmarkObservation> {
    assertValidBenchmarkId(benchmarkId);
    const map = this.rates.get(benchmarkId);
    if (!map) throw new Error(`Rate benchmark ${benchmarkId} not found`);
    const exact = map.get(date.toString());
    if (exact) return Object.freeze({ ...exact });
    throw new Error(`Rate observation not found for ${benchmarkId} on ${date.toString()}`);
  }

  async getRateObservations(
    benchmarkId: BenchmarkId,
    from: LocalDate,
    to: LocalDate,
  ): Promise<RateBenchmarkObservation[]> {
    if (from.compare(to) > 0) throw new Error('Invalid range');
    const map = this.rates.get(benchmarkId);
    if (!map) return [];
    const result: RateBenchmarkObservation[] = [];
    let current = from;
    while (current.compare(to) <= 0) {
      const obs = map.get(current.toString());
      if (obs) result.push(Object.freeze({ ...obs }));
      current = addDays(current, 1);
    }
    return result;
  }
}

function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return LocalDate.fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

// ---------------------------------------------------------------------------
// Stooq Benchmark Provider (IBOV real)
// ---------------------------------------------------------------------------

export class StooqBenchmarkDataProvider implements BenchmarkDataProvider {
  readonly provider = 'STOOQ';
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly maxLookbackDays: number;

  constructor(
    options: { timeoutMs?: number; fetchFn?: typeof fetch; maxLookbackDays?: number } = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.fetchFn = options.fetchFn ?? fetch;
    this.maxLookbackDays = options.maxLookbackDays ?? 7;
  }

  async getObservation(benchmarkId: BenchmarkId, date: LocalDate): Promise<BenchmarkObservation> {
    assertValidBenchmarkId(benchmarkId);
    // Stooq symbol for IBOV: ^BVSP or ibov.sa (we use ^BVSP)
    const symbol = benchmarkId === 'IBOV' ? '^BVSP' : benchmarkId;
    const start = addDays(date, -this.maxLookbackDays);
    const prices = await this.fetchHistory(symbol, start, date);
    let current = date;
    for (let i = 0; i <= this.maxLookbackDays; i++) {
      const found = prices.get(current.toString());
      if (found) return Object.freeze({ ...found });
      current = addDays(current, -1);
    }
    throw new Error(`Benchmark observation not found for ${benchmarkId} on ${date.toString()}`);
  }

  async getObservations(
    benchmarkId: BenchmarkId,
    from: LocalDate,
    to: LocalDate,
  ): Promise<BenchmarkObservation[]> {
    assertValidBenchmarkId(benchmarkId);
    if (from.compare(to) > 0) throw new Error('Invalid range');
    const symbol = benchmarkId === 'IBOV' ? '^BVSP' : benchmarkId;
    const prices = await this.fetchHistory(symbol, from, to);
    const result: BenchmarkObservation[] = [];
    let current = from;
    while (current.compare(to) <= 0) {
      const found = prices.get(current.toString());
      if (found) result.push(Object.freeze({ ...found }));
      current = addDays(current, 1);
    }
    return result;
  }

  private async fetchHistory(
    symbol: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<Map<string, BenchmarkObservation>> {
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol.toLowerCase())}&i=d`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(url, { signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      throw new Error(
        `Benchmark provider unavailable: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`Benchmark provider error: ${response.status}`);
    let csv: string;
    try {
      csv = await response.text();
    } catch {
      // ignore
      throw new Error('Benchmark invalid response');
    }
    const rows = parseBenchmarkCsv(csv);
    const map = new Map<string, BenchmarkObservation>();
    for (const row of rows) {
      const rowDate = LocalDate.from(row.date);
      if (rowDate.compare(from) < 0 || rowDate.compare(to) > 0) continue;
      if (!row.close) continue;
      try {
        const obs: BenchmarkObservation = {
          benchmarkId: 'IBOV',
          date: rowDate,
          value: Quantity.from(row.close),
          source: 'STOOQ',
        };
        map.set(rowDate.toString(), obs);
      } catch {
        // ignore
        // skip malformed
      }
    }
    return map;
  }
}

function parseBenchmarkCsv(csv: string): Array<{ date: string; close: string }> {
  const lines = csv
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length < 2) return [];
  const header = (lines[0] ?? '').split(',').map((h) => h.trim().toLowerCase());
  const dateIdx = header.indexOf('date');
  const closeIdx = header.indexOf('close');
  if (dateIdx === -1 || closeIdx === -1) return [];
  const rows: Array<{ date: string; close: string }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = (lines[i] ?? '').split(',').map((c) => c.trim());
    const date = cols[dateIdx] ?? '';
    const close = cols[closeIdx] ?? '';
    if (!date || !close) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!/^-?\d+(\.\d+)?$/.test(close)) continue;
    rows.push({ date, close });
  }
  return rows;
}

export class YahooBenchmarkDataProvider implements BenchmarkDataProvider {
  readonly provider = 'YAHOO';
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly maxLookbackDays: number;

  constructor(
    options: { timeoutMs?: number; fetchFn?: typeof fetch; maxLookbackDays?: number } = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.fetchFn = options.fetchFn ?? fetch;
    this.maxLookbackDays = options.maxLookbackDays ?? 7;
  }

  async getObservation(benchmarkId: BenchmarkId, date: LocalDate): Promise<BenchmarkObservation> {
    assertValidBenchmarkId(benchmarkId);
    const start = addDays(date, -this.maxLookbackDays);
    const prices = await this.fetchHistory('^BVSP', start, date);
    let current = date;
    for (let i = 0; i <= this.maxLookbackDays; i++) {
      const found = prices.get(current.toString());
      if (found) return Object.freeze({ ...found });
      current = addDays(current, -1);
    }
    throw new Error(`Benchmark observation not found for ${benchmarkId} on ${date.toString()}`);
  }

  async getObservations(
    benchmarkId: BenchmarkId,
    from: LocalDate,
    to: LocalDate,
  ): Promise<BenchmarkObservation[]> {
    assertValidBenchmarkId(benchmarkId);
    if (from.compare(to) > 0) throw new Error('Invalid range');
    const prices = await this.fetchHistory('^BVSP', from, to);
    const result: BenchmarkObservation[] = [];
    let current = from;
    while (current.compare(to) <= 0) {
      const found = prices.get(current.toString());
      if (found) result.push(Object.freeze({ ...found }));
      current = addDays(current, 1);
    }
    return result;
  }

  private async fetchHistory(
    symbol: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<Map<string, BenchmarkObservation>> {
    const fromTs = Math.floor(Date.UTC(from.year, from.month - 1, from.day) / 1000);
    const toTs = Math.floor(Date.UTC(to.year, to.month - 1, to.day + 1) / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${fromTs}&period2=${toTs}&interval=1d`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Atlas/1.0' } as never,
      });
    } catch (err) {
      clearTimeout(timer);
      throw new Error(
        `Benchmark provider unavailable: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`Benchmark provider error: ${response.status}`);
    let json: {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: (number | null)[] }> };
          meta?: { symbol?: string; currency?: string };
        }>;
        error?: unknown;
      };
    };
    try {
      json = (await response.json()) as never;
    } catch {
      throw new Error('Benchmark invalid response');
    }
    if (json.chart?.error) throw new Error('Benchmark invalid response');
    const result = json.chart?.result?.[0];
    if (!result?.timestamp || !result?.indicators?.quote?.[0]?.close)
      throw new Error('Benchmark invalid response');
    if (result.meta?.symbol && result.meta.symbol !== '^BVSP' && result.meta.symbol !== 'BVSP') {
      // still accept, but ensure currency is BRL
    }
    if (result.meta?.currency && result.meta.currency !== 'BRL')
      throw new Error('Benchmark currency mismatch');
    const timestamps: number[] = result.timestamp;
    const closes: (number | null)[] = result.indicators.quote[0].close ?? [];
    const map = new Map<string, BenchmarkObservation>();
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      const close = closes[i];
      if (ts === undefined || close === null || close === undefined) continue;
      if (close <= 0) continue;
      const d = new Date(ts * 1000);
      const rowDate = LocalDate.fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      if (rowDate.compare(from) < 0 || rowDate.compare(to) > 0) continue;
      try {
        const obs: BenchmarkObservation = {
          benchmarkId: 'IBOV',
          date: rowDate,
          value: Quantity.from(close.toString()),
          source: 'YAHOO',
        };
        map.set(rowDate.toString(), obs);
      } catch (_e) {
        void _e;
      }
    }
    return map;
  }
}

export class InMemoryRateBenchmarkDataProvider implements RateBenchmarkDataProvider {
  readonly provider = 'IN_MEMORY';
  private readonly rates = new Map<string, Map<string, RateBenchmarkObservation>>();

  seed(data: { benchmarkId: BenchmarkId; date: string; rate: string; unit?: RateUnit }): void {
    const key = data.benchmarkId;
    let map = this.rates.get(key);
    if (!map) {
      map = new Map();
      this.rates.set(key, map);
    }
    const date = LocalDate.from(data.date);
    const obs: RateBenchmarkObservation = {
      benchmarkId: data.benchmarkId,
      date,
      rate: Quantity.from(data.rate),
      unit: (data.unit as RateUnit) ?? 'DAILY_PERCENT',
      source: 'IN_MEMORY',
    };
    map.set(date.toString(), obs);
  }

  async getRateObservation(
    benchmarkId: BenchmarkId,
    date: LocalDate,
  ): Promise<RateBenchmarkObservation> {
    assertValidBenchmarkId(benchmarkId);
    const map = this.rates.get(benchmarkId);
    if (!map) throw new Error(`Rate benchmark ${benchmarkId} not found`);
    const exact = map.get(date.toString());
    if (exact) return Object.freeze({ ...exact });
    throw new Error(`Rate observation not found for ${benchmarkId} on ${date.toString()}`);
  }

  async getRateObservations(
    benchmarkId: BenchmarkId,
    from: LocalDate,
    to: LocalDate,
  ): Promise<RateBenchmarkObservation[]> {
    if (from.compare(to) > 0) throw new Error('Invalid range');
    const map = this.rates.get(benchmarkId);
    if (!map) return [];
    const result: RateBenchmarkObservation[] = [];
    let current = from;
    while (current.compare(to) <= 0) {
      const obs = map.get(current.toString());
      if (obs) result.push(Object.freeze({ ...obs }));
      current = addDays(current, 1);
    }
    return result;
  }
}

export class BcbRateBenchmarkDataProvider implements RateBenchmarkDataProvider {
  readonly provider = 'BCB';
  readonly institution = 'Banco Central do Brasil';
  readonly providerSeriesCode = '12';
  readonly seriesName = 'Taxa de juros - CDI';
  readonly unit: RateUnit = 'DAILY_PERCENT';
  readonly frequency = 'DAILY_BUSINESS_DAYS';
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: { timeoutMs?: number; fetchFn?: typeof fetch } = {}) {
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async getRateObservation(
    benchmarkId: BenchmarkId,
    date: LocalDate,
  ): Promise<RateBenchmarkObservation> {
    assertValidBenchmarkId(benchmarkId);
    if (benchmarkId !== 'CDI') throw new Error(`Unsupported rate benchmark ${benchmarkId}`);
    const obs = await this.fetchRates(date, date);
    const found = obs.get(date.toString());
    if (!found) throw new Error(`CDI observation not found for ${date.toString()}`);
    return Object.freeze({ ...found });
  }

  async getRateObservations(
    benchmarkId: BenchmarkId,
    from: LocalDate,
    to: LocalDate,
  ): Promise<RateBenchmarkObservation[]> {
    assertValidBenchmarkId(benchmarkId);
    if (benchmarkId !== 'CDI') throw new Error(`Unsupported rate benchmark ${benchmarkId}`);
    if (from.compare(to) > 0) throw new Error('Invalid range');
    const map = await this.fetchRates(from, to);
    const result: RateBenchmarkObservation[] = [];
    let current = from;
    while (current.compare(to) <= 0) {
      const obs = map.get(current.toString());
      if (obs) result.push(Object.freeze({ ...obs }));
      current = addDays(current, 1);
    }
    return result;
  }

  private async fetchRates(
    from: LocalDate,
    to: LocalDate,
  ): Promise<Map<string, RateBenchmarkObservation>> {
    // BCB SGS 12 = CDI, 4389 = CDI also? Use 12 for daily CDI rate
    // API: https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=01/01/2020&dataFinal=31/12/2020
    const formatDate = (d: LocalDate): string =>
      `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}/${d.year}`;
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${formatDate(from)}&dataFinal=${formatDate(to)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(url, { signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      throw new Error(
        `Rate provider unavailable: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`Rate provider error: ${response.status}`);
    let json: Array<{ data: string; valor: string }>;
    try {
      json = (await response.json()) as never;
    } catch {
      throw new Error('Rate invalid response');
    }
    const map = new Map<string, RateBenchmarkObservation>();
    for (const row of json) {
      if (!row.data || !row.valor) continue;
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row.data.trim());
      if (!match) continue;
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      let date: LocalDate;
      try {
        date = LocalDate.fromParts(year, month, day);
      } catch (_e) {
        void _e;
        continue;
      }
      // Ignore any observation outside the requested range (provider hygiene).
      if (date.compare(from) < 0 || date.compare(to) > 0) continue;
      const rateStr = row.valor.trim().replace(',', '.');
      if (!/^-?\d+(\.\d+)?$/.test(rateStr)) continue;
      try {
        const obs: RateBenchmarkObservation = {
          benchmarkId: 'CDI',
          date,
          rate: Quantity.from(rateStr),
          unit: 'DAILY_PERCENT',
          source: 'BCB',
        };
        map.set(date.toString(), obs);
      } catch (_e) {
        void _e;
      }
    }
    return map;
  }
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export class InMemoryBenchmarkCache {
  private readonly cache = new Map<string, BenchmarkObservation>();
  hits = 0;
  misses = 0;

  private key(benchmarkId: BenchmarkId, date: LocalDate): string {
    return `${benchmarkId}::${date.toString()}`;
  }

  get(benchmarkId: BenchmarkId, date: LocalDate): BenchmarkObservation | null {
    const v = this.cache.get(this.key(benchmarkId, date));
    if (v) {
      this.hits++;
      return v;
    }
    this.misses++;
    return null;
  }

  set(benchmarkId: BenchmarkId, date: LocalDate, obs: BenchmarkObservation): void {
    this.cache.set(this.key(benchmarkId, date), obs);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

export class InMemoryRateBenchmarkCache {
  private readonly cache = new Map<string, RateBenchmarkObservation[]>();
  hits = 0;
  misses = 0;

  private key(benchmarkId: BenchmarkId, from: LocalDate, to: LocalDate): string {
    return `${benchmarkId}::${from.toString()}::${to.toString()}`;
  }

  get(benchmarkId: BenchmarkId, from: LocalDate, to: LocalDate): RateBenchmarkObservation[] | null {
    const v = this.cache.get(this.key(benchmarkId, from, to));
    if (v) {
      this.hits++;
      return v;
    }
    this.misses++;
    return null;
  }

  set(
    benchmarkId: BenchmarkId,
    from: LocalDate,
    to: LocalDate,
    obs: RateBenchmarkObservation[],
  ): void {
    this.cache.set(this.key(benchmarkId, from, to), obs);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}
