import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetPortfolioReviewUseCase } from '../../application/portfolios/get-portfolio-review.use-case';
import { GetPortfolioReviewSignalDetailUseCase } from '../../application/portfolios/get-portfolio-review-signal-detail.use-case';
import {
  mapPortfolioReviewToResponse,
  mapPortfolioReviewDetailToResponse,
} from './portfolio-review.mapper';
import { ReviewPeriodQuery, ReviewPeriodQuerySchema } from './dto/portfolio-review.dto';
import { ApiQuery } from '@nestjs/swagger';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

@ApiTags('PortfolioReview')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/review')
export class PortfolioReviewController {
  constructor(
    @Inject(GetPortfolioReviewUseCase)
    private readonly reviewService: GetPortfolioReviewUseCase,
    @Inject(GetPortfolioReviewSignalDetailUseCase)
    private readonly reviewDetailService: GetPortfolioReviewSignalDetailUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get the portfolio review: prioritized attention signals with evidence',
    description:
      'Derived, read-only decision support. Aggregates valuation coverage, allocation concentration, benchmark gaps, income, pending reviews and reconciliation state into deterministic signals with evidence and navigation actions. Never buy/sell advice; no persistence.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Portfolio review by stable signal codes' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getReview(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const review = await this.reviewService.execute({
      portfolioId,
      userId: principal.userId,
    });
    return { data: mapPortfolioReviewToResponse(review) };
  }

  @Get('signals/:code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one review signal drill-down with historical evidence',
    description:
      'Lazy detail for a stable signal code: current evidence (identical to the overview signal), historical points where a real source exists (performance series, monthly income, recent runs), neutral trend, explicit limitations and the same navigation action. Inactive codes return NOT_ACTIVE with whatever history is honestly available.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({
    name: 'code',
    description: 'Stable signal code (e.g. ALLOCATION_SINGLE_ASSET_CONCENTRATION)',
  })
  @ApiQuery({ name: 'period', required: false, enum: ['1M', '3M', '6M', 'YTD', '1A', 'INCEPTION'] })
  @ApiResponse({ status: 200, description: 'Signal detail with history' })
  @ApiResponse({ status: 404, description: 'Portfolio or signal code not found' })
  async getSignalDetail(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('code') code: string,
    @Query(new ZodValidationPipe(ReviewPeriodQuerySchema)) query: ReviewPeriodQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const detail = await this.reviewDetailService.execute({
      portfolioId,
      userId: principal.userId,
      code,
      period: query.period,
    });
    return { data: mapPortfolioReviewDetailToResponse(detail) };
  }
}
