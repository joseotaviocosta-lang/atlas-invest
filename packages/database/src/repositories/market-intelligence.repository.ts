import { PrismaClient, Prisma } from '@prisma/client';
import {
  IMarketIntelligenceRepository,
  MarketIntelligenceRecord,
  MarketIntelligenceFilter,
  PaginationOptions,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

export class MarketIntelligenceRepository implements IMarketIntelligenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private mapToRecord(item: {
    id: string;
    sourceProvider: string;
    sourceType: string;
    sourceItemId: string;
    headline: string;
    excerpt: string | null;
    canonicalUrl: string | null;
    publishedAt: Date;
    retrievedAt: Date;
    category: string;
    language: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    assetLinks?: Array<{ assetId: string }>;
  }): MarketIntelligenceRecord {
    return {
      id: item.id,
      sourceProvider: item.sourceProvider,
      sourceType: item.sourceType,
      sourceItemId: item.sourceItemId,
      headline: item.headline,
      excerpt: item.excerpt,
      canonicalUrl: item.canonicalUrl,
      publishedAt: item.publishedAt,
      retrievedAt: item.retrievedAt,
      category: item.category,
      language: item.language,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      linkedAssetIds: (item.assetLinks ?? []).map((l) => l.assetId),
    };
  }

  async upsertItem(
    item: {
      sourceProvider: string;
      sourceType: string;
      sourceItemId: string;
      headline: string;
      excerpt?: string;
      canonicalUrl?: string;
      publishedAt: Date;
      category: string;
      language?: string;
      status?: string;
    },
    linkedAssetIds: string[] = [],
  ): Promise<MarketIntelligenceRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const persisted = await tx.marketIntelligenceItem.upsert({
          where: {
            source_provider_item_id_unique: {
              sourceProvider: item.sourceProvider,
              sourceItemId: item.sourceItemId,
            },
          },
          update: {
            sourceType: item.sourceType,
            headline: item.headline,
            excerpt: item.excerpt ?? null,
            canonicalUrl: item.canonicalUrl ?? null,
            publishedAt: item.publishedAt,
            category: item.category,
            language: item.language ?? 'pt-BR',
            status: item.status ?? 'ACTIVE',
          },
          create: {
            sourceProvider: item.sourceProvider,
            sourceType: item.sourceType,
            sourceItemId: item.sourceItemId,
            headline: item.headline,
            excerpt: item.excerpt ?? null,
            canonicalUrl: item.canonicalUrl ?? null,
            publishedAt: item.publishedAt,
            category: item.category,
            language: item.language ?? 'pt-BR',
            status: item.status ?? 'ACTIVE',
          },
        });

        // Upsert asset links deterministically
        if (linkedAssetIds.length > 0) {
          for (const assetId of linkedAssetIds) {
            await tx.marketIntelligenceAssetLink.upsert({
              where: {
                item_asset_link_unique: {
                  marketIntelligenceItemId: persisted.id,
                  assetId,
                },
              },
              update: {},
              create: {
                marketIntelligenceItemId: persisted.id,
                assetId,
              },
            });
          }
        }

        const links = await tx.marketIntelligenceAssetLink.findMany({
          where: { marketIntelligenceItemId: persisted.id },
          select: { assetId: true },
        });

        return this.mapToRecord({
          ...persisted,
          assetLinks: links,
        });
      });
    } catch (error) {
      throw new PersistenceError(
        `Failed to upsert market intelligence item: ${(error as Error).message}`,
      );
    }
  }

  async batchUpsertItems(
    items: Array<{
      item: {
        sourceProvider: string;
        sourceType: string;
        sourceItemId: string;
        headline: string;
        excerpt?: string;
        canonicalUrl?: string;
        publishedAt: Date;
        category: string;
        language?: string;
        status?: string;
      };
      linkedAssetIds?: string[];
    }>,
  ): Promise<{ accepted: number; duplicates: number }> {
    let accepted = 0;
    let duplicates = 0;

    for (const entry of items) {
      const existing = await this.findByProviderAndItemId(
        entry.item.sourceProvider,
        entry.item.sourceItemId,
      );
      if (existing) {
        duplicates++;
      } else {
        accepted++;
      }
      await this.upsertItem(entry.item, entry.linkedAssetIds ?? []);
    }

    return { accepted, duplicates };
  }

  async findById(id: string): Promise<MarketIntelligenceRecord | null> {
    try {
      const item = await this.prisma.marketIntelligenceItem.findUnique({
        where: { id },
        include: {
          assetLinks: { select: { assetId: true } },
        },
      });
      return item ? this.mapToRecord(item) : null;
    } catch (error) {
      throw new PersistenceError(
        `Failed to find market intelligence item by id: ${(error as Error).message}`,
      );
    }
  }

  async findByProviderAndItemId(
    sourceProvider: string,
    sourceItemId: string,
  ): Promise<MarketIntelligenceRecord | null> {
    try {
      const item = await this.prisma.marketIntelligenceItem.findUnique({
        where: {
          source_provider_item_id_unique: {
            sourceProvider,
            sourceItemId,
          },
        },
        include: {
          assetLinks: { select: { assetId: true } },
        },
      });
      return item ? this.mapToRecord(item) : null;
    } catch (error) {
      throw new PersistenceError(
        `Failed to find market intelligence item by provider and item id: ${(error as Error).message}`,
      );
    }
  }

  async list(
    filter?: MarketIntelligenceFilter,
    pagination?: PaginationOptions,
  ): Promise<{ items: MarketIntelligenceRecord[]; nextCursor?: string; hasMore: boolean }> {
    try {
      const where: Prisma.MarketIntelligenceItemWhereInput = {};

      if (filter?.status) {
        where.status = filter.status;
      }

      if (filter?.category) {
        where.category = filter.category;
      }

      if (filter?.from || filter?.to) {
        where.publishedAt = {};
        if (filter.from) where.publishedAt.gte = filter.from;
        if (filter.to) where.publishedAt.lte = filter.to;
      }

      if (filter?.assetId) {
        where.assetLinks = {
          some: { assetId: filter.assetId },
        };
      } else if (filter?.assetIds && filter.assetIds.length > 0) {
        where.assetLinks = {
          some: { assetId: { in: filter.assetIds } },
        };
      }

      const limit = Math.min(pagination?.limit ?? 20, 50);

      const queryArgs: Prisma.MarketIntelligenceItemFindManyArgs = {
        where,
        take: limit + 1,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        include: {
          assetLinks: { select: { assetId: true } },
        },
      };

      if (pagination?.cursor) {
        queryArgs.cursor = { id: pagination.cursor };
        queryArgs.skip = 1;
      }

      const rows = await this.prisma.marketIntelligenceItem.findMany(queryArgs);
      const hasMore = rows.length > limit;
      const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => this.mapToRecord(r));
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]?.id : undefined;

      return {
        items,
        nextCursor,
        hasMore,
      };
    } catch (error) {
      throw new PersistenceError(
        `Failed to list market intelligence items: ${(error as Error).message}`,
      );
    }
  }
}
