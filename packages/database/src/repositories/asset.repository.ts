import { PrismaClient } from '@prisma/client';
import { Asset } from '@atlas/domain';
import { IAssetRepository } from './interfaces';
import { AssetMapper } from '../mappers/asset.mapper';
import { getPrismaClient } from '../client';

export class AssetRepository implements IAssetRepository {
  constructor(private readonly prisma: PrismaClient = getPrismaClient()) {}

  async findById(id: string): Promise<Asset | null> {
    const raw = await this.prisma.asset.findUnique({ where: { id } });
    return raw ? AssetMapper.toDomain(raw) : null;
  }

  async findByIds(ids: readonly string[]): Promise<Asset[]> {
    if (ids.length === 0) return [];
    const raws = await this.prisma.asset.findMany({ where: { id: { in: [...ids] } } });
    return raws.map((raw) => AssetMapper.toDomain(raw));
  }

  async findByTicker(ticker: string): Promise<Asset | null> {
    const normalized = ticker.trim().toUpperCase();
    const raw = await this.prisma.asset.findFirst({ where: { ticker: normalized } });
    return raw ? AssetMapper.toDomain(raw) : null;
  }

  async findByTickerAndExchange(ticker: string, exchange: string): Promise<Asset | null> {
    const raw = await this.prisma.asset.findUnique({
      where: {
        ticker_exchange: {
          ticker: ticker.trim().toUpperCase(),
          exchange: exchange.trim().toUpperCase(),
        },
      },
    });
    return raw ? AssetMapper.toDomain(raw) : null;
  }

  async findAllByTicker(ticker: string): Promise<Asset[]> {
    const normalized = ticker.trim().toUpperCase();
    const raws = await this.prisma.asset.findMany({
      where: { ticker: normalized },
      orderBy: { exchange: 'asc' },
    });
    return raws.map((raw) => AssetMapper.toDomain(raw));
  }

  async create(asset: Asset): Promise<Asset> {
    const created = await this.prisma.asset.create({
      data: AssetMapper.toPersistence(asset),
    });
    return AssetMapper.toDomain(created);
  }

  async list(): Promise<Asset[]> {
    const items = await this.prisma.asset.findMany({
      orderBy: { ticker: 'asc' },
    });
    return items.map((item) => AssetMapper.toDomain(item));
  }
}
