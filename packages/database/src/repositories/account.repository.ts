import { PrismaClient } from '@prisma/client';
import { Account } from '@atlas/domain';
import { IAccountRepository } from './interfaces';
import { AccountMapper } from '../mappers/account.mapper';
import { getPrismaClient } from '../client';

export class AccountRepository implements IAccountRepository {
  constructor(private readonly prisma: PrismaClient = getPrismaClient()) {}

  async findById(id: string): Promise<Account | null> {
    const raw = await this.prisma.account.findUnique({ where: { id } });
    return raw ? AccountMapper.toDomain(raw) : null;
  }

  async findByPortfolioId(portfolioId: string): Promise<Account[]> {
    const items = await this.prisma.account.findMany({
      where: { portfolioId },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((item) => AccountMapper.toDomain(item));
  }

  async create(account: Account): Promise<Account> {
    const created = await this.prisma.account.create({
      data: AccountMapper.toPersistence(account),
    });
    return AccountMapper.toDomain(created);
  }

  async update(account: Account): Promise<Account> {
    const updated = await this.prisma.account.update({
      where: { id: account.id },
      data: AccountMapper.toPersistence(account),
    });
    return AccountMapper.toDomain(updated);
  }
}
