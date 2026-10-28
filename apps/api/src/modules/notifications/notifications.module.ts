import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { NotificationsController } from './notifications.controller';
import { GetNotificationCenterFeedUseCase } from '../../application/notifications/get-notification-center-feed.use-case';

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController],
  providers: [GetNotificationCenterFeedUseCase],
  exports: [GetNotificationCenterFeedUseCase],
})
export class NotificationsModule {}
