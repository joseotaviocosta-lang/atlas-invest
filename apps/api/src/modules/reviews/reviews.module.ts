import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { IntegrationReviewsController } from './integration-reviews.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [IntegrationReviewsController],
})
export class IntegrationReviewsModule {}
