import { Controller, Get, HttpCode, HttpStatus, Inject, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetPortfolioCompositionUseCase } from '../../application/portfolios/get-portfolio-composition.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

/**
 * Phase 5R-C — portfolio composition intelligence (read-only).
 *
 * Asset, asset-class, currency (and exchange where canonical) breakdowns
 * over a single known denominator, with unvalued and unclassified positions
 * shown explicitly. Issuer and sector dimensions are unavailable: no
 * canonical source exists and nothing is inferred.
 */
@ApiTags('PortfolioComposition')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/composition')
export class PortfolioCompositionController {
  constructor(
    @Inject(GetPortfolioCompositionUseCase)
    private readonly composition: GetPortfolioCompositionUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read portfolio composition (read-only)',
    description:
      'Canonical asset, asset-class, currency and exchange breakdowns with concentration facts. Derived only — persists nothing.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Portfolio composition' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getComposition(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.composition.execute({
      portfolioId,
      userId: principal.userId,
    });
    return { data: result };
  }
}
