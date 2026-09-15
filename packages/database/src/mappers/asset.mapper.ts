import { Asset as PrismaAsset, Prisma } from '@prisma/client';
import { Asset, AssetType } from '@atlas/domain';

export class AssetMapper {
  static toDomain(raw: PrismaAsset): Asset {
    return Asset.create({
      id: raw.id,
      ticker: raw.ticker,
      name: raw.name,
      type: raw.type as AssetType,
      currency: raw.currency,
      exchange: raw.exchange,
    });
  }

  static toPersistence(entity: Asset): Prisma.AssetUncheckedCreateInput {
    return {
      id: entity.id,
      ticker: entity.ticker,
      name: entity.name,
      type: entity.type,
      currency: entity.currency,
      exchange: entity.exchange,
    };
  }
}
