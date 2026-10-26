import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type {
  IAssetRepository,
  IPortfolioRepository,
  ITransactionRepository,
} from '@atlas/database';
import type { Transaction } from '@atlas/domain';
import { Currency, LocalDate, Quantity } from '@atlas/domain';
import type { HistoricalMarketDataProvider, MarketDataAssetRef } from '@atlas/market-data';
import { replayPortfolioTimeline, type PortfolioState } from '@atlas/portfolio-engine';
import {
  attributePositionContributions,
  calculatePositionTwr,
  POSITION_PERFORMANCE_MAX_MONTHS,
  sumPositionRealized,
  toPositionCapitalFlow,
} from '@atlas/performance-engine';
import { addDaysIso, addMonthsIso, enumerateGoalMonths } from '@atlas/portfolio-strategy';
import { HISTORICAL_MARKET_DATA_PROVIDER } from '../../market-data/tokens';
import {
  ASSET_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import { aggregatePositionIncome } from '../portfolios/portfolio-position-intelligence.compose';

const MAX_SERIES_RANGE_DAYS = 5 * 366;
const STALE_LOOKBACK_DAYS = 7;

function invalidPeriod(message: string): never {
  throw new BadRequestException({ message, code: 'PERFORMANCE.INVALID_PERIOD' });
}

/** Local civil "today" as `YYYY-MM-DD` from wall-clock fields (no instants). */
function todayCivilString(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function parseCivilDate(raw: string, label: string): LocalDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    invalidPeriod(`Invalid ${label} date '${raw}'. Expected YYYY-MM-DD.`);
  }
  try {
    return LocalDate.from(raw);
  } catch {
    invalidPeriod(`Invalid ${label} date '${raw}'. Expected YYYY-MM-DD.`);
  }
}

type RawTx = {
  id?: { toString(): string };
  type?: string;
  tradeDate?: { toString(): string };
  currency?: string;
  assetId?: { toString(): string };
  quantity?: { value?: string };
  unitPrice?: { amount?: string };
  fees?: { amount?: string };
  taxes?: { amount?: string };
  amount?: { amount?: string };
  createdAt?: Date | string;
};

interface LedgerRow {
  id: string;
  type: string;
  tradeDate: string;
  currency: string;
  assetId: string;
  quantity?: string;
  unitPrice?: string;
  fees?: string;
  taxes?: string;
  amount?: string;
  createdAt: string;
}

function readTx(tx: Transaction): LedgerRow | null {
  const raw = tx as unknown as RawTx;
  const id = raw.id?.toString();
  const tradeDate = raw.tradeDate?.toString();
  const assetId = raw.assetId?.toString();
  if (
    typeof id !== 'string' ||
    typeof raw.type !== 'string' ||
    typeof tradeDate !== 'string' ||
    typeof assetId !== 'string'
  ) {
    return null;
  }
  return {
    id,
    type: raw.type,
    tradeDate,
    currency: typeof raw.currency === 'string' ? raw.currency : '',
    assetId,
    quantity: raw.quantity?.value,
    unitPrice: raw.unitPrice?.amount,
    fees: raw.fees?.amount,
    taxes: raw.taxes?.amount,
    amount: raw.amount?.amount,
    createdAt:
      raw.createdAt instanceof Date
        ? raw.createdAt.toISOString()
        : typeof raw.createdAt === 'string'
          ? raw.createdAt
          : '',
  };
}

interface ResolvedPrice {
  close: string;
  priceDate: string;
  resolution: 'EXACT' | 'PREVIOUS_TRADING_DAY';
}

interface CapitalFlow {
  date: LocalDate;
  amount: string;
  direction: 'INFLOW' | 'OUTFLOW';
}

export interface PositionPerformanceMonthPoint {
  month: string;
  positionReturn: string | null;
  weightStart: string | null;
  contributionPp: string | null;
  valued: boolean;
}

