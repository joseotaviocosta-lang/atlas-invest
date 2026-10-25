import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PortfolioContributionInsightsUseCase } from '../../application/portfolios/portfolio-contribution-insights.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

/**
 * Phase 5Q-I — read-only contribution insights (facts only).
 *
 * Aggregates plans + CONFIRMED ledger links + transactions. No
 * persistence, no recommendations. Cancelled
 * plans stay out of planned totals; mixed currencies fail closed to
 * per-currency summaries.
 */
@ApiTags('PortfolioContributionInsights')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/contribution-insights')
export class PortfolioContributionInsightsController {
  constructor(
    @Inject(PortfolioContributionInsightsUseCase)
    private readonly insights: PortfolioContributionInsightsUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read contribution insights for a period (read-only)',
    description:
      'Planned vs confirmed totals, monthly timeline, status and category breakdowns, recent plans. Derived only — persists nothing.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiQuery({ name: 'period', required: false, enum: ['3M', '6M', 'YTD', '1A', 'INCEPTION'] })
  @ApiResponse({ status: 200, description: 'Contribution insights' })
  @ApiResponse({ status: 400, description: 'Invalid period' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getInsights(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('period') period?: string,
  ) {
    const result = await this.insights.getInsights({
      portfolioId,
      userId: principal.userId,
      period,
    });
    return { data: result };
  }
}
