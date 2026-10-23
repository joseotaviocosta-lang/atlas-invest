import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { IntegrationSettingsController } from './integration-settings.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [IntegrationSettingsController],
})
export class IntegrationsModule {}