export interface PositionPerformanceResponse {
  portfolioId: string;
  assetId: string;
  generatedAt: string;
  marketDataAsOf: string | null;
  period: { startDate: string; endDate: string; months: string[] };
  inceptionDate: string;
  positionCurrency: string;
  return: {
    twr: string | null;
    status: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT_DATA' | 'NOT_AVAILABLE';
    dataAvailability: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
    actualStartDate: string | null;
    actualEndDate: string | null;
  };
  realized: {
    byCurrency: Array<{
      currency: string;
      gainLoss: string | null;
      status: 'KNOWN' | 'INCOMPLETE';
      disposalCount: number;
    }>;
  };
  unrealized: { amount: string; currency: string; percent: string | null } | null;
  income: {
    totalsByCurrency: Array<{
      currency: string;
      dividends: string;
      jcp: string;
      fiiIncome: string;
      total: string;
    }>;
  };
  economicPnl: {
    totalsByCurrency: Array<{
      currency: string;
      realized: string | null;
      unrealized: string | null;
      income: string | null;
      total: string | null;
    }>;
  } | null;
  contribution: {
    totalPp: string | null;
    portfolioReturnOnGrid: string;
    monthsValued: number;
    monthsTotal: number;
    monthlyPoints: PositionPerformanceMonthPoint[];
  } | null;
  limitations: string[];
}

/**
 * Phase 5R-B — position performance and contribution (read-only).
 *
 * TWR via the shared `calculateTWR` engine on per-position observations
 * (quantity x price) with capital flows classified exactly like the replay
 * engine (BUY/SUBSCRIPTION in, SELL out net, transfers at carried cost;
 * income, corporate actions, standalone fees, amortizations and cash
 * movements are NOT external flows — identical to the portfolio engine).
 * Contribution chains monthly beginning-weights with the portfolio's own
 * monthly returns; the current weight is never used.
 */
