import { Module, Global } from '@nestjs/common';
import {
  getPrismaClient,
  PortfolioRepository,
  InstitutionRepository,
  AccountRepository,
  AssetRepository,
  TransactionRepository,
  UserRepository,
  SessionRepository,
  PasswordResetTokenRepository,
  AiConversationRepository,
} from '@atlas/database';
import {
  PRISMA_CLIENT,
  PORTFOLIO_REPOSITORY,
  INSTITUTION_REPOSITORY,
  ACCOUNT_REPOSITORY,
  ASSET_REPOSITORY,
  TRANSACTION_REPOSITORY,
  USER_REPOSITORY,
  SESSION_REPOSITORY,
  PASSWORD_RESET_TOKEN_REPOSITORY,
  AI_CONVERSATION_REPOSITORY,
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
    {
      provide: USER_REPOSITORY,
      useFactory: (prisma: AtlasPrismaClient) => new UserRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
    {
      provide: SESSION_REPOSITORY,
      useFactory: (prisma: AtlasPrismaClient) => new SessionRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
    {
      provide: PASSWORD_RESET_TOKEN_REPOSITORY,
      useFactory: (prisma: AtlasPrismaClient) => new PasswordResetTokenRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
    {
      provide: AI_CONVERSATION_REPOSITORY,
      useFactory: (prisma: AtlasPrismaClient) => new AiConversationRepository(prisma),
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
    USER_REPOSITORY,
    SESSION_REPOSITORY,
    PASSWORD_RESET_TOKEN_REPOSITORY,
    AI_CONVERSATION_REPOSITORY,
  ],
})
export class DatabaseModule {}
