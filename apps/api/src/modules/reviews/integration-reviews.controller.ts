import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IntegrationReviewService } from '../../application/imports/integration-review.service';
import {
  IntegrationReviewListQuery,
  IntegrationReviewListQuerySchema,
} from './dto/integration-review.dto';
import { mapIntegrationReviewToResponse } from './integration-review.mapper';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

@ApiTags('IntegrationReviews')
@ApiBearerAuth()
@Controller('api/v1/integration-reviews')
export class IntegrationReviewsController {
  constructor(
    @Inject(IntegrationReviewService)
    private readonly reviewService: IntegrationReviewService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List actionable integration review items',
    description:
      'Derived inbox over import/sync runs: awaiting-review runs with attention reasons and unsuperseded failures. Clean completed runs never appear.',
  })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (1-200)' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor (run id)' })
  @ApiQuery({ name: 'severity', required: false, enum: ['REVIEW', 'WARNING', 'ERROR'] })
  @ApiQuery({ name: 'portfolioId', required: false, description: 'Scope to one portfolio' })
  @ApiQuery({ name: 'source', required: false, enum: ['B3', 'CSV', 'MANUAL'] })
  @ApiResponse({ status: 200, description: 'Cursor-paginated review items' })
  async listReviews(
    @Query(new ZodValidationPipe(IntegrationReviewListQuerySchema))
    query: IntegrationReviewListQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const { items, portfolioNames, hasMore, nextCursor } = await this.reviewService.listReviews(
      principal.userId,
      {
        limit: query.limit,
        cursor: query.cursor ?? null,
        severity: query.severity ?? null,
        portfolioId: query.portfolioId ?? null,
        source: query.source ?? null,
      },
    );
    const data = items.map((item) =>
      mapIntegrationReviewToResponse(item, portfolioNames.get(item.portfolioId) ?? null),
    );
    return {
      data,
      meta: {
        limit: query.limit,
        cursor: query.cursor ?? null,
        nextCursor,
        hasMore,
      },
    };
  }

  @Get('count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Count actionable review items without loading the list',
    description:
      'Lightweight badge feed: derives the actionable count from a bounded recent window of runs.',
  })
  @ApiResponse({ status: 200, description: 'Pending count' })
  async countPending(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    const result = await this.reviewService.countPending(principal.userId);
    return { data: result };
  }

  @Get(':runId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one review item with its resolution state',
    description:
      'Actionable items return full detail. Resolved runs (confirmed, superseded, in-flight, no-action) return a RESOLVED state with the reason instead of a 404, so stale links explain themselves.',
  })
  @ApiParam({ name: 'runId', description: 'UUID of the integration run' })
  @ApiResponse({ status: 200, description: 'Review item or resolved state' })
  @ApiResponse({ status: 404, description: 'Run not found in owned portfolios' })
  async getReview(
    @Param('runId', UUIDParamPipe) runId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const detail = await this.reviewService.getReview(principal.userId, runId);
    return {
      data: {
        item: detail.item
          ? mapIntegrationReviewToResponse(detail.item, detail.portfolioName)
          : null,
        state: detail.state,
        resolvedReason: detail.resolvedReason,
        portfolioName: detail.portfolioName,
        linkedTransactions: detail.linkedTransactions,
        linkedTransactionsTruncated: detail.linkedTransactionsTruncated,
        limitations: detail.limitations,
      },
    };
  }
}
