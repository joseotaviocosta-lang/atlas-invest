import { Controller, Get, HttpCode, HttpStatus, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';
import { ZodValidationPipe } from '../../common/pipes';
import {
  GetNotificationCenterFeedUseCase,
} from '../../application/notifications/get-notification-center-feed.use-case';
import {
  GetNotificationsQueryDto,
  GetNotificationsQuerySchema,
} from './dto/notifications.dto';
import { NotificationCenterResponseDto } from '@atlas/domain';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(
    @Inject(GetNotificationCenterFeedUseCase)
    private readonly getFeedUseCase: GetNotificationCenterFeedUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get unified factual investor notification feed',
    description:
      'Aggregated cross-product notification feed derived from verified Atlas engines (Fiscal, Review, Import, Recovery, Data Quality, Contribution). Fully scoped to the authenticated user.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'category', required: false, enum: ['FISCAL', 'REVIEW', 'IMPORT', 'RECOVERY', 'DATA_QUALITY', 'CONTRIBUTION', 'CORPORATE_EVENT'] })
  @ApiQuery({ name: 'priority', required: false, enum: ['URGENT', 'ACTION_REQUIRED', 'IMPORTANT', 'INFO'] })
  @ApiQuery({ name: 'portfolioId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Grounded investor notification feed' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 404, description: 'Portfolio not found (anti-enumeration)' })
  async getNotifications(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query(new ZodValidationPipe(GetNotificationsQuerySchema))
    query: GetNotificationsQueryDto,
  ): Promise<NotificationCenterResponseDto> {
    return this.getFeedUseCase.execute({
      userId: principal.userId,
      limit: query.limit,
      category: query.category,
      priority: query.priority,
      portfolioId: query.portfolioId,
    });
  }
}
