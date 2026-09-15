import { PrismaClient } from '@prisma/client';
import { Portfolio } from '@atlas/domain';
import { IPortfolioRepository } from './interfaces';
import { PortfolioMapper } from '../mappers/portfolio.mapper';
import { getPrismaClient } from '../client';

export class PortfolioRepository implements IPortfolioRepository {
  constructor(private readonly prisma: PrismaClient = getPrismaClient()) {}

  async findById(id: string): Promise<Portfolio | null> {
    const raw = await this.prisma.portfolio.findUnique({ where: { id } });
    return raw ? PortfolioMapper.toDomain(raw) : null;
  }

  async findByUserId(userId: string): Promise<Portfolio[]> {
    const items = await this.prisma.portfolio.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((item) => PortfolioMapper.toDomain(item));
  }

  async create(portfolio: Portfolio): Promise<Portfolio> {
    const created = await this.prisma.portfolio.create({
      data: PortfolioMapper.toPersistence(portfolio),
    });
    return PortfolioMapper.toDomain(created);
  }

  async update(portfolio: Portfolio): Promise<Portfolio> {
    const updated = await this.prisma.portfolio.update({
      where: { id: portfolio.id },
      data: PortfolioMapper.toPersistence(portfolio),
    });
    return PortfolioMapper.toDomain(updated);
  }
}
