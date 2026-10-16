import { PrismaClient, Prisma } from '@prisma/client';
import { LocalDate } from '@atlas/domain';
import {
  IMarketQuoteRepository,
  MarketQuoteRecordRow,
  MarketQuoteRevisionRecordRow,
  MarketQuoteUpsertInput,
  MarketQuoteUpsertOutcome,
} from './interfaces';

export class PrismaMarketQuoteRepository implements IMarketQuoteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private mapQuoteRow(row: {
    id: string;
    assetId: string;
    tradingDate: Date;
    currency: string;
    open: Prisma.Decimal | null;
    high: Prisma.Decimal | null;
    low: Prisma.Decimal | null;
    close: Prisma.Decimal;
    adjustedClose: Prisma.Decimal | null;
    volume: Prisma.Decimal | null;
    provider: string;
    providerSymbol: string;
    firstFetchedAt: Date;
    lastFetchedAt: Date;
    fetchCount: number;
    revisedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): MarketQuoteRecordRow {
    return {
      id: row.id,
      assetId: row.assetId,
      tradingDate: LocalDate.fromParts(
        row.tradingDate.getUTCFullYear(),
        row.tradingDate.getUTCMonth() + 1,
        row.tradingDate.getUTCDate(),
      ),
      currency: row.currency,
      open: row.open ? row.open.toString() : null,
      high: row.high ? row.high.toString() : null,
      low: row.low ? row.low.toString() : null,
      close: row.close.toString(),
      adjustedClose: row.adjustedClose ? row.adjustedClose.toString() : null,
      volume: row.volume ? row.volume.toString() : null,
      provider: row.provider,
      providerSymbol: row.providerSymbol,
      firstFetchedAt: row.firstFetchedAt,
      lastFetchedAt: row.lastFetchedAt,
      fetchCount: row.fetchCount,
      revisedAt: row.revisedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapRevisionRow(row: {
    id: string;
    marketQuoteId: string;
    changedAt: Date;
    priorOpen: Prisma.Decimal | null;
    priorHigh: Prisma.Decimal | null;
    priorLow: Prisma.Decimal | null;
    priorClose: Prisma.Decimal;
    priorAdjustedClose: Prisma.Decimal | null;
    priorVolume: Prisma.Decimal | null;
    newOpen: Prisma.Decimal | null;
    newHigh: Prisma.Decimal | null;
    newLow: Prisma.Decimal | null;
    newClose: Prisma.Decimal;
    newAdjustedClose: Prisma.Decimal | null;
    newVolume: Prisma.Decimal | null;
    reason: string | null;
    createdAt: Date;
  }): MarketQuoteRevisionRecordRow {
    return {
      id: row.id,
      marketQuoteId: row.marketQuoteId,
      changedAt: row.changedAt,
      priorOpen: row.priorOpen ? row.priorOpen.toString() : null,
      priorHigh: row.priorHigh ? row.priorHigh.toString() : null,
      priorLow: row.priorLow ? row.priorLow.toString() : null,
      priorClose: row.priorClose.toString(),
      priorAdjustedClose: row.priorAdjustedClose ? row.priorAdjustedClose.toString() : null,
      priorVolume: row.priorVolume ? row.priorVolume.toString() : null,
      newOpen: row.newOpen ? row.newOpen.toString() : null,
      newHigh: row.newHigh ? row.newHigh.toString() : null,
      newLow: row.newLow ? row.newLow.toString() : null,
      newClose: row.newClose.toString(),
      newAdjustedClose: row.newAdjustedClose ? row.newAdjustedClose.toString() : null,
      newVolume: row.newVolume ? row.newVolume.toString() : null,
      reason: row.reason,
      createdAt: row.createdAt,
    };
  }

  async findLatest(assetId: string, provider?: string): Promise<MarketQuoteRecordRow | null> {
    const where: Prisma.MarketQuoteRecordWhereInput = {
      assetId,
      ...(provider ? { provider } : {}),
    };
    const row = await this.prisma.marketQuoteRecord.findFirst({
      where,
      orderBy: { tradingDate: 'desc' },
    });
    return row ? this.mapQuoteRow(row) : null;
  }

  async findLatestByAssets(
    assetIds: readonly string[],
    provider?: string,
  ): Promise<Map<string, MarketQuoteRecordRow>> {
    const map = new Map<string, MarketQuoteRecordRow>();
    if (assetIds.length === 0) return map;

    // Fetch latest quote for each asset
    for (const assetId of assetIds) {
      const latest = await this.findLatest(assetId, provider);
      if (latest) {
        map.set(assetId, latest);
      }
    }
    return map;
  }

  async findByAssetDate(
    assetId: string,
    tradingDate: LocalDate,
    provider?: string,
  ): Promise<MarketQuoteRecordRow | null> {
    const jsDate = new Date(Date.UTC(tradingDate.year, tradingDate.month - 1, tradingDate.day));
    const where: Prisma.MarketQuoteRecordWhereInput = {
      assetId,
      tradingDate: jsDate,
      ...(provider ? { provider } : {}),
    };
    const row = await this.prisma.marketQuoteRecord.findFirst({
      where,
      orderBy: { lastFetchedAt: 'desc' },
    });
    return row ? this.mapQuoteRow(row) : null;
  }

  async findRange(
    assetId: string,
    from: LocalDate,
    to: LocalDate,
    provider?: string,
  ): Promise<MarketQuoteRecordRow[]> {
    const fromJs = new Date(Date.UTC(from.year, from.month - 1, from.day));
    const toJs = new Date(Date.UTC(to.year, to.month - 1, to.day));

    const rows = await this.prisma.marketQuoteRecord.findMany({
      where: {
        assetId,
        tradingDate: {
          gte: fromJs,
          lte: toJs,
        },
        ...(provider ? { provider } : {}),
      },
      orderBy: { tradingDate: 'asc' },
    });
    return rows.map((r) => this.mapQuoteRow(r));
  }

  async upsertQuote(input: MarketQuoteUpsertInput): Promise<{
    outcome: MarketQuoteUpsertOutcome;
    quote: MarketQuoteRecordRow;
    revision?: MarketQuoteRevisionRecordRow;
  }> {
    const jsDate = new Date(
      Date.UTC(input.tradingDate.year, input.tradingDate.month - 1, input.tradingDate.day),
    );

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.marketQuoteRecord.findUnique({
        where: {
          assetId_tradingDate_provider: {
            assetId: input.assetId,
            tradingDate: jsDate,
            provider: input.provider,
          },
        },
      });

      if (!existing) {
        // CASE A: Fresh insert
        const created = await tx.marketQuoteRecord.create({
          data: {
            assetId: input.assetId,
            tradingDate: jsDate,
            currency: input.currency,
            open: input.open ? new Prisma.Decimal(input.open) : null,
            high: input.high ? new Prisma.Decimal(input.high) : null,
            low: input.low ? new Prisma.Decimal(input.low) : null,
            close: new Prisma.Decimal(input.close),
            adjustedClose: input.adjustedClose ? new Prisma.Decimal(input.adjustedClose) : null,
            volume: input.volume ? new Prisma.Decimal(input.volume) : null,
            provider: input.provider,
            providerSymbol: input.providerSymbol,
            fetchCount: 1,
            firstFetchedAt: new Date(),
            lastFetchedAt: new Date(),
          },
        });

        return {
          outcome: 'INSERTED',
          quote: this.mapQuoteRow(created),
        };
      }

      // Check whether numeric prices actually changed
      const closeChanged = !existing.close.equals(new Prisma.Decimal(input.close));
      const openChanged =
        (existing.open === null && input.open !== null && input.open !== undefined) ||
        (existing.open !== null &&
          (input.open === null ||
            input.open === undefined ||
            !existing.open.equals(new Prisma.Decimal(input.open))));
      const highChanged =
        (existing.high === null && input.high !== null && input.high !== undefined) ||
        (existing.high !== null &&
          (input.high === null ||
            input.high === undefined ||
            !existing.high.equals(new Prisma.Decimal(input.high))));
      const lowChanged =
        (existing.low === null && input.low !== null && input.low !== undefined) ||
        (existing.low !== null &&
          (input.low === null ||
            input.low === undefined ||
            !existing.low.equals(new Prisma.Decimal(input.low))));
      const adjCloseChanged =
        (existing.adjustedClose === null &&
          input.adjustedClose !== null &&
          input.adjustedClose !== undefined) ||
        (existing.adjustedClose !== null &&
          (input.adjustedClose === null ||
            input.adjustedClose === undefined ||
            !existing.adjustedClose.equals(new Prisma.Decimal(input.adjustedClose))));
      const volumeChanged =
        (existing.volume === null && input.volume !== null && input.volume !== undefined) ||
        (existing.volume !== null &&
          (input.volume === null ||
            input.volume === undefined ||
            !existing.volume.equals(new Prisma.Decimal(input.volume))));

      const priceChanged =
        closeChanged ||
        openChanged ||
        highChanged ||
        lowChanged ||
        adjCloseChanged ||
        volumeChanged;

      if (!priceChanged) {
        // CASE B: Identical refetch
        const updated = await tx.marketQuoteRecord.update({
          where: { id: existing.id },
          data: {
            lastFetchedAt: new Date(),
            fetchCount: { increment: 1 },
          },
        });
        return {
          outcome: 'UNCHANGED',
          quote: this.mapQuoteRow(updated),
        };
      }

      // CASE C: Price revision detected -> Record revision audit row and update
      const revision = await tx.marketQuoteRevisionRecord.create({
        data: {
          marketQuoteId: existing.id,
          priorOpen: existing.open,
          priorHigh: existing.high,
          priorLow: existing.low,
          priorClose: existing.close,
          priorAdjustedClose: existing.adjustedClose,
          priorVolume: existing.volume,
          newOpen: input.open ? new Prisma.Decimal(input.open) : null,
          newHigh: input.high ? new Prisma.Decimal(input.high) : null,
          newLow: input.low ? new Prisma.Decimal(input.low) : null,
          newClose: new Prisma.Decimal(input.close),
          newAdjustedClose: input.adjustedClose ? new Prisma.Decimal(input.adjustedClose) : null,
          newVolume: input.volume ? new Prisma.Decimal(input.volume) : null,
          reason: input.reason ?? 'Provider published revised EOD data',
        },
      });

      const updated = await tx.marketQuoteRecord.update({
        where: { id: existing.id },
        data: {
          currency: input.currency,
          open: input.open ? new Prisma.Decimal(input.open) : null,
          high: input.high ? new Prisma.Decimal(input.high) : null,
          low: input.low ? new Prisma.Decimal(input.low) : null,
          close: new Prisma.Decimal(input.close),
          adjustedClose: input.adjustedClose ? new Prisma.Decimal(input.adjustedClose) : null,
          volume: input.volume ? new Prisma.Decimal(input.volume) : null,
          providerSymbol: input.providerSymbol,
          lastFetchedAt: new Date(),
          revisedAt: new Date(),
          fetchCount: { increment: 1 },
        },
      });

      return {
        outcome: 'REVISED',
        quote: this.mapQuoteRow(updated),
        revision: this.mapRevisionRow(revision),
      };
    });
  }

  async listRevisions(marketQuoteId: string): Promise<MarketQuoteRevisionRecordRow[]> {
    const rows = await this.prisma.marketQuoteRevisionRecord.findMany({
      where: { marketQuoteId },
      orderBy: { changedAt: 'desc' },
    });
    return rows.map((r) => this.mapRevisionRow(r));
  }
}
