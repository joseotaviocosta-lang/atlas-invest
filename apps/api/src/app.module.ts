import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
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
import { PortfolioImportsModule } from './modules/imports/imports.module';
import { IntegrationReviewsModule } from './modules/reviews/reviews.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { FiscalModule } from './modules/fiscal/fiscal.module';
import { AiModule } from './modules/ai/ai.module';
import { BenchmarkModule } from './modules/benchmarks/benchmark.module';
import { FxModule } from './modules/fx/fx.module';
import { CalendarsModule } from './modules/calendars/calendars.module';
import { MacroModule } from './modules/macro/macro.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { WatchlistModule } from './modules/watchlist/watchlist.module';
import { MarketModule } from './modules/market/market.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import {
  RequestIdMiddleware,
  UnifiedAnnualNoStoreMiddleware,
  HttpLoggingMiddleware,
} from './common/middleware';

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
    PortfolioImportsModule,
    IntegrationReviewsModule,
    IntegrationsModule,
    PerformanceModule,
    FiscalModule,
    AiModule,
    BenchmarkModule,
    FxModule,
    CalendarsModule,
    MacroModule,
    IngestionModule,
    WatchlistModule,
    MarketModule,
    NotificationsModule,
    PrivacyModule,
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
    consumer.apply(RequestIdMiddleware, HttpLoggingMiddleware).forRoutes('*');
    // Phase 4J.1/4J.2: the unified annual route and the unified review-package
    // routes must carry `private, no-store` on EVERY response (including
    // 400/401/404/422/500 that bypass the successful handler), so the directive
    // is applied in route-scoped middleware ahead of guards/pipes rather than
    // only inside the handler body.
    consumer.apply(UnifiedAnnualNoStoreMiddleware).forRoutes(
      { path: 'api/v1/fiscal/annual/:calendarYear', method: RequestMethod.GET },
      {
        path: 'api/v1/fiscal/annual/:calendarYear/review-package',
        method: RequestMethod.GET,
      },
      {
        path: 'api/v1/fiscal/annual/:calendarYear/review-package/export',
        method: RequestMethod.GET,
      },
    );
  }
}
