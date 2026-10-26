import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetPositionPerformanceUseCase } from '../../application/performance/get-position-performance.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

/**
 * Phase 5R-B — position performance and contribution (read-only).
 *
 * TWR via the shared engine, realized/unrealized/income P&L components and
 * monthly attribution against the portfolio's own returns. Derived only —
 * persists nothing, recommends nothing.
 */
@ApiTags('PositionPerformance')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/positions/:assetId/performance')
export class PositionPerformanceController {
  constructor(
    @Inject(GetPositionPerformanceUseCase)
    private readonly performance: GetPositionPerformanceUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read position performance and contribution (read-only)',
    description:
      'TWR, realized/unrealized/income P&L and monthly contribution to the portfolio return. Derived only — persists nothing.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'assetId', description: 'UUID of the asset' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Period start YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Period end YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Position performance' })
  @ApiResponse({ status: 400, description: 'Invalid period' })
  @ApiResponse({ status: 404, description: 'Portfolio or position not found' })
  async getPositionPerformance(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('assetId', UUIDParamPipe) assetId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const result = await this.performance.execute({
      portfolioId,
      assetId,
      userId: principal.userId,
      startDate,
      endDate,
    });
    return { data: result };
  }
}
