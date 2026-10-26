import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type {
  IAssetRepository,
  IPortfolioRepository,
  ITransactionRepository,
} from '@atlas/database';
import type { Transaction } from '@atlas/domain';
import { LocalDate } from '@atlas/domain';
import { replayPortfolioTimeline, type PortfolioState } from '@atlas/portfolio-engine';
import {
  aggregateIncomeTotals,
  bucketIncomeByMonth,
  enumerateGoalMonths,
  incomeShareBp,
  INCOME_EVENT_TYPES,
  MAX_INCOME_MONTHS,
  type IncomeCurrencyTotal,
  type IncomeLedgerRow,
} from '@atlas/portfolio-strategy';
import { addMonthsIso } from '@atlas/portfolio-strategy';
import {
  ASSET_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';

const MAX_SERIES_RANGE_DAYS = 5 * 366;
/** Parity with the 5R-A position detail surface (recent income rows). */
const POSITION_INCOME_RECENT_LIMIT = 5;

function invalidPeriod(message: string): never {
  throw new BadRequestException({ message, code: 'PERFORMANCE.INVALID_PERIOD' });
}

/** Local civil "today" as `YYYY-MM-DD` from wall-clock fields (no instants). */
function todayCivilString(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function parseCivilDate(raw: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    invalidPeriod(`Invalid ${label} date '${raw}'. Expected YYYY-MM-DD.`);
  }
  return raw;
}

type RawTx = {
  id?: { toString(): string };
  type?: string;
  tradeDate?: { toString(): string };
  currency?: string;
  assetId?: { toString(): string };
  amount?: { amount?: string };
  createdAt?: Date | string;
};

function toIncomeRow(tx: Transaction): IncomeLedgerRow | null {
  const raw = tx as unknown as RawTx;
  const id = raw.id?.toString();
  const tradeDate = raw.tradeDate?.toString();
  const assetId = raw.assetId?.toString();
  if (typeof id !== 'string' || typeof tradeDate !== 'string' || typeof assetId !== 'string') {
    return null;
  }
  return {
    id,
    assetId,
    tradeDate,
    type: typeof raw.type === 'string' ? raw.type : '',
    amount: raw.amount?.amount ?? null,
    currency: typeof raw.currency === 'string' ? raw.currency : '',
    createdAt:
      raw.createdAt instanceof Date
        ? raw.createdAt.toISOString()
        : typeof raw.createdAt === 'string'
          ? raw.createdAt
          : '',
  };
}

function isIncomeRow(row: IncomeLedgerRow): boolean {
  return (
    (INCOME_EVENT_TYPES as readonly string[]).includes(row.type) && typeof row.amount === 'string'
  );
}

/**
 * Phase 5R-D — position income intelligence (read-only).
 *
 * Canonical income for one open position over its current holding
 * lifecycle (5R-B semantics: inception is the first event after the last
 * zero-quantity date; earlier lifecycles stay out of position totals but
 * remain in the portfolio aggregate). Timeline, by-type totals, recent
 * events and the position share of known portfolio income in the same
 * currency and period. Facts only — nothing projected, nothing recommended.
 */
@Injectable()
export class GetPositionIncomeUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assets: IAssetRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactions: ITransactionRepository,
  ) {}

  async execute(params: {
    portfolioId: string;
    assetId: string;
    userId: string;
    startDate?: string;
    endDate?: string;
    today?: string;
  }) {
    const portfolio = params.userId
      ? await this.portfolios.findByIdAndUserId(params.portfolioId, params.userId)
      : await this.portfolios.findById(params.portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', params.portfolioId);
    }
    const assetMetas = await this.assets.findByIds([params.assetId]);
    if (assetMetas.length === 0) {
      throw new EntityNotFoundError('Position', params.assetId);
    }

    const today = params.today ?? todayCivilString();
    const endStr = params.endDate ? parseCivilDate(params.endDate, 'endDate') : today;
    const startStr = params.startDate
      ? parseCivilDate(params.startDate, 'startDate')
      : addMonthsIso(endStr, -12);
    if (startStr > endStr) {
      invalidPeriod(`Invalid period: startDate '${startStr}' is after endDate '${endStr}'.`);
    }
    if (endStr > today) {
      invalidPeriod(`Invalid period: endDate '${endStr}' is in the future.`);
    }
    const startDay = Date.UTC(
      Number(startStr.slice(0, 4)),
      Number(startStr.slice(5, 7)) - 1,
      Number(startStr.slice(8, 10)),
    );
    const endDay = Date.UTC(
      Number(endStr.slice(0, 4)),
      Number(endStr.slice(5, 7)) - 1,
      Number(endStr.slice(8, 10)),
    );
    if (Math.round((endDay - startDay) / 86_400_000) > MAX_SERIES_RANGE_DAYS) {
      invalidPeriod('Invalid period: range exceeds five years.');
    }
    const months = enumerateGoalMonths({ start: startStr, end: endStr }, [], MAX_INCOME_MONTHS + 1);
    if (months.length === 0 || months.length > MAX_INCOME_MONTHS) {
      invalidPeriod('Invalid period: month grid exceeds bounds.');
    }

    // Full ledger once: snapshots, lifecycle and income all derive from it.
    const ledger = await this.transactions.findByPortfolioId(params.portfolioId);
    const rows = ledger.map(toIncomeRow).filter((row): row is IncomeLedgerRow => row !== null);
    const assetRows = rows.filter((row) => row.assetId === params.assetId);
    const assetTradeDatesAll = [...new Set(assetRows.map((row) => row.tradeDate))].sort();
    if (assetTradeDatesAll.length === 0) {
      throw new EntityNotFoundError('Position', params.assetId);
    }
    const assetTradeDates = assetTradeDatesAll.filter((date) => date <= endStr);

    // Grid: requested bounds + month starts inside + every target trade
    // date (same lifecycle anchoring as 5R-B).
    const boundarySet = new Set<string>([startStr]);
    for (const monthKey of months.slice(1)) {
      const first = `${monthKey}-01`;
      if (first > startStr && first <= endStr) boundarySet.add(first);
    }
    boundarySet.add(endStr);
    const gridDates = [...new Set([...boundarySet, ...assetTradeDates])].sort();

    const { snapshots } = replayPortfolioTimeline({
      portfolioId: params.portfolioId,
      transactions: ledger,
      asOfDates: gridDates.map((date) => LocalDate.from(date)),
    });
    const stateByDate = new Map<string, PortfolioState>();
    for (const snapshot of snapshots) {
      stateByDate.set(snapshot.asOfDate.toString(), snapshot.state);
    }
    const quantityAt = (date: string): boolean => {
      const position = stateByDate.get(date)?.assets.get(params.assetId);
      return position !== undefined && !position.quantity.isZero();
    };

    // Holding lifecycle (5R-B semantics): inception is the first event
    // after the last zero-quantity date. A close + reopen starts fresh.
    let lastZeroDate: string | null = null;
    for (const date of gridDates) {
      if (!quantityAt(date)) lastZeroDate = date;
    }
    const inception =
      assetTradeDatesAll.find((date) => lastZeroDate === null || date > lastZeroDate) ?? null;
    if (inception === null) {
      throw new EntityNotFoundError('Position', params.assetId);
    }

    // Closed (or never-opened) at period end: no position detail, like 5R-B.
    if (!quantityAt(endStr)) {
      if (endStr < inception) {
        return {
          portfolioId: params.portfolioId,
          assetId: params.assetId,
          generatedAt: new Date().toISOString(),
          marketDataAsOf: null,
          period: { startDate: startStr, endDate: endStr, months },
          inceptionDate: inception,
          lifecycle: { inceptionDate: inception, isOpenAtEnd: false },
          totalsByCurrency: [] as IncomeCurrencyTotal[],
          timeline: months.map((month) => ({ month, totals: [] as IncomeCurrencyTotal[] })),
          recentEvents: [],
          eventCount: 0,
          portfolioShare: [] as Array<{ currency: string; shareBp: string | null }>,
          limitations: ['NO_POSITION_IN_PERIOD'],
        };
      }
      throw new EntityNotFoundError('Position', params.assetId);
    }

    const effectiveStart = inception > startStr ? inception : startStr;
    const lifecycleEvents = rows.filter(
      (row) =>
        row.assetId === params.assetId &&
        row.tradeDate >= effectiveStart &&
        row.tradeDate <= endStr &&
        isIncomeRow(row),
    );
    const portfolioEvents = rows.filter(
      (row) => row.tradeDate >= startStr && row.tradeDate <= endStr && isIncomeRow(row),
    );

    const totalsByCurrency = aggregateIncomeTotals(lifecycleEvents);
    const portfolioTotals = aggregateIncomeTotals(portfolioEvents);
    const portfolioTotalsMap = new Map(portfolioTotals.map((row) => [row.currency, row.total]));
    const timelineBuckets = bucketIncomeByMonth(lifecycleEvents, months);

    const recentEvents = [...lifecycleEvents]
      .sort((a, b) => {
        if (a.tradeDate !== b.tradeDate) return a.tradeDate < b.tradeDate ? 1 : -1;
        if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
        return a.id < b.id ? 1 : -1;
      })
      .slice(0, POSITION_INCOME_RECENT_LIMIT)
      .map((row) => ({
        transactionId: row.id,
        tradeDate: row.tradeDate,
        type: row.type,
        amount: row.amount as string,
        currency: row.currency,
      }));

    const limitations: string[] = [];
    if (lifecycleEvents.length === 0) limitations.push('NO_INCOME_IN_PERIOD');
    if (totalsByCurrency.length > 1) limitations.push('MULTI_CURRENCY_INCOME');

    return {
      portfolioId: params.portfolioId,
      assetId: params.assetId,
      generatedAt: new Date().toISOString(),
      marketDataAsOf: null,
      period: { startDate: startStr, endDate: endStr, months },
      inceptionDate: inception,
      lifecycle: { inceptionDate: inception, isOpenAtEnd: true },
      totalsByCurrency,
      timeline: timelineBuckets,
      recentEvents,
      eventCount: lifecycleEvents.length,
      portfolioShare: totalsByCurrency.map((row) => ({
        currency: row.currency,
        shareBp: incomeShareBp(row.total, portfolioTotalsMap.get(row.currency) ?? '0'),
      })),
      limitations,
    };
  }
}
