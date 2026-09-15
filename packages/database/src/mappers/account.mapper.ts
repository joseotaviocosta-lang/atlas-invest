import { Account as PrismaAccount, Prisma } from '@prisma/client';
import { Account, AccountStatus } from '@atlas/domain';

export class AccountMapper {
  static toDomain(raw: PrismaAccount): Account {
    return Account.create({
      id: raw.id,
      portfolioId: raw.portfolioId,
      institutionId: raw.institutionId,
      name: raw.name,
      currency: raw.currency,
      status: raw.status as AccountStatus,
    });
  }

  static toPersistence(entity: Account): Prisma.AccountUncheckedCreateInput {
    return {
      id: entity.id,
      portfolioId: entity.portfolioId,
      institutionId: entity.institutionId,
      name: entity.name,
      currency: entity.currency,
      status: entity.status,
    };
  }
}
