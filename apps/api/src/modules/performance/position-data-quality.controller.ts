import { Controller, Get, HttpCode, HttpStatus, Inject, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetPositionDataQualityUseCase } from '../../application/performance/get-position-data-quality.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

/**
 * Phase 5R-E — position data quality diagnostics (read-only).
 *
 * Operational issues for one open position: what is missing, which
 * metrics are affected and where to look. Reuses the portfolio quality
 * composition — never one replay per position. Diagnostics only.
 */
@ApiTags('PositionDataQuality')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/positions/:assetId/data-quality')
export class PositionDataQualityController {
  constructor(
    @Inject(GetPositionDataQualityUseCase)
    private readonly quality: GetPositionDataQualityUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read position data quality diagnostics (read-only)',
    description:
      'Data issues for one open position with affected capabilities and navigation actions. Derived only — persists nothing.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'assetId', description: 'UUID of the asset' })
  @ApiResponse({ status: 200, description: 'Position data quality' })
  @ApiResponse({ status: 404, description: 'Portfolio, asset or position not found' })
  async getPositionDataQuality(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('assetId', UUIDParamPipe) assetId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.quality.execute({
      portfolioId,
      assetId,
      userId: principal.userId,
    });
    return { data: result };
  }
}
