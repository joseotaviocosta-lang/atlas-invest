import { Controller, Get, Post, HttpCode, HttpStatus, Inject, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetOpportunityRadarUseCase } from '../../application/portfolios/opportunity-radar/get-opportunity-radar.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

/**
 * Phase APP-16F / APP-16H / APP-16I — Daily Opportunity Radar (Read-only analysis).
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
      'Returns top assets from the portfolio to study for potential contributions based on price, momentum, portfolio fit, fundamentals, recent news, and dividend calendar. Cached for instant startup.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiQuery({ name: 'strategy', required: false, description: 'Optional strategy toggle: DIVIDEND_CASH_ROTATION (default) or NO_CALENDAR' })
  @ApiResponse({ status: 200, description: 'Opportunity radar result' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getOpportunityRadar(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('strategy') strategy?: string,
  ) {
    const enableDividendCalendarStrategy = strategy !== 'NO_CALENDAR' && strategy !== 'false';
    const data = await this.radarUseCase.execute({
      portfolioId,
      userId: principal.userId,
      forceRefresh: false,
      enableDividendCalendarStrategy,
    });
    return { data };
  }

  @Get('news')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get portfolio news inbox (read-only)',
    description: 'Returns canonical deduplicated news events, breakdown, and provider status for portfolio assets.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Portfolio news inbox' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPortfolioNews(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.radarUseCase.getPortfolioNews({
      portfolioId,
      userId: principal.userId,
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
  @ApiQuery({ name: 'strategy', required: false, description: 'Optional strategy toggle: DIVIDEND_CASH_ROTATION (default) or NO_CALENDAR' })
  @ApiResponse({ status: 200, description: 'Refreshed opportunity radar result' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async refreshOpportunityRadar(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('strategy') strategy?: string,
  ) {
    const enableDividendCalendarStrategy = strategy !== 'NO_CALENDAR' && strategy !== 'false';
    const data = await this.radarUseCase.execute({
      portfolioId,
      userId: principal.userId,
      forceRefresh: true,
      enableDividendCalendarStrategy,
    });
    return { data };
  }
}
