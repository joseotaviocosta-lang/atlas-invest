import { PrismaClient } from '@prisma/client';
import { IWatchlistRepository, WatchlistItemRow } from './interfaces';
import { getPrismaClient } from '../client';

export class WatchlistRepository implements IWatchlistRepository {
  constructor(private readonly prisma: PrismaClient = getPrismaClient()) {}

  async add(userId: string, assetId: string): Promise<WatchlistItemRow> {
    const item = await this.prisma.watchlistItem.upsert({
      where: {
        userId_assetId: {
          userId,
          assetId,
        },
      },
      update: {},
      create: {
        userId,
        assetId,
      },
      include: {
        asset: {
          select: {
            id: true,
            ticker: true,
            name: true,
            type: true,
            currency: true,
            exchange: true,
          },
        },
      },
    });

    return {
      id: item.id,
      userId: item.userId,
      assetId: item.assetId,
      createdAt: item.createdAt,
      asset: item.asset,
    };
  }

  async remove(userId: string, assetId: string): Promise<boolean> {
    try {
      await this.prisma.watchlistItem.delete({
        where: {
          userId_assetId: {
            userId,
            assetId,
          },
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  async listByUser(userId: string): Promise<WatchlistItemRow[]> {
    const items = await this.prisma.watchlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        asset: {
          select: {
            id: true,
            ticker: true,
            name: true,
            type: true,
            currency: true,
            exchange: true,
          },
        },
      },
    });

    return items.map((item) => ({
      id: item.id,
      userId: item.userId,
      assetId: item.assetId,
      createdAt: item.createdAt,
      asset: item.asset,
    }));
  }

  async isWatched(userId: string, assetId: string): Promise<boolean> {
    const count = await this.prisma.watchlistItem.count({
      where: {
        userId,
        assetId,
      },
    });
    return count > 0;
  }

  async findByUserAndAsset(userId: string, assetId: string): Promise<WatchlistItemRow | null> {
    const item = await this.prisma.watchlistItem.findUnique({
      where: {
        userId_assetId: {
          userId,
          assetId,
        },
      },
      include: {
        asset: {
          select: {
            id: true,
            ticker: true,
            name: true,
            type: true,
            currency: true,
            exchange: true,
          },
        },
      },
    });

    if (!item) return null;

    return {
      id: item.id,
      userId: item.userId,
      assetId: item.assetId,
      createdAt: item.createdAt,
      asset: item.asset,
    };
  }
}
