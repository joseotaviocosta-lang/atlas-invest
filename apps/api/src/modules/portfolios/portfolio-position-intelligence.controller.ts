import { Controller, Get, HttpCode, HttpStatus, Inject, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetPortfolioPositionIntelligenceUseCase } from '../../application/portfolios/portfolio-position-intelligence.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

/**
 * Phase 5R-A — position intelligence (read-only composition).
 *
 * One integrated answer per open position: canonical state, valuation,
 * allocation weight, income, realized disposals and recent activity.
 * Derived only — persists nothing.
 * Per-position performance does not exist canonically yet (5R-B).
 */
@ApiTags('PortfolioPositionIntelligence')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/positions/:assetId/intelligence')
export class PortfolioPositionIntelligenceController {
  constructor(
    @Inject(GetPortfolioPositionIntelligenceUseCase)
    private readonly intelligence: GetPortfolioPositionIntelligenceUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read position intelligence for one asset (read-only)',
    description:
      'Canonical quantity, valuation, allocation weight, income, realized disposals and recent activity. Derived only — persists nothing.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'assetId', description: 'UUID of the asset' })
  @ApiResponse({ status: 200, description: 'Position intelligence' })
  @ApiResponse({ status: 404, description: 'Portfolio, asset or position not found' })
  async getPositionIntelligence(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('assetId', UUIDParamPipe) assetId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.intelligence.execute({
      portfolioId,
      assetId,
      userId: principal.userId,
    });
    return { data: result };
  }
}
