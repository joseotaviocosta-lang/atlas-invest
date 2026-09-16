import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { DatabaseModule } from './database';
import { HealthModule } from './health/health.module';
import { AuthModule, JwtAuthGuard } from './auth';
import { PortfoliosModule } from './modules/portfolios/portfolios.module';
import { InstitutionsModule } from './modules/institutions/institutions.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AssetsModule } from './modules/assets/assets.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { RequestIdMiddleware } from './common/middleware';

@Module({
  imports: [
    DatabaseModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    AuthModule,
    HealthModule,
    PortfoliosModule,
    InstitutionsModule,
    AccountsModule,
    AssetsModule,
    TransactionsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
