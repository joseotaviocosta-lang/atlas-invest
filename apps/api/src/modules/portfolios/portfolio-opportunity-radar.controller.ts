import { Controller, Get, Post, HttpCode, HttpStatus, Inject, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetOpportunityRadarUseCase } from '../../application/portfolios/opportunity-radar/get-opportunity-radar.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

/**
 * Phase APP-16F — Daily Opportunity Radar (Read-only analysis).
 *
 * Evaluates active portfolio assets to identify top opportunities for analysis.
 * Zero order execution, zero buy buttons, read-only analysis with explainability.
 */
@ApiTags('PortfolioOpportunityRadar')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/opportunity-radar')
export class PortfolioOpportunityRadarController {
  constructor(
    @Inject(GetOpportunityRadarUseCase)
    private readonly radarUseCase: GetOpportunityRadarUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get daily opportunity radar for a portfolio (read-only)',
    description:
      'Returns top assets from the portfolio to study for potential contributions based on price, momentum, portfolio fit, fundamentals, and recent news. Cached for instant startup.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Opportunity radar result' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getOpportunityRadar(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.radarUseCase.execute({
      portfolioId,
      userId: principal.userId,
      forceRefresh: false,
    });
    return { data };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manually refresh daily opportunity radar for a portfolio',
    description: 'Bypasses the daily cache, recalculates metrics with fresh data, and updates cache.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Refreshed opportunity radar result' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async refreshOpportunityRadar(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.radarUseCase.execute({
      portfolioId,
      userId: principal.userId,
      forceRefresh: true,
    });
    return { data };
  }
}
