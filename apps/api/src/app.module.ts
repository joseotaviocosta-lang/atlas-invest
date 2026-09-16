import { Module } from '@nestjs/common';
import { DatabaseModule } from './database';
import { HealthModule } from './health/health.module';
import { PortfoliosModule } from './modules/portfolios/portfolios.module';
import { InstitutionsModule } from './modules/institutions/institutions.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AssetsModule } from './modules/assets/assets.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    PortfoliosModule,
    InstitutionsModule,
    AccountsModule,
    AssetsModule,
  ],
})
export class AppModule {}
