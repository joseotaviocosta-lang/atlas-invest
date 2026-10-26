import { Controller, Get, HttpCode, HttpStatus, Inject, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetPortfolioDataQualityUseCase } from '../../application/portfolios/get-portfolio-data-quality.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

/**
 * Phase 5R-E — portfolio data quality diagnostics (read-only).
 *
 * Consolidates market-data, cost-basis, FX, classification and
 * reconciliation facts into operational issues with affected
 * capabilities and navigation actions. Derived only — persists
 * nothing, changes nothing, ranks nothing.
 */
@ApiTags('PortfolioDataQuality')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/data-quality')
export class PortfolioDataQualityController {
  constructor(
    @Inject(GetPortfolioDataQualityUseCase)
    private readonly quality: GetPortfolioDataQualityUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read portfolio data quality diagnostics (read-only)',
    description:
      'Per-position data issues, portfolio-level reconciliation facts and structural limitations. Derived only — persists nothing.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Portfolio data quality' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPortfolioDataQuality(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.quality.execute({
      portfolioId,
      userId: principal.userId,
    });
    return { data: result };
  }
}
