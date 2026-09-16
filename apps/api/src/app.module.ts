import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { DatabaseModule } from './database';
import { HealthModule } from './health/health.module';
import { PortfoliosModule } from './modules/portfolios/portfolios.module';
import { InstitutionsModule } from './modules/institutions/institutions.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AssetsModule } from './modules/assets/assets.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { RequestIdMiddleware } from './common/middleware';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    PortfoliosModule,
    InstitutionsModule,
    AccountsModule,
    AssetsModule,
    TransactionsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
