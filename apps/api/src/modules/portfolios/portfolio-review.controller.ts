import { Controller, Get, HttpCode, HttpStatus, Inject, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetPortfolioReviewUseCase } from '../../application/portfolios/get-portfolio-review.use-case';
import { mapPortfolioReviewToResponse } from './portfolio-review.mapper';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

@ApiTags('PortfolioReview')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/review')
export class PortfolioReviewController {
  constructor(
    @Inject(GetPortfolioReviewUseCase)
    private readonly reviewService: GetPortfolioReviewUseCase,
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
}
