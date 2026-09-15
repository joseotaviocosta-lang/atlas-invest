import { Portfolio as PrismaPortfolio, Prisma } from '@prisma/client';
import { Portfolio, PortfolioType, PortfolioStatus } from '@atlas/domain';

export class PortfolioMapper {
  static toDomain(raw: PrismaPortfolio): Portfolio {
    return Portfolio.create({
      id: raw.id,
      userId: raw.userId,
      name: raw.name,
      baseCurrency: raw.baseCurrency,
      type: raw.type as PortfolioType,
      status: raw.status as PortfolioStatus,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  static toPersistence(entity: Portfolio): Prisma.PortfolioUncheckedCreateInput {
    return {
      id: entity.id,
      userId: entity.userId,
      name: entity.name,
      baseCurrency: entity.baseCurrency,
      type: entity.type,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
