import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type {
  IAssetRepository,
  IPortfolioRepository,
  ITransactionRepository,
} from '@atlas/database';
import type { Transaction } from '@atlas/domain';
import { replayPortfolio } from '@atlas/portfolio-engine';
import {
  addDecimals,
  aggregateIncomeTotals,
  bucketIncomeByMonth,
  enumerateGoalMonths,
  incomeShareBp,
  isIncomeEventType,
  rankIncomeRows,
  INCOME_EVENT_TYPES,
  MAX_INCOME_MONTHS,
  type IncomeLedgerRow,
} from '@atlas/portfolio-strategy';
import { addMonthsIso } from '@atlas/portfolio-strategy';
import {
  ASSET_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';

const MAX_SERIES_RANGE_DAYS = 5 * 366;

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

/**
 * Phase 5R-D — portfolio income intelligence (read-only).
 *
 * One portfolio ledger scan plus one batched asset lookup, then pure
 * aggregation: per-currency totals, monthly buckets, by-position ranking
 * with portfolio share, and top-3 concentration. Closed positions stay
 * included (their income happened); unknown-asset rows are labeled, not
 * dropped, so totals always reconcile.
 */
@Injectable()
export class GetPortfolioIncomeUseCase {
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

    // Single portfolio ledger scan: everything below derives from these
    // rows. No per-position, per-month or per-type queries.
    const ledger = await this.transactions.findByPortfolioId(params.portfolioId);
    const inPeriod = ledger
      .map(toIncomeRow)
      .filter(
        (row): row is IncomeLedgerRow =>
          row !== null && row.tradeDate >= startStr && row.tradeDate <= endStr,
      );
    const incomeEvents = inPeriod.filter((row) =>
      (INCOME_EVENT_TYPES as readonly string[]).includes(row.type),
    );

    // Open positions at period end (single replay): closed positions keep
    // their income rows but get no navigation CTA.
    const replayed = replayPortfolio({
      portfolioId: params.portfolioId,
      transactions: ledger,
      asOfDate: endStr,
    });
    const openAssetIds = new Set<string>();
    for (const [assetId] of replayed.state.assets) openAssetIds.add(String(assetId));

    const assetIds = [...new Set(incomeEvents.map((row) => row.assetId as string))];
    const assetMetas = await this.assets.findByIds(assetIds);
    const metaById = new Map(assetMetas.map((asset) => [String(asset.id), asset]));

    const totalsByCurrency = aggregateIncomeTotals(incomeEvents);
    const timeline = bucketIncomeByMonth(incomeEvents, months);

    // By-position ranking with portfolio share (same currency, same period).
    // Ranked within each currency (raw amounts are not comparable across
    // currencies); groups ordered by currency for determinism.
    const totalsByAsset = new Map<string, { total: string; currency: string; count: number }>();
    for (const row of incomeEvents) {
      if (typeof row.amount !== 'string' || row.assetId === null) continue;
      const existing = totalsByAsset.get(row.assetId);
      if (existing) {
        existing.total = addDecimals(existing.total, row.amount);
        existing.count += 1;
      } else {
        totalsByAsset.set(row.assetId, { total: row.amount, currency: row.currency, count: 1 });
      }
    }
    const totalsByCurrencyMap = new Map(totalsByCurrency.map((row) => [row.currency, row.total]));
    const rowsByCurrency = new Map<
      string,
      Array<{
        assetId: string;
        ticker: string | null;
        currency: string;
        total: string;
        eventCount: number;
        isOpen: boolean;
        hasDetail: boolean;
      }>
    >();
    for (const [assetId, entry] of totalsByAsset) {
      const row = {
        assetId,
        ticker: metaById.get(assetId)?.ticker ?? null,
        currency: entry.currency,
        total: entry.total,
        eventCount: entry.count,
        isOpen: openAssetIds.has(assetId),
        hasDetail: openAssetIds.has(assetId) && metaById.has(assetId),
      };
      const list = rowsByCurrency.get(entry.currency);
      if (list) list.push(row);
      else rowsByCurrency.set(entry.currency, [row]);
    }
    const byPosition: Array<{
      assetId: string;
      ticker: string | null;
      currency: string;
      total: string;
      eventCount: number;
      isOpen: boolean;
      hasDetail: boolean;
      rank: number;
      shareBp: string | null;
    }> = [];
    for (const currency of [...rowsByCurrency.keys()].sort()) {
      const group = rowsByCurrency.get(currency) ?? [];
      const ranked = rankIncomeRows(
        group,
        (row) => row.total,
        (row) => row.assetId,
        group.length,
      );
      for (const { rank, row } of ranked) {
        byPosition.push({
          ...row,
          rank,
          shareBp: incomeShareBp(row.total, totalsByCurrencyMap.get(row.currency) ?? '0'),
        });
      }
    }

    const concentrationByCurrency = totalsByCurrency.map((row) => {
      const inCurrency = byPosition.filter((position) => position.currency === row.currency);
      const top3 = inCurrency.slice(0, 3);
      let top3Sum = '0';
      for (const position of top3) {
        top3Sum = addDecimals(top3Sum, position.total);
      }
      return {
        currency: row.currency,
        largest:
          inCurrency.length > 0
            ? {
                assetId: inCurrency[0]!.assetId,
                ticker: inCurrency[0]!.ticker,
                total: inCurrency[0]!.total,
                shareBp: incomeShareBp(inCurrency[0]!.total, row.total),
              }
            : null,
        top3ShareBp: top3.length > 0 ? incomeShareBp(top3Sum, row.total) : null,
        top3: top3.map((position, index) => ({
          assetId: position.assetId,
          ticker: position.ticker,
          total: position.total,
          shareBp: incomeShareBp(position.total, row.total),
          rank: index + 1,
        })),
      };
    });

    const limitations: string[] = [];
    if (incomeEvents.length === 0) limitations.push('NO_INCOME_IN_PERIOD');

    // Earliest income ever (any period): for the UI INCEPTION preset anchor.
    // Bounded history scan over canonical rows already loaded above.
    let inceptionDate: string | null = null;
    for (const row of ledger) {
      const parsed = toIncomeRow(row);
      if (!parsed || !isIncomeEventType(parsed.type) || typeof parsed.amount !== 'string') continue;
      if (inceptionDate === null || parsed.tradeDate < inceptionDate) {
        inceptionDate = parsed.tradeDate;
      }
    }

    return {
      portfolioId: params.portfolioId,
      generatedAt: new Date().toISOString(),
      marketDataAsOf: null,
      period: { startDate: startStr, endDate: endStr, months },
      inceptionDate,
      totalsByCurrency,
      timeline,
      byPosition,
      concentration: concentrationByCurrency,
      limitations,
    };
  }
}