@Injectable()
export class GetPositionPerformanceUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assets: IAssetRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactions: ITransactionRepository,
    @Inject(HISTORICAL_MARKET_DATA_PROVIDER)
    private readonly historicalProvider: HistoricalMarketDataProvider,
  ) {}

  async execute(params: {
    portfolioId: string;
    assetId: string;
    userId: string;
    startDate?: string;
    endDate?: string;
    today?: string;
  }): Promise<PositionPerformanceResponse> {
    const portfolio = params.userId
      ? await this.portfolios.findByIdAndUserId(params.portfolioId, params.userId)
      : await this.portfolios.findById(params.portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', params.portfolioId);
    }

    const today = params.today ?? todayCivilString();
    const end = params.endDate ? parseCivilDate(params.endDate, 'endDate') : LocalDate.from(today);
    const start = params.startDate
      ? parseCivilDate(params.startDate, 'startDate')
      : LocalDate.from(addMonthsIso(end.toString(), -12));
    if (start.compare(end) > 0) {
      invalidPeriod(
        `Invalid period: startDate '${start.toString()}' is after endDate '${end.toString()}'.`,
      );
    }
    if (end.compare(LocalDate.from(today)) > 0) {
      invalidPeriod(`Invalid period: endDate '${end.toString()}' is in the future.`);
    }
    const startDay = Date.UTC(start.year, start.month - 1, start.day);
    const endDay = Date.UTC(end.year, end.month - 1, end.day);
    if (Math.round((endDay - startDay) / 86_400_000) > MAX_SERIES_RANGE_DAYS) {
      invalidPeriod('Invalid period: range exceeds five years.');
    }
    const startStr = start.toString();
    const endStr = end.toString();
    const requestedMonths = enumerateGoalMonths({ start: startStr, end: endStr }, []);
    if (requestedMonths.length === 0 || requestedMonths.length > POSITION_PERFORMANCE_MAX_MONTHS) {
      invalidPeriod('Invalid period: month grid exceeds bounds.');
    }

    // Full ledger once: snapshots, inception, flows and income all derive
    // from it in a single incremental replay. Bounded by portfolio size.
    const ledger = await this.transactions.findByPortfolioId(params.portfolioId);
    const txRows = ledger.map(readTx).filter((row) => row !== null);
    const assetIds = [...new Set(txRows.map((row) => row.assetId))];
    const assetMetas = await this.assets.findByIds(assetIds);
    const metaById = new Map(assetMetas.map((asset) => [String(asset.id), asset]));
    if (!metaById.has(params.assetId)) {
      throw new EntityNotFoundError('Position', params.assetId);
    }

    const assetTradeDatesAll = [
      ...new Set(
        txRows.filter((row) => row.assetId === params.assetId).map((row) => row.tradeDate),
      ),
    ].sort();
    const assetTradeDates = assetTradeDatesAll.filter((date) => date <= endStr);

    // Grid: requested bounds + month starts strictly inside + every target
    // trade date (inception detection and flow anchoring need full coverage).
    const boundarySet = new Set<string>([startStr]);
    for (const monthKey of requestedMonths.slice(1)) {
      const first = `${monthKey}-01`;
      if (first > startStr && first <= endStr) boundarySet.add(first);
    }
    boundarySet.add(endStr);
    const gridDates = [...new Set([...boundarySet, ...assetTradeDates])].sort();

    const timeline = replayPortfolioTimeline({
      portfolioId: params.portfolioId,
      transactions: ledger,
      asOfDates: gridDates.map((date) => LocalDate.from(date)),
    });
    const stateByDate = new Map<string, PortfolioState>();
    for (const snapshot of timeline.snapshots) {
      stateByDate.set(snapshot.asOfDate.toString(), snapshot.state);
    }
    const quantityAt = (date: string): string | null => {
      const position = stateByDate.get(date)?.assets.get(params.assetId);
      if (!position || position.quantity.isZero()) return null;
      return position.quantity.value;
    };

    // Holding inception: first event after the last zero-quantity date.
    // A close + reopen starts a fresh holding (the engine evicts on full
    // close, so averaging the two eras would be meaningless). Future trades
    // count toward inception so a window entirely before the (re)opening
    // reports NO_POSITION_IN_PERIOD instead of 404.
    let lastZeroDate: string | null = null;
    for (const date of gridDates) {
      if (quantityAt(date) === null) lastZeroDate = date;
    }
    const inception =
      assetTradeDatesAll.find((date) => lastZeroDate === null || date > lastZeroDate) ?? null;
    if (inception === null) {
      throw new EntityNotFoundError('Position', params.assetId);
    }
    if (endStr < inception) {
      return {
        portfolioId: params.portfolioId,
        assetId: params.assetId,
        generatedAt: new Date().toISOString(),
        marketDataAsOf: null,
        period: { startDate: startStr, endDate: endStr, months: requestedMonths },
        inceptionDate: inception,
        positionCurrency: '',
        return: {
          twr: null,
          status: 'NOT_AVAILABLE',
          dataAvailability: 'UNAVAILABLE',
          actualStartDate: null,
          actualEndDate: null,
        },
        realized: { byCurrency: [] },
        unrealized: null,
        income: { totalsByCurrency: [] },
        economicPnl: null,
        contribution: null,
        limitations: ['NO_POSITION_IN_PERIOD'],
      };
    }
    const effectiveStart = inception > startStr ? inception : startStr;

    const endState = stateByDate.get(endStr);
    if (!endState?.assets.get(params.assetId)) {
      throw new EntityNotFoundError('Position', params.assetId);
    }

    const endPosition = endState.assets.get(params.assetId);
    const positionCurrency = String(endPosition?.currency ?? '');
    const currency = positionCurrency as Currency;
    const limitations: string[] = [];
    let marketDataAsOf: string | null = null;

    // Memoized price resolution per (asset, date).
    const priceCache = new Map<string, ResolvedPrice | null>();
    const resolvePrice = async (
      assetId: string,
      dateStr: string,
    ): Promise<ResolvedPrice | null> => {
      const key = `${assetId}::${dateStr}`;
      const cached = priceCache.get(key);
      if (cached !== undefined) return cached;
      const meta = metaById.get(assetId);
      if (!meta) {
        priceCache.set(key, null);
        return null;
      }
      const ref: MarketDataAssetRef = {
        assetId: assetId as never,
        ticker: meta.ticker,
        exchange: meta.exchange,
        currency: meta.currency as never,
        assetType: meta.type as never,
      };
      try {
        const resolved = await this.historicalProvider.getDailyPrice(ref, LocalDate.from(dateStr));
        if (
          resolved.status === 'UNAVAILABLE' ||
          String(resolved.currency) !== String(meta.currency)
        ) {
          priceCache.set(key, null);
          return null;
        }
        if (marketDataAsOf === null || resolved.date.toString() > marketDataAsOf) {
          marketDataAsOf = resolved.date.toString();
        }
        const priced: ResolvedPrice = {
          close: resolved.close.amount,
          priceDate: resolved.date.toString(),
          resolution: resolved.status,
        };
        priceCache.set(key, priced);
        return priced;
      } catch {
        priceCache.set(key, null);
        return null;
      }
    };

    const valueAt = async (
      assetId: string,
      dateStr: string,
    ): Promise<{
      value: string;
      priceDate: string;
      resolution: 'EXACT' | 'PREVIOUS_TRADING_DAY';
    } | null> => {
      const position = stateByDate.get(dateStr)?.assets.get(assetId);
      if (!position || position.quantity.isZero()) return null;
      const priced = await resolvePrice(assetId, dateStr);
      if (!priced) return null;
      return {
        value: Quantity.from(position.quantity.value).multiply(Quantity.from(priced.close)).value,
        priceDate: priced.priceDate,
        resolution: priced.resolution,
      };
    };

    // Transfer carried costs from the cumulative audit (final snapshot).
    const carriedByTx = new Map<string, { amount: string; known: boolean }>();
    for (const transfer of endState.appliedTransfers) {
      if (String(transfer.assetId) !== params.assetId) continue;
      carriedByTx.set(String(transfer.transactionId), {
        amount: transfer.carriedCost?.amount ?? '',
        known: transfer.costBasisStatus === 'KNOWN' && transfer.carriedCost !== undefined,
      });
    }

    const buildFlows = (
      assetId: string,
      fromExclusive: string,
      toInclusive: string,
    ): CapitalFlow[] | null => {
      const flows: CapitalFlow[] = [];
      for (const row of txRows) {
        if (row.assetId !== assetId) continue;
        if (row.tradeDate <= fromExclusive || row.tradeDate > toInclusive) continue;
        if (
          row.type !== 'BUY' &&
          row.type !== 'SELL' &&
          row.type !== 'SUBSCRIPTION' &&
          row.type !== 'TRANSFER_IN' &&
          row.type !== 'TRANSFER_OUT'
        ) {
          continue;
        }
        const carried = carriedByTx.get(row.id);
        const flow = toPositionCapitalFlow(
          {
            type: row.type,
            tradeDate: row.tradeDate,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            fees: row.fees,
            taxes: row.taxes,
            carriedCost: carried?.amount,
            costKnown: carried ? carried.known : undefined,
          },
          currency,
        );
        if (!flow) return null;
        flows.push({ date: flow.date, amount: flow.amount.amount, direction: flow.direction });
      }
      return flows;
    };

    // --- Target observations over the effective window ---
    const obsDates = gridDates.filter((date) => date >= effectiveStart && date <= endStr);
    const observations: Array<{ date: LocalDate; value: string }> = [];
    const endResolutions = new Map<string, 'EXACT' | 'PREVIOUS_TRADING_DAY'>();
    let missingStart = false;
    let missingEnd = false;
    for (const date of obsDates) {
      const valued = await valueAt(params.assetId, date);
      if (!valued) {
        if (date === effectiveStart) missingStart = true;
        if (date === endStr) missingEnd = true;
        continue;
      }
      endResolutions.set(date, valued.resolution);
      observations.push({ date: LocalDate.from(date), value: valued.value });
    }

    const targetFlows = buildFlows(params.assetId, addDaysIso(effectiveStart, -1), endStr);
    // Only flows strictly inside the window need anchoring: a flow exactly
    // on the effective start is ignored by the engine's end-of-subperiod
    // timing (its capital is already in the beginning value).
    const anchoredFlowDates = new Set(
      (targetFlows ?? [])
        .filter((flow) => flow.date.toString() > effectiveStart)
        .map((flow) => flow.date.toString()),
    );
    const obsDateSet = new Set(observations.map((point) => point.date.toString()));
    let missingFlowPrice = false;
    for (const date of anchoredFlowDates) {
      if (!obsDateSet.has(date)) {
        missingFlowPrice = true;
        break;
      }
    }

    // --- Return via the shared TWR engine ---
    let twr: string | null = null;
    let returnStatus: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT_DATA' | 'NOT_AVAILABLE' =
      'NOT_AVAILABLE';
    let dataAvailability: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' = 'UNAVAILABLE';
    const actualStartDate =
      observations.length > 0 ? (observations[0]?.date.toString() ?? null) : null;
    const actualEndDate =
      observations.length > 0
        ? (observations[observations.length - 1]?.date.toString() ?? null)
        : null;
    if (targetFlows === null) {
      limitations.push('INCOMPLETE_COST_BASIS');
    } else if (missingFlowPrice) {
      limitations.push('MISSING_FLOW_PRICE');
    } else if (observations.length < 2) {
      limitations.push('INSUFFICIENT_HISTORY');
      if (missingStart || actualStartDate === null) limitations.push('MISSING_START_PRICE');
      if (missingEnd || actualEndDate === null) limitations.push('MISSING_END_PRICE');
      returnStatus = 'INSUFFICIENT_DATA';
    } else {
      const result = calculatePositionTwr({
        observations,
        flows: targetFlows,
        startDate: LocalDate.from(effectiveStart),
        endDate: LocalDate.from(endStr),
        currency,
      });
      if (result.status === 'COMPLETE') {
        twr = result.returnPercentage.value;
        const caveats: string[] = [];
        if (actualStartDate !== null && actualStartDate > effectiveStart) {
          caveats.push('MISSING_START_PRICE');
        }
        if (actualEndDate !== null && actualEndDate < endStr) {
          caveats.push('MISSING_END_PRICE');
        }
        const endResolution = actualEndDate ? endResolutions.get(actualEndDate) : undefined;
        if (
          endResolution !== undefined &&
          endResolution !== 'EXACT' &&
          endStr >= addDaysIso(today, -STALE_LOOKBACK_DAYS)
        ) {
          caveats.push('STALE_END_PRICE');
        }
        limitations.push(...caveats);
        returnStatus = caveats.length > 0 ? 'PARTIAL' : 'COMPLETE';
        dataAvailability = caveats.length > 0 ? 'PARTIAL' : 'AVAILABLE';
      } else {
        limitations.push('INSUFFICIENT_HISTORY');
        returnStatus = 'INSUFFICIENT_DATA';
      }
    }

    // --- Realized P&L in period (canonical disposals, ADR-045/046) ---
    const realizedByCurrency = new Map<
      string,
      Array<{ gainLoss: string | null; status: 'KNOWN' | 'INCOMPLETE' }>
    >();
    for (const disposal of endState.realizedDisposals) {
      if (String(disposal.assetId) !== params.assetId) continue;
      const tradeDate = disposal.tradeDate.toString();
      if (tradeDate < effectiveStart || tradeDate > endStr) continue;
      const bucket = realizedByCurrency.get(disposal.currency) ?? [];
      bucket.push({
        gainLoss: disposal.realizedGainLoss ? disposal.realizedGainLoss.amount : null,
        status: disposal.status,
      });
      realizedByCurrency.set(disposal.currency, bucket);
    }
    const realized = {
      byCurrency: [...realizedByCurrency.entries()].map(([cur, rows]) => {
        const summed = sumPositionRealized(rows);
        return {
          currency: cur,
          gainLoss: summed.total,
          status: summed.status,
          disposalCount: summed.count,
        };
      }),
    };

    // --- Unrealized at the period end (snapshot cost basis) ---
    let unrealized: { amount: string; currency: string; percent: string | null } | null = null;
    if (
      endPosition &&
      endPosition.costBasisStatus === 'KNOWN' &&
      endPosition.totalCost &&
      actualEndDate === endStr
    ) {
      const endValue = observations.find((point) => point.date.toString() === endStr);
      if (endValue) {
        const gain = Quantity.from(endValue.value).subtract(
          Quantity.from(endPosition.totalCost.amount),
        );
        const basis = Quantity.from(endPosition.totalCost.amount);
        unrealized = {
          amount: gain.value,
          currency: positionCurrency,
          percent: basis.isPositive()
            ? gain.divide(basis).multiply(Quantity.from('100')).value
            : null,
        };
      }
    }

    // --- Income in period (canonical events, grouped per currency) ---
    const income = aggregatePositionIncome(
      txRows
        .filter(
          (row) =>
            row.assetId === params.assetId &&
            row.tradeDate >= effectiveStart &&
            row.tradeDate <= endStr &&
            (row.type === 'DIVIDEND' || row.type === 'JCP' || row.type === 'FII_INCOME') &&
            typeof row.amount === 'string',
        )
        .map((row) => ({
          id: row.id,
          type: row.type,
          tradeDate: row.tradeDate,
          currency: row.currency,
          createdAt: row.createdAt,
          amount: row.amount as string,
        })),
    );

    // --- Economic P&L per currency (only when every component is known) ---
    const economicCurrencies = new Set<string>([
      ...realized.byCurrency.map((row) => row.currency),
      ...income.totalsByCurrency.map((row) => row.currency),
    ]);
    if (unrealized) economicCurrencies.add(unrealized.currency);
    const economicPnl =
      economicCurrencies.size === 0
        ? null
        : {
            totalsByCurrency: [...economicCurrencies].sort().map((cur) => {
              const realizedRow = realized.byCurrency.find((row) => row.currency === cur);
              const incomeRow = income.totalsByCurrency.find((row) => row.currency === cur);
              const realizedValue = realizedRow ? realizedRow.gainLoss : '0';
              const incomeValue = incomeRow ? incomeRow.total : '0';
              const unrealizedValue =
                cur === positionCurrency ? (unrealized ? unrealized.amount : null) : '0';
              const total =
                realizedValue !== null && unrealizedValue !== null && incomeValue !== null
                  ? Quantity.from(realizedValue)
                      .add(Quantity.from(unrealizedValue))
                      .add(Quantity.from(incomeValue)).value
                  : null;
              return {
                currency: cur,
                realized: realizedValue,
                unrealized: unrealizedValue,
                income: incomeValue,
                total,
              };
            }),
          };

    // --- Contribution: monthly beginning-weights chained with the
    // portfolio's own monthly returns (no current-weight approximation) ---
    const monthBoundaries: string[] = [effectiveStart];
    for (const monthKey of requestedMonths.slice(1)) {
      const first = `${monthKey}-01`;
      if (first > effectiveStart && first <= endStr) monthBoundaries.push(first);
    }
    if (monthBoundaries[monthBoundaries.length - 1] !== endStr) monthBoundaries.push(endStr);

    const sameCurrencyAssets = new Set<string>();
    for (const snapshot of timeline.snapshots) {
      for (const [assetId, position] of snapshot.state.assets) {
        if (String(position.currency) === positionCurrency) sameCurrencyAssets.add(assetId);
      }
    }

    const monthSlices: Array<{
      startValues: Map<string, string>;
      monthlyReturns: Map<string, string>;
    }> = [];
    const sliceLabels: string[] = [];
    let universeIncomplete = false;
    for (let m = 0; m < monthBoundaries.length - 1; m += 1) {
      const monthStart = monthBoundaries[m] as string;
      const monthEnd = monthBoundaries[m + 1] as string;
      const startValues = new Map<string, string>();
      for (const assetId of sameCurrencyAssets) {
        const valued = await valueAt(assetId, monthStart);
        if (!valued) {
          universeIncomplete = true;
          continue;
        }
        startValues.set(assetId, valued.value);
      }
      const monthlyReturns = new Map<string, string>();
      for (const assetId of startValues.keys()) {
        const dates = [
          monthStart,
          ...[
            ...new Set(
              txRows
                .filter(
                  (row) =>
                    row.assetId === assetId &&
                    row.tradeDate > monthStart &&
                    row.tradeDate <= monthEnd,
                )
                .map((row) => row.tradeDate),
            ),
          ].sort(),
          monthEnd,
        ];
        const uniqueDates = [...new Set(dates)].sort();
        const obs: Array<{ date: LocalDate; value: string }> = [];
        let complete = true;
        for (const date of uniqueDates) {
          const valued = await valueAt(assetId, date);
          if (!valued) {
            complete = false;
            break;
          }
          obs.push({ date: LocalDate.from(date), value: valued.value });
        }
        if (!complete || obs.length < 2) {
          universeIncomplete = true;
          continue;
        }
        // End-of-period timing: flows strictly after the start belong to
        // the month that ends at monthEnd. A flow exactly on monthStart
        // belongs to the previous month (engine end-of-subperiod timing).
        const monthFlows = ((): CapitalFlow[] | null => {
          const out: CapitalFlow[] = [];
          for (const row of txRows) {
            if (row.assetId !== assetId) continue;
            if (row.tradeDate <= monthStart || row.tradeDate > monthEnd) continue;
            if (
              row.type !== 'BUY' &&
              row.type !== 'SELL' &&
              row.type !== 'SUBSCRIPTION' &&
              row.type !== 'TRANSFER_IN' &&
              row.type !== 'TRANSFER_OUT'
            ) {
              continue;
            }
            const carried = carriedByTx.get(row.id);
            const flow = toPositionCapitalFlow(
              {
                type: row.type,
                tradeDate: row.tradeDate,
                quantity: row.quantity,
                unitPrice: row.unitPrice,
                fees: row.fees,
                taxes: row.taxes,
                carriedCost: carried?.amount,
                costKnown: carried ? carried.known : undefined,
              },
              currency,
            );
            if (!flow) return null;
            out.push({ date: flow.date, amount: flow.amount.amount, direction: flow.direction });
          }
          return out;
        })();
        if (monthFlows === null) {
          universeIncomplete = true;
          continue;
        }
        const monthly = calculatePositionTwr({
          observations: obs,
          flows: monthFlows,
          startDate: LocalDate.from(monthStart),
          endDate: LocalDate.from(monthEnd),
          currency,
        });
        if (monthly.status !== 'COMPLETE') {
          universeIncomplete = true;
          continue;
        }
        monthlyReturns.set(assetId, monthly.returnPercentage.value);
      }
      monthSlices.push({ startValues, monthlyReturns });
      sliceLabels.push(monthStart.slice(0, 7));
    }

    const attribution = attributePositionContributions({
      months: sliceLabels,
      positions: [...sameCurrencyAssets].map((assetId) => ({
        assetId,
        startValues: monthSlices.map((slice) => slice.startValues.get(assetId) ?? null),
        monthlyReturns: monthSlices.map((slice) => slice.monthlyReturns.get(assetId) ?? null),
      })),
      targetAssetId: params.assetId,
    });
    const targetValuedMonths = attribution.months.filter((row) => row.valued).length;
    const contribution =
      targetValuedMonths === 0
        ? null
        : {
            totalPp: (attribution.contributions[params.assetId] as string | undefined) ?? null,
            portfolioReturnOnGrid: attribution.portfolioReturnOnGrid,
            monthsValued: targetValuedMonths,
            monthsTotal: sliceLabels.length,
            monthlyPoints: attribution.months.map((row) => ({
              month: row.month,
              positionReturn: row.positionReturn,
              weightStart: row.weightStart,
              contributionPp: row.contributionPp,
              valued: row.valued,
            })),
          };
    if (contribution === null) {
      limitations.push('POSITION_CONTRIBUTION_NOT_AVAILABLE');
    }
    if (universeIncomplete) {
      limitations.push('PARTIAL_PORTFOLIO_VALUATION');
    }
    if (endPosition && endPosition.costBasisStatus === 'INCOMPLETE') {
      limitations.push('INCOMPLETE_COST_BASIS');
    }

    return {
      portfolioId: params.portfolioId,
      assetId: params.assetId,
      generatedAt: new Date().toISOString(),
      marketDataAsOf,
      period: { startDate: startStr, endDate: endStr, months: requestedMonths },
      inceptionDate: inception,
      positionCurrency,
      return: {
        twr,
        status: returnStatus,
        dataAvailability,
        actualStartDate,
        actualEndDate,
      },
      realized,
      unrealized,
      income: { totalsByCurrency: income.totalsByCurrency },
      economicPnl,
      contribution,
      limitations,
    };
  }
}
