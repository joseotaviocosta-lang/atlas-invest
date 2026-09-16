import { Module, Global } from '@nestjs/common';
import {
  getPrismaClient,
  PortfolioRepository,
  InstitutionRepository,
  AccountRepository,
  AssetRepository,
  TransactionRepository,
} from '@atlas/database';
import {
  PRISMA_CLIENT,
  PORTFOLIO_REPOSITORY,
  INSTITUTION_REPOSITORY,
  ACCOUNT_REPOSITORY,
  ASSET_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from './tokens';

type AtlasPrismaClient = ReturnType<typeof getPrismaClient>;

@Global()
@Module({
  providers: [
    {
      provide: PRISMA_CLIENT,
      useFactory: () => getPrismaClient(),
    },
    {
      provide: PORTFOLIO_REPOSITORY,
      useFactory: (prisma: AtlasPrismaClient) => new PortfolioRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
    {
      provide: INSTITUTION_REPOSITORY,
      useFactory: (prisma: AtlasPrismaClient) => new InstitutionRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
    {
      provide: ACCOUNT_REPOSITORY,
      useFactory: (prisma: AtlasPrismaClient) => new AccountRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
    {
      provide: ASSET_REPOSITORY,
      useFactory: (prisma: AtlasPrismaClient) => new AssetRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
    {
      provide: TRANSACTION_REPOSITORY,
      useFactory: (prisma: AtlasPrismaClient) => new TransactionRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
  ],
  exports: [
    PRISMA_CLIENT,
    PORTFOLIO_REPOSITORY,
    INSTITUTION_REPOSITORY,
    ACCOUNT_REPOSITORY,
    ASSET_REPOSITORY,
    TRANSACTION_REPOSITORY,
  ],
})
export class DatabaseModule {}
